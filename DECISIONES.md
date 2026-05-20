# KitchenOS — Decisiones de Producto

Registro de decisiones tomadas con Facundo durante el diseño y construcción de KitchenOS. Cada entrada explica **qué se decidió**, **por qué** y **cómo se aplica** en el código para que cualquiera que tome el proyecto (o una nueva sesión de Claude) entienda el rationale.

---

## 1. Target y alcance

**Decisión:** KitchenOS es una herramienta **real** para El Rescoldo, no un portfolio demo.
**Por qué:** Facundo es dueño de un restaurante en Córdoba y necesita que el equipo use la app todos los días. Si algo no se usa en la cocina, se descarta.
**Cómo se aplica:** Priorizamos flujos que se hagan en cocina (checklist mise en place, pase de turno, tareas, stock rápido). Features "bonitas" pero no usadas se difieren o descartan.

---

## 2. Mobile-first, sin responsive compromises

**Decisión:** Diseño mobile-first absoluto. Desktop funciona pero no se optimiza.
**Por qué:** El equipo de cocina usa la app en celulares durante el servicio. Tablets ocasionalmente. Nadie abre la app en una laptop.
**Cómo se aplica:**
- Cada pantalla se prueba en celular (Facundo testea en su teléfono antes de aceptar).
- Botones grandes (44px+), inputs grandes, modo táctil.
- FABs (Floating Action Buttons) con `bottom: 100+` para no chocar con la navbar flotante.
- No hay un breakpoint de "desktop" especial — layouts de celular estirados funcionan OK en monitor.

---

## 3. Arranque vacío (sin mock data)

**Decisión:** La app arranca completamente vacía. Un restaurante recién creado tiene cero productos, cero recetas, cero tareas.
**Por qué:** Datos mock pre-poblados confunden al usuario ("¿estos son mis datos o los del demo?") y además requieren borrarlos antes de usar la app en serio. El HTML de referencia (`kitchenos-demo.html`) tiene datos hardcodeados **solo para ilustrar estructura y diseño**, no como seed real.
**Cómo se aplica:**
- Los scripts `seed.mjs` / `seed-data.mjs` se usan solo para el usuario admin de testing (`admin@elrescoldo.com`), no como parte del flujo de producción.
- Los nuevos restaurantes (creados vía `signUp`) solo reciben `rol_permisos` seed (5 filas), nada más.
- Cuando una pantalla no tiene datos, se muestra un **estado vacío con CTA** (ej: "Aún no cargaste ninguna receta — Tocá aquí para importar con IA").
- `components/dashboard/WelcomeDashboard.tsx` guía al restaurante nuevo con 5 pasos.

---

## 4. No hay modo servicio real

**Decisión:** El "Modo Servicio" que estaba planeado (pantalla full-screen con comandas en vivo, tiempos por plato, KDS estilo) **se difiere o descarta**.
**Por qué:**
- Requiere integración con una caja/POS (TouchBistro, Maxirest, Tango, SAP…) o escribir un POS propio. Ambas opciones son trabajo de meses y no resuelven el dolor principal del Rescoldo.
- El valor real que Facundo necesita del módulo "servicio" ya está cubierto por: Tareas (producción del día), Pase de Turno (mensajes entre turnos), 86/Carta (items no disponibles), Mise en place (listo para servicio).
- Un KDS rojo/verde de comandas en vivo requiere integrarse con el sistema de comandas del salón — fuera de scope.
**Cómo se aplica:**
- `components/dashboard/ModoServicio.tsx` existe como placeholder UI pero no está conectado a datos.
- En `ESTADO-ACTUAL.md` figura como "Parcial" pero no se invierte trabajo en él.
- Si en el futuro se reactiva, tendría que ser como agregado pro de un plan superior, conectado a un POS específico.

**Corolario:** No hay modelo de "salón" (mesas, meseros, cuentas). KitchenOS es un sistema para **cocina** únicamente. El puente cocina↔salón lo hace la app de caja que ya tiene el restaurante.

---

## 5. Confirmación plato por plato en el pase (no bulk)

