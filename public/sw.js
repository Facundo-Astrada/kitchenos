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

// Notificaciones push — payload lo manda lib/push/enviar.ts como JSON
// { tipo, titulo, cuerpo, link }, mismo shape que la fila de `notificaciones`.
self.addEventListener('push', (event) => {
  let datos = {}
  try {
    datos = event.data ? event.data.json() : {}
  } catch {
    datos = { titulo: 'KitchenOS', cuerpo: event.data ? event.data.text() : '' }
  }

  const titulo = datos.titulo || 'KitchenOS'
  const opciones = {
    body: datos.cuerpo || '',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: datos.tipo || undefined,
    data: { link: datos.link || '/' },
  }

  event.waitUntil(self.registration.showNotification(titulo, opciones))
})

// Tap en la notificación: enfoca una pestaña ya abierta en ese link, o la
// navega ahí si está abierta en otro, o abre una nueva.
self.addEventListener('notificationclick', (event) => {
  const link = (event.notification.data && event.notification.data.link) || '/'
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaClientes) => {
      const destino = new URL(link, self.location.origin).href
      const yaAbierto = listaClientes.find((c) => c.url === destino)
      if (yaAbierto) return yaAbierto.focus()

      const cualquiera = listaClientes[0]
      if (cualquiera) {
        return cualquiera.focus().then(() => {
          if ('navigate' in cualquiera) return cualquiera.navigate(destino)
        })
      }

      if (self.clients.openWindow) return self.clients.openWindow(destino)
    })
  )
})
