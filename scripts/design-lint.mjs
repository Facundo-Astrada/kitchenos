#!/usr/bin/env node
// Lint de diseño — P5 de DESIGN.md/INVESTIGACION-DISENO-2026-08.md.
//
// Verificación estática (sin browser, sin LLM juez) de las reglas MÁS
// precisas de DESIGN.md — no un auditor exhaustivo del archivo entero.
// Primera corrida (versión sin scoping) mostró dos cosas reales, y el
// script quedó calibrado contra eso en vez de ignorarlo:
//
//   - confirm()/alert() aparece 60+ veces en pantallas de GESTIÓN (Turnos,
//     Clientes, HACCP, Carta, Stock…), no de servicio. La regla de DESIGN.md
//     §10 apunta a "flujo de servicio" — un confirm() nativo para "eliminar
//     un puesto" en Turnos es debate de estilo, no el mismo bug que romper
//     el único momento de celebración del turno en el Mise (lo que sí se
//     arregló, P2.1/P4). Por eso el chequeo de confirm() es ERROR solo
//     dentro de las rutas de servicio (mismo scope que el piso de targets,
//     abajo); en gestión es WARN. alert() en sí (reporte de error, no
//     confirmación de una acción) es WARN en todos lados — P4 ya decidió
//     no tocarlo ahí, no tendría sentido que el propio lint lo contradiga.
//
//   - Matchear `height:`/`minHeight:` línea por línea sin importar qué
//     elemento lo tiene pescaba barras de progreso, puntos de estado y
//     skeletons — ruido, no hallazgos. Ahora solo mira DENTRO de bloques
//     `<button ...>`, con una ventana acotada de texto (no la línea suelta).
//
// hex/box-shadow fuera de token quedaron afuera a propósito: un censo real
// (ver commit) encontró cientos de usos ya shippeados en decenas de
// archivos nunca auditados contra esa regla — un gate acá fallaría en masa
// sobre código pre-existente, no sobre deriva nueva. Auditarlo bien es su
// propio trabajo (anotado en PENDIENTES.md), no algo para forzar en este
// script.
//
// Uso: node scripts/design-lint.mjs   (exit 1 solo si hay ERROR)

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(full)
  }
  return out
}

const APP_DIR = join(ROOT, 'app', '(app)')
const SERVICIO_DIR = join(ROOT, 'app', '(servicio)')
const COMPONENTS_DIR = join(ROOT, 'components')

// Rutas de superficie de servicio dentro del Registro Preparación (uso
// constante, de pie, manos ocupadas — DESIGN.md §7: 56px ahí). El resto de
// app/(app) es gestión de escritorio (44px alcanza, no se audita acá) o
// vive en app/(servicio) (64px, chequeado aparte).
const RUTAS_SERVICIO_PREPARACION = ['checklist', 'produccion', 'pase', 'operaciones']
// Componentes que solo se usan desde esas rutas — mismo criterio.
const COMPONENTES_SERVICIO = ['mise', 'ops']

function esRutaServicio(rel) {
  const partes = rel.split(sep)
  if (partes[0] === 'app' && partes[1] === '(app)' && RUTAS_SERVICIO_PREPARACION.includes(partes[2])) return true
  if (partes[0] === 'components' && COMPONENTES_SERVICIO.includes(partes[1])) return true
  return false
}

const errors = []
const warns = []

