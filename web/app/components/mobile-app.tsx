'use client';

/* eslint-disable @next/next/no-img-element -- avatars and user uploads can be IndexedDB data URLs. */

import Image from 'next/image';
import {
  ArrowLeft, Bell, BookOpen, Bookmark, Camera, Check, ChevronDown, ChevronRight,
  CircleAlert, Filter, Grid2X2, Heart, Home, ImagePlus, Info, Leaf, MapPin,
  MessageCircle, MoreHorizontal, PackageCheck, Plus, RefreshCw,
  Search, Send, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Trash2,
  UserRound, WandSparkles, X,
} from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CURRENT_USER_ID, seedBooks } from '../lib/demo-data';
import {
  destroyBitLoginChallenge,
  getBitLoginRegistrationToken,
  startBitLogin,
  submitBitLoginSms,
  type BitLoginChallenge,
} from '../lib/bit-login';
import { getH5Profile, h5ApiRequest, loginWithCampusCookie, logoutH5Session, restoreH5Session, updateH5Profile, type H5Profile } from '../lib/h5-auth';
import { compressImage, getImages, saveImages, scanIsbnBarcode } from '../lib/image-store';
import { defaultFilters, demoRepository, getUser, peekBook, peekBooks, peekFavorites, peekMyListings, peekNotifications, peekThread, peekThreads } from '../lib/repository';
import type { Book, BookFilters, ChatThread, Condition, ListingStatus, Notification, PublishDraft, User } from '../lib/types';

const navItems = [
  { label: '首页', href: '/home', icon: Home },
  { label: '分类', href: '/category', icon: Grid2X2 },
  { label: '发布', href: '/publish', icon: Send, primary: true },
  { label: '消息', href: '/messages', icon: MessageCircle },
  { label: '我的', href: '/profile', icon: UserRound },
];

const categories = ['全部', '教材教辅', '专业课', '考研考公', '文学小说'];
const campuses = ['全部', '中关村', '良乡', '西山', '珠海'] as const;
const conditions = ['全部', '全新', '九成新', '八成新', '七成新及以下'] as const;

const UI_ASSET_BUNDLE_VERSION = '2026.08.24.11';
const UI_ASSET_BUNDLE_KEY = 'biterstore.ui-assets.bundle';
const UI_ASSETS = [
  '/assets/paper-bg.webp',
  '/assets/avatar-jian.webp', '/assets/avatar-lin.webp', '/assets/avatar-zhou.webp',
  '/assets/tobby-cheer.webp', '/assets/tobby-guide-publish.webp', '/assets/tobby-guide-search.webp',
  '/assets/tobby-guide-trade.webp', '/assets/tobby-heart.webp', '/assets/tobby-hello.webp',
  '/assets/tobby-maintenance.webp', '/assets/tobby-master-transparent.webp', '/assets/tobby-news.webp',
  '/assets/tobby-question.webp', '/assets/tobby-sad.webp', '/assets/tobby-search.webp',
  '/assets/tobby-unavailable.webp',
] as const;

const CurrentUserContext = createContext<User | undefined>(undefined);
function warmAccountSnapshots() { return Promise.allSettled([demoRepository.listFavorites(), demoRepository.listMyListings(), demoRepository.listThreads(), demoRepository.listNotifications()]); }
const PROFILE_SNAPSHOT_KEY = 'biterstore:v1:snapshot:profile';

function readProfileSnapshot(): User | undefined {
  try { return JSON.parse(window.localStorage.getItem(PROFILE_SNAPSHOT_KEY) || 'null') as User | undefined; } catch { return undefined; }
}
function writeProfileSnapshot(profile?: User) {
  if (profile) window.localStorage.setItem(PROFILE_SNAPSHOT_KEY, JSON.stringify(profile));
  else window.localStorage.removeItem(PROFILE_SNAPSHOT_KEY);
}

function profileToUser(profile: H5Profile): User {
  return {
    id: profile.id,
    studentNumber: profile.studentNumber || undefined,
    name: profile.nickname,
    campus: (profile.campus || '未设置') as User['campus'],
    verified: profile.campusStatus === 'VERIFIED',
    bio: profile.bio || '还没有填写个人简介。',
    responseTime: '通常很快回复',
    avatar: profile.avatarUrl || undefined,
    avatarTone: 'sage',
  };
}

async function warmUiAssetBundle(onProgress: (value: number) => void) {
  const workerReady = 'serviceWorker' in navigator
    ? navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready).catch(() => undefined)
    : Promise.resolve(undefined);
  let completed = 0;
  await Promise.all(UI_ASSETS.map((src) => new Promise<void>((resolve) => {
    const asset = new window.Image();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      completed += 1;
      onProgress(Math.round((completed / UI_ASSETS.length) * 100));
      resolve();
    };
    const timeout = window.setTimeout(done, 12000);
    asset.onload = () => { void asset.decode().catch(() => undefined).finally(done); };
    asset.onerror = done;
    asset.src = src;
    if (asset.complete && asset.naturalWidth > 0) done();
  })));
  await Promise.race([workerReady, new Promise((resolve) => window.setTimeout(resolve, 3000))]);
  return true;
}

const emptyDraft: PublishDraft = {
  title: '', author: '', isbn: '', category: '教材教辅', course: '', price: '', originalPrice: '',
  condition: '九成新', campus: '良乡', description: '', tags: [],
};

function formatPrice(price: number) { return price.toFixed(2); }
function statusLabel(status: ListingStatus) { return { available: '可交易', sold: '已售', offline: '已下架', draft: '草稿', reviewing: '待审核' }[status]; }

function newPublishRequestId() {
  return globalThis.crypto?.randomUUID?.() || `publish-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Brand() {
  return <span className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>BITerStore</span></span>;
}

function BootScreen({ progress }: { progress: number }) {
  return <section className="phone-shell boot-screen" aria-live="polite"><div className="paper-texture" aria-hidden="true" /><div className="boot-brand"><Brand /><span>移动校园书站</span></div><div className="boot-visual"><i aria-hidden="true" /><Image src="/assets/tobby-cheer.webp" alt="Tobby 正在准备 BITerStore" width={760} height={760} priority /></div><div className="boot-copy"><p>APP RESOURCE PACK</p><h1>托比正在从服务器<br />下载 App 资源包……</h1><span>第一次见面会稍久一点，之后打开就会快很多。</span></div><div className="boot-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${Math.max(5, progress)}%` }} /></div><div className="boot-status"><span>正在初始化界面与角色素材</span><strong>{progress}%</strong></div><small>请稍候，书页马上就准备好啦 ❧</small></section>;
}

function Avatar({ user, size = 42 }: { user: User; size?: number }) {
  if (user.id === CURRENT_USER_ID) {
    return <span className="avatar image-avatar" style={{ width: size, height: size }}><Image src="/assets/tobby-hello.webp" alt={user.name} width={760} height={760} /></span>;
  }
  return (
    <span className={`avatar avatar-${user.avatarTone}`} style={{ width: size, height: size }}>
      {user.avatar ? <img src={user.avatar} alt={user.name} /> : user.name.slice(0, 1)}
    </span>
  );
}

function BookCover({ book, compact = false }: { book: Book; compact?: boolean }) {
  return (
    <div className={`book-cover ${book.tone} ${compact ? 'compact' : ''}`}>
      <span className="cover-leaf">❧</span>
      <strong>{book.title}</strong>
      {!compact && <small>BITerStore 校园藏书</small>}
    </div>
  );
}

