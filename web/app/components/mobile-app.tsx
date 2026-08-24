'use client';

/* eslint-disable @next/next/no-img-element -- avatars and user uploads can be IndexedDB data URLs. */

import Image from 'next/image';
import {
  ArrowLeft, Bell, BookOpen, Bookmark, Camera, Check, ChevronDown, ChevronRight,
  CircleAlert, Filter, Grid2X2, Heart, Home, ImagePlus, Info, Leaf, MapPin,
  MessageCircle, MoreHorizontal, PackageCheck, Plus, RefreshCw, RotateCcw,
  Search, Send, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Star, Trash2,
  UserRound, WandSparkles, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CURRENT_USER_ID, notifications, seedBooks } from '../lib/demo-data';
import { compressImage, getImages, saveImages } from '../lib/image-store';
import { defaultFilters, demoRepository, getUser } from '../lib/repository';
import type { Book, BookFilters, ChatThread, Condition, ListingStatus, PublishDraft, User } from '../lib/types';

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

const emptyDraft: PublishDraft = {
  title: '', author: '', isbn: '', category: '教材教辅', course: '', price: '', originalPrice: '',
  condition: '九成新', campus: '良乡', description: '', tags: [],
};

function formatPrice(price: number) { return price.toFixed(2); }
function statusLabel(status: ListingStatus) { return { available: '可交易', sold: '已售', offline: '已下架', draft: '草稿' }[status]; }

function Brand() {
  return <span className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>BITerStore</span></span>;
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
  return (
    <header className={`topbar ${title ? 'page-topbar' : ''}`}>
      {back ? <button className="round-button" onClick={() => history.back()} aria-label="返回"><ArrowLeft /></button> : <button className="brand-button" onClick={() => navigate('/home')} aria-label="返回首页"><Brand /></button>}
      {title && <h1>{title}</h1>}
      <div className="top-actions"><button className="icon-button" aria-label="通知"><Bell size={24} /><i className="notification-dot" /></button>{!title && <Avatar user={getUser(CURRENT_USER_ID)} size={38} />}{title && <button className="icon-button" aria-label="更多"><MoreHorizontal /></button>}</div>
    </header>
  );
}

