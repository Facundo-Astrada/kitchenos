# Plan — Web de escritorio KitchenOS

> Versión web optimizada para carga rápida de datos en PC/notebook, en paralelo
> con la app móvil. **Mismo backend Supabase → sincronización en tiempo real
> automática en ambos sentidos.** Lo que se carga en la web aparece en el móvil
> al instante y viceversa, sin código de sync.

Fecha de inicio del plan: 2026-06-19

---

## Decisión arquitectónica: Opción A (responsive, mismo repo)

La "app móvil" ya es una app web Next.js bloqueada a `max-width: 420px`
(`app/globals.css` → `#shell`). No es nativa. Por lo tanto la web de escritorio
**no es un proyecto nuevo**: es una capa de presentación distinta sobre el mismo
código.

Se reutiliza al 100%:
- **24 hooks** (`useFacturas`, `useStock`, `useRecetas`, …) — ya cachean con SWR.
- **Todas las API routes** (`/api/importador/*`, `/api/facturas`,
  `/api/carta/import`, `/api/coach`).
- Auth, RLS multi-tenant, permisos (`usePermisos`), Kitchen Coach.

Lo único que cambia entre móvil y escritorio: **layout, navegación y flujos de
carga.**

### Por qué no un repo separado (Opción B, descartada)
Obligaría a extraer/duplicar los 24 hooks a un paquete compartido y mantener dos
códigos en sync. Para "carga rápida sobre los mismos datos" no aporta nada y
cuesta semanas extra.

---

## Dominio

- **Ahora (free):** se sirve desde `kos-app-one.vercel.app` (mismo deploy,
  responsive). Cero costo.
- **Más adelante:** `kitchenos.app` (preferido) o `getkitchenos.com` /
  `kitchenos.io`. Comprar en Cloudflare Registrar (precio costo) y apuntar
  `app.` o `panel.` al mismo proyecto Vercel (dominio extra = gratis en Vercel).

---

## Escalado a ~10.000 usuarios

La UI responsive **no afecta el escalado** — es presentación. El backend es el
mismo para ambas apps. A escala alta, los 3 puntos a vigilar (config/infra, no
reescritura):

1. **Conexiones realtime (lo más caro):** suscribir solo a lo que la pantalla
   necesita y cerrar al desmontar. Subir el tier de Supabase según concurrencia.
2. **Connection pooling:** las API routes con admin client / `pg` directo deben
   ir por el pooler (Supavisor), nunca conexión directa (serverless las agota).
3. **Índices por `restaurante_id`:** ya existen; mantenerlos al crecer el volumen
   por tabla. `mi_restaurante_id()` es `STABLE` (Postgres lo cachea por statement).

Veredicto: 10k tenants con cientos de concurrentes en hora pico → Supabase
Pro/Team alcanza. 10k concurrentes simultáneos → mismo código, tier mayor + las
3 verificaciones de arriba. No se reescribe la app.

---

## Fases

### Fase 0 — Cimientos del shell de escritorio · ~2-3 días
- `useViewport()` (o container queries / breakpoints) decide shell escritorio vs
  móvil. El `max-width:420px` se aplica solo en mobile.
- `DesktopShell`: **sidebar lateral** con los ~20 módulos, header superior, área
  de contenido multi-columna.
- Reutilizar tal cual: auth, `RouteGuard`, `usePermisos`, Kitchen Coach.
- **Entregable:** app navegable en escritorio con sidebar; cada módulo abre
  (aunque todavía con su layout móvil dentro).

### Fase 1 — MVP de carga rápida · ~1 semana
Los 4 módulos donde el escritorio gana de verdad:
- **Facturas / Importador** (killer feature): drag&drop multi-archivo, preview en
  grilla ancha, edición masiva. APIs ya existen.
- **Stock**: grilla tipo planilla, edición inline.
- **Recetario**: carga de ingredientes tabular + atajos.
- **Dashboard** de escritorio: KPIs en grid, no scroll vertical infinito.

