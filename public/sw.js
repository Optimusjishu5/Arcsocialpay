// Shows message alerts and opens the chat when one is tapped. It does no caching.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const convId = event.notification.data && event.notification.data.convId
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = all.find((c) => 'focus' in c)
    if (open) {
      await open.focus()
      open.postMessage({ type: 'socialpay:open-chat', convId })
    } else {
      await self.clients.openWindow('/app')
    }
  })())
})