function BottomNav({ active, navigate }: { active: string; navigate: (to: string) => void }) {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {navItems.map(({ label, href, icon: Icon, primary }) => (
        <button className={`nav-item ${active === href ? 'active' : ''} ${primary ? 'publish' : ''}`} onClick={() => navigate(href)} key={href} aria-label={label}>
          <Icon size={primary ? 21 : 20} strokeWidth={1.9} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Topbar({ title, back, navigate }: { title?: string; back?: boolean; navigate: (to: string) => void }) {
  const currentUser = useContext(CurrentUserContext);
  const headerUser = currentUser || getUser(CURRENT_USER_ID);
  return (
    <header className={`topbar ${title ? 'page-topbar' : ''}`}>
      {back ? <button className="round-button" onClick={() => history.back()} aria-label="返回"><ArrowLeft /></button> : <button className="brand-button" onClick={() => navigate('/home')} aria-label="返回首页"><Brand /></button>}
      {title && <h1>{title}</h1>}
      <div className="top-actions"><button className="icon-button" onClick={() => navigate('/messages')} aria-label="通知"><Bell size={24} /><i className="notification-dot" /></button>{back ? <button className="icon-button" aria-label="更多"><MoreHorizontal /></button> : <button className="icon-button avatar-action" onClick={() => navigate('/profile')} aria-label="我的"><Avatar user={headerUser} size={38} /></button>}</div>
    </header>
  );
}

function AppShell({ children, active, navigate, title, back = false, noNav = false, className = '' }: { children: React.ReactNode; active?: string; navigate: (to: string) => void; title?: string; back?: boolean; noNav?: boolean; className?: string }) {
  const shouldGoBack = back || active === '/publish';
  const hideNavigation = noNav || className === 'detail-page';
  return (
    <section className={`phone-shell ${className}`}>
      <div className="paper-texture" aria-hidden="true" />
      <Topbar title={title} back={shouldGoBack} navigate={navigate} />
      <div className={`content-scroll ${hideNavigation ? 'no-nav' : ''}`}>{children}</div>
      {!hideNavigation && <BottomNav active={active ?? ''} navigate={navigate} />}
    </section>
  );
}

function BookTile({ book, navigate }: { book: Book; navigate: (to: string) => void }) {
  return (
    <button className="book-tile" onClick={() => navigate(`/books/${book.id}`)}>
      <BookCover book={book} />
      <h3>{book.title}</h3><p>{book.author}</p>
      <div className="book-meta"><strong>¥{formatPrice(book.price)}</strong><span>{book.campus}</span></div>
    </button>
  );
}

function BookListCard({ book, navigate, favorite, onFavorite, ownerView = false }: { book: Book; navigate: (to: string) => void; favorite?: boolean; onFavorite?: (book: Book) => void; ownerView?: boolean }) {
  const [previewSeller, setPreviewSeller] = useState<User>();
  useEffect(() => { if (book.id === 'preview') demoRepository.getProfile().then(setPreviewSeller).catch(() => undefined); }, [book.id]);
  const seller = book.id === 'preview' ? (previewSeller || getUser(CURRENT_USER_ID)) : (book.seller || getUser(book.sellerId));
  return (
    <article className={`listing-card ${book.status !== 'available' ? 'unavailable-card' : ''}`}>
      <button className="listing-main" onClick={() => navigate(`/books/${book.id}`)}>
        <BookCover book={book} compact />
        <div className="listing-copy">
          <div className="listing-heading"><h3>{book.title}</h3><MoreHorizontal size={17} /></div>
          <p>{book.author}</p>
          <div className="listing-price"><strong>¥{formatPrice(book.price)}</strong><del>¥{formatPrice(book.originalPrice)}</del><span>{book.condition}</span></div>
          <div className="listing-detail"><MapPin size={13} />{book.campus}校区 <BookOpen size={13} />{book.course}</div>
          <div className="seller-line"><Avatar user={seller} size={25} /><span>{seller.name}</span><ShieldCheck size={12} />{seller.verified ? '已认证' : '校园用户'}</div>
        </div>
      </button>
      {!ownerView && book.id !== 'preview' && <div className="listing-actions">
        <button onClick={() => onFavorite?.(book)}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} />{favorite ? '已收藏' : '收藏'}</button>
        <button onClick={() => navigate(`/messages/new-${book.id}`)}><MessageCircle size={17} />联系卖家</button>
        <button className="detail-action" onClick={() => navigate(`/books/${book.id}`)}>详情 <ChevronRight size={15} /></button>
      </div>}
      <span className={`status-badge ${book.status}`}>{book.id === 'preview' ? '预览' : statusLabel(book.status)}</span>
    </article>
  );
}

function WelcomePage({ navigate }: { navigate: (to: string) => void }) {
  return (
    <section className="phone-shell welcome-page">
      <div className="welcome-decoration" aria-hidden="true" />
      <header className="welcome-brand"><Brand /><span className="leaf-seal"><Leaf /></span></header>
      <div className="welcome-copy"><span>你好呀，我是托比 <Leaf size={14} /></span><h1>欢迎来到你的<br /><em>校园二手书小站</em></h1><p>搜索闲置教材、发布旧书、站内联系，<br />在校内安心完成交易。</p></div>
      <Image className="welcome-tobby" src="/assets/tobby-master-transparent.webp" alt="Tobby 欢迎你来到 BITerStore" width={760} height={760} priority />
      <div className="welcome-steps">
        {[['01', Search, '找书', '搜索教材与参考书'], ['02', MessageCircle, '联系', '站内沟通更方便'], ['03', PackageCheck, '交易', '线下见面更安心']].map(([n, Icon, title, text]) => {
          const StepIcon = Icon as typeof Search;
          return <div key={String(n)}><small>{n as string}</small><StepIcon /><strong>{title as string}</strong><span>{text as string}</span></div>;
        })}
      </div>
      <div className="welcome-actions"><button className="primary-button" onClick={() => navigate('/onboarding')}>进入 BITerStore</button><button className="secondary-button" onClick={() => navigate('/onboarding')}>先看看如何使用</button><p>❧ 北理工校内试运行中 ❧</p></div>
    </section>
  );
}

function OnboardingPage({ navigate }: { navigate: (to: string) => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    { title: '快速找到一本书', text: '使用搜索栏与分类入口，按课程、ISBN 或书名找到需要的教材。', image: '/assets/tobby-guide-search.webp', targets: ['搜索栏', '分类筛选', '推荐书籍'] },
    { title: '看懂商品与状态', text: '价格、成色、校区和卖家信息一目了然，已售商品会清晰标注。', image: '/assets/tobby-question.webp', targets: ['商品信息', '收藏与联系', '交易状态'] },
    { title: '发布并完成交易', text: '从底栏一键发布，站内联系同学，再约在校内安心见面。', image: '/assets/tobby-guide-trade.webp', targets: ['发布入口', '消息中心', '个人中心'] },
  ];
  useEffect(() => {
    ['/assets/tobby-guide-search.webp', '/assets/tobby-question.webp', '/assets/tobby-guide-trade.webp'].forEach((src) => { const asset = new window.Image(); asset.src = src; });
  }, []);
  const complete = () => { demoRepository.completeOnboarding(); navigate('/login'); };
  const current = steps[step];
  return (
    <section className="phone-shell onboarding-page">
      <div className="onboarding-preview"><div className="fake-brand"><Brand /></div><div className="fake-search" /><div className="fake-hero" /><div className="fake-cards"><i /><i /><i /></div><div className="fake-nav" /></div>
      <div className="onboarding-scrim" />
      <div className="onboarding-panel">
        <div className="onboarding-heading"><span>新手指引 {step + 1}/3</span><button onClick={complete}>跳过</button></div>
        <Image key={`guide-image-${step}`} src={current.image} alt="Tobby 新手引导" width={760} height={760} unoptimized priority />
        <div className="guide-card" key={`guide-card-${step}`}><small>STEP 0{step + 1}</small><h1>{current.title}</h1><p>{current.text}</p><div className="guide-pills">{current.targets.map((target) => <span key={target}><Check size={12} />{target}</span>)}</div></div>
        <div className="step-dots">{steps.map((_, index) => <i className={index === step ? 'active' : ''} key={index} />)}</div>
        <div className="guide-actions">{step > 0 && <button className="secondary-button" onClick={() => setStep(step - 1)}>上一步</button>}<button className="primary-button" onClick={() => step === 2 ? complete() : setStep(step + 1)}>{step === 2 ? '开始使用' : '下一步'}</button></div>
      </div>
    </section>
  );
}

function LoginPage({ navigate, onAuthenticated, onGuest }: { navigate: (to: string) => void; onAuthenticated: (profile: H5Profile) => void; onGuest: () => void }) {
  const [sid, setSid] = useState('');
  const [password, setPassword] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [challenge, setChallenge] = useState<BitLoginChallenge>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const finish = async (value: BitLoginChallenge) => {
    try {
      const registrationToken = await getBitLoginRegistrationToken(value);
      const session = await loginWithCampusCookie(registrationToken);
      const profile = await getH5Profile();
      demoRepository.markAuthenticated(session.user.id);
      void warmAccountSnapshots();
      onAuthenticated(profile);
      navigate('/home');
    } finally {
      setPassword('');
      setSmsCode('');
      setChallenge(undefined);
      await destroyBitLoginChallenge(value);
    }
  };
  const continueAsGuest = async () => {
    setLoading(true); setError(''); setPassword('');
    try {
      await logoutH5Session();
      demoRepository.markAuthenticated('guest');
      onGuest();
      navigate('/home');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法进入游客模式'); }
    finally { setLoading(false); }
  };
  const login = async () => {
    if (!/^\d{8,12}$/.test(sid.trim())) return setError('请输入正确的北理工学号');
    if (!password) return setError('请输入统一身份认证密码');
    setLoading(true); setError('');
    try {
      const result = await startBitLogin(sid.trim(), password);
      if (result.status === 'waiting_sms') setChallenge(result);
      else await finish(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '统一身份认证失败'); }
    finally { setPassword(''); setLoading(false); }
  };
  const verifySms = async () => {
    if (!challenge || !/^\d{4,8}$/.test(smsCode.trim())) return setError('请输入 4 至 8 位短信验证码');
    setLoading(true); setError('');
    try { const result = await submitBitLoginSms(challenge, smsCode.trim()); if (result.status === 'authenticated') await finish(result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '短信验证失败'); }
    finally { setLoading(false); }
  };
  return <section className="phone-shell login-page"><div className="paper-texture" aria-hidden="true" /><header className="login-brand"><Brand /><span><ShieldCheck /></span></header><div className="login-hero"><Image src="/assets/tobby-hello.webp" alt="Tobby 欢迎北理同学" width={760} height={760} priority /><div><p className="eyebrow">BIT CAMPUS IDENTITY</p><h1>{challenge ? '确认是你本人' : '北理同学，你好'}</h1><p>{challenge ? <>验证码已发送至 <strong>{challenge.masked_phone || '绑定手机'}</strong></> : '使用学校统一身份认证登录，完成校园身份验证。'}</p></div></div><div className="login-card">{challenge ? <><label><span>短信验证码</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={smsCode} onChange={(event) => setSmsCode(event.target.value.replace(/\D/g, ''))} placeholder="请输入验证码" autoFocus /></label><button className="primary-button" disabled={loading} onClick={verifySms}>{loading ? <><RefreshCw className="spin" />正在验证</> : '继续验证'}</button><button className="login-link" disabled={loading} onClick={() => { setChallenge(undefined); setSmsCode(''); setError(''); }}>返回重新登录</button></> : <><label><span>学号</span><input inputMode="numeric" autoComplete="username" value={sid} onChange={(event) => setSid(event.target.value.replace(/\D/g, ''))} placeholder="请输入北理工学号" autoFocus /></label><label><span>统一身份认证密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void login(); }} placeholder="请输入密码" /></label><button className="primary-button" disabled={loading} onClick={login}>{loading ? <><RefreshCw className="spin" />正在安全验证</> : '登录 BITerStore'}</button><div className="guest-divider"><span>或</span></div><button className="secondary-button guest-button" disabled={loading} onClick={continueAsGuest}>游客访问</button><p className="guest-note">先逛逛校园书架，之后可在“我的”页面重新登录。</p></>}{error && <div className="login-error" role="alert"><CircleAlert />{error}</div>}</div><div className="login-security"><ShieldCheck /><p><strong>凭据安全说明</strong><span>密码仅用于本次学校统一身份认证，不会保存在 BITerStore 本地。</span></p></div><button className="login-guide" onClick={() => navigate('/onboarding')}>返回新手指引</button></section>;
}

function HomePage({ navigate }: { navigate: (to: string) => void }) {
  const [books, setBooks] = useState<Book[] | undefined>(() => peekBooks(defaultFilters));
  useEffect(() => { demoRepository.listBooks(defaultFilters).then(setBooks).catch(() => setBooks([])); }, []);
  return (
    <AppShell active="/home" navigate={navigate} className="home-page">
      <button className="search-box" onClick={() => navigate('/category')}><Search size={21} /><span>搜索书名、作者或 ISBN</span><SlidersHorizontal size={18} /></button>
      <nav className="category-chips">{categories.map((category, index) => <button className={index === 0 ? 'chip active' : 'chip'} onClick={() => navigate(`/category?category=${encodeURIComponent(category)}`)} key={category}>{category}</button>)}</nav>
      <section className="hero-card"><div className="hero-copy"><p className="eyebrow">书页轻翻 · 好物续航</p><h1>以书会友<br />共享知识之美</h1><p>让每一本闲置书，遇见下一位需要它的人。</p><button className="hero-button" onClick={() => navigate('/category')}>探索好书 <span>→</span></button></div><Image className="hero-tobby" src="/assets/tobby-hello.webp" alt="Tobby 抱着书向你打招呼" width={760} height={760} priority /></section>
      <section className="section-block"><div className="section-title"><h2>精选推荐</h2><button className="section-more" onClick={() => navigate('/category')}>查看全部 <ChevronRight /></button></div>{books === undefined ? <InlineLoading /> : books.length ? <div className="book-row">{books.slice(0, 5).map((book) => <BookTile book={book} navigate={navigate} key={book.id} />)}</div> : <InlineEmpty navigate={navigate} />}</section>
      {books && books.length > 0 && <section className="ranking-card"><div className="section-title"><h2>最近上架</h2><span>最新流动好书</span></div>{books.slice(0, 3).map((book, index) => <button className="rank-item" onClick={() => navigate(`/books/${book.id}`)} key={book.id}><span className="rank-number">0{index + 1}</span><BookCover book={book} compact /><span className="rank-copy"><strong>{book.title}</strong><small>{book.author}</small><em>{book.campus}校区 · {book.condition}</em></span><span className="rank-price"><b>¥{book.price}</b><small>查看详情</small></span><ChevronRight /></button>)}</section>}
    </AppShell>
  );
}

function FilterSheet({ filters, onChange, onClose, count }: { filters: BookFilters; onChange: (next: BookFilters) => void; onClose: () => void; count: number }) {
  return <div className="sheet-layer"><button className="sheet-scrim" onClick={onClose} aria-label="关闭筛选" /><section className="filter-sheet"><div className="sheet-handle" /><div className="sheet-title"><h2>高级筛选 <Leaf size={17} /></h2><button onClick={() => onChange(defaultFilters)}><Trash2 size={15} />清空</button><button onClick={onClose}><X /></button></div><label className="range-label"><span>价格区间（元）</span><strong>¥0 — ¥{filters.maxPrice}+</strong><input type="range" min="20" max="200" step="10" value={filters.maxPrice} onChange={(event) => onChange({ ...filters, maxPrice: Number(event.target.value) })} /></label><FilterGroup label="校区" options={campuses} value={filters.campus} onSelect={(campus) => onChange({ ...filters, campus: campus as BookFilters['campus'] })} /><FilterGroup label="分类" options={categories} value={filters.category} onSelect={(category) => onChange({ ...filters, category })} /><FilterGroup label="成色" options={conditions} value={filters.condition} onSelect={(condition) => onChange({ ...filters, condition: condition as BookFilters['condition'] })} /><label className="switch-row"><span>只看可交易</span><input type="checkbox" checked={filters.availableOnly} onChange={(event) => onChange({ ...filters, availableOnly: event.target.checked })} /><i /></label><button className="primary-button apply-filter" onClick={onClose}>查看 {count} 个结果</button></section></div>;
}

function FilterGroup({ label, options, value, onSelect }: { label: string; options: readonly string[]; value: string; onSelect: (value: string) => void }) {
  return <div className="filter-group"><strong>{label}</strong><div>{options.map((option) => <button className={option === value ? 'active' : ''} onClick={() => onSelect(option)} key={option}>{option}</button>)}</div></div>;
}

function CategoryPage({ navigate, notify }: { navigate: (to: string) => void; notify: (text: string) => void }) {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [filters, setFilters] = useState<BookFilters>({ ...defaultFilters, category: params.get('category') || '全部' });
  const [books, setBooks] = useState<Book[]>(() => peekBooks(filters) || []); const [loading, setLoading] = useState(() => !peekBooks(filters)); const [sheet, setSheet] = useState(false); const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    demoRepository.listBooks(filters).then((result) => {
      if (active) { setBooks(result); setLoading(false); }
    });
    return () => { active = false; };
  }, [filters]);
  const updateFilters = (next: BookFilters) => { const cached = peekBooks(next); if (cached) setBooks(cached); setLoading(!cached && books.length === 0); setFilters(next); };
  const toggle = async (book: Book) => { const active = await demoRepository.toggleFavorite(book.id); setFavorites((ids) => active ? [...new Set([...ids, book.id])] : ids.filter((id) => id !== book.id)); notify(active ? '已收藏这本书' : '已取消收藏'); };
  return <AppShell active="/category" navigate={navigate} className="category-page">
    <div className="search-input"><Search size={20} /><input aria-label="搜索书籍" placeholder="搜索书名 / 作者 / ISBN / 课程" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} /><button onClick={() => updateFilters({ ...filters, query: '' })}>{filters.query ? <X size={18} /> : <Camera size={19} />}</button></div>
    <nav className="category-chips">{categories.map((category) => <button className={filters.category === category ? 'chip active' : 'chip'} onClick={() => updateFilters({ ...filters, category })} key={category}>{category}</button>)}</nav>
    <div className="quick-filters"><button onClick={() => setSheet(true)}>校区 <ChevronDown /></button><button onClick={() => setSheet(true)}>成色 <ChevronDown /></button><button onClick={() => setSheet(true)}>价格 <ChevronDown /></button><button onClick={() => updateFilters({ ...filters, sort: filters.sort === '最新发布' ? '价格从低到高' : '最新发布' })}>{filters.sort} <ChevronDown /></button><button className={`availability-filter ${filters.availableOnly ? 'active' : ''}`} aria-pressed={filters.availableOnly} onClick={() => updateFilters({ ...filters, availableOnly: !filters.availableOnly })}><span>只看可交易</span><i /></button><button className="filter-trigger" onClick={() => setSheet(true)}><Filter size={16} />筛选</button></div>
    <div className="search-tobby-hint"><Image src="/assets/tobby-search.webp" alt="Tobby 筛选提示" width={760} height={760} /><span><strong>托比提示</strong>组合筛选，找书更快更准。</span></div>
    <div className="results-heading"><h2>为你找到 <em>{books.length}</em> 本书</h2><span>{filters.availableOnly ? '只显示可交易' : '显示全部状态'}</span></div>
    {loading ? <InlineLoading /> : books.length ? <div className="listing-stack">{books.map((book) => <BookListCard book={book} navigate={navigate} favorite={favorites.includes(book.id)} onFavorite={toggle} key={book.id} />)}</div> : <InlineEmpty navigate={navigate} />}
    {sheet && <FilterSheet filters={filters} onChange={updateFilters} onClose={() => setSheet(false)} count={books.length} />}
  </AppShell>;
}

