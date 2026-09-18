// Install from the H5 app entry, before Taro registers its history listener.
// The Golden Reference uses native pushState, so Taro has no matching page
// stack for these entries. Only the owning application may consume their pops.
const historyIndexKey = '__biterstoreHistoryIndex'
globalThis.addEventListener('popstate', (event: PopStateEvent) => {
  if (typeof event.state?.[historyIndexKey] !== 'number') return
  event.stopImmediatePropagation()
  globalThis.dispatchEvent(new PopStateEvent('biterstore:popstate', { state: event.state }))
}, true)
