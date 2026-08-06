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
- `--viewport`: `mobile` (390×844) o `desktop` (1440×900). Default `mobile`.
- `--cuenta`: `demo` (El Rescoldo, credenciales fijas) o `bros` (requiere env var `BROS_PASSWORD`). Default `demo`.
- `--out`: ruta del PNG. Default `docs/shots/<ruta>-<viewport>.png`.
- `--click`: selectores separados por `|` que se tocan en orden antes de capturar, para lo que no es una ruta (una hoja, un panel). Ej. `--click 'text=Parrilla|[title="Cómo funciona el Mise"]'`.
- `--esperaClick`: ms de espera después de cada click. Default 1200.
- `--scroll`: píxeles de scroll antes de capturar (sirve para ver el fondo de una lista o de la hoja abierta con `--click`).
- `--base`: apuntar al dev server local (`http://localhost:3000`) en vez de producción.

En Git Bash anteponer `MSYS_NO_PATHCONV=1` (si no, `/stock` se traduce a un path de Windows). En PowerShell no hace falta.

No crear un script one-off nuevo para esto — si `shot.mjs` no cubre un caso (otro viewport, otra cuenta), extenderlo ahí, no duplicar la lógica de login/espera en otro archivo.