function InlineLoading() { return <div className="inline-state"><Image src="/assets/tobby-search.webp" alt="正在搜索" width={760} height={760} /><h3>托比正在翻找书架…</h3><span className="loading-bar"><i /></span></div>; }
function InlineEmpty({ navigate }: { navigate: (to: string) => void }) { return <div className="inline-state"><Image src="/assets/tobby-question.webp" alt="没有搜索结果" width={760} height={760} /><h3>这次没有找到合适的书</h3><p>换个关键词，或者发布一条求书心愿吧。</p><button className="secondary-button" onClick={() => navigate('/states/no-results')}>查看空状态</button></div>; }

function BookDetailPage({ id, navigate, notify }: { id: string; navigate: (to: string) => void; notify: (text: string) => void }) {
  const currentUser = useContext(CurrentUserContext);
  const [book, setBook] = useState<Book | null | undefined>(() => peekBook(id)); const [favorite, setFavorite] = useState(false); const [images, setImages] = useState<string[]>([]); const [pendingAction, setPendingAction] = useState<'favorite' | 'contact'>();
  useEffect(() => { demoRepository.getBook(id).then((value) => { setBook(value); if (value?.imageStoreKey) getImages(value.imageStoreKey).then(setImages); }); }, [id]);
  useEffect(() => {
    let active = true;
    if (!currentUser) return;
    demoRepository.listFavorites().then((items) => { if (active) setFavorite(items.some((item) => item.id === id)); }).catch(() => undefined);
    return () => { active = false; };
  }, [currentUser, id]);
  if (book === undefined) return <AppShell navigate={navigate} title="商品详情" back noNav><InlineLoading /></AppShell>;
  if (!book) return <StatePage type="404" navigate={navigate} />;
  const seller = book.seller || getUser(book.sellerId); const unavailable = book.status !== 'available';
  const displayImages = book.images?.length ? book.images : images;
  const ownListing = currentUser?.id === book.sellerId;
  const favoriteActive = Boolean(currentUser && favorite);
  const requireAccount = (message: string) => { if (currentUser) return true; notify(message); navigate('/login'); return false; };
  const toggleFavorite = async () => {
    if (!requireAccount('请先使用学号登录后收藏商品')) return;
    if (ownListing) return notify('不能收藏自己的商品');
    if (pendingAction) return;
    setPendingAction('favorite');
    try { const active = await demoRepository.toggleFavorite(book.id); setFavorite(active); notify(active ? '收藏成功' : '已取消收藏'); }
    catch (cause) { notify(cause instanceof Error ? cause.message : '收藏操作失败，请稍后重试'); }
    finally { setPendingAction(undefined); }
  };
  const contact = async () => {
    if (unavailable) return navigate('/states/unavailable');
    if (!requireAccount('请先使用学号登录后联系卖家')) return;
    if (ownListing) return notify('不能联系自己发布的商品');
    if (pendingAction) return;
    setPendingAction('contact');
    try { const thread = await demoRepository.ensureThread(book.id); navigate(`/messages/${thread}`); }
    catch (cause) { notify(cause instanceof Error ? cause.message : '联系卖家失败，请稍后重试'); }
    finally { setPendingAction(undefined); }
  };
  const contactLabel = ownListing ? '本人商品' : pendingAction === 'contact' ? '正在联系…' : '联系';
  return <AppShell navigate={navigate} title="商品详情" back className="detail-page"><DetailGallery images={displayImages} book={book} unavailable={unavailable} /><section className="detail-card"><div className="detail-title"><div><span className={`status-pill ${book.status}`}>{statusLabel(book.status)}</span><h1>{book.title}</h1><p>{book.author}</p></div><button disabled={pendingAction === 'favorite'} onClick={toggleFavorite} aria-label={ownListing ? '自己的商品不能收藏' : favoriteActive ? '取消收藏' : '收藏'}><Heart fill={favoriteActive ? 'currentColor' : 'none'} /></button></div><div className="detail-price"><strong>¥{formatPrice(book.price)}</strong><del>¥{formatPrice(book.originalPrice)}</del><span>{book.condition}</span></div><div className="detail-facts"><span><MapPin />{book.campus}校区</span><span><BookOpen />{book.course}</span><span><Info />ISBN {book.isbn}</span></div><div className="description-block"><h2>书籍简介</h2><p>{book.description}</p><div>{book.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div></section><section className="seller-card"><Avatar user={seller} size={52} /><div><h3>{seller.name} <ShieldCheck /></h3><p>{seller.campus}校区 · 已完成校园认证</p><span>{seller.responseTime}</span></div><button disabled={unavailable || pendingAction === 'contact'} onClick={contact}>{contactLabel}</button></section><div className="safety-note"><ShieldCheck />建议在校内公共场所当面验书，确认书况后再付款。</div><div className="detail-cta"><button onClick={() => notify('举报入口已记录')}><CircleAlert />举报</button><button className="primary-button" disabled={unavailable || pendingAction === 'contact'} onClick={contact}><MessageCircle />{unavailable ? '当前不可联系' : ownListing ? '这是我的商品' : pendingAction === 'contact' ? '正在联系卖家…' : '联系卖家'}</button></div></AppShell>;
}

function DetailGallery({ images, book, unavailable }: { images: string[]; book: Book; unavailable: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const total = Math.max(images.length, 1)
  const show = useCallback((index: number) => {
    const next = (index + total) % total
    setActive(next)
    const viewport = viewportRef.current
    if (viewport) viewport.scrollTo({ left: viewport.clientWidth * next, behavior: 'smooth' })
  }, [total])
  useEffect(() => {
    if (total < 2) return
    const timer = window.setInterval(() => setActive((current) => {
      const next = (current + 1) % total
      const viewport = viewportRef.current
      if (viewport) viewport.scrollTo({ left: viewport.clientWidth * next, behavior: 'smooth' })
      return next
    }), 4000)
    return () => window.clearInterval(timer)
  }, [total])
  return <div className="detail-gallery-shell"><div className="detail-gallery" ref={viewportRef} onScroll={(event) => { const width = event.currentTarget.clientWidth; if (width) setActive(Math.round(event.currentTarget.scrollLeft / width)) }}>{images.length ? images.map((image, index) => <img src={image} alt={`${book.title} 实拍图 ${index + 1}`} key={`${image.slice(-20)}-${index}`} />) : <BookCover book={book} />}</div>{unavailable && <span className="gallery-status">{statusLabel(book.status)}</span>}{total > 1 && <div className="gallery-dots" aria-label={`第 ${active + 1} 张，共 ${total} 张`}>{Array.from({ length: total }, (_, index) => <button className={active === index ? 'active' : ''} aria-label={`查看第 ${index + 1} 张图片`} onClick={() => show(index)} key={index} />)}</div>}</div>
}

function PublishPage({ navigate, notify }: { navigate: (to: string) => void; notify: (text: string) => void }) {
  const [step, setStep] = useState(1); const [draft, setDraft] = useState<PublishDraft>(() => ({ ...emptyDraft, clientRequestId: newPublishRequestId() })); const [images, setImages] = useState<string[]>([]); const [aiLoading, setAiLoading] = useState(false); const [errors, setErrors] = useState<string[]>([]); const publishingRef = useRef(false); const coverInputRef = useRef<HTMLInputElement>(null); const isbnInputRef = useRef<HTMLInputElement>(null); const extraInputRef = useRef<HTMLInputElement>(null);
  const [defaultImageStoreKey] = useState(() => `draft-${Date.now()}`);
  useEffect(() => { demoRepository.getDraft().then((value) => { if (value) { setDraft({ ...value, clientRequestId: value.clientRequestId || newPublishRequestId() }); if (value.imageStoreKey) getImages(value.imageStoreKey).then(setImages); } }); }, []);
  const update = <K extends keyof PublishDraft>(key: K, value: PublishDraft[K]) => setDraft((valueDraft) => ({ ...valueDraft, [key]: value }));
  const persistImages = async (next: string[]) => { const key = draft.imageStoreKey ?? defaultImageStoreKey; await saveImages(key, next); setImages(next); setDraft((current) => ({ ...current, imageStoreKey: key })); };
  const handleRequired = async (slot: 0 | 1, files: FileList | null) => { const file = files?.[0]; if (!file) return; const image = await compressImage(file); const next = [...images]; next[slot] = image; await persistImages(next); notify(slot === 0 ? '封面已拍摄' : 'ISBN 页已拍摄'); };
  const handleExtras = async (files: FileList | null) => { if (!files) return; const extras = await Promise.all(Array.from(files).slice(0, Math.max(0, 6 - images.filter(Boolean).length)).map((file) => compressImage(file))); const next = [images[0] || '', images[1] || '', ...images.slice(2).filter(Boolean), ...extras].slice(0, 6); await persistImages(next); notify(`已添加 ${extras.length} 张补充图片`); };
  const removeImage = async (index: number) => { const next = [...images]; if (index < 2) next[index] = ''; else next.splice(index, 1); await persistImages(next); };
  const runAi = async () => {
    if (!images[0] || !images[1]) return notify('请先拍摄封面和 ISBN 页');
    setAiLoading(true);
    let isbn = '';
    try {
      try {
        isbn = await scanIsbnBarcode(images[1]);
      } catch {
        const image = await fetch(images[1]).then((response) => response.blob());
        const recognized = await h5ApiRequest<{ isbn: string }>('/books/isbn/recognize', { method: 'POST', headers: { 'Content-Type': image.type || 'image/jpeg' }, body: image });
        isbn = recognized.isbn;
      }
      setDraft((current) => ({ ...current, isbn }));
      const metadata = await h5ApiRequest<{ isbn: string; title: string; author: string; subjects: string[] }>(`/books/isbn/${isbn}`);
      setDraft((current) => ({ ...current, isbn: metadata.isbn, title: metadata.title, author: metadata.author || current.author, category: metadata.subjects.some((value) => /文学|小说|fiction/i.test(value)) ? '文学小说' : '教材教辅', course: current.course || metadata.title, description: current.description || `${metadata.title}${metadata.author ? `，${metadata.author}著` : ''}。${current.condition}，支持校内当面验书。`, tags: Array.from(new Set([...current.tags, ...metadata.subjects.slice(0, 2)])) }));
      notify('已识别 ISBN 并补全书籍信息'); setStep(2);
    } catch (cause) {
      if (isbn) { setDraft((current) => ({ ...current, isbn })); notify('已识别 ISBN；书目信息暂未查到，请手动补全'); setStep(2); }
      else notify(cause instanceof Error ? cause.message : '识别失败，请重试');
    } finally { setAiLoading(false); }
  };
  const validate = () => { const next = [!draft.title && '请填写书名', !draft.author && '请填写作者', !draft.price && '请填写价格', !draft.description && '请填写商品简介'].filter(Boolean) as string[]; setErrors(next); return next.length === 0; };
  const save = async () => { await demoRepository.saveDraft(draft); notify('草稿已保存'); };
  const nextStep = () => { if (step === 1) { if (!images[0] || !images[1]) return notify('封面和 ISBN 页均为必拍项'); setStep(2); } else if (step === 2 && validate()) setStep(3); };
  const publish = async () => {
    if (publishingRef.current) return;
    if (!validate()) return setStep(2);
    publishingRef.current = true; notify('正在上传并发布 1%');
    try { await demoRepository.publishListing(draft, (progress) => notify(`正在上传并发布 ${progress}%`)); navigate('/states/published'); }
    catch (cause) { publishingRef.current = false; notify(cause instanceof Error ? cause.message : '发布失败，请稍后重试'); }
  };
  return <AppShell active="/publish" navigate={navigate} title="发布闲置书籍" className="publish-page"><div className="stepper">{['上传图片', '填写信息', '确认发布'].map((label, index) => <div className={step >= index + 1 ? 'active' : ''} key={label}><span>{index + 1}</span><p>{label}</p>{index < 2 && <i />}</div>)}</div>{step === 1 && <><section className="upload-card"><strong className="upload-heading">两张必拍照片</strong><span className="upload-instruction">请对准拍摄，文字与条码保持清晰，发布时会再次校验。</span><div className="required-image-grid">{([['书籍封面', '必拍 · 用作商品首图', images[0], coverInputRef, 0], ['ISBN 页', '必拍 · 对准条形码', images[1], isbnInputRef, 1]] as const).map(([label, hint, image, ref, slot]) => <div className="required-image" key={label}>{image ? <div className="upload-preview"><img src={image} alt={label} /><span className="image-role">{label} ✓</span><button onClick={() => removeImage(slot)} aria-label={`移除${label}`}><X /></button></div> : <button className="required-image-button" onClick={() => ref.current?.click()}><Camera /><strong>{label}</strong><span>{hint}</span></button>}<input ref={ref} hidden type="file" accept="image/*" capture="environment" onChange={(event) => handleRequired(slot, event.target.files)} /></div>)}</div><div className="optional-images"><span>其他实拍图（选填，最多 4 张）</span><div className="image-grid">{images.slice(2).filter(Boolean).map((image, offset) => <div className="upload-preview" key={image.slice(-20)}><img src={image} alt={`补充图片 ${offset + 1}`} /><button onClick={() => removeImage(offset + 2)} aria-label={`移除补充图片 ${offset + 1}`}><X /></button></div>)}{images.filter(Boolean).length < 6 && <button className="add-image" onClick={() => extraInputRef.current?.click()}><Camera /><strong>补充图片</strong><span>书脊、内页或瑕疵</span></button>}</div><input ref={extraInputRef} hidden type="file" accept="image/*" multiple onChange={(event) => handleExtras(event.target.files)} /></div><div className="tobby-tip"><Image src="/assets/tobby-guide-publish.webp" alt="Tobby 提醒拍摄封面" width={760} height={760} /><span>封面和 ISBN 页拍清楚，托比就能帮你补全信息～</span></div></section><section className="ai-card"><div><p><Sparkles />Tobby 一键识别</p><span>免费识别 ISBN 条码，查询书名、作者与分类；识别结果可修改。</span></div><button onClick={runAi} disabled={aiLoading || !images[0] || !images[1]}>{aiLoading ? <><RefreshCw className="spin" />识别中…</> : <><WandSparkles />一键识别生成</>}</button></section></>}{step === 2 && <section className="form-card"><FormField label="书名" required error={errors.includes('请填写书名')}><input value={draft.title} onChange={(event) => update('title', event.target.value)} /></FormField><div className="form-grid"><FormField label="作者" required error={errors.includes('请填写作者')}><input value={draft.author} onChange={(event) => update('author', event.target.value)} /></FormField><FormField label="ISBN"><input value={draft.isbn} onChange={(event) => update('isbn', event.target.value)} /></FormField><FormField label="课程 / 分类" required><select value={draft.category} onChange={(event) => update('category', event.target.value)}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></FormField><FormField label="成色" required><select value={draft.condition} onChange={(event) => update('condition', event.target.value as Condition)}>{conditions.slice(1).map((condition) => <option key={condition}>{condition}</option>)}</select></FormField><FormField label="价格" required error={errors.includes('请填写价格')}><input type="number" inputMode="decimal" value={draft.price} onChange={(event) => update('price', event.target.value)} placeholder="¥ 0.00" /></FormField><FormField label="校区" required><select value={draft.campus} onChange={(event) => update('campus', event.target.value as PublishDraft['campus'])}>{campuses.slice(1).map((campus) => <option key={campus}>{campus}</option>)}</select></FormField></div><FormField label="商品简介" required error={errors.includes('请填写商品简介')}><textarea rows={5} maxLength={300} value={draft.description} onChange={(event) => update('description', event.target.value)} /></FormField><div className="tag-picker"><span>添加标签</span>{['考研必备', '期末复习', '笔记少', '教材'].map((tag) => <button className={draft.tags.includes(tag) ? 'active' : ''} onClick={() => update('tags', draft.tags.includes(tag) ? draft.tags.filter((value) => value !== tag) : [...draft.tags, tag])} key={tag}>{tag}</button>)}</div>{errors.length > 0 && <div className="form-error"><CircleAlert />{errors.join('、')}</div>}</section>}{step === 3 && <section className="publish-preview"><p className="eyebrow">发布前最后确认</p><BookListCard book={{ ...seedBooks[0], id: 'preview', title: draft.title, author: draft.author, price: Number(draft.price || 0), originalPrice: Number(draft.originalPrice || draft.price || 0), condition: draft.condition, campus: draft.campus, description: draft.description, tags: draft.tags, status: 'available', course: draft.course || draft.category }} navigate={() => setStep(2)} /><div className="safety-note"><ShieldCheck />请确认图片和描述真实准确，联系方式仅对发起咨询的同学可见。</div></section>}<div className="publish-actions">{step === 2 && <button className="secondary-button" onClick={save}>保存草稿</button>}{step > 1 && <button className="secondary-button" onClick={() => setStep(step - 1)}>上一步</button>}<button className="primary-button" onClick={step === 3 ? publish : nextStep}>{step === 3 ? '发布上架' : '下一步'}</button></div></AppShell>;
}

function FormField({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: boolean }) { return <label className={`form-field ${error ? 'error' : ''}`}><span>{required && <em>*</em>}{label}</span>{children}</label>; }

function MessagesPage({ navigate }: { navigate: (to: string) => void }) {
  const [threads, setThreads] = useState<ChatThread[]>(() => peekThreads() || []); const [items, setItems] = useState<Notification[]>(() => peekNotifications() || []);
  useEffect(() => { void demoRepository.listThreads().then(setThreads).catch(() => undefined); void demoRepository.listNotifications().then(setItems).catch(() => undefined); }, []);
  return <AppShell active="/messages" navigate={navigate} title="消息" className="messages-page"><div className="notification-grid">{items.map((item) => { const Icon = { like: Heart, comment: MessageCircle, system: Bell, follow: UserRound }[item.type]; return <button onClick={() => navigate(`/messages/notifications/${item.type}`)} aria-label={`查看${item.title}详情`} key={item.id}><span className={`notice-icon ${item.type}`}><Icon /></span><div><strong>{item.title}</strong><p>{item.subtitle}</p><small>点击查看详情</small></div><ChevronRight className="notice-chevron" />{item.unread > 0 && <b>{item.unread}</b>}</button>; })}</div><div className="section-title message-title"><h2>私聊消息</h2><span><Check size={14} />站内消息</span></div><div className="thread-list">{threads.map((thread) => { const user = thread.participant || getUser(thread.participantId); const last = thread.messages.at(-1); return <button onClick={() => navigate(`/messages/${thread.id}`)} key={thread.id}><Avatar user={user} size={54} /><div><h3><strong>{user.name}</strong><span>{user.campus === '未设置' ? '校区未设置' : `${user.campus}校区`}</span></h3><p>{last?.text || (thread.book ? `我想咨询《${thread.book.title}》` : '从一本书开始聊聊吧')}</p></div><time>{thread.updatedAt}</time>{thread.unread > 0 && <b>{thread.unread}</b>}</button>; })}</div>{threads.length === 0 && <div className="inline-state"><Image src="/assets/tobby-question.webp" alt="暂无私聊消息" width={760} height={760} /><h3>还没有私聊消息</h3><p>从一本感兴趣的书开始聊聊吧。</p></div>}<div className="tobby-banner"><Image src="/assets/tobby-hello.webp" alt="Tobby 消息提醒" width={760} height={760} /><span><strong>Tobby 提醒：</strong>及时回复消息，能提升成交率哦～</span></div></AppShell>;
}

function NotificationDetailPage({ type, navigate }: { type: string; navigate: (to: string) => void }) {
  const notificationType = (['like', 'comment', 'system', 'follow'].includes(type) ? type : 'system') as Notification['type'];
  const [items, setItems] = useState<Notification[]>();
  useEffect(() => { demoRepository.listNotifications().then((values) => setItems(values.filter((item) => item.type === notificationType))); }, [notificationType]);
  const summary = items?.[0] ?? { id: notificationType, type: notificationType, title: { like: '赞与收藏', comment: '评论与回复', system: '系统通知', follow: '新的关注' }[notificationType], subtitle: '暂无新通知', unread: 0 };
  const Icon = { like: Heart, comment: MessageCircle, system: Bell, follow: UserRound }[notificationType];
  return <AppShell active="/messages" navigate={navigate} title={summary.title} back className="notification-detail-page"><section className={`notification-detail-hero ${notificationType}`}><span className={`notice-icon ${notificationType}`}><Icon /></span><div><p>消息分类</p><h1>{summary.title}</h1><span>{summary.subtitle}</span></div><b>{items?.reduce((total, item) => total + item.unread, 0) || 0} 条未读</b></section>{items === undefined ? <InlineLoading /> : items.length ? <div className="notification-feed">{items.map((item, index) => <article key={item.id}><span className="feed-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{item.title}</strong><p>{item.subtitle}</p><time>{item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : ''}</time></div></article>)}</div> : <div className="inline-state"><Image src="/assets/tobby-question.webp" alt="暂无通知" width={760} height={760} /><h3>暂无此类通知</h3></div>}<div className="notification-safe"><ShieldCheck />这里显示的是你的真实站内通知。</div></AppShell>;
}

function ConversationBookMessage({ thread, book, currentUser, user, navigate }: { thread: ChatThread; book: Book; currentUser?: User; user: User; navigate: (to: string) => void }) {
  const mine = !thread.buyerId || thread.buyerId === currentUser?.id;
  return <div className={`message-row ${mine ? 'mine' : ''}`}>{!mine && <Avatar user={user} size={37} />}<div><button className="shared-book" onClick={() => navigate(`/books/${book.id}`)}><BookCover book={book} compact /><span><strong>{book.title}</strong><small>{book.author}</small><b>¥{book.price}</b></span></button><p>我想咨询这本书</p><time>会话关联商品</time></div>{mine && currentUser && <Avatar user={currentUser} size={37} />}</div>;
}

function ChatPage({ threadId, navigate, notify }: { threadId: string; navigate: (to: string) => void; notify: (text: string) => void }) {
  const currentUser = useContext(CurrentUserContext);
  const [thread, setThread] = useState<ChatThread | null | undefined>(() => threadId.startsWith('new-') ? undefined : peekThread(threadId)); const [text, setText] = useState(''); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (threadId.startsWith('new-')) {
          const id = await demoRepository.ensureThread(threadId.replace('new-', ''));
          if (active) navigate(`/messages/${id}`);
          return;
        }
        const cached = peekThread(threadId);
        if (active && cached) setThread(cached);
        const loaded = await demoRepository.getThread(threadId);
        if (!loaded) throw new Error('会话不存在或已不可访问');
        if (active) setThread(loaded);
      } catch (cause) {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : '会话加载失败，请稍后重试';
        setError(message); setThread(null); notify(message);
      }
    })();
    return () => { active = false; };
  }, [threadId, navigate, notify, attempt]);
  if (thread === undefined) return <AppShell navigate={navigate} title="消息" back noNav><InlineLoading /></AppShell>;
  if (thread === null) return <AppShell navigate={navigate} title="消息" back noNav><div className="inline-state large"><Image src="/assets/tobby-sad.webp" alt="会话加载失败" width={760} height={760} /><h3>会话加载失败</h3><p>{error}</p><button className="primary-button" onClick={() => { setThread(undefined); setError(''); setAttempt((value) => value + 1); }}>重新加载</button></div></AppShell>;
  const user = thread.participant || getUser(thread.participantId); const book = thread.book || peekBook(thread.bookId) || seedBooks.find((item) => item.id === thread.bookId) || { ...seedBooks[0], id: thread.bookId, title: '会话关联商品' };
  const send = async () => { if (!text.trim()) return; const message = await demoRepository.sendMessage(thread.id, text.trim()); setThread({ ...thread, messages: [...thread.messages, message] }); setText(''); };
  return <AppShell navigate={navigate} title={user.name} back noNav className="chat-page"><div className="chat-user"><Avatar user={user} size={40} /><span>{user.campus === '未设置' ? '校区未设置' : `${user.campus}校区`} · 站内用户</span></div><div className="chat-safety"><ShieldCheck />站内沟通更安全 · 当面交易请确认书况</div><div className="message-stream"><ConversationBookMessage thread={thread} book={book} currentUser={currentUser} user={user} navigate={navigate} />{thread.messages.map((message) => { const mine = message.senderId === currentUser?.id; return <div className={`message-row ${mine ? 'mine' : ''}`} key={message.id}>{!mine && <Avatar user={user} size={37} />}<div>{message.kind === 'book' && <button className="shared-book" onClick={() => navigate(`/books/${book.id}`)}><BookCover book={book} compact /><span><strong>{book.title}</strong><small>{book.author}</small><b>¥{book.price}</b></span></button>}<p>{message.text}</p><time>{message.createdAt}</time></div>{mine && currentUser && <Avatar user={currentUser} size={37} />}</div>; })}</div><div className="trade-tip">❧ 交易小贴士：请在校内当面交易，确认书况后再付款哦～ ❧</div><div className="chat-composer"><button onClick={() => notify('图片消息暂未开放')}><ImagePlus /></button><button onClick={() => notify('商品链接分享暂未开放')}><Bookmark /></button><input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send(); }} placeholder="输入消息…" aria-label="输入消息" /><button className="send-button" onClick={send}>发送</button></div></AppShell>;
}

