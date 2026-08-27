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
  it('微信入口复用 Golden 样式并只追加原生节点适配', () => {
    const entry = read('src/app.weapp.ts')
    expect(entry).toContain("import './golden.css'")
    expect(entry).toContain("import './app.css'")
    expect(entry).not.toContain("import './weapp.css'")
  })

  it('所有原生页面静态类名都有样式或是明确的结构标记', () => {
    const css = ['src/golden.css', 'src/app.css', 'src/custom-tab-bar/index.css'].map(read).join('\n')
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

  it('自定义 tabBar 的组件样式只用 class 选择器', () => {
    const css = read('src/custom-tab-bar/index.css')
    const withoutColors = css.replace(/#[0-9a-fA-F]{3,8}\b/g, '')
    expect(css).not.toMatch(/\.custom-tabbar\s+(?:button|view|text|image)\b/)
    expect(withoutColors).not.toMatch(/#[a-zA-Z_-]|\[[^\]]+\]/)
    expect(css).toContain('.custom-tabbar .nav-item')
  })
})