**Decisión:** En los flujos donde el usuario confirma tareas de producción o mise en place, se confirma **uno a uno**, no con un "marcar todos como hechos".
**Por qué:** El bulk-accept genera errores (marcás como listo algo que no hiciste). En una cocina real, confirmar un plato requiere verlo. Facundo prefiere fricción honesta a velocidad engañosa.
**Cómo se aplica:**
- En `/checklist` cada mise item tiene su propio toggle.
- En `/tareas` tab Producción, cada componente se marca individualmente.
- En `/pase`, los mensajes son chat continuo — no hay "marcar todo leído".
- **Excepción:** En HACCP el registro de temperatura bulk existe (8 equipos de una vez) porque temperatura + hora es un solo acto físico. Pero cada temperatura igual se valida por separado (dentro/fuera de rango).

---

## 6. Proveedores se auto-crean desde facturas

**Decisión:** Cuando cargás una factura con IA y el proveedor (detectado por nombre/CUIT) no existe en la DB, se **crea automáticamente**.
**Por qué:**
- Obligar al usuario a crear el proveedor primero rompe el flujo "sacá foto de la factura → listo".
- El 80% de los proveedores del Rescoldo son predecibles (los 10 de siempre) pero los otros son ad-hoc. Crearlos a mano cada vez es fricción innecesaria.
- Los datos mínimos que la factura provee (nombre, CUIT) son suficientes para registrar al proveedor; el resto (días de entrega, rubro, teléfono) se completa después si hace falta.
**Cómo se aplica:**
- `useFacturas` / `/api/facturas` detectan `proveedor_nombre` y `proveedor_cuit`.
- Antes de insertar la factura, hacen `SELECT proveedores WHERE cuit = ... OR nombre ilike ...`. Si no existe, hacen un `INSERT` básico en `proveedores` y usan ese `id`.
- La vista `/proveedores` marca los proveedores auto-creados para que el admin pueda completarlos después.
**Trade-off:** Pueden quedar proveedores duplicados si el OCR detecta variantes del nombre ("DISTRIB. SUR SA" vs "Distribuidora Sur S.A."). Decidimos aceptar el ruido y permitir merge manual.

---

## 7. IA: Haiku por defecto, Sonnet solo para casos que lo requieran

**Decisión:**
- **Claude Haiku 4.5** para texto simple (importar receta desde texto pegado, ajustes sobre resultados previos).
- **Claude Sonnet 4.6** para visión (facturas, recetas desde foto) y multi-import (varias recetas en un solo archivo).
**Por qué:** Haiku es significativamente más barato y suficientemente bueno para tareas de extracción con prompts bien estructurados. Sonnet es necesario para imágenes y parsing complejo de documentos largos.
**Cómo se aplica:**
- `app/api/recetas/import/route.ts` acepta un parámetro de modelo en `callClaude()`, default Sonnet.
- Las llamadas desde single-text pasan explícitamente Haiku; las de imagen y multi-import usan Sonnet.
- Coach, facturas y listas-precios usan Sonnet (imagen o contexto rico).

**Corolario:** Cuando se active prompt caching (Anthropic) para el Coach, se puede bajar aún más el costo de Sonnet porque el system prompt con contexto del restaurante se cachea 5 min.

---

## 8. Gráficos con CSS divs, no Chart.js

**Decisión:** Todos los gráficos (barras, líneas de tendencia) son `<div>` con `width: ${pct}%` y colores CSS. Sin Chart.js, Recharts, Victory, etc.
**Por qué:**
- Chart.js pesa ~60KB minified y requiere polyfills de canvas.
- Los gráficos de KitchenOS son simples: barras horizontales, líneas con dots. CSS los resuelve en 20 líneas.
- Mobile-first: un canvas full-width se redimensiona peor que un flexbox.
- Bundle size importa en 3G argentino.
**Cómo se aplica:**
- En `/reportes`, las barras de food cost son `<div style={{ width: ${pct}%, background: color }}>`.
- Las líneas de tendencia son una grilla de dots con `<div>` posicionados absolutos.
- Si se necesita algo más complejo (scatter, heatmap), evaluar en su momento — pero el default es CSS.

---

## 9. Next.js 16 con `proxy.ts` (no `middleware.ts`)