function AppShell({ children, active, navigate, title, back = false, noNav = false, className = '' }: { children: React.ReactNode; active?: string; navigate: (to: string) => void; title?: string; back?: boolean; noNav?: boolean; className?: string }) {
  return (
    <section className={`phone-shell ${className}`}>
      <div className="paper-texture" aria-hidden="true" />
      <Topbar title={title} back={back} navigate={navigate} />
      <div className={`content-scroll ${noNav ? 'no-nav' : ''}`}>{children}</div>
      {!noNav && <BottomNav active={active ?? ''} navigate={navigate} />}
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

function BookListCard({ book, navigate, favorite, onFavorite }: { book: Book; navigate: (to: string) => void; favorite?: boolean; onFavorite?: (book: Book) => void }) {
  const seller = getUser(book.sellerId);
  return (
    <article className={`listing-card ${book.status !== 'available' ? 'unavailable-card' : ''}`}>
      <button className="listing-main" onClick={() => navigate(`/books/${book.id}`)}>
        <BookCover book={book} compact />
        <div className="listing-copy">
          <div className="listing-heading"><h3>{book.title}</h3><MoreHorizontal size={17} /></div>
          <p>{book.author}</p>
          <div className="listing-price"><strong>¥{formatPrice(book.price)}</strong><del>¥{formatPrice(book.originalPrice)}</del><span>{book.condition}</span></div>
          <div className="listing-detail"><MapPin size={13} />{book.campus}校区 <BookOpen size={13} />{book.course}</div>
          <div className="seller-line"><Avatar user={seller} size={25} /><span>{seller.name}</span><Star size={12} fill="currentColor" />4.9分</div>
        </div>
      </button>
      <div className="listing-actions">
        <button onClick={() => onFavorite?.(book)}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} />{favorite ? '已收藏' : '收藏'}</button>
        <button onClick={() => navigate(`/messages/new-${book.id}`)}><MessageCircle size={17} />联系卖家</button>
        <button className="detail-action" onClick={() => navigate(`/books/${book.id}`)}>详情 <ChevronRight size={15} /></button>
      </div>
      <span className={`status-badge ${book.status}`}>{statusLabel(book.status)}</span>
    </article>
  );
}

function WelcomePage({ navigate }: { navigate: (to: string) => void }) {
  return (
    <section className="phone-shell welcome-page">
      <div className="welcome-decoration" aria-hidden="true" />
      <header className="welcome-brand"><Brand /><span className="leaf-seal"><Leaf /></span></header>
      <div className="welcome-copy"><span>你好呀，我是托比 <Leaf size={14} /></span><h1>欢迎来到你的<br /><em>校园二手书小站</em></h1><p>搜索闲置教材、发布旧书、站内联系，<br />在校内安心完成交易。</p></div>
      <Image className="welcome-tobby" src="/assets/tobby-master.webp" alt="Tobby 欢迎你来到 BITerStore" width={760} height={760} priority />
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
  const complete = () => { demoRepository.completeOnboarding(); navigate('/home'); };
  const current = steps[step];
  return (
    <section className="phone-shell onboarding-page">
      <div className="onboarding-preview"><div className="fake-brand"><Brand /></div><div className="fake-search" /><div className="fake-hero" /><div className="fake-cards"><i /><i /><i /></div><div className="fake-nav" /></div>
      <div className="onboarding-scrim" />
      <div className="onboarding-panel">
        <div className="onboarding-heading"><span>新手指引 {step + 1}/3</span><button onClick={complete}>跳过</button></div>
        <Image src={current.image} alt="Tobby 新手引导" width={760} height={760} />
        <div className="guide-card"><small>STEP 0{step + 1}</small><h1>{current.title}</h1><p>{current.text}</p><div className="guide-pills">{current.targets.map((target) => <span key={target}><Check size={12} />{target}</span>)}</div></div>
        <div className="step-dots">{steps.map((_, index) => <i className={index === step ? 'active' : ''} key={index} />)}</div>
        <div className="guide-actions">{step > 0 && <button className="secondary-button" onClick={() => setStep(step - 1)}>上一步</button>}<button className="primary-button" onClick={() => step === 2 ? complete() : setStep(step + 1)}>{step === 2 ? '开始使用' : '下一步'}</button></div>
      </div>
    </section>
  );
}

function HomePage({ navigate }: { navigate: (to: string) => void }) {
  return (
    <AppShell active="/home" navigate={navigate} className="home-page">
      <button className="search-box" onClick={() => navigate('/category')}><Search size={21} /><span>搜索书名、作者或 ISBN</span><SlidersHorizontal size={18} /></button>
      <nav className="category-chips">{categories.map((category, index) => <button className={index === 0 ? 'chip active' : 'chip'} onClick={() => navigate(`/category?category=${encodeURIComponent(category)}`)} key={category}>{category}</button>)}</nav>
      <section className="hero-card"><div className="hero-copy"><p className="eyebrow">书页轻翻 · 好物续航</p><h1>以书会友<br />共享知识之美</h1><p>让每一本闲置书，遇见下一位需要它的人。</p><button className="hero-button" onClick={() => navigate('/category')}>探索好书 <span>→</span></button></div><Image className="hero-tobby" src="/assets/tobby-hello.webp" alt="Tobby 抱着书向你打招呼" width={760} height={760} priority /></section>
      <section className="section-block"><div className="section-title"><h2>精选推荐</h2><button onClick={() => navigate('/category')}>查看全部 ›</button></div><div className="book-row">{seedBooks.slice(0, 5).map((book) => <BookTile book={book} navigate={navigate} key={book.id} />)}</div></section>
      <section className="ranking-card"><div className="section-title"><h2>校园热榜</h2><span>本周流动好书</span></div>{seedBooks.slice(0, 3).map((book, index) => <button className="rank-item" onClick={() => navigate(`/books/${book.id}`)} key={book.id}><span className="rank-number">0{index + 1}</span><span><strong>{book.title}</strong><small>{book.author} · {book.campus}校区</small></span><b>¥{book.price}</b></button>)}</section>
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
  const [books, setBooks] = useState<Book[]>([]); const [loading, setLoading] = useState(true); const [sheet, setSheet] = useState(false); const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    demoRepository.listBooks(filters).then((result) => {
      if (active) { setBooks(result); setLoading(false); }
    });
    return () => { active = false; };
  }, [filters]);
  const toggle = async (book: Book) => { const active = await demoRepository.toggleFavorite(book.id); setFavorites((ids) => active ? [...new Set([...ids, book.id])] : ids.filter((id) => id !== book.id)); notify(active ? '已收藏这本书' : '已取消收藏'); };
  return <AppShell active="/category" navigate={navigate} className="category-page"><div className="search-input"><Search size={20} /><input aria-label="搜索书籍" placeholder="搜索书名 / 作者 / ISBN / 课程" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} /><button onClick={() => setFilters({ ...filters, query: '' })}>{filters.query ? <X size={18} /> : <Camera size={19} />}</button></div><nav className="category-chips">{categories.map((category) => <button className={filters.category === category ? 'chip active' : 'chip'} onClick={() => setFilters({ ...filters, category })} key={category}>{category}</button>)}</nav><div className="quick-filters"><button onClick={() => setSheet(true)}>校区 <ChevronDown /></button><button onClick={() => setSheet(true)}>成色 <ChevronDown /></button><button onClick={() => setSheet(true)}>价格 <ChevronDown /></button><button onClick={() => setFilters({ ...filters, sort: filters.sort === '最新发布' ? '价格从低到高' : '最新发布' })}>{filters.sort} <ChevronDown /></button><button className="filter-trigger" onClick={() => setSheet(true)}><Filter size={16} />筛选</button></div><div className="results-heading"><h2>为你找到 <em>{books.length}</em> 本书</h2><span>{filters.availableOnly ? '只显示可交易' : '显示全部状态'}</span></div>{loading ? <InlineLoading /> : books.length ? <div className="listing-stack">{books.map((book) => <BookListCard book={book} navigate={navigate} favorite={favorites.includes(book.id)} onFavorite={toggle} key={book.id} />)}</div> : <InlineEmpty navigate={navigate} />}{sheet && <FilterSheet filters={filters} onChange={setFilters} onClose={() => setSheet(false)} count={books.length} />}</AppShell>;
}