function ProfilePage({ navigate, notify, currentUser, onProfileUpdated, onLogout }: { navigate: (to: string) => void; notify: (text: string) => void; currentUser?: User; onProfileUpdated: (profile: User) => void; onLogout: () => void }) {
  const [profile, setProfile] = useState<User | undefined>(currentUser); const [favorites, setFavorites] = useState(() => peekFavorites()?.length || 0); const [listings, setListings] = useState(() => peekMyListings()?.length || 0);
  useEffect(() => {
    void getH5Profile().then((student) => { const user = profileToUser(student); setProfile(user); onProfileUpdated(user); }).catch((cause) => notify(cause instanceof Error ? cause.message : '个人资料加载失败'));
    void demoRepository.listFavorites().then((favoriteBooks) => setFavorites(favoriteBooks.length)).catch(() => undefined);
    void demoRepository.listMyListings().then((myBooks) => setListings(myBooks.length)).catch(() => undefined);
  }, [notify, onProfileUpdated]);
  if (!profile) return <AppShell active="/profile" navigate={navigate}><InlineLoading /></AppShell>;
  return <AppShell active="/profile" navigate={navigate} title="我的" className="profile-page">
    <section className="profile-hero">
      <Avatar user={profile} size={86} />
      <div className="profile-copy"><span className="profile-student-number">学号 {profile.studentNumber || '待同步'}</span><h1>{profile.name}<ShieldCheck /></h1><div className="profile-badges"><span>书海漫游者</span><span><ShieldCheck />学生认证</span></div><p>{profile.campus === '未设置' ? '校区未设置' : `${profile.campus}校区`} · 北京理工大学</p><small>{profile.bio}</small></div>
      <button aria-label="编辑个人资料" onClick={() => navigate('/profile/edit')}><Settings /></button>
    </section>
    <div className="profile-stats"><button onClick={() => navigate('/favorites')}><strong>{favorites}</strong><span>我的收藏</span></button><button onClick={() => navigate('/my-listings')}><strong>{listings}</strong><span>我的发布</span></button><button><strong className="verified-stat">已认证</strong><span>校园身份</span></button></div>
    <div className="profile-reminder"><Image src="/assets/tobby-heart.webp" alt="Tobby 比心提醒" width={760} height={760} /><p><strong>Tobby 提醒：</strong>让闲置继续流动，也会遇见更多书友。</p><button onClick={() => navigate('/category')}>去逛逛 <ChevronRight /></button></div>
    <section className="profile-menu"><h2>书籍管理</h2><MenuButton icon={BookOpen} label="我的发布" detail="在售、已售、草稿与下架" onClick={() => navigate('/my-listings')} /><MenuButton icon={Heart} label="我的收藏" detail="把想看的书放在这里" onClick={() => navigate('/favorites')} /></section>
    <section className="profile-menu"><h2>体验与帮助</h2><MenuButton icon={RefreshCw} label="重新观看新手指引" detail="再次认识搜索、商品卡与发布" onClick={() => navigate('/onboarding')} /></section>
    <section className="profile-menu"><h2>账号与安全</h2><MenuButton icon={ShieldCheck} label="退出登录" detail="清除本机的校园认证状态" onClick={() => { void logoutH5Session().then(() => { demoRepository.clearAuthentication(); onLogout(); navigate('/login'); }).catch(() => notify('退出失败，请检查网络后重试')); }} danger /></section>
  </AppShell>;
}

