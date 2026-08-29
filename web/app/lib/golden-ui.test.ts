import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mobileApp = readFileSync(new URL('../components/mobile-app.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');

describe('authenticated Golden H5', () => {
  it('uses a dedicated profile editor page instead of a scroll-bound bottom sheet', () => {
    expect(mobileApp).toContain('function ProfileEditPage');
    expect(mobileApp).toContain("navigate('/profile/edit')");
    expect(mobileApp).not.toContain('profile-edit-layer');
    expect(styles).toContain('.profile-edit-page .content-scroll');
    expect(styles).toContain('.profile-edit-card');
  });

  it('does not show demo reset controls on the authenticated profile', () => {
    const profilePage = mobileApp.slice(mobileApp.indexOf('function ProfilePage'), mobileApp.indexOf('function ProfileEditPage'));
    expect(profilePage).not.toContain('重置演示数据');
    expect(profilePage).not.toContain('演示与状态');
  });

  it('shows the authenticated student number above the nickname', () => {
    const profilePage = mobileApp.slice(mobileApp.indexOf('function ProfilePage'), mobileApp.indexOf('function ProfileEditPage'));
    expect(profilePage).toContain('profile-student-number');
    expect(profilePage.indexOf('profile-student-number')).toBeLessThan(profilePage.indexOf('<h1>{profile.name}'));
  });

  it('uses the current seller and hides buyer actions from the publish preview', () => {
    expect(mobileApp).toContain("if (book.id === 'preview') demoRepository.getProfile()")
    expect(mobileApp).toContain("book.id !== 'preview' && <div className=\"listing-actions\"")
    expect(mobileApp).toContain("book.id === 'preview' ? '预览'")
  })

  it('shows byte-level upload progress and prevents repeated publish triggers', () => {
    expect(mobileApp).toContain('if (publishingRef.current) return')
    expect(mobileApp).toContain('正在上传并发布 ${progress}%')
    expect(styles).toContain('.toast.progress-toast progress')
  })

  it('explains blocked detail actions and surfaces request failures', () => {
    const detailPage = mobileApp.slice(mobileApp.indexOf('function BookDetailPage'), mobileApp.indexOf('function PublishPage'))
    expect(detailPage).toContain("if (ownListing) return notify('不能收藏自己的商品')")
    expect(detailPage).toContain("if (ownListing) return notify('不能联系自己发布的商品')")
    expect(detailPage).toContain("navigate('/login')")
    expect(detailPage).toContain("cause instanceof Error ? cause.message : '收藏操作失败，请稍后重试'")
    expect(detailPage).toContain("cause instanceof Error ? cause.message : '联系卖家失败，请稍后重试'")
  })

  it('shows a retryable error instead of loading a failed chat forever', () => {
    const chatPage = mobileApp.slice(mobileApp.indexOf('function ChatPage'), mobileApp.indexOf('function ProfilePage'))
    expect(chatPage).toContain("setError(message); setThread(null); notify(message)")
    expect(chatPage).toContain('if (thread === undefined)')
    expect(chatPage).toContain('会话加载失败')
    expect(chatPage).toContain("setThread(undefined); setError(''); setAttempt((value) => value + 1)")
  })

  it('removes a deleted listing immediately and surfaces delete failures', () => {
    const myListingsPage = mobileApp.slice(mobileApp.indexOf('function MyListingsPage'), mobileApp.indexOf('const stateContent'))
    expect(myListingsPage).toContain('setBooks((current) => current.filter((item) => item.id !== book.id))')
    expect(myListingsPage).toContain("cause instanceof Error ? cause.message : '删除失败，请稍后重试'")
  })

  it('reflows continuously from narrow phones through ultra-wide H5 windows', () => {
    expect(styles).toContain('@media (max-width: 340px)')
    expect(styles).toContain('@media (min-width: 480px) and (max-width: 699px)')
    expect(styles).toContain('@media (orientation: landscape) and (min-width: 700px)')
    expect(styles).toContain('repeat(auto-fill, minmax(340px, 1fr))')
    expect(styles).toContain('width: min(calc(100vw - 48px), 1600px)')
    expect(styles).toContain('.profile-page .content-scroll { grid-template-columns: repeat(3, minmax(0, 1fr)); }')
  })
});
