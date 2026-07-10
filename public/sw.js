/* Dimer service worker — conservative offline shell */
var CACHE_VERSION = 'dimer-v1';
var PRECACHE_URLS = ['/'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function () {
        return self.skipWaiting();
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

function isStaticAsset(url) {
  var path = url.pathname;
  if (path.indexOf('/_expo/') === 0) return true;
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

  // Network-first for navigations, fall back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response && response.status === 200 && response.type === 'basic') {
            var copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put('/', copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match('/').then(function (cached) {
            return cached || Response.error();
          });
        })
    );
    return;
  }

  // Stale-while-revalidate for same-origin static assets.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(function (cache) {
        return cache.match(request).then(function (cached) {
          var network = fetch(request)
            .then(function (response) {
              if (
                response &&
                response.status === 200 &&
                (response.type === 'basic' || response.type === 'default')
              ) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(function () {
              return cached;
            });
          return cached || network;
        });
      })
    );
    return;
  }

  // Everything else: let the browser handle it normally.
});
