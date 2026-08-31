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

  it('paints message snapshots immediately and anchors every chat to its listing', () => {
    const messagesPage = mobileApp.slice(mobileApp.indexOf('function MessagesPage'), mobileApp.indexOf('function NotificationDetailPage'))
    const chatPage = mobileApp.slice(mobileApp.indexOf('function ConversationBookMessage'), mobileApp.indexOf('function ProfilePage'))
    expect(messagesPage).toContain('peekThreads() || []')
    expect(messagesPage).toContain('peekNotifications() || []')
    expect(chatPage).toContain('peekThread(threadId)')
    expect(chatPage).toContain('我想咨询这本书')
    expect(chatPage).toContain('会话关联商品')
    expect(chatPage).toContain('navigate(`/books/${book.id}`)')
    expect(styles).toContain('.messages-page .thread-list > button { animation: none; }')
  })

  it('does not replay entrance motion when browser history returns to a page', () => {
    expect(mobileApp).toContain("currentIndex < previousIndex ? 'back' : 'forward'")
    expect(mobileApp).toContain('function initialRouteTransition()')
    expect(mobileApp).toContain('ROUTE_HISTORY_INDEX_KEY')
    expect(mobileApp).toContain('routeScrollPositions.get(locationKeyRef.current)')
    expect(mobileApp).toContain('container.scrollTop = position')
    expect(mobileApp).toContain('route-${routeTransition}')
    expect(styles).toContain('.route-view.route-forward { animation: route-in')
    expect(styles).toContain('.route-view:not(.route-back) .listing-card')
    expect(styles).not.toContain('.route-view { animation: route-in')
  })

  it('keeps cached object references when a background refresh is unchanged', () => {
    expect(mobileApp).toContain('function preserveSnapshot<T>')
    expect(mobileApp).toContain('JSON.stringify(current) === JSON.stringify(next) ? current : next')
    expect(mobileApp).toContain('setThreads((current) => preserveSnapshot(current, next))')
    expect(mobileApp).toContain('setBooks((current) => preserveSnapshot(current, next))')
  })

  it('uses the uploaded cover photo on book cards and keeps a text fallback', () => {
    const bookCover = mobileApp.slice(mobileApp.indexOf('function BookCover'), mobileApp.indexOf('function BottomNav'))
    expect(bookCover).toContain('book.images?.[0]')
    expect(bookCover).toContain('className="book-cover-image"')
    expect(bookCover).toContain('BITerStore 校园藏书')
    expect(styles).toContain('.book-cover-image { width: 100%; height: 100%; display: block; object-fit: cover; }')
  })

  it('autoplays one detail image at a time and keeps actions at the bottom', () => {
    const detailPage = mobileApp.slice(mobileApp.indexOf('function BookDetailPage'), mobileApp.indexOf('function PublishPage'))
    expect(mobileApp).toContain("const hideNavigation = noNav || className === 'detail-page'")
    expect(mobileApp).toContain("!hideNavigation && <BottomNav")
    expect(detailPage).toContain('function DetailGallery')
    expect(detailPage).toContain('window.setInterval')
    expect(detailPage).toContain('scrollTo')
    expect(styles).toContain('scroll-snap-type: x mandatory')
    expect(styles).toContain('.detail-cta { grid-row: 4; position: sticky;')
    expect(styles).toContain('.detail-page .content-scroll.no-nav { padding-bottom:')
  })

  it('hides an empty course fact and keeps campus and ISBN easy to read', () => {
    const detailPage = mobileApp.slice(mobileApp.indexOf('function BookDetailPage'), mobileApp.indexOf('function PublishPage'))
    expect(detailPage).toContain('book.course.trim() ? <span><BookOpen />{book.course}</span> : null')
    expect(styles).toContain('.detail-facts span { display: flex; align-items: center; gap: 7px; color: #62675a; font-size: 13px;')
    expect(styles).not.toContain('.detail-price span, .detail-facts span, .description-block span')
  })

  it('uses an in-app delete confirmation instead of the browser confirm dialog', () => {
    const myListingsPage = mobileApp.slice(mobileApp.indexOf('function MyListingsPage'), mobileApp.indexOf('const stateContent'))
    expect(myListingsPage).not.toContain('window.confirm')
    expect(myListingsPage).toContain('role="alertdialog"')
    expect(myListingsPage).toContain('className="dialog-scrim"')
    expect(styles).toContain('.confirm-dialog')
  })

  it('keeps optional publish photos fully visible across aspect ratios', () => {
    const publishPage = mobileApp.slice(mobileApp.indexOf('function PublishPage'), mobileApp.indexOf('function ProfileEditPage'))
    expect(publishPage).toContain('className="optional-images"')
    expect(styles).toContain('.optional-images .upload-preview img')
    expect(styles).toContain('object-fit: contain')
    expect(styles).toContain('.publish-page .upload-card { flex: 0 0 auto; overflow: visible; }')
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