function ProfileEditPage({ navigate, notify, currentUser, onProfileUpdated }: { navigate: (to: string) => void; notify: (text: string) => void; currentUser?: User; onProfileUpdated: (profile: User) => void }) {
  const [draft, setDraft] = useState<User | undefined>(currentUser); const [saving, setSaving] = useState(false); const avatarInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!currentUser) getH5Profile().then((profile) => setDraft(profileToUser(profile))).catch(() => notify('个人资料加载失败')); }, [currentUser, notify]);
  if (!draft) return <AppShell navigate={navigate} title="编辑个人资料" back noNav className="profile-edit-page"><InlineLoading /></AppShell>;
  const selectAvatar = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return notify('请选择不超过 5MB 的 JPEG、PNG 或 WebP 图片');
    try {
      const avatar = await compressImage(file, 320, .78);
      if (avatar.length > 350_000) return notify('头像压缩后仍然过大，请换一张图片');
      setDraft({ ...draft, avatar });
    } catch { notify('头像处理失败，请换一张图片重试'); }
  };
  const saveProfile = async () => {
    const nickname = draft.name.trim();
    if (nickname.length < 2 || nickname.length > 24) return notify('昵称长度应为 2–24 个字符');
    setSaving(true);
    try {
      const saved = profileToUser(await updateH5Profile({ nickname, avatarUrl: draft.avatar || null, campus: draft.campus === '未设置' ? null : draft.campus, bio: draft.bio === '还没有填写个人简介。' ? '' : draft.bio.trim() }));
      onProfileUpdated(saved); notify('个人资料已保存'); navigate('/profile');
    } catch (cause) { notify(cause instanceof Error ? cause.message : '个人资料保存失败'); }
    finally { setSaving(false); }
  };
  return <AppShell navigate={navigate} title="编辑个人资料" back noNav className="profile-edit-page">
    <section className="profile-edit-intro"><div className="profile-avatar-editor"><Avatar user={draft} size={92} /><div><button className="secondary-button" onClick={() => avatarInput.current?.click()}><Camera />更换头像</button>{draft.avatar && <button className="profile-avatar-clear" onClick={() => setDraft({ ...draft, avatar: undefined })}>移除头像</button>}</div><input ref={avatarInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void selectAvatar(event.target.files?.[0]); event.target.value = ''; }} /></div><p>完善资料，让校友更放心地和你交易。</p></section>
    <section className="profile-edit-card">
      <label className="profile-edit-field"><span>昵称</span><input maxLength={24} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><small>{draft.name.length}/24</small></label>
      <label className="profile-edit-field"><span>校区</span><select value={draft.campus} onChange={(event) => setDraft({ ...draft, campus: event.target.value as User['campus'] })}><option value="未设置">暂不设置</option>{campuses.slice(1).map((campus) => <option value={campus} key={campus}>{campus}</option>)}</select></label>
      <label className="profile-edit-field"><span>个人简介</span><textarea rows={5} maxLength={160} value={draft.bio === '还没有填写个人简介。' ? '' : draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} placeholder="介绍一下自己、常交易的校区或偏好的书籍" /><small>{draft.bio === '还没有填写个人简介。' ? 0 : draft.bio.length}/160</small></label>
    </section>
    <div className="profile-edit-notice"><ShieldCheck /><span><strong>校园身份已认证</strong>学号与认证信息不会公开展示。</span></div>
    <button className="primary-button profile-save" disabled={saving} onClick={saveProfile}>{saving ? <><RefreshCw className="spin" />保存中</> : '保存个人资料'}</button>
  </AppShell>;
}

