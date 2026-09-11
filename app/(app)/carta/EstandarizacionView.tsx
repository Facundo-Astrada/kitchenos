'use client'

import { useMemo, useState } from 'react'
import type { Receta } from '@/types'
import type { CartaItemEnriquecido } from '@/lib/hooks/useCarta'
import type { MenuConPreparaciones } from '@/lib/hooks/useMenus'
import { analizarCarta, nivelDePlato, nivelDeMenu, type Nivel, type DiagnosticoPlato } from '@/lib/recetas/estandarizacion'
import { PLAZAS_OPS } from '@/lib/ops/mise'
import { fmtMoney } from './cards'

// Escala de 4 niveles — NO son colores de alarma (DESIGN.md §8: presupuesto
// de ámbar ≤3 por pantalla). N0/N1 son neutros, N2 es informativo (azul,
// "en progreso"), N3 es positivo (verde, "listo"). Nunca ámbar/rojo por
// nivel — con hasta ~90 componentes en pantalla eso violaría el presupuesto
// por acumulación aunque cada uno individualmente no sea una alarma.
export const NIVEL_META: Record<Nivel, { label: string; nombre: string; bg: string; fg: string }> = {
  0: { label: 'N0', nombre: 'Sin cargar', bg: 'var(--border)', fg: 'var(--text-3)' },
  1: { label: 'N1', nombre: 'Nombrada',   bg: 'var(--bg)',     fg: 'var(--text-2)' },
  2: { label: 'N2', nombre: 'Escrita',    bg: 'var(--blue-bg)', fg: 'var(--blue-fg)' },
  3: { label: 'N3', nombre: 'Pesada',     fg: 'var(--green-fg)', bg: 'var(--green-bg)' },
}

export function NivelBadge({ nivel, title }: { nivel: Nivel; title?: string }) {
  const m = NIVEL_META[nivel]
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 800,
      padding: '2px 6px', borderRadius: 5, background: m.bg, color: m.fg,
      letterSpacing: '.02em', flexShrink: 0,
    }}>
      {m.label}
    </span>
  )
}

const TODAS = 'Todas'

// Fila combinada para "Por plato y menú" — un plato de Carta o un Menú,
// tratados con la misma escala. El tipo decide qué callback dispara el click
// (Carta abre DetailView; Menú abre el editor de composición) y qué ícono
// lo distingue (sin ícono = plato, calendario = menú).
type FilaEstandarizable =
  | { tipo: 'plato'; id: string; nombre: string; diag: DiagnosticoPlato; item: CartaItemEnriquecido }
  | { tipo: 'menu'; id: string; nombre: string; diag: DiagnosticoPlato; menu: MenuConPreparaciones }

