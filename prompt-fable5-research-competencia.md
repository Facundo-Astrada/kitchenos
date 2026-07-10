# Prompt para Claude Fable 5 — Investigación de competencia gastronómica para K-OS

Copiá y pegá esto en una sesión con Fable 5 que tenga acceso a Claude in Chrome (las 9 pestañas ya deberían estar abiertas, o pasale los links).

---

## Contexto

Sos mi socio de producto en el desarrollo de **K-OS**, un sistema de gestión gastronómica (Next.js 16 + Supabase + Tailwind, IA con Claude Sonnet/Haiku). K-OS ya cubre: stock, comandas, recetas con escandallos, facturación electrónica ARCA (Argentina), mesas, ventas, importador de facturas, y un asistente de IA ("Kitchen Coach") integrado en pantallas.

Quiero escalar K-OS lo más alto posible dentro del mercado de plataformas de gestión gastronómica, así que necesito una inspección profunda de la competencia para robar (con criterio) sus mejores ideas, detectar huecos, y priorizar qué construir después.

## Objetivo

Inspeccionar cada uno de los siguientes 9 sitios (páginas oficiales de productos, no notas de prensa), navegando lo más posible dentro de cada uno (home, funcionalidades, precios, demo/registro, blog de producto si lo tienen) y registrar todo lo que sirva como referencia o inspiración para K-OS.

## Sitios a inspeccionar

1. Fudo — https://fu.do/es-ar/
2. CajaOS — https://www.cajaos.com/
3. bcnsoft — https://bcnsoft.com.ar/software-restaurante-sistemas-restaurant-programa-gastronomia/
4. Artics (iRestora) — https://www.artics.com.ar/sistema-de-gestion-para-restaurantes-y-bares-artics/
5. Frambuesa — https://www.frambuesa.app/
6. Ganapán — https://www.ganapan.com.ar/
7. Iristrace — https://iristrace.com/en/sectors/restaurants/
8. Cuiner — https://cuiner.com/software-grupos-restauracion/
9. Yurest — https://www.yurest.com/

## Qué registrar por cada sitio

Para cada plataforma, completá una ficha con:

- **Propuesta de valor**: qué prometen, a quién le venden (independiente, cadena, dark kitchen, etc.)
- **Módulos y funcionalidades core**: stock, comandas, mesas, ventas, reservas, delivery, facturación, RRHH/fichaje, etc.
- **Plantillas y registros**: checklists, formularios, recetarios/escandallos, planillas de apertura/cierre, cualquier plantilla descargable o precargada que muestren
- **Dashboards y análisis de datos**: qué métricas muestran, cómo visualizan datos (gráficos, reportes, KPIs), qué decisiones ayudan a tomar
- **Integraciones y vinculaciones**: apps de delivery (PedidosYa, Rappi, Uber Eats), pasarelas de pago, facturación fiscal, contabilidad, marketing, etc.
- **Onboarding y registro**: cómo es el flujo de alta/demo/trial, qué piden, cuánta fricción hay
- **Planes y precios**: estructura de precios, qué está en cada plan
- **UI/UX**: patrones de interfaz que destaquen (positivos o negativos), qué tan simple o compleja se ve la operación diaria
- **Diferenciador único**: qué tiene ESTA plataforma que no vimos en las demás

No hace falta crear cuenta ni pagar nada — si algo requiere login para verse, registralo como "no accesible sin cuenta" y seguí.

## Qué producir al final

1. **Ficha individual por plataforma** (las 9), con los puntos de arriba.
2. **Tabla comparativa** cruzando las 9 plataformas contra los módulos de K-OS (columnas: módulo/feature, Fudo, CajaOS, bcnsoft, Artics, Frambuesa, Ganapán, Iristrace, Cuiner, Yurest, K-OS) para ver de un vistazo qué tiene cada uno y qué le falta a K-OS.
3. **Lista de gaps**: funcionalidades que la competencia tiene y K-OS no.
4. **Backlog de mejoras priorizado** para K-OS, separado en:
   - *Quick wins* (bajo esfuerzo, alto impacto visible)
   - *Mid-term* (requiere desarrollo pero es claramente rentable)
   - *Apuestas estratégicas* (features que podrían diferenciar a K-OS del resto, no solo igualar)
   
   Para cada ítem: qué es, de qué plataforma lo tomamos como referencia, por qué le agrega valor a K-OS, y una estimación gruesa de esfuerzo (S/M/L).

## Formato de entrega

Documento en markdown, en español, sin relleno innecesario. Priorizá datos concretos por sobre descripciones genéricas de marketing.
