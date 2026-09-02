# Negocio — las reglas que cambian decisiones de código

**Estado:** `VIGENTE` · 01/09/2026
**Fuente de verdad:** `~/Desktop/START UP KOS/00-decisiones/DECISIONES.md` (decisiones 001-012).
**Si este archivo y esa carpeta difieren, manda la carpeta.** Acá vive solo el destilado
que afecta al código; el razonamiento completo, las reversiones y las condiciones de
salida viven allá.

Leer esto cuando la tarea toque: planes, precios, cobro, gating, costo de IA, importador
como onboarding, o la pregunta "¿construimos este módulo nuevo?".

---

## 1. Cobro: Mercado Pago, nunca Stripe

**Decisión 004.** Stripe no opera en Argentina (46-47 países; en LatAm solo Brasil y
México). Una empresa argentina no puede abrir cuenta. El cobro automático va por la API
de suscripciones (`preapproval`) de Mercado Pago.

- **No escribir código de Stripe.** Si aparece una sugerencia de Stripe en un plan, está
  mal por país, no por preferencia.
- El cobro automático es el **último** ítem del roadmap de planes (`PENDIENTES.md` §
  Roadmap: Planes y cobro): recién cuando cobrar a mano moleste, cliente 4-5.
- Cuando se construya: **el dunning se diseña desde el día uno.** 20-40% de las bajas de
  suscripción en LatAm son involuntarias (tarjeta vencida, rechazo), no decisiones del
  cliente.
- Prerrequisito que no es código: monotributo + facturación electrónica ARCA
  (decisión 001).

## 2. Planes: `lib/planes.ts` es un reflejo, no la fuente

**Decisión 006.** Cuatro paquetes — Base ($48.000), Cocina ($75.000), Control ($110.000),
Producción ($26.000), todos ARS/mes — más fee de implementación de $300.000 (pago único,
decisión 007) y +65% por local adicional.

- `restaurantes.plan` **no tiene default a propósito**. Hoy es NULL en las 5 cuentas y
  `puedeUsar()` devuelve `true` siempre. No inventar un default.
- La grilla **no está validada contra ningún cliente pago** (decisión 003). Tratarla como
  hipótesis: puede cambiar de nombre o de contenido antes de la primera factura.
- En `lib/planes.ts` hay módulos marcados como *inferidos* — la decisión 006 no los
  nombra. Si el trabajo toca uno de esos, no "corregirlo" en silencio: es una pregunta de
  negocio, no de código.
- **Indexación trimestral ~7% siguiendo IPC** (decisión 010). Al indexar hay que tocar
  `PLAN_PRECIO_ARS` y avisar al cliente 30 días antes. Si algún día hay más de un lugar
  con el precio escrito, eso es un bug esperando.

## 3. Feature gating: existe el mecanismo, no el cableado

`usePlan()` y `puedeUsar(modulo)` existen. **No están cableados a ninguna pantalla.** El
lugar natural es `RouteGuard`, junto a `moduloEnPerfil`.

No apurar el cableado sin al menos un cliente con plan asignado: hoy no cambia nada
visible y solo agrega superficie para romper.

## 4. IA: todo consumo se imputa, el Coach tiene tope

**Decisión 008.** El costo variable de IA es el único que escala peligroso.

- **Toda ruta nueva que llame a Claude imputa su costo en `ia_uso` con `restaurante_id`.**
  Son 12 rutas hoy; una ruta nueva sin imputar es un agujero en el único número de costo
  que tenemos.
- Medición del 01/09: import por planilla conocida (Fudo) = **$0**, no consume tokens —
  las 3.499 facturas de Bros entraron por ahí. OCR de foto ~$0,03-0,05 por factura.
  **Coach ~$0,05-0,15 por turno** → a 100 turnos/mes son 12-37% de un abono de $75.000.
- El Coach va en el plan Control con **tope mensual visible** (orden de magnitud: 300
  consultas). Superado el tope: se cobra excedente o se degrada a Haiku.
- Corolario de diseño: **antes de mandar algo a la IA, preguntarse si hay ruta
  determinística.** La ruta rápida del importador es el ejemplo a copiar, no la excepción.

## 5. K-OS convive con el POS — no se construye POS

**Decisión 009**, y esto no se debatió: se encontró en los datos. El único cliente vivo
usa Fudo como POS y K-OS como back-office, y le pasa el export de Fudo a K-OS.

- **No incorporar caja, facturación fiscal ni mapa de mesas.**
- La **ruta rápida del importador para exports de Fudo** (Gastos+Detalle, sin IA, conoce
  hasta el prefijo `"Empleado"` con que Fudo marca sueldos) es infraestructura crítica de
  negocio, no una función de compras. Romperla rompe el onboarding y el único flujo
  probado en producción. Ver `.claude/docs/importador.md`.
- Consecuencia a tener presente: K-OS es un **segundo abono**. Compite contra el margen
  que le queda al dueño después de pagar el POS.

## 6. El importador es el motor de onboarding

Del research: onboarding autogestionado = >100 horas de trabajo administrativo y <15% de
finalización. Con OCR de facturas, MarginEdge onboardea en 24-48 horas.

- Cualquier trabajo sobre importación se evalúa por **tiempo hasta el primer valor**, no
  por completitud del catálogo.
- **Regla de las 10 recetas:** cargar las 10 de mayor facturación o margen y mostrar costo
  y rentabilidad en menos de 30 minutos. No pedir la carta entera. (Bros tiene 380 recetas
  y 261 con costeo incompleto: el onboarding actual pide todo y entrega valor al final.)

## 7. Moratoria de módulos nuevos

**Decisión 012.** No se construyen módulos nuevos hasta 3 cuentas pagando. 30+ módulos
contra 1 cuenta viva es el riesgo más grande del proyecto.

- Si un pedido implica un módulo nuevo: **decirlo antes de escribir código.** No es un
  "no", es una decisión de negocio que hay que tomar explícitamente.
- Todo el esfuerzo de producto va a **profundidad en lo que Bros usa todos los días**.
- **No cuentan como módulo nuevo:** completar HACCP hasta los 5 registros obligatorios y
  la calculadora de octógonos — son razones de compra identificadas por el research. Pero
  entran recién cuando el perfil que las necesita sea el objetivo (decisión 005: hoy el
  objetivo es restaurante, no producción).

## 8. Marca: no poner nombre en nada de cobro

La decisión del nombre está **abierta** (Nutritics comercializa un *Kitchen-OS* en
`kitchen-os.com`). Hasta que se cierre: **no estampar marca ni nombre legal en
comprobantes, facturas, emails transaccionales de cobro ni contratos.** El primer
comprobante fiscal es el primer papel con nombre legal.

## 9. Cuándo esto deja de valer

Cuando cambia una decisión de negocio, **se escribe primero en `DECISIONES.md` de la
carpeta START UP KOS y después se toca el código.** Una decisión revertida se escribe con
la misma prolijidad que la original — es la regla que existe justamente porque el
`DECISIONES.md` del repo se pudrió por no hacerlo.
