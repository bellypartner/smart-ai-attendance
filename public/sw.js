// ============================================================
// SmartAi Attendance — Service Worker
// Save this file as: public/sw.js
// ============================================================

const CACHE_NAME = 'smartai-v1';

// Install
self.addEventListener('install', e => {
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Push notification received
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'smartai',
    data: { url: data.url || '/' },
    requireInteraction: data.urgent || false,
    actions: data.actions || [],
  };
  e.waitUntil(
    self.registration.showNotification(data.title || 'SmartAi Attendance', options)
  );
});

// Notification click
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Badge update via message
self.addEventListener('message', e => {
  if (e.data?.type === 'SET_BADGE') {
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(e.data.count).catch(() => {});
    }
  }
  if (e.data?.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }
});
