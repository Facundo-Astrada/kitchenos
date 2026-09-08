'use client'

// ImplantacionStrip — empuje diario hacia /implantacion (la cordillera de
// PLAN-IMPLANTACION-2026-09). Antes de esto el único acceso a esa pantalla
// eran dos pastillas de 12px en el header de Configuración (S7 sep 2026,
// feedback: "deberían tener más protagonismo") — una ruta que por diseño no
// termina nunca no puede depender de que alguien la busque.
//
// Solo admin: el hook son ~30 counts en paralelo (useRutaImplantacion), bien
// para una pantalla que se abre una vez por día, no para correr en cada
// apertura de home para todo el equipo. Por eso el chequeo de isAdmin vive en
// un componente PADRE que ni monta al hijo si no corresponde — así el hook
// nunca se ejecuta para el resto del equipo, no es solo un `return null`
// después de haberlo llamado.
//
// Cachea el último % en localStorage para pintar de entrada sin esqueleto
// mientras revalida (la SWR key es la misma que usa /implantacion, con
// dedupingInterval de 5 minutos — abrir la cordillera después de ver la tira
// no vuelve a pedir nada).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useRutaImplantacion } from '@/lib/hooks/useRutaImplantacion'
import { textoRecordatorio } from '@/lib/implantacion/avisos'
import { MODULO_CONFIG } from '@/lib/constants'

const PCT_KEY = (rid: string) => `kc_implantacion_pct_${rid}`

export default function ImplantacionStrip() {
  const { isAdmin, loading } = usePermisos()
  if (loading || !isAdmin) return null
  return <ImplantacionStripAdmin />
}

function ImplantacionStripAdmin() {
  const RESTAURANTE_ID = useRestauranteId()
  const { progreso, loading } = useRutaImplantacion()
  const [pctCache, setPctCache] = useState<number | null>(null)

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    try {
      const raw = window.localStorage.getItem(PCT_KEY(RESTAURANTE_ID))
      if (raw !== null) setPctCache(Number(raw))
    } catch { /* privado */ }
  }, [RESTAURANTE_ID])

  useEffect(() => {
    if (!RESTAURANTE_ID || loading) return
    try { window.localStorage.setItem(PCT_KEY(RESTAURANTE_ID), String(progreso.pct)) } catch { /* privado */ }
  }, [RESTAURANTE_ID, loading, progreso.pct])

  const pct = loading ? pctCache : progreso.pct
  if (pct === null || pct >= 100) return null

  const siguiente = !loading && progreso.siguiente
    ? textoRecordatorio(progreso.siguiente, MODULO_CONFIG[progreso.siguiente.modulo]?.href ?? '/implantacion').titulo
    : null

  return (
    <Link
      href="/implantacion"
      className="block transition-transform active:scale-[.98]"
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)', borderRadius: 12,
        padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 11,
        textDecoration: 'none',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)', flexShrink: 0 }}>
        landscape
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>
          Organización — {pct}%
        </span>
        <span style={{
          display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {siguiente ? `Siguiente: ${siguiente}` : 'Ver la ruta completa'}
        </span>
      </span>
      <span className="material-symbols-outlined" style={{ fontSize: 19, color: 'var(--text-3)', flexShrink: 0 }}>
        chevron_right
      </span>
    </Link>
  )
}
