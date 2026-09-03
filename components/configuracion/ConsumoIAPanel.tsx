'use client'

/**
 * Consumo de IA del mes, por función.
 *
 * Dos motivos para que exista, uno de producto y uno de negocio:
 * - El cliente usa 12 features con IA y no tenía forma de ver que las usaba.
 *   Un número visible convierte "botones sueltos" en una capacidad que se
 *   está consumiendo.
 * - `.claude/docs/negocio.md` §4: el costo variable de IA es el único que
 *   escala peligroso, y el Coach va con tope mensual **visible**. Este panel
 *   es el lugar donde ese tope va a vivir cuando se defina.
 *
 * Muestra USD porque es la unidad en que se asienta en `ia_uso` (los precios
 * de Anthropic son en USD). Convertir a pesos acá sería inventar un tipo de
 * cambio que el producto todavía no tiene en ningún lado.
 */

import { useConsumoIA } from '@/lib/hooks/useConsumoIA'
import { IAIcon, Num, iaTinte } from '@/components/ui'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function usd(n: number): string {
  // Por debajo del centavo, "$0,00" parece un error. Mejor decir que es poco.
  if (n > 0 && n < 0.01) return '< $0,01'
  return `$${n.toFixed(2).replace('.', ',')}`
}

export default function ConsumoIAPanel() {
  const { consumo, loading } = useConsumoIA()

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <IAIcon size={18} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Consumo de IA</span>
        {consumo && (
          <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>
            {MESES[consumo.desde.getMonth()]}
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '8px 0 0' }}>Calculando…</p>
      ) : !consumo || consumo.llamadas === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '8px 0 0', lineHeight: 1.5 }}>
          Todavía no usaste ninguna función con IA este mes. Importar recetas,
          leer facturas y sugerir pedidos son las que más tiempo ahorran.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <Num style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>
              {usd(consumo.costoUsd)}
            </Num>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              en <Num>{consumo.llamadas}</Num> {consumo.llamadas === 1 ? 'consulta' : 'consultas'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {consumo.porFuncion.map(f => {
              const pct = consumo.costoUsd > 0 ? (f.costoUsd / consumo.costoUsd) * 100 : 0
              return (
                <div key={f.tag}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-1)', flex: 1, minWidth: 0 }}>{f.nombre}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      <Num>{f.llamadas}</Num>×
                    </span>
                    <Num style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {usd(f.costoUsd)}
                    </Num>
                  </div>
                  {/* Barra en div CSS — DESIGN.md §10 prohíbe Chart.js. */}
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
                  </div>
                </div>
              )
            })}
          </div>

          <p style={{
            fontSize: 10, color: 'var(--text-3)', margin: '12px 0 0',
            padding: '6px 8px', borderRadius: 8, background: iaTinte(6), lineHeight: 1.45,
          }}>
            Lo que cuesta procesar tus fotos, PDFs y planillas con IA. Los imports
            de planillas conocidas no consumen nada: no pasan por IA.
          </p>
        </>
      )}
    </div>
  )
}
