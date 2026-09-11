# Sesión — 2026-09-11

## Qué se cerró
- **Panel de Estandarización** (8 commits, `ac1762e`…`a284c7a`, cada uno con
  typecheck+Vitest(441)+build antes de push): escala N0-N3 por componente
  (`lib/recetas/estandarizacion.ts`) derivada de datos ya cargados — Carta →
  Estandarización nueva (gate `canEdit`, no `verCostos`), badge en Recetario
  (reemplazó el binario "SIN PESO NETO") y en `DetailView`, número real en la
  estación 2.3 de `/implantacion` (antes reusaba "sin receta" como proxy).
- Recursión en subrecetas (un ingrediente `tipo:'subreceta'` resuelve a su
  propio nivel, no siempre "sin costo") y Menús integrados a la misma
  cola/lista (`menu_preparaciones`, incluidas las que reusan un plato entero
  de la carta — resuelven al nivel real de ESE plato).
- Filtros de categoría y plaza — el de plaza es por COMPONENTE, no por plato
  entero, y lee `plaza_efectiva` (fallback al mise cuando `plato_recetas.plaza`
  nunca se guardó — bug real encontrado y confirmado con SQL directo contra
  Bros, no solo en la cuenta demo).
- **Dos bugs reales encontrados en la propia verificación en pantalla** (no en
  código): el editor de composición quedaba trabado al abrir un menú desde
  Estandarización (orden de `if (composing)` vs `if (view===...)` en
  `carta/page.tsx`) y "Empezá por acá" mostraba 8 ítems fijos aunque hubiera
  un filtro activo (en Bros/Calientes: 8 de 41 reales) — ambos arreglados y
  reverificados.
- `BROS_PASSWORD` agregado a `.env.local` (gitignorado) — primera vez que se
  verifica una feature en pantalla contra la cuenta Bros real, no solo la demo.
- `.claude/docs/columnas.md` actualizado (`plaza_efectiva`, `menu_preparaciones`
  sin columna `gramaje` propia) y `PENDIENTES.md`/`ESTADO-ACTUAL.md` podados.

## Qué quedó a medias
- **`plaza_efectiva` solo se calculó para `plato_recetas`**, no para
  `menu_preparaciones.plaza` — si el mismo desfasaje (mise sabe la plaza,
  la tabla no) existe también ahí, hoy sigue sin recuperarse.
- **`producto_id` en `plato_recetas`** (componentes comprados: pan, limón, un
  vino) — declarado como límite, deliberadamente NO tomado esta sesión: toca
  schema+costeo+editor+mise, tamaño de su propia sesión.
- **`PENDIENTES.md` sigue en 38KB** (guideline ~10KB) — no se podó a fondo,
  solo se cerró el ítem que tocaba esta sesión (checkpoint de implantación).

## Probar primero mañana
- Verificar si `menu_preparaciones.plaza` tiene el mismo desfasaje que
  `plato_recetas.plaza` tenía contra el mise (mismo patrón de SQL usado hoy).
- En Bros: asignarle plaza a alguno de los 11 "componentes sin plaza asignada"
  desde el botón OPS del plato y confirmar que desaparece de esa lista al
  recargar Estandarización (cerrar el loop completo, hoy solo se verificó que
  el click abre el lugar correcto).

## Próximo paso concreto
- Si sigue el mismo tema: `producto_id` en `plato_recetas` (sesión propia,
  ver arriba). Si no: retomar `PENDIENTES.md` 🟠 Alto — SMTP propio para
  invitaciones, o "Nada avisa cuando producción se rompe" (01/09).
