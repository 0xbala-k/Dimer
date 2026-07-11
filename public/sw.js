/* Dimer service worker — conservative offline shell */
var CACHE_VERSION = 'dimer-v2';

/**
 * Precache the shell and the hashed bundles it references. The bundle URLs
 * are content-hashed and unknown at authoring time, so we discover them by
 * parsing the shell HTML during install — this is what makes the app boot
 * offline even if the user never reloads after the first visit.
 */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return fetch('/')
        .then(function (response) {
          if (!response || response.status !== 200) return;
          var copy = response.clone();
          return response.text().then(function (html) {
            var assets = html.match(/\/_expo\/static\/[^"']+/g) || [];
            var unique = assets.filter(function (u, i) {
              return assets.indexOf(u) === i;
            });
            return Promise.all([
              cache.put('/', copy),
              cache.addAll(unique),
            ]);
          });
        })
        .then(function () {
          return self.skipWaiting();
        });
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== CACHE_VERSION) {
              return caches.delete(key);
            }
            return undefined;
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// Content-hashed bundles never change; everything else static may.
function isImmutableAsset(url) {
  return url.pathname.indexOf('/_expo/') === 0;
}

function isStaticAsset(url) {
  var path = url.pathname;
  if (path.indexOf('/icons/') === 0) return true;
  return /\.(js|mjs|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(
    path
  );
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Only handle GET requests.
  if (request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // Only same-origin http(s). Never intercept cross-origin (Supabase / Whoop /
  // OpenFoodFacts) or non-http schemes.
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Network-first for navigations, cached per URL so each route keeps its own
  // HTML; fall back to that route's cache, then the shell, when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response && response.status === 200 && response.type === 'basic') {
            var copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            if (cached) return cached;
            return caches.match('/').then(function (shell) {
              return shell || Response.error();
            });
          });
        })
    );
    return;
  }

  // Cache-first for immutable hashed bundles: a hit never needs the network.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(function (cache) {
        return cache.match(request).then(function (cached) {
          if (cached) return cached;
          return fetch(request).then(function (response) {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for other same-origin static assets.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(function (cache) {
        return cache.match(request).then(function (cached) {
          var network = fetch(request).then(function (response) {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          });
          if (cached) {
            network.catch(function () {});
            return cached;
          }
          return network;
        });
      })
    );
    return;
  }

  // Everything else: let the browser handle it normally.
});
