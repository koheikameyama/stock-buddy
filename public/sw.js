// Service Worker for Push Notifications

self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');

  if (!event.data) {
    console.log('[Service Worker] Push event but no data');
    return;
  }

  const data = event.data.json();
  const title = data.title || 'Stock Buddy';
  const options = {
    body: data.body || '新しい通知があります',
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    data: {
      url: data.url || '/',
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification click Received.');

  event.notification.close();

  const url = event.notification.data.url || '/';

  event.waitUntil(
    clients.openWindow(url)
  );
});