function InlineLoading() { return <div className="inline-state"><Image src="/assets/tobby-search.webp" alt="正在搜索" width={760} height={760} /><h3>托比正在翻找书架…</h3><span className="loading-bar"><i /></span></div>; }
function InlineEmpty({ navigate }: { navigate: (to: string) => void }) { return <div className="inline-state"><Image src="/assets/tobby-question.webp" alt="没有搜索结果" width={760} height={760} /><h3>这次没有找到合适的书</h3><p>换个关键词，或者发布一条求书心愿吧。</p><button className="secondary-button" onClick={() => navigate('/states/no-results')}>查看空状态</button></div>; }

function BookDetailPage({ id, navigate, notify }: { id: string; navigate: (to: string) => void; notify: (text: string) => void }) {
  const [book, setBook] = useState<Book | null>(); const [favorite, setFavorite] = useState(false); const [images, setImages] = useState<string[]>([]);
  useEffect(() => { demoRepository.getBook(id).then((value) => { setBook(value); if (value?.imageStoreKey) getImages(value.imageStoreKey).then(setImages); }); }, [id]);
  if (book === undefined) return <AppShell navigate={navigate} title="商品详情" back noNav><InlineLoading /></AppShell>;
  if (!book) return <StatePage type="404" navigate={navigate} />;
  const seller = getUser(book.sellerId); const unavailable = book.status !== 'available';
  const contact = async () => { if (unavailable) return navigate('/states/unavailable'); const thread = await demoRepository.ensureThread(book.id); navigate(`/messages/${thread}`); };
  return <AppShell navigate={navigate} title="商品详情" back className="detail-page"><div className="detail-gallery">{images.length ? images.map((image) => <img src={image} alt={`${book.title} 实拍图`} key={image.slice(-20)} />) : <BookCover book={book} />}{unavailable && <span>{statusLabel(book.status)}</span>}</div><section className="detail-card"><div className="detail-title"><div><span className={`status-pill ${book.status}`}>{statusLabel(book.status)}</span><h1>{book.title}</h1><p>{book.author}</p></div><button onClick={async () => { const active = await demoRepository.toggleFavorite(book.id); setFavorite(active); notify(active ? '收藏成功' : '已取消收藏'); }} aria-label="收藏"><Heart fill={favorite ? 'currentColor' : 'none'} /></button></div><div className="detail-price"><strong>¥{formatPrice(book.price)}</strong><del>¥{formatPrice(book.originalPrice)}</del><span>{book.condition}</span></div><div className="detail-facts"><span><MapPin />{book.campus}校区</span><span><BookOpen />{book.course}</span><span><Info />ISBN {book.isbn}</span></div><div className="description-block"><h2>书籍简介</h2><p>{book.description}</p><div>{book.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div></section><section className="seller-card"><Avatar user={seller} size={52} /><div><h3>{seller.name} <ShieldCheck /></h3><p>{seller.campus}校区 · 已完成校园认证</p><span>{seller.responseTime}</span></div><button onClick={contact}>联系</button></section><div className="safety-note"><ShieldCheck />建议在校内公共场所当面验书，确认书况后再付款。</div><div className="detail-cta"><button onClick={() => notify('举报入口已记录，演示中不会真实提交')}><CircleAlert />举报</button><button className="primary-button" disabled={unavailable} onClick={contact}><MessageCircle />{unavailable ? '当前不可联系' : '联系卖家'}</button></div></AppShell>;
}

function PublishPage({ navigate, notify }: { navigate: (to: string) => void; notify: (text: string) => void }) {
  const [step, setStep] = useState(1); const [draft, setDraft] = useState<PublishDraft>(emptyDraft); const [images, setImages] = useState<string[]>([]); const [aiLoading, setAiLoading] = useState(false); const [errors, setErrors] = useState<string[]>([]); const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { demoRepository.getDraft().then((value) => { if (value) { setDraft(value); if (value.imageStoreKey) getImages(value.imageStoreKey).then(setImages); } }); }, []);
  const update = <K extends keyof PublishDraft>(key: K, value: PublishDraft[K]) => setDraft((valueDraft) => ({ ...valueDraft, [key]: value }));
  const handleFiles = async (files: FileList | null) => { if (!files) return; const next = await Promise.all(Array.from(files).slice(0, 6).map(compressImage)); const key = draft.imageStoreKey ?? `draft-${Date.now()}`; await saveImages(key, next); setImages(next); setDraft({ ...draft, imageStoreKey: key }); notify(`已添加 ${next.length} 张图片`); };
  const runAi = () => { setAiLoading(true); setTimeout(() => { setDraft({ ...draft, title: '高等数学（第七版）上册', author: '同济大学数学系 编', isbn: '978-7-5608-9493-7', category: '教材教辅', course: '高等数学', price: '26', originalPrice: '49.8', condition: '九成新', description: '同济版经典教材，例题讲解清晰，笔记和标注较少，整体干净整洁，适合期末复习备考。', tags: ['考研必备', '期末复习', '笔记少'] }); setAiLoading(false); setStep(2); notify('托比已经帮你补全书籍信息'); }, 1100); };
  const validate = () => { const next = [!draft.title && '请填写书名', !draft.author && '请填写作者', !draft.price && '请填写价格', !draft.description && '请填写商品简介'].filter(Boolean) as string[]; setErrors(next); return next.length === 0; };
  const save = async () => { await demoRepository.saveDraft(draft); notify('草稿已保存'); };
  const nextStep = () => { if (step === 1) setStep(2); else if (step === 2 && validate()) setStep(3); };
  const publish = async () => { if (!validate()) return setStep(2); await demoRepository.publishListing(draft); navigate('/states/published'); };
  return <AppShell active="/publish" navigate={navigate} title="发布闲置书籍" className="publish-page"><div className="stepper">{['上传图片', '填写信息', '确认发布'].map((label, index) => <div className={step >= index + 1 ? 'active' : ''} key={label}><span>{index + 1}</span><p>{label}</p>{index < 2 && <i />}</div>)}</div>{step === 1 && <><section className="upload-card"><div className="image-grid">{images.map((image, index) => <div className="upload-preview" key={image.slice(-20)}><img src={image} alt={`上传图片 ${index + 1}`} /><button onClick={() => setImages(images.filter((_, valueIndex) => valueIndex !== index))}><X /></button></div>)}<button className="add-image" onClick={() => inputRef.current?.click()}><Camera /><strong>添加图片</strong><span>最多 6 张</span></button></div><input ref={inputRef} hidden type="file" accept="image/*" multiple onChange={(event) => handleFiles(event.target.files)} /><div className="tobby-tip"><Image src="/assets/tobby-guide-publish.webp" alt="Tobby 提醒拍摄封面" width={760} height={760} /><span>拍下封面，托比来帮你补全信息～</span></div></section><section className="ai-card"><div><p><Sparkles />Tobby 一键成文</p><span>上传封面后，自动生成书名、ISBN、分类与简介。</span></div><button onClick={runAi} disabled={aiLoading}>{aiLoading ? <><RefreshCw className="spin" />识别中…</> : <><WandSparkles />一键识别生成</>}</button></section></>}{step === 2 && <section className="form-card"><FormField label="书名" required error={errors.includes('请填写书名')}><input value={draft.title} onChange={(event) => update('title', event.target.value)} /></FormField><div className="form-grid"><FormField label="作者" required error={errors.includes('请填写作者')}><input value={draft.author} onChange={(event) => update('author', event.target.value)} /></FormField><FormField label="ISBN"><input value={draft.isbn} onChange={(event) => update('isbn', event.target.value)} /></FormField><FormField label="课程 / 分类" required><select value={draft.category} onChange={(event) => update('category', event.target.value)}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></FormField><FormField label="成色" required><select value={draft.condition} onChange={(event) => update('condition', event.target.value as Condition)}>{conditions.slice(1).map((condition) => <option key={condition}>{condition}</option>)}</select></FormField><FormField label="价格" required error={errors.includes('请填写价格')}><input type="number" inputMode="decimal" value={draft.price} onChange={(event) => update('price', event.target.value)} placeholder="¥ 0.00" /></FormField><FormField label="校区" required><select value={draft.campus} onChange={(event) => update('campus', event.target.value as PublishDraft['campus'])}>{campuses.slice(1).map((campus) => <option key={campus}>{campus}</option>)}</select></FormField></div><FormField label="商品简介" required error={errors.includes('请填写商品简介')}><textarea rows={5} maxLength={300} value={draft.description} onChange={(event) => update('description', event.target.value)} /></FormField><div className="tag-picker"><span>添加标签</span>{['考研必备', '期末复习', '笔记少', '教材'].map((tag) => <button className={draft.tags.includes(tag) ? 'active' : ''} onClick={() => update('tags', draft.tags.includes(tag) ? draft.tags.filter((value) => value !== tag) : [...draft.tags, tag])} key={tag}>{tag}</button>)}</div>{errors.length > 0 && <div className="form-error"><CircleAlert />{errors.join('、')}</div>}</section>}{step === 3 && <section className="publish-preview"><p className="eyebrow">发布前最后确认</p><BookListCard book={{ ...seedBooks[0], id: 'preview', title: draft.title, author: draft.author, price: Number(draft.price || 0), originalPrice: Number(draft.originalPrice || draft.price || 0), condition: draft.condition, campus: draft.campus, description: draft.description, tags: draft.tags, status: 'available', course: draft.course || draft.category }} navigate={() => setStep(2)} /><div className="safety-note"><ShieldCheck />请确认图片和描述真实准确，联系方式仅对发起咨询的同学可见。</div></section>}<div className="publish-actions">{step === 2 && <button className="secondary-button" onClick={save}>保存草稿</button>}{step > 1 && <button className="secondary-button" onClick={() => setStep(step - 1)}>上一步</button>}<button className="primary-button" onClick={step === 3 ? publish : nextStep}>{step === 3 ? '发布上架' : '下一步'}</button></div></AppShell>;
}