**Decisión:** Usar `proxy.ts` en la raíz del proyecto para interceptar requests y validar auth, en vez del clásico `middleware.ts`.
**Por qué:** Next.js 16 renombró `middleware.ts` a `proxy.ts` como breaking change. El archivo `AGENTS.md` del proyecto explícitamente advierte: "This is NOT the Next.js you know". Si usás `middleware.ts` simplemente no se ejecuta.
**Cómo se aplica:**
- `proxy.ts` en la raíz, exporta `proxy()` (no `middleware()`) y un `config.matcher`.
- Usa `createServerClient` de `@supabase/ssr` con lectura/escritura de cookies.
- Redirige a `/login` si no hay sesión y la ruta no es pública.

---

## 10. Tipos centralizados en un solo archivo

**Decisión:** Todos los tipos e interfaces del dominio viven en `types/index.ts`. No hay `types/receta.ts`, `types/factura.ts`, etc.
**Por qué:**
- Un solo archivo es más fácil de auditar cuando hay que alinear tipos con el schema de Supabase.
- Los imports son uniformes: `import type { Receta, Producto, Tarea } from '@/types'`.
- Los tipos tienen comentarios que documentan la tabla DB correspondiente (`// DB: recetas (id, nombre, ...)`).
**Trade-off:** El archivo es largo (~600 líneas). Aceptamos el tamaño a cambio de la ergonomía.
**Cuándo cambiar:** Si el archivo supera ~1500 líneas o si varios desarrolladores editan tipos a la vez con conflictos, dividir por dominio.

---

## 11. Supabase Auth por email+password, no magic links (por ahora)

**Decisión:** Login con email + password tradicional. Magic links están planeados solo para invitación de empleados.
**Por qué:**
- En cocina, el equipo se loguea al empezar el turno y queda logueado todo el día. El flujo de abrir email para cada login no encaja.
- Password lo recuerdan, es rápido.
- Reset por email existe para cuando lo olvidan.
**Cómo se aplica:**
- `signInWithPassword` en `/login`.
- `signUp(email, password, restauranteName)` crea el user + restaurante + miembro.
- Recuperación de password con `/forgot-password` (email link).
- Invitación de nuevos empleados → magic link (pendiente, ver PENDIENTES §8).

---

## 12. Modelo de permisos por rol

**Decisión:** Permisos se definen en la tabla `rol_permisos` con una fila por rol por restaurante. Cinco roles: `admin`, `sous_chef`, `cocinero`, `bachero`, `compras`.
**Por qué:**
- Roles por-restaurante permiten que cada dueño configure quién ve qué sin tocar código.
- Cinco roles cubren el espectro real de una cocina sin caer en el infinito de "role-based access control" de enterprise.
- Los permisos se expresan como flags booleanos (`puede_editar_stock`, etc.) + un array `modulos_visibles text[]` en vez de un grafo complejo de permissions.
**Cómo se aplica:**
- Al registrarse, cada restaurante recibe 5 filas default en `rol_permisos` (ver `AuthProvider.signUp`).
- `usePermisos` lee estas filas y expone `puedeEscribirStock`, `puedeEditarRecetas`, `modulosVisibles[]`, etc.
- Los componentes esconden botones de acción según estos flags. `BottomNav` y `MoreMenu` filtran módulos por `modulosVisibles`.

**Mapping DB → UI Rol:** Los roles de DB no son 1:1 con los del UI (`Rol` type). Ver `mapRol()` en `lib/auth/context.tsx`. Esto es deuda de diseño — un `cocinero` en DB puede ser `parrilla`, `frios`, `calientes`, etc. según `plaza_asignada`. Simplificar esto es parte de refactor futuro, pero el mapping funciona OK hoy.

---

## 13. Estructura de planes y pricing

**Decisión (preliminar — pendiente de implementar):**
- **Trial (gratis, 14 días):** acceso completo a todos los módulos. Se bloquea al vencer.
- **Basic — USD $60/mes:** módulos core (Dashboard, Tareas, Recetario, Stock, Pedidos, Proveedores, Facturas, Carta, Checklist, Pase, Reportes básicos, Turnos). Sin IA. Sin HACCP avanzado. 3 usuarios máx.
- **Pro — USD $99/mes:** todo lo de Basic + Kitchen Coach IA + HACCP completo + OCR de facturas con IA + reportes avanzados (CMV por periodo, food cost histórico) + usuarios ilimitados.
**Por qué:**
- Dos tiers son suficientes para empezar. Un tier gratis permanente atrae usuarios que no convierten; mejor trial forzoso.
- El precio ancla en USD para no depender del peso. En Argentina, se factura el equivalente en ARS al tipo oficial del día.
- $60 es accesible para un restaurante pequeño (10-15 empleados); $99 para uno con volumen mayor que necesita IA y HACCP.
**Cómo se va a aplicar:** Ver `PENDIENTES.md` §12-14. Stripe Checkout + webhooks + tabla `suscripciones` + feature gating por plan.