export function EstandarizacionView({
  items,
  menus = [],
  recetasPorId,
  onBack,
  onOpenPlato,
  onOpenMenu,
  verCostos = false,
}: {
  items: CartaItemEnriquecido[]
  // Menús fijos/eventos — segunda fuente de componentes (sep 2026): un
  // restaurante que trabaja mucho por menú (ej. un comedor) puede tener más
  // recetas colgando de acá que de la carta a la carta, y antes quedaban
  // invisibles en esta pantalla. Opcional y con default [] — nada se rompe
  // si algún caller todavía no las pasa.
  menus?: MenuConPreparaciones[]
  // Recetario completo — resuelve ingredientes tipo "subreceta" a su propio
  // nivel en vez de contarlos siempre como "sin costo". Ver estandarizacion.ts.
  recetasPorId?: Map<string, Receta>
  onBack: () => void
  onOpenPlato: (id: string) => void
  onOpenMenu: (menu: MenuConPreparaciones) => void
  verCostos?: boolean
}) {
  const [categoriaFiltro, setCategoriaFiltro] = useState(TODAS)
  const [plazaFiltro, setPlazaFiltro] = useState(TODAS)

  // Chips derivados de lo que realmente hay — nunca una plaza/categoría sin
  // un solo plato detrás. Orden: categorías tal cual vienen (ya ordenadas por
  // fetchCartaItemsData), plazas en el orden canónico de PLAZAS_OPS. Los
  // Menús no tienen "categoría" (Entradas/Principales/...) — no aportan acá.
  const categoriasPresentes = useMemo(
    () => [...new Set(items.map(i => i.categoria).filter(Boolean))],
    [items],
  )
  const plazasPresentes = useMemo(() => {
    const set = new Set([
      ...items.flatMap(i => i.plato_recetas).map(pr => pr.plaza_efectiva),
      ...menus.flatMap(m => m.preparaciones).map(mp => mp.plaza),
    ].filter((p): p is string => !!p))
    return PLAZAS_OPS.filter(p => set.has(p.id))
  }, [items, menus])

  // Componentes sin plaza en NINGÚN lado (ni plato_recetas ni el mise) —
  // sep 2026, hallazgo real: estos no aparecen bajo ningún filtro de plaza,
  // y sin este aviso desaparecen en silencio ("¿por qué no veo nueces
  // pecan caramelizadas en Calientes?" cuando en realidad nunca se le
  // asignó una plaza a ese componente). Se calcula sobre TODA la carta,
  // no sobre itemsFiltrados — el aviso vale exista o no un filtro activo.
  const componentesSinPlaza = useMemo(() => {
    return items.flatMap(item =>
      item.plato_recetas
        .filter(pr => pr.plaza_efectiva == null)
        .map(pr => ({ platoId: item.id, platoNombre: item.nombre, nombre: pr.receta?.nombre ?? '(receta eliminada)' })),
    )
  }, [items])

  // El filtro de plaza es por COMPONENTE, no por plato/menú entero: un plato
  // de Parrilla+Guarnición solo debe mostrarle al de Fríos su guarnición, no
  // el corte de carne. Uno sin ningún componente en la plaza filtrada
  // desaparece de la lista (no hay nada suyo que ese puesto tenga que
  // mirar). Los platos con receta_id directa (sin plato_recetas) no tienen
  // plaza propia — quedan afuera en cuanto se filtra por plaza.
  //
  // plaza_efectiva (no `plaza`): sep 2026, hallazgo real — un componente
  // puede estar configurado en el mise (OPS) con una plaza sin que
  // ComposicionEditor haya guardado esa plaza en plato_recetas. Filtrar por
  // `plaza` a secas los hacía desaparecer del filtro aunque el mise supiera
  // exactamente dónde van. Ver useCarta.ts.
  const itemsFiltrados = useMemo(() => {
    return items
      .filter(item => categoriaFiltro === TODAS || item.categoria === categoriaFiltro)
      .map(item => plazaFiltro === TODAS ? item : { ...item, plato_recetas: item.plato_recetas.filter(pr => pr.plaza_efectiva === plazaFiltro) })
      .filter(item => plazaFiltro === TODAS || item.plato_recetas.length > 0)
  }, [items, categoriaFiltro, plazaFiltro])

  // Un filtro de categoría específico (no "Todas") excluye los Menús: no
  // tienen ese dato, filtrarlos "adentro" de una categoría sería inventar
  // una pertenencia que no existe. El de plaza sí les aplica (misma lógica
  // que arriba, sobre preparaciones en vez de plato_recetas).
  const menusFiltrados = useMemo(() => {
    if (categoriaFiltro !== TODAS) return []
    return menus
      .map(m => plazaFiltro === TODAS ? m : { ...m, preparaciones: m.preparaciones.filter(mp => mp.plaza === plazaFiltro) })
      .filter(m => plazaFiltro === TODAS || m.preparaciones.length > 0)
  }, [menus, categoriaFiltro, plazaFiltro])

  const hayFiltrosActivos = categoriaFiltro !== TODAS || plazaFiltro !== TODAS

  // SIN filtrar — un menú que reusa un plato entero (menu_preparaciones tipo
  // 'plato') tiene que resolver bien aunque ese plato haya quedado afuera
  // del filtro de categoría/plaza actual; el filtro decide qué se MUESTRA,
  // no qué datos existen.
  const cartaItemsPorId = useMemo(() => new Map(items.map(i => [i.id, i])), [items])

  const analisis = useMemo(
    () => analizarCarta(itemsFiltrados, recetasPorId, menusFiltrados, cartaItemsPorId),
    [itemsFiltrados, menusFiltrados, recetasPorId, cartaItemsPorId],
  )
  const filas = useMemo(() => {
    const platos: FilaEstandarizable[] = itemsFiltrados.map(item => ({ tipo: 'plato', id: item.id, nombre: item.nombre, diag: nivelDePlato(item, recetasPorId), item }))
    const menusD: FilaEstandarizable[] = menusFiltrados.map(m => ({ tipo: 'menu', id: m.id, nombre: m.nombre, diag: nivelDeMenu(m, recetasPorId, cartaItemsPorId), menu: m }))
    return [...platos, ...menusD].sort((a, b) => a.diag.nivel - b.diag.nivel || a.nombre.localeCompare(b.nombre, 'es'))
  }, [itemsFiltrados, menusFiltrados, recetasPorId, cartaItemsPorId])

  const { porNivel, totalComponentes, totalPlatos, totalMenus, platosQueCostean, cola } = analisis
  const n3Verificados = porNivel[3]
  const totalEntidades = totalPlatos + totalMenus

  function abrir(fila: FilaEstandarizable) {
    if (fila.tipo === 'plato') onOpenPlato(fila.id)
    else onOpenMenu(fila.menu)
  }

  return (
    <div>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Estandarización</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Qué le falta a cada receta para costear de verdad</div>
          </div>
        </div>

        {/* Filtro de categoría — mismo patrón visual que el de Carta (lista) */}
        {categoriasPresentes.length > 1 && (
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, marginTop: 12, overflowX: 'auto', paddingBottom: 2 }}>
            {[TODAS, ...categoriasPresentes].map(cat => (
              <button key={cat} onClick={() => setCategoriaFiltro(cat)} style={{
                padding: '5px 12px', borderRadius: 20, border: 'none', whiteSpace: 'nowrap',
                background: categoriaFiltro === cat ? '#fff' : 'rgba(255,255,255,0.12)',
                color: categoriaFiltro === cat ? 'var(--navy)' : 'rgba(255,255,255,0.8)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Filtro de plaza — "mi corner": qué de esto es mío. Por componente,
            no por plato/menú entero (ver itemsFiltrados/menusFiltrados). */}
        {plazasPresentes.length > 1 && (
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {[{ id: TODAS, label: 'Todas las plazas' }, ...plazasPresentes].map(p => (
              <button key={p.id} onClick={() => setPlazaFiltro(p.id)} style={{
                padding: '5px 12px', borderRadius: 20, border: 'none', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 4,
                background: plazaFiltro === p.id ? '#fff' : 'rgba(255,255,255,0.12)',
                color: plazaFiltro === p.id ? 'var(--navy)' : 'rgba(255,255,255,0.8)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {totalComponentes === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            {hayFiltrosActivos
              ? 'Nada acá con estos filtros — probá con otra categoría o plaza.'
              : 'Todavía no hay componentes cargados en ningún plato o menú.'}
          </div>
        ) : (
          <>
            {/* ── Barra apilada — un solo elemento visual, no 4 alarmas ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
                {totalPlatos} plato{totalPlatos !== 1 ? 's' : ''}
                {totalMenus > 0 && <> · {totalMenus} menú{totalMenus !== 1 ? 's' : ''}</>}
                {' '}· {totalComponentes} componente{totalComponentes !== 1 ? 's' : ''}
                {hayFiltrosActivos && <span> · filtrado</span>}
              </div>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg)' }}>
                {([0, 1, 2, 3] as Nivel[]).map(n => (
                  porNivel[n] > 0 && (
                    <div key={n} title={`${NIVEL_META[n].nombre}: ${porNivel[n]}`} style={{
                      width: `${(porNivel[n] / totalComponentes) * 100}%`,
                      background: n === 0 ? 'var(--border)' : NIVEL_META[n].fg,
                      opacity: n === 0 ? 1 : 0.85,
                    }} />
                  )
                ))}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                {([0, 1, 2, 3] as Nivel[]).map(n => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <NivelBadge nivel={n} />
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{NIVEL_META[n].nombre} · {porNivel[n]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Titular real — conteo, no un % ponderado inventado ── */}
            <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5 }}>
              <strong>{totalComponentes - porNivel[0] - porNivel[1]}</strong> de {totalComponentes} componentes ya costean (N2 o mejor) ·{' '}
              <strong>{n3Verificados}</strong> con peso pesado y costo verificado (N3) ·{' '}
              <strong>{platosQueCostean}</strong> de {totalEntidades} {totalMenus > 0 ? 'platos/menús' : 'platos'} con food cost calculable
            </div>

            {/* ── Empezá por acá — cola ordenada por palanca, no alfabético.
                Con un filtro activo (plaza/categoría) se muestra COMPLETA:
                caparla ahí es lo que generaba "¿por qué no veo todo lo de
                Calientes?" — el usuario ya acotó el universo, no hace falta
                acotarlo de nuevo. Solo se recorta en la vista sin filtrar
                (puede haber decenas de componentes pendientes en toda la
                carta), y ahí se avisa cuántos quedan afuera en vez de
                cortarlos en silencio. ── */}
            {cola.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                  Empezá por acá
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  {(hayFiltrosActivos ? cola : cola.slice(0, 8)).map((c, idx) => (
                    <button
                      key={c.key}
                      onClick={() => {
                        if (c.primerTipo === 'plato') onOpenPlato(c.primerId)
                        else { const m = menusFiltrados.find(x => x.id === c.primerId); if (m) onOpenMenu(m) }
                      }}
                      style={{
                        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 12px', background: 'none', border: 'none', fontFamily: 'inherit', cursor: 'pointer',
                        borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <NivelBadge nivel={c.nivel} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{c.nombre}</span>
                          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                            → destraba {c.platosQueDestraba} {menus.length > 0
                              ? (c.platosQueDestraba !== 1 ? 'lugares' : 'lugar')
                              : `plato${c.platosQueDestraba !== 1 ? 's' : ''}`}
                          </span>
                        </div>
                        {c.faltantes.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                            Falta: {c.faltantes.join(' · ')}
                          </div>
                        )}
                      </div>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', flexShrink: 0 }}>chevron_right</span>
                    </button>
                  ))}
                </div>
                {!hayFiltrosActivos && cola.length > 8 && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 2px 0', textAlign: 'center' }}>
                    +{cola.length - 8} más — filtrá por plaza o categoría para verlos todos
                  </div>
                )}
              </div>
            )}

            {/* ── Por plato y menú — mini-barra de segmentos, uno por componente ── */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                {totalMenus > 0 ? 'Por plato y menú' : 'Por plato'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filas.map(fila => (
                  <button
                    key={`${fila.tipo}-${fila.id}`}
                    onClick={() => abrir(fila)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                      padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <NivelBadge nivel={fila.diag.nivel} />
                    {fila.tipo === 'menu' && (
                      <span className="material-symbols-outlined" title="Menú" style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>event</span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fila.nombre}
                    </span>
                    {fila.diag.componentes.length > 0 && (
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        {fila.diag.componentes.map((c, i) => (
                          <div
                            key={i}
                            title={`${c.nombre} — ${NIVEL_META[c.diag.nivel].nombre}${c.diag.faltantes.length ? ': falta ' + c.diag.faltantes.join(', ') : ''}`}
                            style={{
                              width: 7, height: 16, borderRadius: 2,
                              background: c.diag.nivel === 0 ? 'var(--border)' : NIVEL_META[c.diag.nivel].fg,
                              opacity: c.diag.nivel === 0 ? 1 : 0.85,
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {verCostos && fila.diag.costoPorGramo != null && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
                        {fmtMoney(fila.diag.costoPorGramo)}/g{!fila.diag.costoVerificado ? ' est.' : ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Sin plaza en ningún lado — no se filtran, no se fabrican: se avisan.
            Distinto del aviso de más abajo (eso es un límite de la app; esto
            es un dato que falta cargar y SÍ se puede arreglar acá mismo). ── */}
        {componentesSinPlaza.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>help</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                {componentesSinPlaza.length} componente{componentesSinPlaza.length !== 1 ? 's' : ''} sin plaza asignada
              </span>
            </div>
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)' }}>
              No aparecen en ningún filtro de plaza — ni en Carta ni en el mise se cargó dónde van. Tocá para abrir el plato y asignarla.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 12px 12px' }}>
              {componentesSinPlaza.slice(0, 12).map((c, i) => (
                <button key={i} onClick={() => onOpenPlato(c.platoId)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg)',
                  border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px',
                  fontSize: 11, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {c.nombre} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· {c.platoNombre}</span>
                </button>
              ))}
              {componentesSinPlaza.length > 12 && (
                <span style={{ fontSize: 10, color: 'var(--text-3)', alignSelf: 'center' }}>+{componentesSinPlaza.length - 12} más</span>
              )}
            </div>
          </div>
        )}

        {/* ── Límite declarado, no oculto ── */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', flexShrink: 0, marginTop: 1 }}>info</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
            No incluye productos comprados que van directo al plato o al menú (pan, limón) ni
            preparaciones de menú que reusan un plato entero de la carta — hoy solo se cuentan
            como componente las recetas y subrecetas.
          </span>
        </div>
      </div>
    </div>
  )
}
