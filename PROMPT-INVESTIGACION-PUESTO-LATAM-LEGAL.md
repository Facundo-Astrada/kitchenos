# Prompt 2 — investigación: encuadre regional y legal de la descripción de puesto

**Para:** Gemini Deep Research.
**Segundo pase.** El primero (`Análisis Puestos Gastronómicos LatAm.md`, 17/09) resolvió bien
la metodología de la pregunta y dejó sin cubrir dos cosas concretas. Este prompt va **solo** por
esas dos, más una tercera que apareció al revisarlo.
**Destino:** `PLAN-DESCRIPCION-PUESTO-2026-09.md` §§ 4.1, 5, 10.1.

---

## El prompt (copiar desde acá)

Sos un investigador documental. Necesito tres cosas puntuales y verificables. **No necesito un
marco teórico ni un informe extenso: necesito documentos reales, artículos de normas con su
número, y la confesión explícita de lo que no encontraste.**

### Antes que nada: cómo quiero que respondas

Ya tengo resuelta la parte metodológica (técnica de incidentes críticos, entrevista etnográfica
de Spradley, *satisficing* de Krosnick, carga cognitiva en interfaces de voz). **No la repitas,
no la re-derives y no la cites.** Si tu respuesta contiene una explicación de qué es la Critical
Incident Technique, te fuiste del pedido.

**Toda afirmación en una tabla lleva una columna `Respaldo` con uno de estos cuatro valores, y
solo estos:**

- `norma` — citás el artículo, la ley, el decreto o el convenio, con su número.
- `fuente` — citás un documento concreto y localizable (manual, guía, resolución, paper, tesis).
- `práctica` — es práctica profesional conocida del sector, sin evidencia publicada que la sostenga.
- `inferencia` — es razonamiento tuyo. Sin fuente. Está permitido, pero tiene que estar marcado.

**No uso Wikipedia, Scribd, Studocu, Course Hero, ni blogs de producto o de agencia como
respaldo.** Si lo único que encontrás para una afirmación es una de esas, marcala `inferencia`.

**Un resultado vacío es un resultado válido y útil.** Si buscás material argentino de
consultoría gastronómica y no existe accesible, escribí "no encontré" y contame qué buscaste.
Prefiero un bloque honesto de tres líneas que dos páginas de relleno. El pase anterior me
devolvió como fuente argentina el diseño curricular de una tecnicatura en gastronomía
presentado como si fuera un cuestionario de consultoría: eso es exactamente lo que no quiero.

---

### Bloque 1 · El diagnóstico real del consultor gastronómico en LatAm

Estoy construyendo, dentro de un software de gestión para restaurantes, una función que arma la
descripción de puesto de cada rol preguntándole al dueño. Quiero saber **qué le pregunta de
verdad un consultor gastronómico al dueño**, en la región, cuando releva cómo está organizado
su equipo.

Buscá **documentos concretos**, no descripciones de qué hace un consultor:

- Guías, manuales operativos y checklists de auditoría de consultoras de hospitalidad de
  **Argentina, México, Chile, Colombia, Perú, Uruguay y España**.
- Material de cámaras y asociaciones del sector: **FEHGRA** y **AHRCC** (Argentina), **CANIRAC**
  (México), **ACHIGA** (Chile), **ACODRES** (Colombia), **AHORA** (Perú), **Hostelería de
  España**. Interesan sus manuales de buenas prácticas y sus programas de formación gerencial.
- **Manuales de franquicia** gastronómica de la región que sean públicos: suelen tener el
  relevamiento de puestos hecho, y con el vocabulario real.
- Programas de **tecnicaturas y diplomaturas en gestión gastronómica** — pero solo si traen el
  instrumento de relevamiento, no si traen el programa de la materia.

Para cada documento que encuentres, quiero: qué es, de quién es, si es público o filtrado, y
**las preguntas o los ítems textuales que contiene** sobre organización del equipo, reparto de
funciones y responsabilidades por puesto.

Y decime, al final del bloque: **¿existe este material de forma accesible o no existe?** Si la
respuesta es que no existe, decilo, y es un hallazgo en sí mismo.

### Bloque 2 · El encuadre laboral argentino

El software va a guardar, por puesto, un documento con tareas, expectativas y límites, y le va a
pedir al empleado que deje constancia de que lo leyó, con fecha y versión.

**No busco asesoramiento legal ni una conclusión.** Busco el material ordenado para llevarle a
un abogado laboral y que esa consulta dure media hora y no dos. Contestá con artículos y fallos,
no con recomendaciones.

