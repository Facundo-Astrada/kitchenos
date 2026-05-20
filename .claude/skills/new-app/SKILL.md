---
name: new-app
description: Scaffoldea una nueva app completa con el stack Antigravity (Next.js 16 App Router + Supabase + Tailwind v4). Usar al iniciar un proyecto nuevo para un cliente.
argument-hint: "nombre-del-proyecto descripcion-breve"
---

Crear una nueva aplicación siguiendo el stack y las convenciones de Antigravity.

El argumento tiene formato: `nombre-del-proyecto "descripción breve del cliente"`
Ejemplo: `gestion-spa "App para gestión de turnos y stock de un spa en Buenos Aires"`

## Estructura a crear

```
nombre-del-proyecto/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx        # Shell: AuthProvider + BottomNav
│   │   └── page.tsx          # Dashboard principal
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   └── api/
│       └── .gitkeep
├── lib/
│   ├── auth/
│   │   └── context.tsx       # AuthProvider (patrón Antigravity — 2 useEffect separados)
│   ├── hooks/
│   │   └── useRestauranteId.ts
│   └── supabase/
│       ├── client.ts         # anon key, browser
│       ├── server.ts         # anon + cookies, SSR
│       └── admin.ts          # service role, solo API routes
├── components/
│   └── shell/
│       ├── BottomNav.tsx
│       └── RouteGuard.tsx
├── types/
│   └── index.ts
├── proxy.ts                  # Auth middleware (NO middleware.ts)
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── .env.local.example
├── CLAUDE.md
├── ARQUITECTURA.md
└── ESTADO-ACTUAL.md
```

## Archivos críticos — contenido obligatorio

### `proxy.ts` (NO middleware.ts)
Usar `@supabase/ssr` createServerClient con cookies, proteger todas las rutas excepto `/login`, `/register`, `/api/*`.

### `lib/auth/context.tsx`
Dos useEffect separados:
1. Solo auth state (onAuthStateChange + getSession) — sin queries DB
2. loadPerfil cuando user cambia — consultar tabla de usuarios del proyecto

### `lib/supabase/admin.ts`
```ts
import { createClient } from '@supabase/supabase-js'
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
```

### `CLAUDE.md`
Llenar con: stack, comandos, convenciones UI del proyecto, columnas no intuitivas (a completar a medida que se crea el schema), referencia a ARQUITECTURA.md.

### `ARQUITECTURA.md`
Documentar el schema Supabase a medida que se crean las tablas.

### `ESTADO-ACTUAL.md`
Tabla de módulos con estado (pendiente/en desarrollo/funcional), bugs conocidos, sesiones de trabajo.

## Reglas del stack Antigravity

- **NO** `middleware.ts` — usar `proxy.ts` (Next.js 16 breaking change)
- **NO** Chart.js — gráficos con CSS divs y `width: X%`
- **NO** emoji en UI — Material Symbols Outlined
- **NO** hex hardcodeado — CSS vars `var(--navy)`, `var(--bg)`, etc.
- **SÍ** Tailwind v4 con CSS vars custom
- **SÍ** jsPDF para exports PDF
- **SÍ** `xlsx` si necesita Excel
- FABs siempre en `bottom: 100+` para no tapar navbar flotante

## Pasos de inicialización

1. `npx create-next-app@latest nombre --typescript --tailwind --app --no-src-dir`
2. `npm install @supabase/ssr @supabase/supabase-js`
3. Instalar jsPDF si necesita PDFs: `npm install jspdf jspdf-autotable`
4. Crear todos los archivos de la estructura
5. Crear `.claude/settings.json` con permisos y MCP servers
6. Correr `npm run build` para verificar build limpio

Tras crear el scaffold, preguntar al usuario: ¿qué módulos necesita este proyecto? Para continuar con el agente `spec-to-code`.