**Lo que NO tiene plan aún:** Enterprise (cadenas de restaurantes) — se atacará cuando haya demanda real.

---

## 14. Argentina-first en formatos

**Decisión:**
- Cantidades con coma decimal: `0,5 kg` (no `0.5 kg`).
- Precios en ARS sin símbolo en la DB, con `$` en el UI: `$5.850`.
- Fechas en formato argentino `DD/MM/YYYY` en el UI; `YYYY-MM-DD` en la DB.
- IVA argentino (21%, 10.5%, 27%, 0%) como opciones explícitas en facturas.
- CUIT como identificador de proveedores, validación client-side `XX-XXXXXXXX-X`.
**Por qué:** Facundo y su equipo son argentinos. Los proveedores, la AFIP, los precios — todo es ARS/CUIT/IVA argentino. Localizar después es más trabajo que localizar de entrada.
**Cómo se aplica:**
- El system prompt de `/api/recetas/import` especifica: "cantidades con coma decimal (formato argentino)".
- El system prompt de `/api/facturas` especifica: "montos en pesos argentinos (ARS), sin símbolo $".
- Las utilidades de formato usan `toLocaleString('es-AR')` cuando aplica.
- No hay i18n — si en algún momento un restaurante de Uruguay o Chile pide la app, habrá que extraer strings, pero por ahora todo es español argentino embebido.

---

## 15. No agregar abstracciones hasta tenerlas usadas 3 veces

**Decisión:** Evitar helpers genéricos, hooks de utilidad, componentes "reutilizables" hasta que exista el segundo o tercer caso de uso concreto.
**Por qué:**
- El proyecto está en fase de descubrimiento — las abstracciones prematuras envejecen mal y después estorban.
- Facundo pide features concretas, no infraestructura.
- Tres líneas de código duplicado es mejor que una abstracción incorrecta.
**Cómo se aplica:**
- Los hooks de dominio (`useRecetas`, `useStock`, …) son largos pero autocontenidos. No hay un `useCrud<T>` genérico.
- Los componentes de card/item son repetidos con ligeras variaciones en cada módulo en vez de un `<EntityCard>` genérico.
- Helpers compartidos solo en `lib/utils.ts` (`cn()` para classnames) y formatos que ya se usan en varios lugares.

---

## 16. Deploy directo a producción, sin staging

**Decisión:** Vercel tiene un único environment: Production. No hay staging.
**Por qué:**
- El ciclo es: escribo → build local → deploy → Facundo prueba en su celular. Un staging intermedio solo agrega latencia sin feedback real.
- Los errores se detectan rápido porque Facundo usa la app en vivo.
- Los preview deployments de Vercel (cuando pusheás a branches) se podrían usar como staging ad-hoc si en algún momento hace falta, pero hoy no.
**Cómo se aplica:**
- `npx vercel --prod --yes` desde local después de `npx next build` limpio.
- Vercel no tiene CI/CD con tests automáticos (no hay tests). Confianza en el build de Next + TypeScript.
- Si algo se rompe en prod, rollback con `vercel rollback` o deploy del commit anterior.

---

## 17. Service role key en API routes (no en cliente)

**Decisión:** El `SUPABASE_SERVICE_ROLE_KEY` solo se usa en API routes server-side (`app/api/*/route.ts`) y scripts. Nunca en el browser.
**Por qué:**
- Exponer service role al cliente = bypassear toda la seguridad de Supabase. Cualquiera en DevTools podría hacer DELETE a cualquier tabla.
- El cliente debe usar `createClient()` del browser (anon key), cuyas queries están sujetas a RLS.
- Cuando RLS bloquea una operación legítima (ej: crear receta sin tener política que lo permita con anon), la solución correcta es una API route que valide y use service role.
**Cómo se aplica:**
- `lib/supabase/admin.ts` exporta `createAdminClient()` — solo importable desde server.
- `lib/supabase/client.ts` exporta `createClient()` — para browser.
- `app/api/recetas/save/route.ts` es el ejemplo canónico: recibe datos del cliente, los valida, y hace el insert con admin client.

