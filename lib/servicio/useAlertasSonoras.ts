'use client'
import { useEffect, useRef, useState } from 'react'
import type { Comanda } from '@/types'

const MUTE_KEY = 'kds_muted'

function tiempoFiredMasViejo(comanda: Comanda): number | null {
  const fired = (comanda.items ?? [])
    .map(i => i.fired_at)
    .filter((f): f is string => !!f)
    .map(f => new Date(f).getTime())
  if (fired.length === 0) return null
  return Math.min(...fired)
}

export function useAlertasSonoras(tarjetas: Comanda[], ahora: number) {
  const [silenciado, setSilenciado] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(MUTE_KEY) === 'true'
  })
  const silenciadoRef = useRef(silenciado)
  useEffect(() => { silenciadoRef.current = silenciado }, [silenciado])

  const ctxRef = useRef<AudioContext | null>(null)
  const prevIdsRef = useRef<Set<string>>(new Set())
  const alertaRojaRef = useRef<Set<string>>(new Set())  // ids que ya emitieron alarma roja

  function getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!ctxRef.current) {
      try {
        ctxRef.current = new (window.AudioContext ?? (window as unknown as Record<string, typeof AudioContext>)['webkitAudioContext'])()
      } catch { return null }
    }
    return ctxRef.current
  }

  function beep(freq: number, duracion: number, retardo = 0) {
    if (silenciadoRef.current) return
    const ctx = getCtx()
    if (!ctx) return
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      const t0 = ctx.currentTime + retardo
      gain.gain.setValueAtTime(0.35, t0)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duracion)
      osc.start(t0)
      osc.stop(t0 + duracion)
    } catch {}
  }

  // Detectar comandas nuevas
  useEffect(() => {
    const currentIds = new Set(tarjetas.map(c => c.id))
    let hayNuevas = false
    for (const id of currentIds) {
      if (!prevIdsRef.current.has(id)) hayNuevas = true
    }
    if (hayNuevas && prevIdsRef.current.size > 0) {
      // doble ping agudo
      beep(880, 0.22)
      beep(1100, 0.18, 0.15)
    }
    prevIdsRef.current = currentIds
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarjetas.map(c => c.id).join(',')])

  // Detectar comandas que cruzan umbral rojo (>10 min)
  useEffect(() => {
    for (const c of tarjetas) {
      const firedMs = tiempoFiredMasViejo(c)
      if (!firedMs) continue
      const seg = Math.floor((ahora - firedMs) / 1000)
      if (seg >= 600 && !alertaRojaRef.current.has(c.id)) {
        alertaRojaRef.current.add(c.id)
        beep(440, 0.5)
      }
    }
    // limpiar ids ya no presentes
    const ids = new Set(tarjetas.map(c => c.id))
    for (const id of [...alertaRojaRef.current]) {
      if (!ids.has(id)) alertaRojaRef.current.delete(id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ahora])

  function toggleSilencio() {
    setSilenciado(prev => {
      const next = !prev
      localStorage.setItem(MUTE_KEY, String(next))
      return next
    })
  }

  return { silenciado, toggleSilencio }
}
