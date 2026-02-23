self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // Basic pass-through for now
  e.respondWith(fetch(e.request));
});
