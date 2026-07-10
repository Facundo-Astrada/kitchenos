---
name: update-manual
description: Actualiza docs/instructivo-carga-datos.md para reflejar features nuevas o cambiadas en la sesión, y regenera el HTML/PDF. Usar al final de cualquier sesión donde haya cambios visibles al usuario.
argument-hint: "descripción breve de qué cambió (opcional — si se omite, usa git diff)"
allowed-tools: Read, Edit, Glob, Grep, Bash
---

## Objetivo

Mantener `docs/instructivo-carga-datos.md` sincronizado con la app real, sección por sección, sin reescribir lo que ya está correcto.

## Pasos

### 1 · Entender qué cambió

Si se pasó argumento, usarlo como descripción del cambio.  
Si no, correr:
```bash
git diff HEAD~1..HEAD --stat
git log -1 --oneline
```
Identificar qué módulos tocaron los commits (facturas, stock, recetario, carta, ventas, OPS, pedidos, salón, reportes, pase, merma).

### 2 · Leer las secciones afectadas

Leer solo las secciones del instructivo que correspondan a los módulos cambiados. No leer el archivo completo si no es necesario.

Mapa módulo → sección del instructivo:
- `facturas*` / `importador*` → sección "1 · FACTURAS"
- `stock*` → sección "2 · STOCK"
- `recetario*` / `recetas*` → sección "3 · RECETARIO"
- `carta*` → sección "4 · CARTA"
- `ventas*` → sección "5 · VENTAS"
- `reportes*` → sección "6 · REPORTES"
- `operaciones*` / `mise*` / `produccion*` → sección "7 · OPS"
- `pase*` → sección "8 · PASE"
- `merma*` → sección "9 · MERMA"
- `pedidos*` → sección "10 · PEDIDOS"
- `salon*` → sección "11 · SALÓN / KDS"

### 3 · Verificar y editar

Para cada sección afectada:
1. Leer el código real del componente/hook/page correspondiente.
2. Comparar con lo que dice el instructivo.
3. Si hay discrepancia: editar solo el párrafo/tip/camino incorrecto con `Edit`. No tocar lo que está bien.
4. Si hay una feature nueva sin documentar: agregar un tip o un "Camino" nuevo al final de la sección.

**Reglas de escritura:**
- Español argentino, tono práctico.
- No explicar implementación técnica — explicar qué hace el usuario y qué resultado obtiene.
- Mantener la estructura: Cómo se carga → Qué pasa en la app → Qué te resuelve → Funciones extra.

### 4 · Chequear gaps en Kitchen Coach tours

Leer `lib/coach/tours.ts` y extraer todos los `targetId` registrados por pantalla.

Para cada archivo cambiado en la sesión (los del paso 1), buscar todos los atributos `data-coach-target` con Grep:
```
data-coach-target="([^"]+)"
```

Cruzar: si un `data-coach-target` del código **no aparece** en ningún `targetId` del tour de su pantalla, es un gap. La pantalla se infiere del path del archivo:

| Path | Clave en TOURS |
|---|---|
| `app/(app)/stock/` | `stock` |
| `app/(app)/carta/` | `carta` |
| `app/(app)/recetario/` | `recetario` |
| `app/(app)/facturas/` | `facturas` |
| `app/(app)/operaciones/` | `operaciones` |
| `app/(app)/pedidos/` | `pedidos` |
| `app/(app)/merma/` | `merma` |
| `app/(app)/ventas/` | `ventas` |
| `app/(app)/reportes/` | `reportes` |
| `app/(servicio)/salon/` | `salon` |

Si no hay tours definidos para esa pantalla en TOURS, reportarlo también (la pantalla entera no tiene tour).

No agregar los pasos al tour — solo reportar los gaps para que el desarrollador decida.

### 5 · Regenerar PDF

```bash
node scripts/md-to-pdf-instructivo.mjs
```

### 6 · Reportar

Listar separado en dos bloques:

**Instructivo:**
- Qué secciones se actualizaron y por qué.
- Si falta captura nueva en `docs/shots/` para alguna feature.
- Confirmar que el PDF se regeneró.

**Kitchen Coach:**
- Lista de `data-coach-target` sin tour step, con el formato:
  `⚠️  [pantalla] → target "id-del-elemento" no tiene tour step en lib/coach/tours.ts`
- Si alguna pantalla completa no tiene tours definidos:
  `⚠️  [pantalla] → sin tours definidos en TOURS`
- Si no hay gaps: `✅ Coach tours al día`

## Qué NO hacer

- No reescribir secciones que no cambiaron.
- No cambiar el glosario, el Paso 0, la tabla resumen ni los Problemas frecuentes salvo que el cambio lo requiera explícitamente.
- No hacer commit ni push.