// confirm()/alert() — separados: confirm() bloquea una decisión (peor),
// alert() solo reporta un error de red (P4 ya lo dejó así a propósito).
function checkConfirmAlert(rel, lines, servicio) {
  lines.forEach((line, i) => {
    const antesDeConfirm = line.split(/\bconfirm\s*\(/)[0] ?? ''
    if (/\bconfirm\s*\(/.test(line) && !antesDeConfirm.includes('//')) {
      const sev = servicio ? errors : warns
      sev.push(`${rel}:${i + 1}${servicio ? '' : ' [gestión]'} — confirm() nativo del navegador: ${line.trim().slice(0, 90)}`)
    }
    const antesDeAlert = line.split(/\balert\s*\(/)[0] ?? ''
    if (/\balert\s*\(/.test(line) && !antesDeAlert.includes('//')) {
      warns.push(`${rel}:${i + 1} — alert() nativo (reporte de error, no confirmación — P4 lo dejó así a propósito): ${line.trim().slice(0, 90)}`)
    }
  })
}

// Solo dentro de <button ...> — ventana de hasta 500 caracteres o hasta el
// próximo <button/</button>, lo que venga primero, para no cruzar al botón
// siguiente en archivos con varios seguidos.
function checkTargetHeights(rel, content, floor) {
  const buttonRe = /<button\b/g
  let m
  while ((m = buttonRe.exec(content))) {
    const start = m.index
    let end = content.indexOf('>', start)
    // Extender hasta el cierre real del bloque de props si style sigue después del primer '>' de un JSX multilinea — heurística: tomar hasta 500 chars o el próximo <button/</button>, lo que sea antes.
    const nextButton = content.indexOf('<button', start + 8)
    const closeButton = content.indexOf('</button>', start)
    const windowEnd = Math.min(
      start + 500,
      nextButton === -1 ? Infinity : nextButton,
      closeButton === -1 ? Infinity : closeButton,
    )
    const ventana = content.slice(start, windowEnd)
    // .hit-slop (globals.css) ya es la mitigación sancionada para un botón
    // chico con área tocable real más grande (P2.1/P4) — si está, el
    // hallazgo no es nuevo, es el patrón establecido funcionando.
    if (/className\s*=\s*['"`][^'"`]*hit-slop/.test(ventana)) continue
    const heightMatch = ventana.match(/\bheight\s*:\s*'?(\d+)/)
    if (heightMatch) {
      const val = parseInt(heightMatch[1], 10)
      if (val > 0 && val < floor) {
        const lineNum = content.slice(0, start).split('\n').length
        warns.push(`${rel}:${lineNum} — botón de ${val}px de alto, piso documentado ${floor}px (revisar si es una excepción deliberada tipo Modo Control, o si el número pescado es de un elemento hijo y no del botón — la heurística es una ventana de texto, no un parser de JSX; ver ui.md): <button…height:${val}`)
      }
    }
  }
}

function checkMotionDurations(rel, content, lines) {
  if (!/from ['"]motion\/react['"]/.test(content)) return
  const importaDuration = /import\s*\{[^}]*\bDURATION\b[^}]*\}\s*from\s*['"]@\/lib\/ui\/motion['"]/.test(content)
  if (importaDuration) return
  lines.forEach((line, i) => {
    if (/duration\s*:\s*0\.\d+/.test(line)) {
      warns.push(`${rel}:${i + 1} — duración de animación hardcodeada sin importar DURATION de lib/ui/motion: ${line.trim().slice(0, 90)}`)
    }
  })
}

const allFiles = [...walk(APP_DIR), ...walk(SERVICIO_DIR), ...walk(COMPONENTS_DIR)]

for (const file of allFiles) {
  const rel = relative(ROOT, file)
  const content = readFileSync(file, 'utf-8')
  const lines = content.split('\n')
  const servicio = rel.startsWith(`app${sep}(servicio)${sep}`) || esRutaServicio(rel)
  checkConfirmAlert(rel, lines, servicio)
  checkMotionDurations(rel, content, lines)
  if (servicio) {
    const floor = rel.startsWith(`app${sep}(servicio)${sep}`) ? 64 : 56
    checkTargetHeights(rel, content, floor)
  }
}

console.log(`\n── Lint de diseño (DESIGN.md) ──\n`)

if (errors.length > 0) {
  console.log(`ERROR (${errors.length}) — confirm() en superficie de servicio:`)
  for (const e of errors) console.log(`  ✗ ${e}`)
  console.log('')
}

if (warns.length > 0) {
  console.log(`WARN — no bloquea, revisar caso por caso (${warns.length}):`)
  for (const w of warns.slice(0, 50)) console.log(`  ⚠ ${w}`)
  if (warns.length > 50) console.log(`  … y ${warns.length - 50} más`)
  console.log('')
}

if (errors.length === 0 && warns.length === 0) {
  console.log('Sin hallazgos.\n')
}

console.log(`Nota: hex/box-shadow fuera de token quedaron fuera a propósito — ver el comentario al inicio de este script.\n`)

process.exit(errors.length > 0 ? 1 : 0)
