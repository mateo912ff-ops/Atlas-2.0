const C = "atlas-ia-25";
const F = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "logo.png", "personalizar.js", "nube.js", "atlas-brain.js"];
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
  if(e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  // Primero internet (así siempre ves la versión nueva); si no hay conexión, usa lo guardado.
  e.respondWith(
    fetch(e.request, {cache: "no-cache"}).then(r => {
      if(r && r.ok){ const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./")))
  );
});
