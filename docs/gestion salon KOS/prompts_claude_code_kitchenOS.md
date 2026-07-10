# Prompts para Claude Code — kitchenOS (cocina + salón + cobro/fiscal)

> Cómo usar este archivo: ejecutá los prompts **en orden**, uno por sesión/turno, revisando entre cada uno. No pegues todo junto. Cada prompt asume que el anterior se completó y se commiteó.
>
> **Requisito previo:** copiá `relevamiento_kitchenOS.md` dentro de tu repo (sugerido: `/docs/relevamiento_kitchenOS.md`). Es la especificación funcional; todos los prompts la referencian.

---

## Orden de ejecución

- **Fase 0 — Auditoría (read-only).** Claude Code lee el repo y reporta. No escribe código.
- **Fase 1 — Fundación.** Propone stack/arquitectura coherente con el repo y espera tu OK; luego scaffolding, `CLAUDE.md`, esquema de datos, decisiones base.
- **Fase 2 — Walking skeleton (P0).** Un flujo vertical completo end-to-end: comanda → KDS → bump. Valida la arquitectura.
- **Fase 3+ — Features.** Una por sesión, siguiendo prioridad P0→P1→P2 de la matriz. Usá la plantilla del final.

---

## PROMPT 0 — Auditoría del repo (read-only)

```
Vas a trabajar sobre un repositorio existente para construir kitchenOS, una
extensión de gestión gastronómica que cubre COCINA y SALÓN.

Antes de escribir una sola línea de código, hacé una auditoría completa del
repo y entregame un informe. NO modifiques nada en esta sesión.

Leé también /docs/relevamiento_kitchenOS.md: es la especificación funcional
del producto (matriz de funcionalidades, modelo de datos, carencias).

Reportá:
1. Stack actual: lenguajes, frameworks, gestor de paquetes, base de datos,
   build, testing. Versiones.
2. Estructura del proyecto: carpetas principales, dónde vive qué.
3. Qué ya está construido y funciona vs. qué está a medio hacer o roto.
4. Convenciones de código existentes (estilo, naming, patrones, capas).
5. Estado de tests, CI, y deploy si existe.
6. Modelo de datos actual (entidades/tablas existentes) y qué tan lejos está
   del modelo de datos de la sección 8 del relevamiento.
7. Riesgos y deuda técnica que afecten construir cocina+salón encima.
8. Tu recomendación: ¿extendemos este stack tal cual, lo ajustamos, o hay
   algo que conviene reemplazar antes de empezar? Justificá.

Terminá con preguntas abiertas que necesites que yo responda antes de la
fase de fundación. No asumas; preguntá.
```

---

## PROMPT 1 — Fundación y arquitectura

> Ejecutar después de revisar el informe de la Fase 0 y responder sus preguntas.

