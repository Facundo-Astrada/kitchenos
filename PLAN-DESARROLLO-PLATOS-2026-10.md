# PLAN — Desarrollo de platos (de notas sueltas a ficha)

**Estado:** `APROBADO` · 02/10/2026 · decisión de negocio **016** (excepción a la moratoria)
**Origen:** boceto en papel de Facundo ("Creación de platos": nombre, descripción, componentes
—cada producción por separado—, cantidad, procedimiento) + la nota de la pasta rellena (§ 9).

---

## 1. Qué problema resuelve

El chef que arma una carta nueva tiene las ideas desparramadas: un Google Doc, notas del
celular, audios y mensajes de WhatsApp. Escribe como piensa — técnica, intención, sin
cantidades:

> Pasta rellena de carne. Hacer con roast beef cortado a cuchillo súper braseado con mirepoix
> básico y fondo de verduras oscuro. Agregar gelatina para tener un relleno no tan líquido…

Pasar eso a una ficha técnica es trabajo de oficina que nadie hace, y por eso los platos nuevos
entran a la carta sin receta, sin gramaje y sin costo (Bros: 261 de 380 recetas con costeo
incompleto). La pantalla tiene que hacer ese paso **por él**: pega todo junto, y en segundos ve
sus 10 platos ordenados en fichas, con lo que falta definir a la vista.

## 2. Las tres reglas que no se negocian

1. **La IA no inventa datos como si fueran del chef.** Cada valor de la ficha lleva su origen:
   `chef` (estaba en el texto) o `ia` (sugerido). Lo sugerido se ve distinto (gris, itálica) y
   se confirma con un toque. Una cantidad inventada que parece real destruye la confianza en la
   ficha entera.
2. **Lo que falta se pregunta, no se rellena.** Si el chef no nombró la salsa, la ficha no le
   pone una: agrega la pregunta "¿Lleva salsa?". Las preguntas abiertas son la lista de trabajo
   de la prueba — es lo más útil que devuelve la pantalla.
3. **Nada entra a la carta hasta que el chef lo aprueba.** Una idea no aparece en la carta
   pública, ni en Rentabilidad, ni en el pase, ni en el mise.

## 3. Modelo: tabla propia, no un estado en `carta_items`

Se evaluó agregar `carta_items.estado` y se descartó: **16 archivos leen `carta_items`**
(carta pública, pase, KDS vía `useComandas`, Coach, reportes, fuga, line-up, control de
carta, onboarding…). Cada uno tendría que filtrar las ideas, y uno solo que se olvide publica
un plato a medio pensar. Una tabla aparte tiene impacto cero sobre lo existente; el plato se
**materializa** en las tablas de siempre recién al aprobar.

```sql
CREATE TABLE platos_desarrollo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre         text NOT NULL,
  descripcion    text NULL,          -- la idea del plato, en palabras del chef
  categoria      text NULL,          -- sugerida; nombre de carta_categorias, sin FK
  estado         text NOT NULL DEFAULT 'idea'
                 CHECK (estado IN ('idea','prueba','aprobado','descartado')),
  ficha          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- ver forma abajo
  texto_origen   text NULL,          -- el pedazo de notas del que salió (se muestra plegado)
  tanda_id       uuid NULL,          -- agrupa los platos de un mismo pegado
  foto_url       text NULL,
  carta_item_id  uuid NULL REFERENCES carta_items(id) ON DELETE SET NULL,  -- al aprobar
  creado_por     uuid NULL REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
```

- `estado`, no `status` (regla 1 del glosario).
- RLS estándar con `mi_restaurante_id()` (`/add-rls platos_desarrollo`). Índice
  `(restaurante_id, estado)`.
- **Sumarla a `reset_demo_restaurante()`** y cargarle 3-4 platos a El Rescoldo para la demo.
- `NOTIFY pgrst, 'reload schema'` después de crearla.

**Por qué la ficha es JSONB:** mientras es idea, la ficha es fluida, se edita entera y nunca
se consulta por componente. Normalizarla (tablas de componentes e ingredientes de idea)
duplicaría `recetas`/`ingredientes`/`plato_recetas` con otro nombre. El JSONB vive solo hasta
la aprobación; después, la fuente de verdad del plato es Carta, como siempre.