function FormField({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: boolean }) { return <label className={`form-field ${error ? 'error' : ''}`}><span>{required && <em>*</em>}{label}</span>{children}</label>; }

function MessagesPage({ navigate }: { navigate: (to: string) => void }) {
  const [threads, setThreads] = useState<ChatThread[]>([]); useEffect(() => { demoRepository.listThreads().then(setThreads); }, []);
  return <AppShell active="/messages" navigate={navigate} title="消息" className="messages-page"><div className="notification-grid">{notifications.map((item) => { const Icon = { like: Heart, comment: MessageCircle, system: Bell, follow: UserRound }[item.type]; return <button key={item.id}><span className={`notice-icon ${item.type}`}><Icon /></span><div><strong>{item.title}</strong><p>{item.subtitle}</p></div>{item.unread > 0 && <b>{item.unread}</b>}</button>; })}</div><div className="section-title message-title"><h2>私聊消息</h2><span><Check size={14} />全部已读</span></div><div className="thread-list">{threads.map((thread) => { const user = getUser(thread.participantId); const last = thread.messages.at(-1); return <button onClick={() => navigate(`/messages/${thread.id}`)} key={thread.id}><Avatar user={user} size={54} /><div><h3>{user.name}<span>{user.campus}校区</span></h3><p>{last?.text || '从一本书开始聊聊吧'}</p></div><time>{thread.updatedAt}</time>{thread.unread > 0 && <b>{thread.unread}</b>}</button>; })}</div><div className="tobby-banner"><Image src="/assets/tobby-hello.webp" alt="Tobby 消息提醒" width={760} height={760} /><span><strong>Tobby 提醒：</strong>及时回复消息，能提升成交率哦～</span></div></AppShell>;
}

