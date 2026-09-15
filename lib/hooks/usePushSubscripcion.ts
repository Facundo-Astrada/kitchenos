'use client'

import { useCallback, useEffect, useState } from 'react'
import { urlBase64ToUint8Array } from '@/lib/push/subscribir'

export type EstadoPush = 'cargando' | 'no-soportado' | 'denegado' | 'inactivo' | 'activo'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

async function postJSON(url: string, body: unknown): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Suscripción push del dispositivo/navegador actual — un toggle por dispositivo, no por cuenta. */
export function usePushSubscripcion() {
  const [estado, setEstado] = useState<EstadoPush>('cargando')
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
      setEstado('no-soportado')
      return
    }
    if (Notification.permission === 'denied') {
      setEstado('denegado')
      return
    }
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription()
        setEstado(sub ? 'activo' : 'inactivo')
      })
      .catch(() => setEstado('inactivo'))
  }, [])

  const activar = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return
    setTrabajando(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado('denegado')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Mismo gotcha de TS que Blob con Uint8Array (hooks.md #5): el buffer
        // tipa como ArrayBufferLike, no como ArrayBuffer — cast explícito.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      })
      const json = sub.toJSON()
      await postJSON('/api/push/subscribe', { endpoint: json.endpoint, keys: json.keys })
      setEstado('activo')
    } catch (e) {
      console.error('[usePushSubscripcion] Error al activar:', e)
      setEstado('inactivo')
    } finally {
      setTrabajando(false)
    }
  }, [])

  const desactivar = useCallback(async () => {
    setTrabajando(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await postJSON('/api/push/unsubscribe', { endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      setEstado('inactivo')
    } catch (e) {
      console.error('[usePushSubscripcion] Error al desactivar:', e)
    } finally {
      setTrabajando(false)
    }
  }, [])

  return { estado, trabajando, activar, desactivar }
}
