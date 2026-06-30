const CACHE_NAME = 'kitchenos-v2'
const OFFLINE_URL = '/offline.html'

const PRECACHE_URLS = [
  '/',
  '/offline.html',
]

// Vista de servicio (Salón/KDS, ver PLAN-FASE-2.md "Offline"): las respuestas GET de
// Supabase REST (comandas/comanda_items/mesas/estaciones) se cachean network-first
// para que la última data conocida quede visible sin red. Las mutaciones (POST/PATCH)
// no pasan por acá — se manejan en el cliente (lib/offline/bumpQueue.ts).
function esGetSupabaseRest(request, url) {
  return request.method === 'GET' && url.pathname.includes('/rest/v1/')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  const url = new URL(event.request.url)
  if (esGetSupabaseRest(event.request, url)) {
    event.respondWith(
      fetch(event.request)
        .then((respuesta) => {
          const copia = respuesta.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia))
          return respuesta
        })
        .catch(() => caches.match(event.request).then((cacheada) => cacheada || Response.error()))
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        if (response.ok && (event.request.url.includes('/_next/static/') || event.request.url.includes('/icons/'))) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      }).catch(() => new Response('', { status: 408 }))
    })
  )
})