```ts
// types/index.ts
export type OrigenDato = 'chef' | 'ia'
export type EstadoPlatoDesarrollo = 'idea' | 'prueba' | 'aprobado' | 'descartado'

export interface FichaDesarrollo {
  componentes: ComponenteDesarrollo[]
  armado: { texto: string; origen: OrigenDato } | null   // emplatado / armado final
  preguntas: PreguntaDesarrollo[]
  notas_prueba?: string[]                                  // Fase 2
}

export interface ComponenteDesarrollo {
  id: string                       // uuid local, para keys y para anclar preguntas
  nombre: string                   // "Relleno", "Pasta", "Salsa"
  origen: OrigenDato
  receta_id: string | null         // vínculo a una receta que YA existe ("Fondo oscuro")
  gramaje: number | null           // por porción del plato → plato_recetas.gramaje
  gramaje_unidad: string | null
  gramaje_origen: OrigenDato | null
  ingredientes: IngredienteDesarrollo[]
  procedimiento: { texto: string; origen: OrigenDato }[]   // pasos
  nota_despacho: string | null     // → plato_recetas.nota (ya existe)
}

export interface IngredienteDesarrollo {
  nombre: string
  cantidad: number | null
  unidad: string | null
  cantidad_origen: OrigenDato | null
  aprox: boolean                   // "mucho pimiento", "un puñado"
  texto_cantidad: string | null    // la expresión literal del chef cuando no es un número
  receta_id: string | null         // subreceta existente (el ícono del boceto)
  producto_id: string | null       // Fase 2: para el costo
}

export interface PreguntaDesarrollo {
  id: string
  texto: string
  componente_id: string | null
  resuelta: boolean
}
```

**Mapeo al aprobar (Fase 2)** — todo hacia columnas que ya existen:

| Ficha | Destino |
|---|---|
| plato (nombre, descripción, categoría, foto) | `carta_items` (`disponible=false` hasta que el chef lo prenda; `precio_venta` lo pide el paso de aprobar) |
| componente con `receta_id` | `plato_recetas` contra esa receta, sin crear nada |
| componente sin `receta_id` | `recetas` `status='draft'` + `ingredientes` + `procedimiento` (vía `/api/recetas/save`, mismo camino del import IA) → `plato_recetas` |
| `gramaje` / `gramaje_unidad` | `plato_recetas.gramaje` / `gramaje_unidad` (**nunca** `cantidad_ops`) |
| `nota_despacho` | `plato_recetas.nota` |
| `armado` | `carta_items.procedimiento` (columna existente) |

## 4. Pipeline de IA

Objetivo de tiempo, honesto: **la primera ficha en ~10 s, las 10 en ~30 s.** Una sola llamada
de Sonnet con los 10 platos tarda más de un minuto (y choca con `maxDuration`); por eso se parte
en dos pasos y el segundo va en paralelo.

**Paso 0 — foto (opcional).** Si el chef adjunta una imagen (captura de WhatsApp, cuaderno),
una llamada de Sonnet con visión la transcribe a texto plano. Después sigue igual que el texto
pegado.

**Paso 1 — separar** · `POST /api/carta/desarrollo/separar` · Haiku 4.5.
El servidor numera las líneas del texto; Haiku devuelve solo
`[{ nombre_tentativo, desde, hasta }]`. Salida mínima, ~1-2 s. Los recortes los hace el
servidor con esos rangos — la IA nunca reescribe el texto del chef. La UI dibuja en el acto una
tarjeta esqueleto por plato.

**Paso 2 — ordenar** · `POST /api/carta/desarrollo/ordenar` · Sonnet 4.6 (`claude-sonnet-4-6`,
el mismo que ya usa el repo).
Una llamada **por plato**, el cliente lanza hasta 4 en paralelo. Entra el recorte del plato;
sale la `FichaDesarrollo` validada por `formatoJson` (`pedirAClaude` ya lo soporta). System
prompt con `cache_control` — es igual para los 10. Cada tarjeta se llena apenas vuelve su
respuesta y se guarda en `platos_desarrollo` en ese momento (si se corta la conexión en el
plato 7, los 6 primeros no se pierden).

Reglas del prompt (además de las de § 2):
- **Componente = cada cosa que se produce por separado** (relleno, masa, salsa, crocante). Un
  ingrediente crudo que va directo al plato es ingrediente de un componente de armado, no un
  componente propio.
- Técnica e intención ("súper braseado", "que no quede líquido sino gelatinoso") van al
  procedimiento con las palabras del chef, no resumidas.
- Las cantidades vagas se guardan como `aprox: true` + `texto_cantidad: "mucho"`, sin número.
  Si sugiere un número, va con `cantidad_origen: 'ia'`.
- Utensilios o equipos nombrados ("molde grande") quedan en el procedimiento y, si son
  ambiguos, generan pregunta.