function ChatPage({ threadId, navigate, notify }: { threadId: string; navigate: (to: string) => void; notify: (text: string) => void }) {
  const [thread, setThread] = useState<ChatThread | null>(); const [text, setText] = useState('');
  useEffect(() => { if (threadId.startsWith('new-')) { demoRepository.ensureThread(threadId.replace('new-', '')).then((id) => navigate(`/messages/${id}`)); } else demoRepository.getThread(threadId).then(setThread); }, [threadId, navigate]);
  if (!thread) return <AppShell navigate={navigate} title="消息" back noNav><InlineLoading /></AppShell>;
  const user = getUser(thread.participantId); const book = seedBooks.find((item) => item.id === thread.bookId) ?? seedBooks[0];
  const send = async () => { if (!text.trim()) return; const message = await demoRepository.sendMessage(thread.id, text.trim()); setThread({ ...thread, messages: [...thread.messages, message] }); setText(''); };
  return <AppShell navigate={navigate} title={user.name} back noNav className="chat-page"><div className="chat-user"><Avatar user={user} size={40} /><span>{user.campus}校区 · 在线</span></div><div className="chat-safety"><ShieldCheck />站内沟通更安全 · 当面交易请确认书况</div><div className="message-stream">{thread.messages.map((message) => { const mine = message.senderId === CURRENT_USER_ID; return <div className={`message-row ${mine ? 'mine' : ''}`} key={message.id}>{!mine && <Avatar user={user} size={37} />}<div>{message.kind === 'book' && <button className="shared-book" onClick={() => navigate(`/books/${book.id}`)}><BookCover book={book} compact /><span><strong>{book.title}</strong><small>{book.author}</small><b>¥{book.price}</b></span></button>}<p>{message.text}</p><time>{message.createdAt}</time></div>{mine && <Avatar user={getUser(CURRENT_USER_ID)} size={37} />}</div>; })}</div><div className="trade-tip">❧ 交易小贴士：请在校内当面交易，确认书况后再付款哦～ ❧</div><div className="chat-composer"><button onClick={() => notify('图片发送为纯前端演示')}><ImagePlus /></button><button onClick={() => notify('商品链接已准备分享')}><Bookmark /></button><input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} placeholder="输入消息…" aria-label="输入消息" /><button className="send-button" onClick={send}>发送</button></div></AppShell>;
}

