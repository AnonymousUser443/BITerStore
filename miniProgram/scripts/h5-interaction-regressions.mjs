import fs from 'node:fs/promises'
import path from 'node:path'

export async function checkBackNavigation(client, preview, artifactDir) {
  const evaluate = async (expression) => (await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true })
  const loaded = client.once('Page.loadEventFired')
  await client.send('Page.navigate', { url: `${preview}/home` })
  await loaded
  await pause(1000)
  await evaluate(`window.__backTestStage = document.querySelector('.app-stage'); true`)
  await evaluate(`window.__backEvents = []; window.addEventListener('popstate', e => window.__backEvents.push({state:e.state, same:window.__backTestStage === document.querySelector('.app-stage')}), true); true`)
  const rounds = []
  for (let index = 0; index < 10; index += 1) {
    const before = await evaluate(`(() => { const area = document.querySelector('.content-scroll'); area.style.scrollBehavior = 'auto'; area.scrollTop = Math.min(160, area.scrollHeight - area.clientHeight); return area.scrollTop })()`)
    await evaluate(`document.querySelector('.book-tile')?.click()`)
    await pause(400)
    const forward = await evaluate(`({same:window.__backTestStage === document.querySelector('.app-stage'), state:history.state})`)
    if (!await evaluate(`!!document.querySelector('.detail-page')`)) throw new Error('Back regression: detail did not open')
    await evaluate(`document.querySelector('button[aria-label="返回"]').click()`)
    await pause(1000)
    const after = await evaluate(`(() => { const area = document.querySelector('.content-scroll'); return { home: !!document.querySelector('.home-page'), sameApp: window.__backTestStage === document.querySelector('.app-stage'), appCount: document.querySelectorAll('.app-stage').length, scroll: area?.scrollTop, scrollbar: area && getComputedStyle(area).scrollbarWidth, animatedCards: [...document.querySelectorAll('.listing-card')].some(node => getComputedStyle(node).animationName !== 'none') } })()`)
    if (!after.home || !after.sameApp || after.appCount !== 1 || Math.abs(after.scroll - before) > 1 || after.scrollbar !== 'none' || after.animatedCards) throw new Error(`Back regression ${index}: ${JSON.stringify({ before, forward, after, events:await evaluate('window.__backEvents') })}`)
    rounds.push({ before, ...after })
  }
  await fs.writeFile(path.join(artifactDir, 'back-navigation.json'), JSON.stringify(rounds, null, 2))
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(artifactDir, 'back-navigation.png'), Buffer.from(screenshot.data, 'base64'))
}
