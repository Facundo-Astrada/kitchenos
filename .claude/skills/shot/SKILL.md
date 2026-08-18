---
name: shot
description: Captura un screenshot de una pantalla de KitchenOS en producción (login + navegar + esperar + capturar). Usar en vez de escribir un script Playwright/Puppeteer nuevo desde cero.
allowed-tools: Bash
---

Correr `scripts/shot.mjs` con los parámetros pedidos:

```bash
node scripts/shot.mjs --ruta /stock --viewport mobile --cuenta demo --out docs/shots/stock.png
```

- `--ruta`: path de la app (ej. `/stock`, `/pedidos`).
- `--viewport`: `mobile` (390×844, 2x) o `desktop` (1440×900). Default `mobile`.
- `--cuenta`: `demo` (El Rescoldo, credenciales fijas) o `bros` (requiere env var `BROS_PASSWORD`). Default `demo`. Para cualquier otra cuenta: `--email` + `--pass` (ej. la tablet de cocina de Bros).
- `--out`: ruta del PNG. Default `docs/shots/<ruta>-<viewport>.png`.
- `--click`: selectores que se tocan en orden antes de capturar, separados por `||`. Si un texto matchea también en un tab oculto, agregarle `>> visible=true`. Ej. `--click 'text=Parrilla >> visible=true||[title="Cómo funciona el Mise"]'`.
- `--ls`: escribe `localStorage` **antes** de navegar, `clave=valor` separados por `||`. Es la única forma de llegar a las preferencias que viven solo en el browser (ej. `checklist_modo_control=true`, `kc_ops_welcomed=1` para saltear el saludo del Coach).
- `--scroll`: píxeles a bajar en el contenedor que realmente scrollea (las listas de OPS tienen overflow propio, no el body). Sirve para sacar del medio lo que tape el FAB del Coach.
- `--wait`: ms extra antes de disparar la foto (animaciones, overlays, listas que recargan al cambiar de tab).
- `--clip "x,y,w,h"` / `--sel` + `--pad`: recorte por coordenadas (px CSS, la mitad del PNG que sale a 2x) o por selector. Para explicar un control puntual en un manual.
- `--full`: página entera. `--probe`: lista qué matchea un selector (para entender por qué un overlay no encuentra su target). `--net`: cuánto baja la pantalla desde Supabase.

Apunta siempre a producción: `--base` está pendiente de implementar (ver `PENDIENTES.md`).

En Git Bash anteponer `MSYS_NO_PATHCONV=1` (si no, `/stock` se traduce a un path de Windows). En PowerShell no hace falta.

No crear un script one-off nuevo para esto — si `shot.mjs` no cubre un caso (otro viewport, otra cuenta), extenderlo ahí, no duplicar la lógica de login/espera en otro archivo.

**Capturando cuentas de clientes reales (Bros):** navegar y fotografiar, nada más. No tildar ítems, crear tareas ni cambiar datos para "armar" una captura mejor.