function ProfilePage({ navigate, notify }: { navigate: (to: string) => void; notify: (text: string) => void }) {
  const [profile, setProfile] = useState<User>(); const [favorites, setFavorites] = useState(0); const [listings, setListings] = useState(0);
  useEffect(() => { Promise.all([demoRepository.getProfile(), demoRepository.listFavorites(), demoRepository.listMyListings()]).then(([user, favoriteBooks, myBooks]) => { setProfile(user); setFavorites(favoriteBooks.length); setListings(myBooks.length); }); }, []);
  if (!profile) return <AppShell active="/profile" navigate={navigate}><InlineLoading /></AppShell>;
  const reset = async () => { await demoRepository.resetDemoData(); notify('演示数据已重置'); navigate('/'); };
  return <AppShell active="/profile" navigate={navigate} title="我的" className="profile-page"><section className="profile-hero"><Avatar user={profile} size={78} /><div><h1>{profile.name}<ShieldCheck /></h1><p>{profile.campus}校区 · 北理身份已认证</p><span>{profile.bio}</span></div><button aria-label="设置"><Settings /></button></section><div className="profile-stats"><button onClick={() => navigate('/favorites')}><strong>{favorites}</strong><span>我的收藏</span></button><button onClick={() => navigate('/my-listings')}><strong>{listings}</strong><span>我的发布</span></button><button><strong>12</strong><span>校园信用</span></button></div><section className="profile-menu"><h2>书籍管理</h2><MenuButton icon={BookOpen} label="我的发布" detail="在售、已售、草稿与下架" onClick={() => navigate('/my-listings')} /><MenuButton icon={Heart} label="我的收藏" detail="把想看的书放在这里" onClick={() => navigate('/favorites')} /></section><section className="profile-menu"><h2>体验与帮助</h2><MenuButton icon={RefreshCw} label="重新观看新手指引" detail="再次认识搜索、商品卡与发布" onClick={() => navigate('/onboarding')} /><MenuButton icon={Sparkles} label="演示与状态" detail="查看空状态、错误、维护等页面" onClick={() => navigate('/states')} /><MenuButton icon={RotateCcw} label="重置演示数据" detail="清空收藏、草稿、发布与消息变化" onClick={reset} danger /></section><div className="profile-tobby"><Image src="/assets/tobby-heart.webp" alt="Tobby 比心" width={760} height={760} /><p>谢谢你让闲置继续流动。</p></div></AppShell>;
}