function MenuButton({ icon: Icon, label, detail, onClick, danger }: { icon: typeof Heart; label: string; detail: string; onClick: () => void; danger?: boolean }) { return <button className={danger ? 'danger' : ''} onClick={onClick}><span><Icon /></span><div><strong>{label}</strong><small>{detail}</small></div><ChevronRight /></button>; }

function FavoritesPage({ navigate, notify }: { navigate: (to: string) => void; notify: (text: string) => void }) {
  const [books, setBooks] = useState<Book[] | undefined>(() => peekFavorites()); useEffect(() => { demoRepository.listFavorites().then(setBooks); }, []);
  return <AppShell navigate={navigate} title="我的收藏" back className="simple-list-page">{books === undefined ? <InlineLoading /> : books.length ? <div className="listing-stack">{books.map((book) => <BookListCard book={book} navigate={navigate} favorite onFavorite={async () => { await demoRepository.toggleFavorite(book.id); setBooks(books.filter((item) => item.id !== book.id)); notify('已取消收藏'); }} key={book.id} />)}</div> : <div className="inline-state large"><Image src="/assets/tobby-question.webp" alt="收藏为空" width={760} height={760} /><h3>收藏夹还空空的</h3><p>看到心仪的书，点一下爱心就能在这里找到它。</p><button className="primary-button" onClick={() => navigate('/category')}>去发现好书</button></div>}</AppShell>;
}

