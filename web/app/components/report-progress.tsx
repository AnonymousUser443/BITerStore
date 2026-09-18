import { useCallback, useEffect, useState } from 'react';
import { h5ApiRequest } from '../lib/h5-auth';
import { formatMessageTime } from '../lib/date-time';
import { type ReportProgress, type ReportProgressPage, reportResolution, reportStatusLabels } from '../lib/report-progress';

export function ReportProgressList() {
  const [items, setItems] = useState<ReportProgress[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (next?: string) => {
    try {
      const page = await h5ApiRequest<ReportProgressPage>(`/reports/mine${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
      setItems((current) => next ? [...current, ...page.items.filter((item) => !current.some((known) => known.id === item.id))] : page.items);
      setCursor(page.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '举报进度加载失败'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void h5ApiRequest<ReportProgressPage>('/reports/mine').then((page) => {
      if (active) { setItems(page.items); setCursor(page.nextCursor); }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '举报进度加载失败'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  return <section className="report-progress-list" aria-label="我的举报进度"><h2>我的举报进度</h2>
    {items.map((item) => <article className="report-progress-card" key={item.id}><div className="report-progress-heading"><h3>{item.targetLabel}</h3><span>{reportStatusLabels[item.status]}</span></div><p className="report-number">举报编号：{item.id}</p><p><strong>举报原因：</strong>{item.reason}</p><p><strong>{item.status === 'OPEN' || item.status === 'PROCESSING' ? '当前进度：' : '处理结果：'}</strong>{reportResolution(item)}</p><time>提交：{formatMessageTime(item.createdAt)}</time><time>更新：{formatMessageTime(item.updatedAt)}</time></article>)}
    {error && <p role="alert">{error}</p>}{busy && <p role="status">正在加载举报进度…</p>}
    {!busy && !error && items.length === 0 && <p>你还没有提交过举报。</p>}
    {(cursor || error) && <button className="secondary-button" disabled={busy} onClick={() => { setBusy(true); setError(''); void load(cursor || undefined); }}>{error ? '重试' : '加载更多举报'}</button>}
  </section>;
}