function MenuButton({ icon: Icon, label, detail, onClick, danger }: { icon: typeof Heart; label: string; detail: string; onClick: () => void; danger?: boolean }) { return <button className={danger ? 'danger' : ''} onClick={onClick}><span><Icon /></span><div><strong>{label}</strong><small>{detail}</small></div><ChevronRight /></button>; }

function FavoritesPage({ navigate, notify }: { navigate: (to: string) => void; notify: (text: string) => void }) {
  const [books, setBooks] = useState<Book[]>(); useEffect(() => { demoRepository.listFavorites().then(setBooks); }, []);
  return <AppShell navigate={navigate} title="我的收藏" back className="simple-list-page">{books === undefined ? <InlineLoading /> : books.length ? <div className="listing-stack">{books.map((book) => <BookListCard book={book} navigate={navigate} favorite onFavorite={async () => { await demoRepository.toggleFavorite(book.id); setBooks(books.filter((item) => item.id !== book.id)); notify('已取消收藏'); }} key={book.id} />)}</div> : <div className="inline-state large"><Image src="/assets/tobby-question.webp" alt="收藏为空" width={760} height={760} /><h3>收藏夹还空空的</h3><p>看到心仪的书，点一下爱心就能在这里找到它。</p><button className="primary-button" onClick={() => navigate('/category')}>去发现好书</button></div>}</AppShell>;
}

function MyListingsPage({ navigate, notify }: { navigate: (to: string) => void; notify: (text: string) => void }) {
  const [tab, setTab] = useState<ListingStatus | 'all'>('all'); const [books, setBooks] = useState<Book[]>([]); const load = useCallback(() => { demoRepository.listMyListings().then(setBooks); }, []); useEffect(load, [load]);
  const visible = tab === 'all' ? books : books.filter((book) => book.status === tab);
  const change = async (book: Book) => { const next: ListingStatus = book.status === 'available' ? 'sold' : 'available'; await demoRepository.updateListingStatus(book.id, next); notify(next === 'sold' ? '已标记为已售' : '已重新上架'); load(); };
  return <AppShell navigate={navigate} title="我的发布" back className="simple-list-page"><div className="status-tabs">{([['all', '全部'], ['available', '在售'], ['sold', '已售'], ['offline', '下架']] as const).map(([value, label]) => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{label}</button>)}</div>{visible.length ? visible.map((book) => <div className="manage-listing" key={book.id}><BookListCard book={book} navigate={navigate} /><button className="secondary-button" onClick={() => change(book)}>{book.status === 'available' ? '标记已售' : '重新上架'}</button></div>) : <InlineEmpty navigate={navigate} />}<button className="floating-add" onClick={() => navigate('/publish')}><Plus />发布一本书</button></AppShell>;
}

