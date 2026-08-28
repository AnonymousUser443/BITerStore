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
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

type BarcodeDetectorLike = { detect(source: ImageBitmap): Promise<Array<{ rawValue: string }>> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

export async function scanIsbnBarcode(image: string): Promise<string> {
  const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector) throw new Error('当前浏览器不支持图片条码识别，请手动填写 ISBN');
  const blob = await fetch(image).then((response) => response.blob());
  const bitmap = await createImageBitmap(blob);
  const values = await new Detector({ formats: ['ean_13', 'ean_8'] }).detect(bitmap);
  bitmap.close();
  const isbn = String(values[0]?.rawValue || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (!/^\d{13}$/.test(isbn)) throw new Error('ISBN 页中没有识别到清晰条码，请重新拍摄或手动填写');
  return isbn;
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