```
Vamos a sentar la fundación de kitchenOS sobre este repo. Trabajá en pasos
pequeños y commiteables. Consultá /docs/relevamiento_kitchenOS.md como
especificación.

ALCANCE DEL PRODUCTO
kitchenOS reemplaza por completo a las suites tipo Fudo/Maxirest/Bistrosoft.
Cubre tres dominios que deben compartir un modelo de datos único:
- COCINA (núcleo, bien especificado en el relevamiento): KDS, ruteo por
  estación, estados de comanda, bump, recetas/escandallos, prep list, par,
  stock por consumo, mermas, 86, métricas de cocina.
- SALÓN: mapa de mesas y estados, toma de pedido/comanda desde salón, envío
  de la comanda a la cocina (al KDS), división de cuentas, propinas.
  [El relevamiento es cocina-profundo y salón-delgado: para salón seguí los
  patrones estándar de las suites (Fudo/Maxirest/Bistrosoft) descritos en el
  doc; si te falta detalle de una decisión de salón, preguntá antes de asumir.]
- COBRO Y FACTURACIÓN FISCAL (Argentina): medios de pago (efectivo,
  tarjeta, transferencia, QR, mixto), cierre de cuenta, y FACTURACIÓN
  ELECTRÓNICA contra ARCA (ex-AFIP) con IVA.

MÓDULO FISCAL ARCA — tratarlo como un workstream propio, aislado y regulado
(NO como una feature más). Base técnica correcta (verificá siempre contra la
doc oficial en arca.gob.ar antes de implementar; empezá en HOMOLOGACIÓN, no
en producción):
- Autenticación vía WSAA con certificado digital (.crt) + clave privada
  (.key): devuelve token+sign válidos ~12hs (cachealos, no re-autentiques por
  cada comprobante).
- Emisión vía WSFEv1: consultar último comprobante autorizado del punto de
  venta, enviar el comprobante, recibir el CAE (con fecha de vencimiento).
- Determinación automática del tipo de comprobante (A/B/C, notas de
  crédito/débito) según condición fiscal del emisor y del receptor.
- Numeración correlativa sin saltos por punto de venta; QR obligatorio en el
  PDF; una factura con CAE no se modifica (se compensa con nota de crédito).
- SEGURIDAD: el certificado y la clave privada son credenciales sensibles.
  Guardalos cifrados / en un secret store, nunca en el repo ni en el cliente.
- DECIDIDO: WSFE DIRECTO (sin servicio de terceros). Razón: kitchenOS es un
  producto para múltiples restaurantes; integrar directo evita un costo por
  comprobante que se multiplicaría por todos los clientes (cada uno emite
  ~100–1.000/mes) y da control total. Contrapartida asumida: kitchenOS es
  responsable de mantener la integración al día con la normativa de ARCA.
  Mantené igual el patrón adapter por si a futuro se suma un fallback de
  terceros, pero implementá WSFE directo como camino principal.
- MULTI-CONDICIÓN (clave, es un producto multi-restaurante): la condición
  fiscal NO se hardcodea. Cada restaurante (tenant) configura su CUIT,
  condición (Monotributo o RI), certificado digital y punto(s) de venta.
  El sistema elige el tipo de comprobante (A/B/C, etc.) automáticamente según
  la condición del emisor (el restaurante) y la del receptor (el cliente).
  WSFEv1 soporta A/B/C/M/E, así que el mismo desarrollo cubre monotributistas
  y responsables inscriptos. La config fiscal es por-tenant y aislada.
- SEGUIMIENTO: implementá el tracking de datos fiscales descrito en
  /docs/instructivo_seguimiento_fiscal.md (estados de comprobante,
  correlatividad, vencimiento de CAE y de certificado, cola de pendientes,
  panel de rechazos, asistencia al Libro IVA Digital para RI).
- Resiliencia: si ARCA no responde, el cobro NO se bloquea; la factura queda
  "pendiente de emisión" y se reintenta. La operación de salón/cocina nunca
  depende de que ARCA esté arriba.

FUERA DE ALCANCE por ahora: contaduría/libros contables completos y reportes
impositivos avanzados (más allá de lo que exige emitir comprobantes válidos).

TU TAREA EN ESTA FASE
1. Proponé la arquitectura y el stack definitivo, coherente con lo que ya
   existe en el repo (de la Fase 0). Cubrí explícitamente:
   - Modelo cliente/servidor y dónde corre el KDS (la cocina necesita correr
     en tablets, OFFLINE-FIRST: debe seguir funcionando si se cae el wifi y
     sincronizar al volver). Justificá cómo lo resolvés (local-first, cola de
     sync, etc.).
   - Tiempo real (comanda de salón debe aparecer en el KDS al instante).
   - Base de datos y esquema.
   PRESENTAME ESTA PROPUESTA Y ESPERÁ MI OK ANTES DE SCAFFOLDING.
2. Tras mi OK:
   - Generá/actualizá CLAUDE.md en la raíz con: alcance, convenciones de
     código, arquitectura, comandos (build/test/run), y la regla de UI de
     cocina (ver abajo). Este archivo guía todas las sesiones futuras.
   - Implementá el esquema de base de datos a partir de la sección 8 del
     relevamiento (Comanda, ÍtemComanda, Modificador, Producto, Receta,
     SubReceta, IngredienteReceta, Insumo/Stock, Estación, PrepTask, Merma,
     EventoCocina) + entidades de salón (Mesa, Cuenta, Mozo) + entidades de
     cobro/fiscal (Pago, MedioDePago, Comprobante/Factura [con CAE, tipo,
     punto de venta, vencimiento CAE, QR], CondiciónIVA del cliente,
     AlícuotaIVA por ítem). Migraciones.
   - Dejá el módulo fiscal ARCA detrás de una interfaz/puerto (patrón
     adapter) para poder cambiar entre "WSFE directo" y "servicio de terceros"
     sin tocar el resto. En esta fase solo el contrato/interfaz + stub, sin
     implementar la integración real todavía.
   - Dejá un stub del listener ESC/POS / ingest de comandas (para migración
     desde POS legacy), sin implementarlo a fondo.
3. NO construyas features todavía. Solo fundación.

REGLA DE UI DE COCINA (va al CLAUDE.md, es un diferenciador central):
La interfaz de cocina es para una brigada con las manos sucias y apurada.
Botones masivos, áreas de swipe amplias, alto contraste, confirmaciones
visuales claras. CERO menús desplegables durante el despacho. Pensada para
tablet, no para escritorio de oficina.

FORMA DE TRABAJO
- Pasos chicos, commits atómicos con mensajes claros.
- No rompas lo que ya funciona en el repo.
- Si una decisión es ambigua o irreversible, preguntá antes de avanzar.
- Al terminar, resumí qué quedó hecho y proponé el primer slice (Fase 2).
```

