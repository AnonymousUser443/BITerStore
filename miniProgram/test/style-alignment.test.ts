import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = path.join(root, 'src')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

function filesBelow(directory: string, extension: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(target, extension) : entry.name.endsWith(extension) ? [target] : []
  })
}

describe('Golden Reference style alignment', () => {
  it('H5 直接复用 Golden Reference 组件和原始样式', () => {
    const pages = filesBelow(path.join(source, 'pages'), '.tsx')
    const config = read('config/index.ts')
    const h5Pages = pages.filter((file) => file.endsWith('.h5.tsx'))
    expect(h5Pages).toHaveLength(14)
    expect(h5Pages.every((file) => fs.readFileSync(file, 'utf8').includes("from '@/h5/GoldenRoute'"))).toBe(true)
    expect(read('src/h5/GoldenRoute.tsx')).toContain("from '../../../web/app/components/mobile-app'")
    expect(read('src/h5/GoldenRoute.tsx')).not.toContain('scrollTo(0, 0)')
    expect(config).toContain("path.resolve(__dirname, '../../web/app')")
    expect(config).toContain(".set('lucide-react$'")
    expect(config).toContain(".set('next/image'")
    expect(read('src/app.ts')).toContain("import '../../web/app/globals.css'")
    expect(read('src/app.ts')).not.toContain("import './app.css'")
    expect(read('src/h5.css')).toContain('#app.taro_router > .taro_page.taro_navigation_page { overflow: hidden; }')
  })

  it('H5 内容高度跟随应用外壳并覆盖短横屏布局', () => {
    const goldenCss = read('../web/app/globals.css')
    expect(goldenCss).toContain('.content-scroll { position: relative; height: calc(100% - 76px);')
    expect(goldenCss).toContain('.chat-page .content-scroll { height: calc(100% - 68px);')
    expect(goldenCss).toContain('@media (min-width: 700px) and (max-width: 1023px) and (max-height: 599px)')
    expect(goldenCss).toContain('@media (min-width: 1024px) and (max-height: 699px)')
  })

  it('个人页宽屏网格由较高菜单撑开，不裁切额外操作', () => {
    const h5Css = read('../web/app/globals.css')
    const weappCss = read('src/golden.css')
    for (const css of [h5Css, weappCss]) {
      expect(css).toContain('.profile-menu { position: relative; }')
      expect(css).not.toContain('.profile-hero, .profile-menu, .upload-card { position: relative; overflow: hidden; }')
      expect(css).not.toContain('.profile-menu { height: 100%; }')
    }
  })

  it('主页面顶栏统一使用通知与头像，返回页保留更多操作', () => {
    const app = read('../web/app/components/mobile-app.tsx')
    expect(app).toContain('className="icon-button avatar-action"')
    expect(app).toContain('aria-label="我的"')
    expect(app).not.toContain('leaf-action')
  })

  it('商品卡优先显示上传的封面照片', () => {
    const ui = read('src/components/ui.tsx')
    const css = read('src/golden.css')
    expect(ui).toContain('listing.imageUrls?.[0]')
    expect(ui).toContain("className='book-cover-image'")
    expect(ui).toContain('BITerStore 校园藏书')
    expect(css).toContain('.book-cover-image { width: 100%; height: 100%; display: block; object-fit: cover; }')
  })

  it('宽屏页面不显示额外的浏览器或内容滚动条', () => {
    const h5Css = read('../web/app/globals.css')
    expect(h5Css).toContain('html, body { width: 100%; height: 100%; margin: 0; overflow: hidden;')
    expect(h5Css).not.toContain('scrollbar-width: thin; scrollbar-color: rgba(115,126,88,.5) transparent;')
  })

  it('微信入口复用 Golden 样式并只追加原生节点适配', () => {
    const entry = read('src/app.weapp.ts')
    expect(entry).toContain("import './golden.css'")
    expect(entry).toContain("import './app.css'")
    expect(entry).not.toContain("import './weapp.css'")
  })

  it('所有原生页面静态类名都有样式或是明确的结构标记', () => {
    const css = ['src/golden.css', 'src/app.css'].map(read).join('\n')
    const structuralMarkers = new Set(['h5-navigation', 'search-page'])
    const used = new Set<string>()
    for (const file of filesBelow(source, '.tsx')) {
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(/className=['"`]([^'"`]+)['"`]/g)) {
        match[1].split(/\s+/).filter((name) => /^[a-z][a-z0-9_-]*$/.test(name)).forEach((name) => used.add(name))
      }
    }
    const missing = [...used].filter((name) => !structuralMarkers.has(name) && !new RegExp(`\\.${name}(?![a-zA-Z0-9_-])`).test(css))
    expect(missing).toEqual([])
  })

  it('共享 WXSS 不含微信编译器无法解析的裸伪类子节点', () => {
    const wxss = ['src/golden.css', 'src/app.css'].map(read).join('\n')
    expect(wxss).not.toMatch(/[>+~]\s*:(?:first|last|nth|not)/)
  })

  it('微信端使用原生 tabBar，页面主体继续复用 Golden Reference', () => {
    const appConfig = read('src/app.config.ts')
    expect(appConfig).not.toContain('custom: true')
    expect(appConfig).not.toContain("window: { navigationStyle: 'custom'")
    expect(appConfig).toContain("navigationBarBackgroundColor: '#fffdf8'")
    expect(appConfig).toContain("backgroundColor: '#fffdf7'")
    expect(appConfig).toContain("selectedColor: '#4f5940'")
    expect(appConfig.match(/iconPath:/g)).toHaveLength(5)
    expect(appConfig.match(/selectedIconPath:/g)).toHaveLength(5)
    expect(filesBelow(path.join(source, 'pages'), '.config.ts').map((file) => fs.readFileSync(file, 'utf8')).join('\n')).not.toContain('custom-tab-bar')
  })

  it('微信页面使用原生居中标题，H5 底栏保留 Golden Reference 结构', () => {
    const adapter = read('src/app.css')
    const ui = read('src/components/ui.tsx')
    expect(adapter).toContain('.page-title { grid-column: 2; justify-self: center;')
    expect(adapter).toContain('.native-chrome .content-scroll')
    expect(ui).toContain("['search', '分类', 'grid']")
    expect(ui).toContain("process.env.TARO_ENV !== 'h5'")
    expect(ui).toContain("process.env.TARO_ENV === 'weapp'")
  })

  it('H5 在窄屏、折叠屏、平板、横屏和超宽窗口连续重排', () => {
    const h5 = read('src/h5.css')
    const visual = read('scripts/h5-visual.mjs')
    expect(h5).toContain('@media (max-width: 340px)')
    expect(h5).toContain('@media (min-width: 480px) and (max-width: 699px)')
    expect(h5).toContain('@media (orientation: landscape) and (min-width: 700px)')
    expect(h5).toContain('repeat(auto-fill, minmax(340px, 1fr))')
    expect(h5).toContain('width: min(calc(100vw - 48px), 1600px)')
    expect(visual).toContain("['home-1920', 1920, 1080, '/home']")
    expect(visual).toContain("['home-landscape-844', 844, 390, '/home']")
    expect(visual).toContain("type: 'horizontal-overflow'")
    expect(visual).toContain("type: 'fixed-compact-canvas'")
  })

  it('injects the ignored local AppID and stable base-library version into every WeApp build', () => {
    const packageJson = read('package.json')
    const syncScript = read('scripts/sync-weapp-project-config.mjs')
    expect(packageJson.match(/node scripts\/sync-weapp-project-config\.mjs/g)).toHaveLength(2)
    expect(syncScript).toContain('project.private.config.json')
    expect(syncScript).toContain("dist', 'project.config.json")
    expect(syncScript).toContain('outputConfig.libVersion = libVersion')
    expect(syncScript).not.toMatch(/\bwx[a-f0-9]{16}\b/i)
  })

  it('covers both required publish images before invoking the WeApp fixture assistant', () => {
    const publish = read('src/pages/publish/index.tsx')
    const e2e = read('scripts/weapp-e2e.mjs')
    expect(publish).toContain("id='e2e-publish-isbn-media'")
    expect(e2e).toContain("openStable('switchTab', '/pages/publish/index')")
    expect(e2e).toContain("required(page, '#e2e-publish-isbn-media')")
    expect(e2e).toContain("requiredEventually(page, '#e2e-publish-title')")
    expect(e2e).toContain('route: lastKnownRoute')
    expect(e2e).not.toContain('void app.currentPage().then')
    expect(e2e).toContain("knownAutomationNoise.push({ kind: 'rawPath'")
    expect(e2e).toContain('eventTime - noise.time <= 20000')
    expect(e2e).toContain('duringRouteObservation')
    expect(e2e).toContain("event.args[0]?.description === '[object Object]'")
  })

  it('gives native navigation immediate feedback and keeps the card detail action wired', () => {
    const platform = read('src/platform/index.ts')
    const ui = read('src/components/ui.tsx')
    expect(platform).toContain("Taro.showLoading({ title: '加载中', mask: false })")
    expect(platform).toContain('Taro.hideLoading()')
    expect(ui).toContain("onClick={href ? () => { void navigationAdapter.go(href) } : onTap}")
    expect(ui.match(/beginNavigationFeedback\(href\)/g)).toHaveLength(3)
  })

  it('gives native detail actions explicit owner and request-error feedback', () => {
    const detail = read('src/pages/listing/detail.tsx')
    const ui = read('src/components/ui.tsx')
    expect(ui).toContain("const hideNavigation = noNav || className === 'detail-page'")
    expect(ui).toContain('{!hideNavigation && <AppNavigation active={active} />}')
    expect(detail).toContain("feedbackAdapter.toast('不能收藏自己的商品')")
    expect(detail).toContain("feedbackAdapter.toast('不能联系自己发布的商品')")
    expect(detail).toContain("cause instanceof Error ? cause.message : '收藏操作失败，请稍后重试'")
    expect(detail).toContain("cause instanceof Error ? cause.message : '联系卖家失败，请稍后重试'")
  })

  it('avoids the unsupported only-child selector in WeApp styles', () => {
    const golden = read('src/golden.css')
    const listings = read('src/pages/my-listings/index.tsx')
    expect(golden).not.toContain(':only-child')
    expect(golden).toContain('.manage-listing-actions.single-action > button')
    expect(listings).toContain("['available', 'offline'].includes(item.status) ? '' : ' single-action'")
  })

  it('hides an empty course fact and enlarges campus and ISBN metadata', () => {
    const detail = read('src/pages/listing/detail.tsx')
    const adapter = read('src/app.css')
    expect(detail).toContain("item.course.trim() ? <Text>▥ {item.course}</Text> : null")
    expect(detail).not.toContain('detail-original-price')
    expect(adapter).toContain("font-size: 13px; line-height: 1.5;")
    expect(adapter).not.toContain('.detail-original-price')
  })
})
