import { describe, expect, it } from 'vitest';
import { formatMessageTime, formatThreadTime, mergeMessagesChronologically } from './date-time';
import { appPathFromUrl, browserPathForAppPath, exactRouteParam } from './routes';

describe('Golden H5 routes', () => {
  it('maps canonical browser URLs to exact application routes', () => {
    expect(appPathFromUrl('https://store.example/books?id=listing-1')).toBe('/books/listing-1');
    expect(appPathFromUrl('https://store.example/chat?id=thread-1')).toBe('/messages/thread-1');
    expect(appPathFromUrl('https://store.example/notifications?type=comment')).toBe('/messages/notifications/comment');
    expect(appPathFromUrl('https://store.example/states?type=not-found')).toBe('/states/404');
  });

  it('rejects missing, malformed and over-nested dynamic routes', () => {
    expect(appPathFromUrl('https://store.example/books')).toBe('/states/404');
    expect(appPathFromUrl('https://store.example/books/listing-1/extra')).toBe('/states/404');
    expect(appPathFromUrl('https://store.example/chat?id=bad%2Fid')).toBe('/states/404');
    expect(appPathFromUrl('https://store.example/notifications?type=unknown')).toBe('/states/404');
    expect(exactRouteParam('/messages/notifications/comment', '/messages/')).toBeNull();
  });

  it('keeps Taro-compatible browser URLs when navigating inside the app', () => {
    expect(browserPathForAppPath('/books/listing-1')).toBe('/books?id=listing-1');
    expect(browserPathForAppPath('/messages/thread-1')).toBe('/chat?id=thread-1');
    expect(browserPathForAppPath('/messages/notifications/like')).toBe('/notifications?type=like');
    expect(browserPathForAppPath('/states/404')).toBe('/states?type=404');
  });
});

describe('message time and ordering', () => {
  const now = new Date(2026, 8, 17, 20, 0);

  it('formats chat and thread timestamps without exposing ISO strings', () => {
    expect(formatMessageTime(new Date(2026, 8, 17, 9, 5).toISOString(), now)).toBe('09:05');
    expect(formatMessageTime(new Date(2026, 8, 16, 21, 8).toISOString(), now)).toBe('昨天 21:08');
    expect(formatThreadTime(new Date(2026, 7, 20, 9, 5).toISOString(), now)).toBe('8月20日');
    expect(formatMessageTime('昨天 20:15', now)).toBe('昨天 20:15');
  });

  it('deduplicates and sorts messages by their real timestamp', () => {
    const merged = mergeMessagesChronologically(
      [{ id: 'later', senderId: 'a', text: 'later', createdAt: '2026-09-17T11:00:00.000Z' }],
      [
        { id: 'earlier', senderId: 'b', text: 'earlier', createdAt: '2026-09-17T09:00:00.000Z' },
        { id: 'later', senderId: 'a', text: 'updated', createdAt: '2026-09-17T11:00:00.000Z' },
      ],
    );
    expect(merged.map((message) => message.id)).toEqual(['earlier', 'later']);
    expect(merged[1].text).toBe('updated');
  });
});
