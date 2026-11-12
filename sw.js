const C = "atlas-ia-20";
const F = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "logo.png", "personalizar.js", "nube.js"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(F)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(k =>
      Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))
    )
  );
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if(new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match("./")))
  );
});