const stateContent: Record<string, { title: string; text: string; image: string; button: string }> = {
  loading: { title: '正在准备页面', text: '托比正在把书页整理好，请稍等一下。', image: '/assets/tobby-search.webp', button: '返回首页' },
  searching: { title: '正在搜索好书', text: '书架有点大，托比马上把结果带回来。', image: '/assets/tobby-search.webp', button: '返回分类' },
  empty: { title: '这里还没有内容', text: '第一本书，也许就在等你来发布。', image: '/assets/tobby-question.webp', button: '发布一本书' },
  'no-results': { title: '没有找到相关书籍', text: '试试更短的关键词，或放宽校区和成色筛选。', image: '/assets/tobby-question.webp', button: '重新搜索' },
  network: { title: '网络好像走丢了', text: '别担心，已填写的内容仍保存在本机。', image: '/assets/tobby-sad.webp', button: '重新加载' },
  maintenance: { title: '托比正在维护书架', text: '系统很快回来，稍后再来看看吧。', image: '/assets/tobby-maintenance.webp', button: '返回首页' },
  unavailable: { title: '这本书目前不可用', text: '它可能已经售出或暂时下架，再看看其他好书吧。', image: '/assets/tobby-unavailable.webp', button: '发现其他书' },
  published: { title: '发布成功！', text: '你的闲置已经上架，等待下一位同学发现它。', image: '/assets/tobby-cheer.webp', button: '查看我的发布' },
  '404': { title: '好像翻错书页了', text: '这个页面不存在，托比带你回到熟悉的地方。', image: '/assets/tobby-sad.webp', button: '返回首页' },
};

function StatePage({ type, navigate }: { type: string; navigate: (to: string) => void }) {
  if (type === 'index') return <AppShell navigate={navigate} title="演示与状态" back className="states-index"><div className="state-grid">{Object.entries(stateContent).filter(([key]) => key !== '404').map(([key, value]) => <button onClick={() => navigate(`/states/${key}`)} key={key}><img src={value.image} alt="" /><span>{value.title}</span><ChevronRight /></button>)}</div></AppShell>;
  const content = stateContent[type] ?? stateContent['404']; const destination = type === 'published' ? '/my-listings' : type === 'empty' ? '/publish' : ['searching', 'no-results', 'unavailable'].includes(type) ? '/category' : '/home';
  return <section className="phone-shell full-state"><div className="paper-texture" /><Brand /><div className="state-orbit" /><Image src={content.image} alt={content.title} width={760} height={760} priority /><h1>{content.title}</h1><p>{content.text}</p>{['loading', 'searching'].includes(type) && <span className="loading-bar"><i /></span>}<button className="primary-button" onClick={() => navigate(destination)}>{content.button}</button><small>BITerStore · 让每一本书继续被需要</small></section>;
}

export function MobileApp({ initialPath }: { initialPath: string }) {
  const [path, setPath] = useState(initialPath || '/'); const [toast, setToast] = useState('');
  const navigate = useCallback((to: string) => { window.history.pushState({}, '', to); setPath(to.split('?')[0] || '/'); }, []);
  useEffect(() => { const handler = () => setPath(window.location.pathname); window.addEventListener('popstate', handler); return () => window.removeEventListener('popstate', handler); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer); }, [toast]);
  const notify = useCallback((text: string) => setToast(text), []);
  const effectivePath = path === '/' && demoRepository.isOnboardingComplete() ? '/home' : path;
  let page: React.ReactNode;
  if (effectivePath === '/') page = <WelcomePage navigate={navigate} />;
  else if (effectivePath === '/onboarding') page = <OnboardingPage navigate={navigate} />;
  else if (effectivePath === '/home') page = <HomePage navigate={navigate} />;
  else if (effectivePath === '/category') page = <CategoryPage navigate={navigate} notify={notify} />;
  else if (effectivePath.startsWith('/books/')) page = <BookDetailPage id={effectivePath.split('/')[2]} navigate={navigate} notify={notify} />;
  else if (effectivePath === '/publish') page = <PublishPage navigate={navigate} notify={notify} />;
  else if (effectivePath === '/messages') page = <MessagesPage navigate={navigate} />;
  else if (effectivePath.startsWith('/messages/')) page = <ChatPage threadId={effectivePath.split('/')[2]} navigate={navigate} notify={notify} />;
  else if (effectivePath === '/profile') page = <ProfilePage navigate={navigate} notify={notify} />;
  else if (effectivePath === '/favorites') page = <FavoritesPage navigate={navigate} notify={notify} />;
  else if (effectivePath === '/my-listings') page = <MyListingsPage navigate={navigate} notify={notify} />;
  else if (effectivePath === '/states') page = <StatePage type="index" navigate={navigate} />;
  else if (effectivePath.startsWith('/states/')) page = <StatePage type={effectivePath.split('/')[2]} navigate={navigate} />;
  else page = <StatePage type="404" navigate={navigate} />;
  return <main className="app-stage">{page}{toast && <div className="toast" role="status"><Leaf size={17} />{toast}</div>}</main>;
}