### Fase 2 — Paridad del resto · ~1-1.5 semanas
Carta/Menús, ventas, proveedores, merma, HACCP, producción, turnos, pase,
pedidos, reportes, calendario → layout responsive reutilizando cada hook.

### Fase 3 — Superpoderes de escritorio · ~1 semana
1. **Pegar desde Excel** (`Ctrl+V` de un rango → filas) en stock/recetas/facturas.
2. **Carga masiva de facturas** drag&drop (30 archivos de una, OCR en serie).
3. **Atajos de teclado** (`N` nueva fila, `Tab`/`Enter` avanzar, `Cmd+S` guardar,
   `/` buscar).
4. **Multi-panel** (receta + stock de ingredientes lado a lado).
5. **Vista planilla editable** (tipo Airtable) para stock y precios.
6. **Export grande** a Excel/PDF (`xlsx` + `jsPDF` ya disponibles).
7. **Kitchen Coach** como panel lateral persistente (no FAB modal).

### Fase 4 — QA + endurecer escalado · ~3-4 días
Pooler, índices, disciplina de realtime, `npm run build`, deploy.

---

## Timeline

- **MVP usable (Fase 0 + 1):** ~1.5 semanas
- **Paridad total (todas las fases):** ~4 semanas

El grueso es UI: la lógica (hooks + API) ya está construida.

---

## Skills para el diseño de la web

Instaladas vía `npx skills add` (viven en `.agents/skills/`, symlinked a Claude Code).
Fuentes: impeccable.style · skills.wondel.ai · tasteskill.dev

**Núcleo de diseño (las que usaremos en cada pantalla):**
- `impeccable` — vocabulario de diseño anti "AI slop"; UX review, jerarquía, IA, tokens.
- `design-taste-frontend` — evita interfaces templated/genéricas; audit-first en rediseños.
- `refactoring-ui` — jerarquía visual, spacing, color, escalas, Tailwind, design tokens.
- `web-typography` — tipografía y carga de fuentes.
- `microinteractions` — feedback, loading states, transiciones de estado.
- `ux-heuristics` — auditoría de usabilidad.
- `top-design` — referencia de diseño de alto nivel.
- `steve-jobs-design-review` — review de simplicidad/foco (cortar scope).
- `design-everyday-things` — affordances, prevención de errores, modelos mentales.

**Apoyo a escalado/performance (útiles para Fase 4 y la pregunta de 10k usuarios):**
- `high-perf-browser` — Core Web Vitals, carga de recursos, render.
- `system-design` / `ddia-systems` — escalado, particionado, consistencia.

**Frameworks de negocio (vinieron con la librería wondel, no se usan en el diseño,
quedan disponibles):** obviously-awesome, jobs-to-be-done, lean-startup, etc.

**Cómo invocarlas:** se activan solas por contexto, o explícitamente
("usá la skill `impeccable` para …").

---

## Estado

- [x] Plan documentado
- [x] Skills seleccionadas e instaladas para diseño
- [x] Fase 0 — `DesktopShell` (sidebar) + `useIsDesktop()` SSR-safe hechos (sesión 22 jun 2026, ver `PENDIENTES.md` historial "Versión web desktop completa"), reforzado en D8 de `PLAN-UI-IDENTIDAD-2026-07.md` (6 jul: max-width 1040px, paleta de módulos consistente, Recetario 2 columnas).
- [~] Fase 1/2 — **parcial, no completa según el scope original.** Lo hecho (22 jun + D8): layouts responsive de Reportes (4-col KPI), Carta (2-col + panel detalle), Stock (tabla), Facturas (tabla), HACCP (grid), Recetario (2 col). Lo que sigue **sin hacer** de esta fase tal como está descripta abajo: drag&drop multi-archivo real en Facturas, grilla tipo planilla con edición inline en Stock, carga tabular de ingredientes en Recetario, y paridad de layout en ventas/proveedores/merma/producción/turnos/pase/pedidos/calendario.
- [ ] Fase 3 — superpoderes (pegar Excel, atajos de teclado, multi-panel, export grande, Coach lateral) sin empezar.
- [ ] Fase 4 — QA + endurecer escalado sin empezar.