**Vínculo con lo existente — determinístico, no IA.** La IA devuelve nombres; el servidor
busca recetas del restaurante por nombre normalizado y completa `receta_id` (así "fondo de
verduras oscuro" se vincula con la receta "Fondo oscuro" si existe). Nada de mandar el
recetario entero en el prompt (Bros tiene 380 recetas). Reusar la normalización de
`/api/recetas/auto-link-ingredientes` o del import de carta; si no hay una función
compartible, extraerla a `lib/recetas/` con test. Corolario de `negocio.md` § 4: si hay ruta
determinística, va primero.

**Costo e imputación.** Las tres rutas pasan `restauranteId` a `pedirAClaude` → quedan en
`ia_uso` (tags `/api/carta/desarrollo/*`). Estimado: ~$0,015 por plato con Sonnet
(~1,8k de entrada, en buena parte cacheados, ~700 de salida) + ~$0,005 de Haiku por pegado →
**~$0,15-0,20 por tanda de 10**. Medirlo en la primera tanda real y corregir este número.

**Límites.** Hasta ~15 platos y ~20.000 caracteres por pegado; arriba de eso, avisar y pedir
que lo parta. `maxDuration = 60` en las tres rutas.

## 5. Pantalla

**Dónde vive.** Botón **"En desarrollo"** en el header de Carta, junto a Menús y
Estandarización → `view === 'desarrollo'` en `carta/page.tsx`. **No es un `ModuloId` nuevo**
(no toca permisos, sidebar ni `AREA_CATALOGO`). Gate `canEdit`, igual que Estandarización.
Componente propio: `app/(app)/carta/DesarrolloView.tsx` (+ `FichaDesarrolloSheet.tsx`); hook
`lib/hooks/usePlatosDesarrollo.ts` (saltea el fetch con `restauranteId === ''`).

**Vista principal.**
- Arriba: caja "Pegá tus ideas" (textarea grande + adjuntar foto) y botón **Ordenar**. Abajo de
  la caja, una línea: "Funciona con notas del celular, Google Docs o WhatsApp. No hace falta
  ordenarlas."
- Debajo: tarjetas por plato, agrupadas por estado (Idea · En prueba · Aprobados · Descartados
  plegado). Cada tarjeta: nombre, descripción en una línea, componentes como chips, y
  **"3 preguntas abiertas"** si hay. Mientras se ordena: esqueleto con el nombre tentativo y un
  indicador de "ordenando…".
- Al terminar una tanda, un resumen arriba: "10 platos · 23 preguntas abiertas · 4 usan bases
  que ya tenés (Fondo oscuro, Masa al huevo)".

**Ficha (sheet).** Calca el boceto:
- Nombre · Descripción (la idea) · foto (subir/sacar con la cámara; mismo bucket que
  `carta_items.foto_url`).
- **Componentes**, cada uno un bloque: encabezado con el nombre y, si está vinculado, chip
  "Receta existente: Fondo oscuro". Debajo, tabla **ingrediente | cant. | procedimiento** en
  desktop (como el boceto, el procedimiento en la columna derecha), apilado en mobile. Nota de
  despacho al pie del componente.
- Valores `ia` en gris itálica con un toque para confirmar (pasa a `chef`). Cantidad vaga se
  muestra como el texto del chef ("mucho") con un campo para ponerle número.
- **Preguntas abiertas**: lista con check; tildar = resuelta. Se puede agregar a mano.
- **"Lo que escribiste"** plegado al final: el `texto_origen` literal, para comparar.
- Acciones: Pasar a prueba · Descartar · (Fase 2) Aprobar → carta.
- Guardado: autosave con debounce sobre `ficha` (es un documento, no un formulario con
  "Guardar").

UI: leer `.claude/docs/ui.md` y `DESIGN.md` antes de escribir. Íconos Material Symbols.
Pasar `ui-auditor` al terminar.

## 6. Fases

### Fase 1 — de notas a fichas (esta es la que se construye ahora)
1. Migración `platos_desarrollo` + RLS + `reset_demo_restaurante()` + reload de schema.
   Agregar fila en `.claude/docs/columnas.md`.
2. Tipos en `types/index.ts` (§ 3).
3. `lib/carta/desarrollo.ts`: numerado de líneas + recorte por rangos, esquema JSON de la
   ficha, normalizador de la respuesta, vínculo determinístico con recetas. **Con tests
   Vitest** (fixtures: la pasta de § 9, el boceto del sándwich, y 2-3 notas reales — ver § 8).
4. Rutas `separar` y `ordenar` (+ transcripción de imagen dentro de `separar`).
5. `usePlatosDesarrollo` + `DesarrolloView` + `FichaDesarrolloSheet` + botón en Carta.
6. Estados idea / prueba / descartado. Foto.
7. Probar con notas reales contra Bros (no El Rescoldo); medir costo real en `ia_uso`.

### Fase 2 — de la prueba a la carta
- **Aprobar → carta** con el mapeo de § 3 (pide precio; `disponible=false` por defecto).
- **Costo estimado** de la idea: ingredientes vinculados a `productos` (mismo matching de
  auto-link) → food cost aproximado con la marca "estimado", y precio sugerido para un food cost
  objetivo. Responde "¿este plato da plata?" antes de gastar mercadería en pruebas.
- **Notas de prueba** (`ficha.notas_prueba`) y foto del plato terminado.
- **Ficha imprimible** (jsPDF): la ficha en una hoja para llevar a la prueba y anotar a mano —
  cubre el hueco "fichas en blanco para validar" de `AUDITORIA-4-CAPAS.md`.
- **Modo "mi carta actual"**: mismo pegado, pero los platos se aprueban directo. Es la carga de
  los 10 platos de la decisión 015.
- Dictado por voz (reusar lo de descripción de puesto).
- Coach: screen context de la vista (`/coach-screen`).

### Fase 3 — satélites (solo versión derivada, ver 016)
Vista de órbitas: un plato principal al centro y alrededor los que comparten componentes con él
(calculado de `plato_recetas` + las fichas en desarrollo). Sirve para ver qué mise nuevo agrega
una idea y qué platos quedan sueltos. CSS posicionado, sin librerías de gráficos. El vínculo
comercial (marcar a mano "este acompaña a este", cruzarlo con comandas) **no entra**: necesita
decisión propia.

## 7. Lo que NO se hace
- No se agrega estado a `carta_items` (§ 3).
- No se manda el recetario ni el catálogo de productos en el prompt.
- No se genera foto con IA.
- No se crea `ModuloId` ni entrada de sidebar.
- No se materializa nada en recetas/ingredientes durante la Fase 1: las ideas viven solo en
  `platos_desarrollo`.

## 8. Antes de afinar el prompt
Hacen falta **2-3 notas reales tal como están en el celular o en el Doc** (con sus faltas, sus
abreviaturas y sus mezclas de platos). Van como fixtures en los tests de `lib/carta/desarrollo`.
Con solo el ejemplo de la pasta el prompt queda afinado para un único estilo de escritura.

## 9. Ejemplos de referencia

**Nota de la pasta** (Facundo, 02/10):
```
Pasta rellena de carne

Hacer con roast beef cortado a cuchillo súper braseado con mirepoix básico y fondo de verduras oscuro
Agregar gelatina para tener un relleno no tan líquido si no más bien glutinoso o gelatinoso
Mucho pimiento y tomate
Usaría un molde grande para la pasta
```
Ficha esperada (aproximada):
- **Relleno** — roast beef cortado a cuchillo (chef), mirepoix (chef, vincula con receta si
  existe), fondo de verduras oscuro (chef, vincula con "Fondo oscuro" si existe), gelatina
  (chef), pimiento "mucho" (chef, aprox), tomate "mucho" (chef, aprox). Procedimiento: braseado
  prolongado ("súper braseado"), cortar a cuchillo, ligar con gelatina para textura gelatinosa,
  no líquida.
- **Pasta** — masa al huevo (ia). Procedimiento: formar con molde grande (chef).
- **Preguntas:** ¿qué salsa o terminación lleva? · ¿cuánta gelatina por kg de relleno? ·
  ¿cuánto relleno por pieza y cuántas piezas por plato? · ¿qué molde, de qué medida? · ¿el
  pimiento y el tomate van en el braseado o crudos al final?

**Boceto en papel** (sándwich de dos componentes): Componente 1 = tomate 100 g, lechuga 50 g,
huevo 1 u (55 g); Componente 2 = pan 50 g, queso 10 g. El ícono junto a cada ingrediente es el
vínculo a su receta (`IngredienteDesarrollo.receta_id`).

## 10. Condición de salida
La de la decisión 016: si a las tres semanas de shippear la Fase 1 no hay ningún plato en
desarrollo creado en una cuenta real, se congela lo que falte. Consulta para medirlo:
`select restaurante_id, count(*) from platos_desarrollo group by 1;`
