const DB_NAME = 'biterstore-images';
const STORE_NAME = 'draft-images';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function compressImage(file: File, maxDimension = 900, quality = .72): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法处理图片');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    bitmap.close();
  }
}

type BarcodeDetectorLike = { detect(source: ImageBitmap): Promise<Array<{ rawValue: string }>> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

type IsbnImageCandidate = { bitmap: ImageBitmap; blob: Blob };
type IsbnCrop = { left: number; top: number; width: number; height: number };

// ISBN bars are normally near the bottom of the back cover. A full-cover
// photograph leaves very few pixels per bar after compression, so scan the
// original image as well as enlarged lower-cover crops.
const ISBN_CROPS: IsbnCrop[] = [
  { left: 0, top: 0, width: 1, height: 1 },
  { left: 0, top: .2, width: 1, height: .8 },
  { left: 0, top: .45, width: 1, height: .55 },
  { left: 0, top: .3, width: .68, height: .7 },
  { left: .32, top: .3, width: .68, height: .7 },
];

function normalizeIsbn(value: string) {
  return value.replace(/[^0-9Xx]/g, '').toUpperCase();
}

function validIsbn13(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  const sum = value.slice(0, 12).split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === Number(value[12]);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片编码失败')), 'image/jpeg', .9);
  });
}

async function createIsbnCandidates(sourceBlob: Blob): Promise<IsbnImageCandidate[]> {
  const source = await createImageBitmap(sourceBlob);
  try {
    const candidates: IsbnImageCandidate[] = [];
    for (const crop of ISBN_CROPS) {
      const sourceWidth = Math.max(1, Math.round(source.width * crop.width));
      const sourceHeight = Math.max(1, Math.round(source.height * crop.height));
      const sourceLeft = Math.max(0, Math.min(source.width - sourceWidth, Math.round(source.width * crop.left)));
      const sourceTop = Math.max(0, Math.min(source.height - sourceHeight, Math.round(source.height * crop.top)));
      const scale = Math.max(1, Math.min(2.5, 2200 / Math.max(sourceWidth, sourceHeight)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.imageSmoothingEnabled = true;
      context.drawImage(source, sourceLeft, sourceTop, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas);
      candidates.push({ blob, bitmap: await createImageBitmap(blob) });
    }
    return candidates;
  } finally {
    source.close();
  }
}

export async function imageToBlob(image: string): Promise<Blob> {
  if (image.startsWith('data:')) {
    const comma = image.indexOf(',');
    if (comma < 0) throw new Error('图片数据格式无效');
    const header = image.slice(0, comma);
    const payload = image.slice(comma + 1);
    const mime = header.match(/^data:([^;,]+)/i)?.[1] || 'image/jpeg';
    if (/;base64/i.test(header)) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }
  const response = await fetch(image);
  if (!response.ok) throw new Error(`图片加载失败（${response.status}）`);
  return response.blob();
}

export async function scanIsbnBarcode(image: string): Promise<string> {
  const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector) throw new Error('当前浏览器不支持图片条码识别，请手动填写 ISBN');
  const blob = await imageToBlob(image);
  const candidates = await createIsbnCandidates(blob);
  const detector = new Detector({ formats: ['ean_13', 'ean_8'] });
  try {
    for (const candidate of candidates) {
      try {
        const values = await detector.detect(candidate.bitmap);
        for (const value of values) {
          const isbn = normalizeIsbn(String(value.rawValue || ''));
          if (validIsbn13(isbn)) return isbn;
        }
      } catch {
        // A browser detector may reject a crop whose dimensions are too small;
        // continue with the other regions and let the server be the fallback.
      } finally {
        candidate.bitmap.close();
      }
    }
  } finally {
    // Every candidate is normally closed in the loop. This also covers an
    // exception thrown before the loop reaches a candidate.
    for (const candidate of candidates) {
      try { candidate.bitmap.close(); } catch { /* already closed */ }
    }
  }
  throw new Error('ISBN 页中没有识别到清晰条码，请重新拍摄或手动填写');
}

/** Return the same enlarged regions used by local scanning for the API fallback. */
export async function getIsbnImageCandidates(image: string): Promise<Blob[]> {
  const candidates = await createIsbnCandidates(await imageToBlob(image));
  try {
    return candidates.map((candidate) => candidate.blob);
  } finally {
    for (const candidate of candidates) candidate.bitmap.close();
  }
}

export async function saveImages(key: string, images: string[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(images, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function getImages(key?: string): Promise<string[]> {
  if (!key || typeof indexedDB === 'undefined') return [];
  const db = await openDatabase();
  const result = await new Promise<string[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as string[]) ?? []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

export async function clearImages(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDatabase();
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
  });
  db.close();
}
