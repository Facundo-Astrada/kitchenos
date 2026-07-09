'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Vínculo liviano a HACCP para secciones tipo Heladera/Freezer — última
// temperatura registrada + próxima limpieza, con deep-link a /haccp. NO
// duplica los forms de HACCP, solo linkea (ver PLAN-MEJORAS-OPS-SALON-MESA §B3).
export default function HaccpSeccionLink({ nombreSeccion }: { nombreSeccion: string }) {
  const router = useRouter()
  const RESTAURANTE_ID = useRestauranteId()
  const [temp, setTemp] = useState<{ valor: number; fecha: string; dentroRango: boolean } | null | undefined>(undefined)
  const [limpieza, setLimpieza] = useState<{ diaSemana: number | null; diaMes: number | null; ultimoRegistro: string | null } | null | undefined>(undefined)

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      const { data: equipo } = await supabase.from('haccp_equipos').select('id')
        .eq('restaurante_id', RESTAURANTE_ID).ilike('nombre', nombreSeccion).limit(1).maybeSingle()
      if (equipo?.id) {
        const { data: t } = await supabase.from('haccp_temperaturas').select('temperatura, dentro_rango, created_at')
          .eq('equipo_id', equipo.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (!cancelled) setTemp(t ? { valor: t.temperatura, fecha: t.created_at, dentroRango: t.dentro_rango } : null)
      } else if (!cancelled) setTemp(null)

      const { data: l } = await supabase.from('haccp_limpieza').select('dia_semana, dia_mes, ultimo_registro')
        .eq('restaurante_id', RESTAURANTE_ID).ilike('area', nombreSeccion).limit(1).maybeSingle()
      if (!cancelled) setLimpieza(l ? { diaSemana: l.dia_semana, diaMes: l.dia_mes, ultimoRegistro: l.ultimo_registro } : null)
    })()
    return () => { cancelled = true }
  }, [RESTAURANTE_ID, nombreSeccion])

  if (temp === undefined || limpieza === undefined) return null
  if (temp === null && limpieza === null) {
    return (
      <button onClick={() => router.push('/haccp')} style={{ ...linkBtn, color: 'var(--text-3)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>thermostat</span>
        Vincular con HACCP
      </button>
    )
  }

  return (
    <button onClick={() => router.push('/haccp')} style={linkBtn}>
      {temp && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: temp.dentroRango ? '#22c55e' : '#ef4444' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>thermostat</span>
          {temp.valor}°C
        </span>
      )}
      {limpieza && (limpieza.diaSemana != null || limpieza.diaMes != null) && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>cleaning_services</span>
          {limpieza.diaSemana != null ? DIAS[limpieza.diaSemana === 7 ? 0 : limpieza.diaSemana] : `día ${limpieza.diaMes}`}
        </span>
      )}
    </button>
  )
}

const linkBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 10, fontWeight: 700, padding: '2px 0', marginTop: 4,
}
