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
    expect(config).toContain("path.resolve(__dirname, '../../web/app')")
    expect(config).toContain(".set('lucide-react$'")
    expect(config).toContain(".set('next/image'")
    expect(read('src/app.ts')).toContain("import '../../web/app/globals.css'")
    expect(read('src/app.ts')).not.toContain("import './app.css'")
    expect(read('src/h5.css')).toContain('#app.taro_router > .taro_page.taro_navigation_page { overflow: hidden; }')
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

  it('injects the ignored local AppID into every WeApp build without committing it', () => {
    const packageJson = read('package.json')
    const syncScript = read('scripts/sync-weapp-project-config.mjs')
    expect(packageJson.match(/node scripts\/sync-weapp-project-config\.mjs/g)).toHaveLength(2)
    expect(syncScript).toContain('project.private.config.json')
    expect(syncScript).toContain("dist', 'project.config.json")
    expect(syncScript).not.toMatch(/\bwx[a-f0-9]{16}\b/i)
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
    expect(detail).toContain("feedbackAdapter.toast('不能收藏自己的商品')")
    expect(detail).toContain("feedbackAdapter.toast('不能联系自己发布的商品')")
    expect(detail).toContain("cause instanceof Error ? cause.message : '收藏操作失败，请稍后重试'")
    expect(detail).toContain("cause instanceof Error ? cause.message : '联系卖家失败，请稍后重试'")
  })
})