---

## PROMPT 2 — Walking skeleton (slice P0 end-to-end)

```
Construí el primer flujo vertical completo de kitchenOS, end-to-end, lo más
delgado posible pero funcionando de punta a punta. Objetivo: validar la
arquitectura, no cubrir features.

EL SLICE (todo P0 de la matriz, sección 4 del relevamiento):
1. Un mozo crea una comanda en salón (mesa + ítems + modificadores/notas).
2. La comanda se envía y aparece EN TIEMPO REAL en el KDS de cocina.
3. La comanda se rutea a la estación correcta según el producto.
4. El KDS muestra estado (pendiente/en preparación/listo) y un cronómetro de
   ticket time con color por umbral (verde/amarillo/rojo).
5. El cocinero hace bump de ítems y de la comanda completa.
6. El cambio de estado se refleja de vuelta en salón.

CRITERIOS DE ACEPTACIÓN
- Funciona en tablet con la regla de UI de cocina del CLAUDE.md.
- Sigue andando si se corta el wifi y sincroniza al reconectar (offline-first).
- Tests de la lógica de estados de comanda.

Respetá el modelo de datos y las convenciones del CLAUDE.md. Pasos chicos,
commits atómicos. Al terminar, demo de cómo probarlo y resumen.
```

---

## PLANTILLA — Prompt por feature (Fase 3+)

> Copiá este bloque y completá los `[corchetes]`. Una feature por sesión. Seguí el orden de prioridad de la matriz: primero el resto de P0/P1, después P2.

```
Implementá la feature: [NOMBRE — ej. "All-day view" / "Prep list con par" /
"Botón 86 con webhook" / "Mapa de salón con estados de mesa"].

Prioridad: [P0 / P1 / P2]. Referencia: sección [4 y/o 5] del relevamiento
(/docs/relevamiento_kitchenOS.md).

QUÉ DEBE HACER (slice vertical completo):
- [comportamiento 1]
- [comportamiento 2]
- [cómo se ve / dónde vive en la UI]

CRITERIOS DE ACEPTACIÓN:
- [criterio medible 1]
- [criterio medible 2]
- Respeta la regla de UI de cocina y el modelo de datos del CLAUDE.md.
- Tests donde haya lógica no trivial.

RESTRICCIONES:
- No rompas features ya construidas.
- Si toca el esquema de datos, migración + actualizá el modelo en CLAUDE.md.
- Si una decisión es ambigua, preguntá antes de implementar.

Pasos chicos, commits atómicos. Al terminar: cómo probarlo + resumen.
```

### Orden sugerido de features tras el walking skeleton
1. **Resto de P0** que no entró en el skeleton (alertas sonoras, ítems+modificadores completos, división de cuentas en salón).
2. **P1 cocina:** recall, all-day, hold/fire, prep list + par, mermas a un toque, costo de plato, offline robusto, impresión de cancelaciones.
3. **P1 salón:** mapa de mesas completo, propinas, estados de mesa.
4. **P2 diferenciadores:** teórico-vs-real, sincronización de marcha, 86 bidireccional con webhook, prep-list viva, métricas de cocina, ficha dinámica por yield, multi-marca/dark kitchen.

### Workstream de cobro + fiscal ARCA (en paralelo, no es P-de-cocina)
Secuencialo aparte de las features de cocina/salón, en este orden:
1. **Cobro** primero (medios de pago, cierre de cuenta, división) — no
   depende de ARCA y desbloquea la operación de salón.
2. **Fiscal en homologación:** WSAA + WSFEv1 (o servicio de terceros) contra
   el ambiente de pruebas de ARCA. Emitir A/B/C de prueba, obtener CAE, generar
   PDF con QR. Una sesión dedicada solo a esto.
3. **Fiscal en producción:** recién cuando homologación esté sólido. Sumar
   notas de crédito/débito, manejo de correlatividad y reintentos.
Tratá cada paso como su propia sesión con la plantilla de feature. Por el peso
regulatorio, pedile a Claude Code que te proponga el plan del módulo fiscal y
lo apruebes antes de codear.

---

## Notas de ejecución

- **Un `CLAUDE.md` bien hecho es el 80% del éxito.** Es la memoria persistente entre sesiones; si está bien, cada feature sale consistente. Revisalo y corregilo vos cuando algo no te cierre.
- **Revisá entre prompts.** Claude Code rinde mejor con un humano que valida cada slice antes del siguiente, no con un batch de 20 tareas.
- **Cuando algo se ponga grande o repetitivo**, pedile a Claude Code que primero te proponga un plan y lo apruebes, antes de codear.
- **El relevamiento es la fuente de verdad funcional.** Si vos y Claude Code discrepan sobre qué construir, gana el doc (o lo actualizás).
