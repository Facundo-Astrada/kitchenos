'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNotificaciones } from '@/lib/hooks/useNotificaciones'
import { agruparAvisos, tiposPresentes } from '@/lib/notificaciones/agrupar'
import type { Notificacion } from '@/types'

function formatDesde(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const horas = Math.floor(mins / 60)
  if (horas < 24) return `hace ${horas}h`
  return `hace ${Math.floor(horas / 24)}d`
}

/** Bandeja de avisos: lo nuevo agrupado por tipo arriba, el historial abajo. */
export default function AvisosPage() {
  const router = useRouter()
  const { notificaciones, noLeidas, loading, marcarLeida, marcarTodasLeidas } = useNotificaciones()
  const [filtro, setFiltro] = useState<string>('todos')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  const filtradas = useMemo(
    () => (filtro === 'todos' ? notificaciones : notificaciones.filter(n => n.tipo === filtro)),
    [notificaciones, filtro],
  )
  const nuevas = filtradas.filter(n => !n.leida)
  const anteriores = filtradas.filter(n => n.leida)
  const tipos = useMemo(() => tiposPresentes(notificaciones), [notificaciones])

  function abrir(n: Notificacion) {
    if (!n.leida) marcarLeida(n.id)
    if (n.link) router.push(n.link)
  }

  function alternar(tipo: string) {
    setAbiertos(prev => {
      const sig = new Set(prev)
      if (sig.has(tipo)) sig.delete(tipo)
      else sig.add(tipo)
      return sig
    })
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>Avisos</h1>
        {noLeidas > 0 && (
          <button
            onClick={marcarTodasLeidas}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--accent)', padding: 0 }}
          >
            Marcar todos leídos
          </button>
        )}
      </div>

      {tipos.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {[{ tipo: 'todos', label: 'Todos' }, ...tipos].map(t => (
            <button
              key={t.tipo}
              onClick={() => setFiltro(t.tipo)}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid var(--border)',
                background: filtro === t.tipo ? 'var(--accent)' : 'var(--surface)',
                color: filtro === t.tipo ? '#fff' : 'var(--text-2)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!loading && notificaciones.length === 0 && (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          Todavía no te llegó ningún aviso.
        </div>
      )}

      {nuevas.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
            Nuevos · {nuevas.length}
          </h2>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            {agruparAvisos(nuevas).map((g, i) => {
              const abierto = abiertos.has(g.tipo)
              const uno = g.avisos.length === 1
              return (
                <div key={g.tipo} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <button
                    onClick={() => (uno ? abrir(g.ultimo) : alternar(g.tipo))}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', background: 'rgba(67,97,160,.06)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)', marginTop: 1 }}>{g.icono}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{g.titulo}</div>
                      {uno && g.ultimo.cuerpo && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{g.ultimo.cuerpo}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{formatDesde(g.ultimo.created_at)}</div>
                    </div>
                    {!uno && (
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>
                        {abierto ? 'expand_less' : 'expand_more'}
                      </span>
                    )}
                  </button>
                  {!uno && abierto && g.avisos.map(n => <FilaAviso key={n.id} n={n} onClick={() => abrir(n)} sangrado />)}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {anteriores.length > 0 && (
        <section>
          <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
            Anteriores
          </h2>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            {anteriores.map((n, i) => <FilaAviso key={n.id} n={n} onClick={() => abrir(n)} separar={i > 0} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function FilaAviso({ n, onClick, separar = true, sangrado = false }: { n: Notificacion; onClick: () => void; separar?: boolean; sangrado?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', display: 'block', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        padding: sangrado ? '10px 16px 10px 48px' : '12px 16px', borderTop: separar ? '1px solid var(--border)' : 'none',
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: n.leida ? 500 : 700, color: 'var(--text-1)' }}>{n.titulo}</div>
      {n.cuerpo && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{n.cuerpo}</div>}
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{formatDesde(n.created_at)}</div>
    </button>
  )
}
