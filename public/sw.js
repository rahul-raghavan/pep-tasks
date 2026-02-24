// Service Worker for Push Notifications
// Shared across PEP School apps — the `app` field in payloads distinguishes them

self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.app || 'pep-tasks',
      renotify: true,
      data: {
        url: data.url || '/dashboard',
        app: data.app || 'pep-tasks',
      },
    };

    event.waitUntil(self.registration.showNotification(data.title || 'PEP Tasks', options));
  } catch (err) {
    console.error('Push event error:', err);
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Try to focus an existing window
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // No existing window — open a new one
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
