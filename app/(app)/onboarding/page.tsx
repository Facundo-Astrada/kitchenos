'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import BulkUploadDrawer from '@/components/facturas/BulkUploadDrawer'

type Step = 1 | 2 | 3 | 4 | 5

export default function OnboardingPage() {
  const router = useRouter()
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = createClient()
  const [step, setStep] = useState<Step>(1)

  // Counters (refreshed at each step)
  const [counts, setCounts] = useState({
    proveedores: 0, facturas: 0, productos: 0, recetas: 0,
  })

  // Step 1 — Proveedores
  const [provNames, setProvNames] = useState('')
  const [provSaving, setProvSaving] = useState(false)

  // Step 2 — Facturas (bulk upload drawer)
  const [showBulk, setShowBulk] = useState(false)

  // Step 3 — Lista de precios
  const [listaResult, setListaResult] = useState<{ items: Array<{ producto_nombre: string; precio: number; unidad: string }> } | null>(null)
  const [listaAnalyzing, setListaAnalyzing] = useState(false)
  const [listaSaving, setListaSaving] = useState(false)
  const listaFileRef = useRef<HTMLInputElement>(null)

  // Step 4 — Fichas técnicas
  const [fichasResult, setFichasResult] = useState<{ recetas: Array<unknown> } | null>(null)
  const [fichasAnalyzing, setFichasAnalyzing] = useState(false)
  const [fichasSaving, setFichasSaving] = useState(false)
  const fichasFileRef = useRef<HTMLInputElement>(null)

  // Step 5 — Final
  const [finalLoading, setFinalLoading] = useState(false)
  const [finalResult, setFinalResult] = useState<{
    productos_creados: number
    proveedores_creados: number
    ingredientes_vinculados: number
  } | null>(null)

  async function refreshCounts() {
    if (!RESTAURANTE_ID) return
    const [{ count: prov }, { count: fact }, { count: prod }, { count: rec }] = await Promise.all([
      supabase.from('proveedores').select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID),
      supabase.from('facturas').select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID),
      supabase.from('productos').select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID),
      supabase.from('recetas').select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID),
    ])
    setCounts({ proveedores: prov ?? 0, facturas: fact ?? 0, productos: prod ?? 0, recetas: rec ?? 0 })
  }

  useEffect(() => {
    if (RESTAURANTE_ID) refreshCounts()
  }, [RESTAURANTE_ID])

  async function saveProveedores() {
    const lines = provNames.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      setStep(2)
      return
    }
    setProvSaving(true)
    try {
      await supabase.from('proveedores').insert(
        lines.map(n => ({
          nombre: n,
          rubro: 'Insumos',
          telefono: '',
          dias_entrega: [],
          restaurante_id: RESTAURANTE_ID,
          activo: true,
        }))
      )
      await refreshCounts()
      setStep(2)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error guardando proveedores')
    }
    setProvSaving(false)
  }

  async function analyzeLista(file: File) {
    setListaAnalyzing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const isImg = file.type.startsWith('image/')
      fd.append('mode', isImg ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'excel')
      const res = await fetch('/api/listas-precios', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setListaResult(data)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error analizando archivo')
    }
    setListaAnalyzing(false)
  }

  async function saveLista() {
    if (!listaResult?.items?.length) {
      setStep(4)
      return
    }
    setListaSaving(true)
    try {
      // Crear productos directos desde la lista (los que aún no existen)
      await fetch('/api/importador/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'stock',
          restaurante_id: RESTAURANTE_ID,
          rows: listaResult.items.map(it => ({
            nombre: it.producto_nombre,
            unidad: it.unidad || 'kg',
            precio_unitario: it.precio,
            categoria: 'Otros',
            stock_actual: 0,
            stock_minimo: 0,
            stock_critico: 0,
          })),
        }),
      })
      await refreshCounts()
      setStep(4)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error guardando')
    }
    setListaSaving(false)
  }

  async function analyzeFichas(file: File) {
    setFichasAnalyzing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/importador/fichas-tecnicas', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setFichasResult(data)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error analizando archivo')
    }
    setFichasAnalyzing(false)
  }

  async function saveFichas() {
    if (!fichasResult?.recetas?.length) {
      setStep(5)
      return
    }
    setFichasSaving(true)
    try {
      for (const r of fichasResult.recetas) {
        const receta = r as Record<string, unknown>
        await fetch('/api/recetas/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receta: {
              restaurante_id: RESTAURANTE_ID,
              nombre: receta.nombre,
              categoria: receta.categoria || 'Principales',
              porciones: receta.porciones || 1,
              tiempo_minutos: receta.tiempo_minutos || 30,
              procedimiento: Array.isArray(receta.procedimiento) ? receta.procedimiento.join('\n') : (receta.procedimiento || ''),
              activa: true,
              status: 'published',
            },
            ingredientes: ((receta.ingredientes as unknown[]) || []).map((ing) => {
              const i = ing as Record<string, unknown>
              return {
                nombre: i.nombre || i.producto_nombre,
                cantidad: i.cantidad || 0,
                unidad: i.unidad || 'g',
                tipo: 'producto',
              }
            }),
          }),
        })
      }
      await refreshCounts()
      setStep(5)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error guardando recetas')
    }
    setFichasSaving(false)
  }

  async function finalizar() {
    setFinalLoading(true)
    try {
      // 1. Crear productos desde facturas
      const prodRes = await fetch('/api/importador/productos-desde-facturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurante_id: RESTAURANTE_ID, mode: 'apply' }),
      })
      const prodData = await prodRes.json()

      // 2. Auto-link ingredientes
      let vinculados = 0
      const linkRes = await fetch('/api/recetas/auto-link-ingredientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurante_id: RESTAURANTE_ID }),
      })
      if (linkRes.ok) {
        const { matches } = await linkRes.json()
        const links = (matches || [])
          .filter((m: { confianza: string }) => m.confianza === 'exacto' || m.confianza === 'parcial')
          .map((m: { ingrediente_ids: string[]; producto_id: string }) => ({
            ingrediente_ids: m.ingrediente_ids,
            producto_id: m.producto_id,
          }))
        if (links.length > 0) {
          const aplicar = await fetch('/api/recetas/auto-link-ingredientes', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ links }),
          })
          if (aplicar.ok) {
            const d = await aplicar.json()
            vinculados = d.vinculados ?? 0
          }
        }
      }

      setFinalResult({
        productos_creados: prodData.insertados ?? 0,
        proveedores_creados: prodData.proveedores_creados ?? 0,
        ingredientes_vinculados: vinculados,
      })
      await refreshCounts()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error finalizando')
    }
    setFinalLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Navy header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Bienvenido a KitchenOS</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.8 }}>
          Cargá tus datos en 4 pasos. Tomá los que tengas, saltá los demás.
        </p>
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          {([1, 2, 3, 4, 5] as Step[]).map(s => (
            <div key={s} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: s <= step ? 'white' : 'rgba(255,255,255,.2)',
            }} />
          ))}
        </div>
      </div>

      <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
        {step === 1 && (
          <StepCard
            num={1} total={4}
            title="Proveedores"
            subtitle="Tus principales proveedores. Podés saltear y se detectan solos desde las facturas."
            counts={counts}
            onSkip={() => setStep(2)}
            primaryLabel={provNames.trim() ? 'Guardar y continuar' : 'Continuar sin proveedores'}
            primaryDisabled={provSaving}
            onPrimary={saveProveedores}
          >
            <textarea
              value={provNames}
              onChange={e => setProvNames(e.target.value)}
              placeholder="Un proveedor por línea, ej:&#10;Carnes Don Pedro&#10;Verdulería La Plata&#10;Almacén Sur"
              style={{
                width: '100%', minHeight: 140, padding: 12, borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-1)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
              }}
            />
          </StepCard>
        )}

        {step === 2 && (
          <StepCard
            num={2} total={4}
            title="Facturas"
            subtitle="Subí tus facturas (PDF/foto) en lote. La IA extrae proveedor, items y precios automáticamente."
            counts={counts}
            onBack={() => setStep(1)}
            onSkip={() => setStep(3)}
            primaryLabel={counts.facturas > 0 ? 'Continuar' : 'Continuar sin facturas'}
            onPrimary={() => setStep(3)}
          >
            <button
              onClick={() => setShowBulk(true)}
              style={{
                width: '100%', padding: 24, borderRadius: 12, border: '2px dashed var(--accent)',
                background: 'rgba(67,97,160,.06)', color: 'var(--accent)', fontWeight: 700,
                cursor: 'pointer', fontSize: 14,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', margin: '0 auto 8px' }}>upload_file</span>
              {counts.facturas > 0 ? `${counts.facturas} facturas cargadas — subir más` : 'Subir facturas en lote'}
            </button>
            <BulkUploadDrawer
              open={showBulk}
              onClose={() => { setShowBulk(false); refreshCounts() }}
              onSaved={() => refreshCounts()}
            />
          </StepCard>
        )}

        {step === 3 && (
          <StepCard
            num={3} total={4}
            title="Lista de precios"
            subtitle="Opcional. Sirve para productos que aún no facturaste pero ya tenés cotización."
            counts={counts}
            onBack={() => setStep(2)}
            onSkip={() => setStep(4)}
            primaryLabel={listaResult ? `Guardar ${listaResult.items.length} productos` : 'Continuar'}
            primaryDisabled={listaSaving}
            onPrimary={listaResult ? saveLista : () => setStep(4)}
          >
            {!listaResult && (
              <>
                <button
                  onClick={() => listaFileRef.current?.click()}
                  disabled={listaAnalyzing}
                  style={{
                    width: '100%', padding: 24, borderRadius: 12, border: '2px dashed var(--accent)',
                    background: 'rgba(67,97,160,.06)', color: 'var(--accent)', fontWeight: 700,
                    cursor: listaAnalyzing ? 'wait' : 'pointer', fontSize: 14,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', margin: '0 auto 8px' }}>price_check</span>
                  {listaAnalyzing ? 'Analizando…' : 'Subir lista de precios (PDF/Excel/Imagen)'}
                </button>
                <input
                  ref={listaFileRef}
                  type="file"
                  accept="image/*,.pdf,.xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) analyzeLista(e.target.files[0]); e.target.value = '' }}
                />
              </>
            )}
            {listaResult && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
                  {listaResult.items.length} productos detectados
                </div>
                <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                  {listaResult.items.slice(0, 20).map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{it.producto_nombre}</span>
                      <span style={{ fontWeight: 600 }}>${it.precio?.toLocaleString('es-AR')}/{it.unidad}</span>
                    </div>
                  ))}
                  {listaResult.items.length > 20 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 8 }}>
                      +{listaResult.items.length - 20} más
                    </div>
                  )}
                </div>
              </div>
            )}
          </StepCard>
        )}

        {step === 4 && (
          <StepCard
            num={4} total={4}
            title="Fichas técnicas"
            subtitle="Subí tus recetas (Excel/PDF/DOCX). La IA extrae nombre, ingredientes y procedimiento."
            counts={counts}
            onBack={() => setStep(3)}
            onSkip={() => setStep(5)}
            primaryLabel={fichasResult ? `Guardar ${fichasResult.recetas.length} recetas` : 'Continuar'}
            primaryDisabled={fichasSaving}
            onPrimary={fichasResult ? saveFichas : () => setStep(5)}
          >
            {!fichasResult && (
              <>
                <button
                  onClick={() => fichasFileRef.current?.click()}
                  disabled={fichasAnalyzing}
                  style={{
                    width: '100%', padding: 24, borderRadius: 12, border: '2px dashed var(--accent)',
                    background: 'rgba(67,97,160,.06)', color: 'var(--accent)', fontWeight: 700,
                    cursor: fichasAnalyzing ? 'wait' : 'pointer', fontSize: 14,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', margin: '0 auto 8px' }}>restaurant_menu</span>
                  {fichasAnalyzing ? 'Analizando…' : 'Subir fichas técnicas (Excel/PDF/DOCX)'}
                </button>
                <input
                  ref={fichasFileRef}
                  type="file"
                  accept=".xlsx,.xls,.pdf,.docx"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) analyzeFichas(e.target.files[0]); e.target.value = '' }}
                />
              </>
            )}
            {fichasResult && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  {fichasResult.recetas.length} recetas detectadas
                </div>
              </div>
            )}
          </StepCard>
        )}

        {step === 5 && (
          <StepCard
            num={5} total={5}
            title="¡Listo!"
            subtitle="Vamos a procesar todo: crear productos desde tus facturas, asignar precios y vincular ingredientes."
            counts={counts}
            onBack={() => setStep(4)}
            primaryLabel={finalResult ? 'Ir al dashboard' : finalLoading ? 'Procesando…' : 'Finalizar'}
            primaryDisabled={finalLoading}
            onPrimary={finalResult ? () => router.push('/') : finalizar}
          >
            {!finalResult && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                <SummaryStat label="Proveedores" value={counts.proveedores} />
                <SummaryStat label="Facturas" value={counts.facturas} />
                <SummaryStat label="Recetas" value={counts.recetas} />
                <SummaryStat label="Productos" value={counts.productos} />
              </div>
            )}
            {finalResult && (
              <div style={{ background: 'rgba(22,101,52,.1)', border: '1px solid rgba(22,101,52,.3)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#166534', marginBottom: 12 }}>
                  ✓ Todo listo
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-1)', fontSize: 14, lineHeight: 1.8 }}>
                  <li>{finalResult.productos_creados} productos creados con precio real</li>
                  <li>{finalResult.proveedores_creados} proveedores nuevos detectados</li>
                  <li>{finalResult.ingredientes_vinculados} ingredientes vinculados al stock</li>
                </ul>
              </div>
            )}
          </StepCard>
        )}
      </div>
    </div>
  )
}

function StepCard(props: {
  num: number
  total: number
  title: string
  subtitle: string
  counts: { proveedores: number; facturas: number; productos: number; recetas: number }
  onBack?: () => void
  onSkip?: () => void
  onPrimary: () => void
  primaryLabel: string
  primaryDisabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>
        Paso {props.num} de {props.total}
      </div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>{props.title}</h2>
      <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{props.subtitle}</p>

      <div style={{ marginBottom: 16 }}>{props.children}</div>

      <div style={{ display: 'flex', gap: 8 }}>
        {props.onBack && (
          <button onClick={props.onBack}
            style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontWeight: 600 }}>
            Atrás
          </button>
        )}
        {props.onSkip && (
          <button onClick={props.onSkip}
            style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontWeight: 600 }}>
            Saltar
          </button>
        )}
        <button onClick={props.onPrimary} disabled={props.primaryDisabled}
          style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: 'white', cursor: props.primaryDisabled ? 'wait' : 'pointer', fontWeight: 700, opacity: props.primaryDisabled ? 0.6 : 1 }}>
          {props.primaryLabel}
        </button>
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
    </div>
  )
}
