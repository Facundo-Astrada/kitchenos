---
name: hoja-instructiva
description: Arma la hoja de una A4 que explica una pantalla de KitchenOS a los cocineros, con capturas reales de producción y los botones recortados. Usar cuando hay que dar un instructivo imprimible de un módulo (mise, stock, pase, carta…) para colgar en la cocina.
argument-hint: "pantalla (ej: stock, pase, planificacion)"
allowed-tools: Read, Write, Edit, Bash, Glob, Artifact
---

Hoja instructiva de `$ARGUMENTS`. Referencia viva: `docs/ops-modo-control-una-hoja.src.html` — copiar su estructura, no inventar otra.

## A quién le habla
Cocineros veteranos que no usan apps ni checklists. Se entiende de un vistazo o no sirve.
- **El orden primero**: qué se toca, en qué momento del día, en 4 pasos numerados.
- Nombrar **el botón exacto**, no la función abstracta ("tocá el +", no "despachá el ítem").
- Frases cortas, castellano rioplatense de cocina. ~180 palabras en toda la hoja.
- Cerrar con 3 dudas típicas (¿y si me equivoco?, ¿anoto números?, ¿no está en la lista?).

## Pasos

1. **Recorrer la pantalla en la app** y decidir qué entra. Si hay un modo o toggle (ej. Modo Control), preguntar al usuario con cuál se documenta.
2. **Capturar** con `scripts/shot.mjs` contra producción. Cuenta de cocina de Bros (o `--cuenta demo`). Flags: `--ls clave=valor` (preferencias de localStorage), `--clip "x,y,w,h"` (px CSS, la mitad del PNG que sale a 2x), `--scroll N` (correr lo que tape el FAB), `--sel`.
   - Primero la pantalla entera **sin** `--clip`, mirarla, y recién ahí calcular los recortes.
   - Un recorte propio por cada botón que se explica, ajustado para que todos traigan su control al mismo tamaño relativo (~79% de la caja).
   - **Nunca tocar datos del cliente**: navegar y fotografiar, no tildar ni crear tareas.
3. **Escribir** `docs/<nombre>.src.html`: `<title>`, `<link rel="stylesheet" href="hoja-base.css">` y el contenido. Solo clases de `docs/hoja-base.css` (`.masthead .block .h .orden/.paso .aparte .fig/.ring .chips/.chip .bandas .par .nota .code .dudas`). No escribir CSS nuevo salvo que el sistema no lo cubra; si se agrega, va a `hoja-base.css`.
4. **Anillos** sobre los controles: `node scripts/hoja-medir.mjs docs/shots/X.png --color azul --zona x0,y0,x1,y1` devuelve el `style` listo para pegar. No estimarlos a ojo.
5. **Compilar y verificar**:
   ```bash
   node scripts/build-hoja.mjs docs/<nombre>.src.html
   node scripts/hoja-check.mjs docs/<nombre>.html
   ```
   Tiene que dar todo ✓ (entra en A4, medianeras únicas, filas parejas, anillos redondos). Si no entra, recortar texto antes que achicar tipografía.
6. **Mirar** el `.print.png` que deja el check.
7. **Publicar** el `.html` como Artifact y anotar los comandos de captura en `docs/shots/README-<nombre>.md`.

## Al terminar
Mostrar la URL del Artifact, el resultado del check y qué decisión de contenido conviene que el usuario revise.