**Trade-off:** Mientras las políticas RLS sean permisivas (`USING (true)`), esto no importa mucho. Pero cuando se restrinjan (ver PENDIENTES §6), la API route debe validar que el `restaurante_id` del insert pertenezca al usuario autenticado (verificar la cookie del request → obtener user → query `user_restaurantes`).

---

## 18. Base de código en español, UI en español argentino

**Decisión:**
- Nombres de variables, tablas, columnas, funciones: **en español** (`useRecetas`, `recetas`, `agregarReceta`, `puedeEditarStock`, `plaza_asignada`).
- Strings de UI: **español argentino** (`"Nueva receta"`, `"¿Querés cerrar el turno?"`, `"Dale"`, `"Listo"`).
- Comentarios de código: español o inglés mezclados, lo que fluya más natural al escribir.
**Por qué:**
- El dominio es una cocina argentina. `parrilla`, `mise en place`, `pase`, `bachero` — usar estos términos en inglés sería forzar una traducción que nadie entiende.
- Facundo lee el código ocasionalmente para entender qué hace. Español le baja la barrera.
- Los tipos y conceptos técnicos (`useState`, `async`, `interface`) quedan en inglés porque así vienen del lenguaje/framework.
**Cómo se aplica:**
- Nombres de archivos de hook: `useRecetas.ts`, `useFacturas.ts`, `usePase.ts`.
- Tablas: `recetas`, `facturas`, `pase_mensajes`, `checklist_items`.
- Variables: `cantidad`, `precio_unitario`, `asignado_a`, `puede_escribir`.
- **Excepción:** algunos identificadores técnicos que heredaron de los primeros prototipos están en inglés (`status`, `active`, `created_at`). Los mantenemos por consistencia con Supabase (timestamps autogestionados).

---

## 19. Memoria de Claude Code como fuente de verdad

**Decisión:** Los archivos en `C:\Users\Equipo\.claude\projects\C--\memory\` (MEMORY.md + archivos individuales) son la fuente de verdad sobre: patrones obligatorios, errores comunes, contexto del proyecto, perfil del usuario. Las sesiones nuevas de Claude leen estos archivos antes de hacer cambios.
**Por qué:**
- Sin memoria persistente, cada nueva sesión repite los mismos errores (queries con columnas equivocadas, asunciones de middleware.ts, etc.).
- Los archivos de memoria acumulan aprendizaje: "las tablas usan `stock_actual` no `cantidad`", "Next 16 usa proxy.ts", "arrancar vacío sin mocks".
**Cómo se aplica:**
- Memorias clave: `project_kitchenos.md` (contexto), `user_facundo.md` (perfil), `feedback_patterns.md` (patrones), `feedback_no_mock_data.md` (sin datos de ejemplo).
- Antes de escribir código, verificar memorias relevantes.
- Cuando una decisión es nueva o un error se repite, actualizar la memoria correspondiente.
**Migración a otro IDE:** Este archivo (`DECISIONES.md`) junto con `ARQUITECTURA.md`, `ESTADO-ACTUAL.md` y `PENDIENTES.md` reemplaza la memoria de Claude para otros agentes/IDEs. Leer los 4 antes de hacer cambios.

---

## 20. Flujo de trabajo con Claude Code

**Decisión:** Facundo no es programador, pero puede probar features en su celular y dar feedback específico. El rol de Claude es: investigar → planear → implementar → deploy → verificar con preview server → reportar.
**Por qué:**
- Facundo no escribe código. Necesita que Claude haga todo end-to-end y entregue "esto ya funciona en https://kitchenos-three.vercel.app, probalo".
- El feedback de Facundo es bug-driven: "no puedo guardar recetas", "los botones están tapados". Pocas veces feature-driven.
- Entregas chicas y frecuentes > sprints largos sin feedback.
**Cómo se aplica:**
- Claude usa los tools de preview (`preview_start`, `preview_snapshot`, `preview_screenshot`) para verificar cambios antes de considerar el task cerrado.
- Deploy directo a Vercel sin staging — ver §16.
- Los mensajes de commit y de respuesta al usuario son en español, concisos, con bullets del tipo "1. Fix X. 2. Fix Y. 3. Deployado." porque es lo que Facundo lee en su celular.