function MyListingsPage({ navigate, notify }: { navigate: (to: string) => void; notify: (text: string) => void }) {
  const [tab, setTab] = useState<ListingStatus | 'all'>('all'); const [books, setBooks] = useState<Book[]>(() => peekMyListings() || []); const [deleteTarget, setDeleteTarget] = useState<Book | null>(null); const [deletingId, setDeletingId] = useState<string>(); const load = useCallback(() => { demoRepository.listMyListings().then(setBooks); }, []); useEffect(load, [load]);
  const visible = tab === 'all' ? books : books.filter((book) => book.status === tab);
  const change = async (book: Book) => { const next: ListingStatus = book.status === 'available' ? 'sold' : 'available'; await demoRepository.updateListingStatus(book.id, next); notify(next === 'sold' ? '已标记为已售' : '已重新上架'); load(); };
  const remove = (book: Book) => setDeleteTarget(book);
  const confirmRemove = async () => {
    if (!deleteTarget || deletingId) return;
    const book = deleteTarget;
    setDeletingId(book.id);
    try {
      await demoRepository.deleteListing(book.id);
      setBooks((current) => current.filter((item) => item.id !== book.id));
      setDeleteTarget(null); notify('已删除这本书'); load();
    } catch (cause) { notify(cause instanceof Error ? cause.message : '删除失败，请稍后重试'); }
    finally { setDeletingId(undefined); }
  };
  return <AppShell navigate={navigate} title="我的发布" back className="simple-list-page"><div className="status-tabs">{([['all', '全部'], ['available', '在售'], ['sold', '已售'], ['offline', '下架']] as const).map(([value, label]) => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{label}</button>)}</div>{visible.length ? visible.map((book) => <div className="manage-listing" key={book.id}><BookListCard book={book} navigate={navigate} ownerView /><div className="manage-listing-actions">{['available', 'offline'].includes(book.status) && <button className="secondary-button" onClick={() => change(book)}>{book.status === 'available' ? '标记已售' : '重新上架'}</button>}<button className="danger-button" onClick={() => remove(book)}><Trash2 />删除</button></div></div>) : <InlineEmpty navigate={navigate} />}<button className="floating-add" onClick={() => navigate('/publish')}><Plus />发布一本书</button>{deleteTarget && <div className="dialog-layer"><button className="dialog-scrim" onClick={() => !deletingId && setDeleteTarget(null)} aria-label="取消删除" /><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title"><div className="confirm-dialog-copy"><span><CircleAlert /></span><div><h2 id="delete-dialog-title">确认删除这本书？</h2><p>《{deleteTarget.title}》删除后不会再公开展示。</p></div></div><div className="confirm-dialog-actions"><button className="secondary-button" disabled={Boolean(deletingId)} onClick={() => setDeleteTarget(null)}>取消</button><button className="danger-button" disabled={Boolean(deletingId)} onClick={() => void confirmRemove()}>{deletingId ? <><RefreshCw className="spin" />删除中</> : <><Trash2 />确认删除</>}</button></div></section></div>}</AppShell>;
}

const stateContent: Record<string, { title: string; text: string; image: string; button: string }> = {
  loading: { title: '正在准备页面', text: '托比正在把书页整理好，请稍等一下。', image: '/assets/tobby-search.webp', button: '返回首页' },
  searching: { title: '正在搜索好书', text: '书架有点大，托比马上把结果带回来。', image: '/assets/tobby-search.webp', button: '返回分类' },
  empty: { title: '这里还没有内容', text: '第一本书，也许就在等你来发布。', image: '/assets/tobby-question.webp', button: '发布一本书' },
  'no-results': { title: '没有找到相关书籍', text: '试试更短的关键词，或放宽校区和成色筛选。', image: '/assets/tobby-question.webp', button: '重新搜索' },
  network: { title: '网络好像走丢了', text: '别担心，已填写的内容仍保存在本机。', image: '/assets/tobby-sad.webp', button: '重新加载' },
  maintenance: { title: '托比正在维护书架', text: '系统很快回来，稍后再来看看吧。', image: '/assets/tobby-maintenance.webp', button: '返回首页' },
  unavailable: { title: '这本书目前不可用', text: '它可能已经售出或暂时下架，再看看其他好书吧。', image: '/assets/tobby-unavailable.webp', button: '发现其他书' },
  published: { title: '发布成功！', text: '你的闲置已经上架，其他同学现在就能看到。', image: '/assets/tobby-cheer.webp', button: '查看我的发布' },
  '404': { title: '好像翻错书页了', text: '这个页面不存在，托比带你回到熟悉的地方。', image: '/assets/tobby-sad.webp', button: '返回首页' },
};

function StatePage({ type, navigate }: { type: string; navigate: (to: string) => void }) {
  if (type === 'index') return <AppShell navigate={navigate} title="演示与状态" back className="states-index"><div className="state-grid">{Object.entries(stateContent).filter(([key]) => key !== '404').map(([key, value]) => <button onClick={() => navigate(`/states/${key}`)} key={key}><img src={value.image} alt="" /><span>{value.title}</span><ChevronRight /></button>)}</div></AppShell>;
  const content = stateContent[type] ?? stateContent['404']; const destination = type === 'published' ? '/my-listings' : type === 'empty' ? '/publish' : ['searching', 'no-results', 'unavailable'].includes(type) ? '/category' : '/home';
  return <section className="phone-shell full-state"><div className="paper-texture" /><Brand /><div className="state-orbit" /><Image src={content.image} alt={content.title} width={760} height={760} priority /><h1>{content.title}</h1><p>{content.text}</p>{['loading', 'searching'].includes(type) && <span className="loading-bar"><i /></span>}<button className="primary-button" onClick={() => navigate(destination)}>{content.button}</button><small>BITerStore · 让每一本书继续被需要</small></section>;
}

export function MobileApp({ initialPath }: { initialPath: string }) {
  const hasCurrentAssetBundle = () => window.localStorage.getItem(UI_ASSET_BUNDLE_KEY) === UI_ASSET_BUNDLE_VERSION;
  const [path, setPath] = useState(initialPath || '/'); const [toast, setToast] = useState(''); const [assetProgress, setAssetProgress] = useState(() => hasCurrentAssetBundle() ? 100 : 0); const [assetsReady, setAssetsReady] = useState(hasCurrentAssetBundle); const [authMode, setAuthMode] = useState<'authenticated' | 'guest' | 'anonymous'>(() => { const sid = demoRepository.getAuthenticatedSid(); return sid === 'guest' ? 'guest' : sid ? 'authenticated' : 'anonymous'; }); const [currentUser, setCurrentUser] = useState<User | undefined>(readProfileSnapshot);
  const navigate = useCallback((to: string) => { window.history.pushState({}, '', to); setPath(to.split('?')[0] || '/'); }, []);
  useEffect(() => { const handler = () => setPath(window.location.pathname); window.addEventListener('popstate', handler); return () => window.removeEventListener('popstate', handler); }, []);
  useEffect(() => { if (!toast || /正在上传并发布\s+(?:[0-9]|[1-9][0-9])%$/.test(toast)) return; const timer = setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    let active = true;
    const cached = window.localStorage.getItem(UI_ASSET_BUNDLE_KEY) === UI_ASSET_BUNDLE_VERSION;
    if (cached) {
      void warmUiAssetBundle(() => undefined);
      return () => { active = false; };
    }
    const started = Date.now();
    warmUiAssetBundle((value) => { if (active) setAssetProgress(value); }).then(async (complete) => {
      if (complete) window.localStorage.setItem(UI_ASSET_BUNDLE_KEY, UI_ASSET_BUNDLE_VERSION);
      const remaining = Math.max(0, 900 - (Date.now() - started));
      if (remaining) await new Promise((resolve) => window.setTimeout(resolve, remaining));
      if (active) { setAssetProgress(100); setAssetsReady(true); }
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const sid = demoRepository.getAuthenticatedSid();
    if (sid && sid !== 'guest') void warmAccountSnapshots();
    void restoreH5Session().then((user) => {
      if (!active) return;
      if (user?.campusStatus === 'VERIFIED') {
        demoRepository.markAuthenticated(user.id);
        if (sid !== user.id) void warmAccountSnapshots();
        const profile = profileToUser(user);
        writeProfileSnapshot(profile);
        setCurrentUser(profile);
        setAuthMode('authenticated');
      } else if (!demoRepository.getAuthenticatedSid()) { writeProfileSnapshot(); setCurrentUser(undefined); setAuthMode('anonymous'); }
    });
    return () => { active = false; };
  }, []);
  const notify = useCallback((text: string) => setToast(text), []);
  const updateCurrentUser = useCallback((profile: User) => { writeProfileSnapshot(profile); setCurrentUser(profile); }, []);
  const clearCurrentUser = useCallback(() => { writeProfileSnapshot(); setCurrentUser(undefined); setAuthMode('anonymous'); }, []);
  const toastProgress = Number(toast.match(/正在上传并发布\s+(\d+)%$/)?.[1] || 0);
  if (!assetsReady) return <main className="app-stage"><div className="route-view"><BootScreen progress={assetProgress} /></div></main>;
  const privatePaths = ['/publish', '/messages', '/profile', '/favorites', '/my-listings'];
  const needsAccount = privatePaths.some((candidate) => path === candidate || path.startsWith(`${candidate}/`));
  const effectivePath = needsAccount && authMode !== 'authenticated'
    ? '/login'
    : path === '/' && demoRepository.isOnboardingComplete() ? (authMode === 'anonymous' ? '/login' : '/home') : path;
  let page: React.ReactNode;
  if (effectivePath === '/') page = <WelcomePage navigate={navigate} />;
  else if (effectivePath === '/onboarding') page = <OnboardingPage navigate={navigate} />;
  else if (effectivePath === '/login') page = <LoginPage navigate={navigate} onAuthenticated={(profile) => { const next = profileToUser(profile); writeProfileSnapshot(next); setCurrentUser(next); setAuthMode('authenticated'); }} onGuest={() => { writeProfileSnapshot(); setCurrentUser(undefined); setAuthMode('guest'); }} />;
  else if (effectivePath === '/home') page = <HomePage navigate={navigate} />;
  else if (effectivePath === '/category') page = <CategoryPage navigate={navigate} notify={notify} />;
  else if (effectivePath.startsWith('/books/')) page = <BookDetailPage id={effectivePath.split('/')[2]} navigate={navigate} notify={notify} />;
  else if (effectivePath === '/publish') page = <PublishPage navigate={navigate} notify={notify} />;
  else if (effectivePath === '/messages') page = <MessagesPage navigate={navigate} />;
  else if (effectivePath.startsWith('/messages/notifications/')) page = <NotificationDetailPage type={effectivePath.split('/')[3]} navigate={navigate} />;
  else if (effectivePath.startsWith('/messages/')) page = <ChatPage threadId={effectivePath.split('/')[2]} navigate={navigate} notify={notify} />;
  else if (effectivePath === '/profile/edit') page = <ProfileEditPage navigate={navigate} notify={notify} currentUser={currentUser} onProfileUpdated={updateCurrentUser} />;
  else if (effectivePath === '/profile') page = <ProfilePage navigate={navigate} notify={notify} currentUser={currentUser} onProfileUpdated={updateCurrentUser} onLogout={clearCurrentUser} />;
  else if (effectivePath === '/favorites') page = <FavoritesPage navigate={navigate} notify={notify} />;
  else if (effectivePath === '/my-listings') page = <MyListingsPage navigate={navigate} notify={notify} />;
  else if (effectivePath === '/states') page = <StatePage type="index" navigate={navigate} />;
  else if (effectivePath.startsWith('/states/')) page = <StatePage type={effectivePath.split('/')[2]} navigate={navigate} />;
  else page = <StatePage type="404" navigate={navigate} />;
  return <CurrentUserContext.Provider value={currentUser}><main className="app-stage"><div className="route-view" key={effectivePath}>{page}</div>{toast && <div className={`toast ${toastProgress ? 'progress-toast' : ''}`} role="status"><Leaf size={17} /><span>{toast}</span>{toastProgress > 0 && <progress max="100" value={toastProgress} />}</div>}</main></CurrentUserContext.Provider>;
}