1. **¿Qué dice la LCT (ley 20.744) sobre la descripción de tareas del trabajador?** Me interesa
   particularmente el **art. 66 (ius variandi)**: si el empleador deja por escrito y firmado el
   detalle de tareas de un puesto, ¿eso limita después su facultad de modificarlas o reasignar a
   la persona? ¿Hay jurisprudencia sobre esto?
2. **El convenio colectivo gastronómico (UTHGRA, CCT 389/04 y sus actualizaciones).** Define
   categorías laborales con tareas asociadas. ¿Una descripción de puesto de la casa puede asignar
   tareas que caen en otra categoría? ¿Qué pasa si lo hace? Quiero las categorías del convenio
   con las tareas que cada una comprende, textual.
3. **El reglamento interno / código de conducta** (arts. 68 y 70 LCT). ¿Qué requisitos tiene para
   ser oponible al trabajador? ¿Hace falta homologación, notificación fehaciente, exhibición en
   lugar visible? ¿Un acuse de lectura dentro de una app tiene el mismo valor que una firma en
   papel? ¿Qué dice la normativa argentina sobre **firma electrónica y digital** (ley 25.506) en
   documentos laborales?
4. **Injuria y despido con causa (art. 242 LCT).** Tener el estándar escrito y notificado, ¿ayuda
   al empleador a acreditar la injuria, o se vuelve en contra porque fija una vara que después se
   le exige a él? Buscá jurisprudencia en los dos sentidos.
5. **El riesgo inverso.** Un documento que dice "el parrillero es responsable del control de
   temperaturas", ¿puede ser usado para imputarle responsabilidad al trabajador en una
   inspección bromatológica o en un accidente? ¿Y para imputársela al empleador por no haber
   capacitado?

Cerrá el bloque con: **las 5 preguntas exactas que le conviene hacerle al abogado**, ya
formuladas, para que la consulta sea corta.

### Bloque 3 · Qué límites vienen de la norma y cuáles de la casa

La función le pide al dueño que defina los "no negociables" de cada puesto. Pero algunos no los
define él: se los impone la regulación, y son iguales en todos los restaurantes del país.
Distinguirlos importa, porque los regulatorios el software los puede traer ya cargados y los
culturales hay que preguntarlos.

Quiero la separación hecha, para **Argentina**, y por rol (cocina, salón, bacha, recepción de
mercadería):

- **Lo que viene de norma:** Código Alimentario Argentino, BPM, carnet de manipulador de
  alimentos, cadena de frío, rotulado, higiene personal, uso de EPP. Con el artículo o la
  resolución que lo exige, y el nivel de gobierno (nacional, provincial, municipal) — sé que
  bromatología es competencia local y que eso complica la respuesta; decilo si es así.
- **Lo que viene de la casa:** todo lo demás — puntualidad, uso del celular, trato entre
  compañeros, manejo de la merma, vestimenta más allá de lo higiénico.
- **Lo ambiguo:** lo que parece cultural pero tiene sustento normativo, o al revés.

---

### Formato de la respuesta

Markdown, español rioplatense, listo para pegar en un repositorio. Cuatro secciones:

1. **Bloque 1 — Material de consultoría LatAm.** Tabla: documento · origen · acceso · preguntas
   o ítems textuales que aporta · `Respaldo`. Más el veredicto de si el material existe.
2. **Bloque 2 — Encuadre laboral argentino.** Un apartado por cada una de las 5 preguntas, con
   artículos y fallos citados con su carátula. Cerrando con las 5 preguntas para el abogado.
3. **Bloque 3 — Norma vs. casa.** Tabla: límite · rol · de dónde viene · norma que lo exige ·
   nivel de gobierno · `Respaldo`.
4. **Lo que no encontré.** Qué buscaste, con qué términos, y qué no apareció. **Esta sección es
   obligatoria y no puede decir "nada".**

### Restricciones

- **Extensión máxima: 2.500 palabras** sin contar las fuentes. Si te sobra material, priorizá el
  bloque 2.
- **Cero marco teórico.** Nada de explicar metodologías, nada de introducción sobre la
  importancia de la gestión de recursos humanos en la hospitalidad.
- Todo lo que sea derecho argentino va con **número de artículo**. Una afirmación legal sin
  artículo no me sirve.
- Si algo que afirmo en este prompt está mal —por ejemplo, si el CCT gastronómico vigente no es
  el 389/04— corregime y seguí con el correcto.
