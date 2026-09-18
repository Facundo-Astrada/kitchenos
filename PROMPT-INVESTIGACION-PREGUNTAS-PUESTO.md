# Prompt — investigación: qué preguntarle a un dueño de restaurante

**Para:** Gemini Deep Research (o equivalente).
**Destino de la respuesta:** `.md` que vuelve al repo y alimenta `PLAN-DESCRIPCION-PUESTO-2026-09.md` § 4.
**Fecha:** 17/09/2026

---

## El prompt (copiar desde acá)

Sos un investigador que cruza tres campos: **análisis de puestos (job analysis) de psicología
organizacional**, **metodología de entrevista cualitativa**, y **consultoría de gestión
gastronómica en Latinoamérica**. No sos un redactor de contenido de RRHH.

### Contexto

Estoy diseñando una función dentro de un software de gestión para restaurantes. La función le
permite al dueño o al chef armar la **descripción de puesto** de cada rol de su equipo
(parrillero, mozo, encargado de compras, bachero) **respondiendo preguntas**, en vez de
llenar un formulario vacío o bajar una plantilla genérica.

Las condiciones reales del usuario, y son duras:

- Es dueño o chef de un restaurante chico o mediano (4 a 25 personas). **No tiene área de RRHH.**
- Contesta desde el **celular**, entre el almuerzo y la cena, con 10 minutos como máximo por sesión.
- Puede **dictar por voz** en vez de escribir, y probablemente lo haga.
- Es **argentino / latinoamericano**, de un sector con baja formalización documental, donde "papeleo
  de recursos humanos" suele leerse como burocracia inútil o como preparar un despido.
- Nunca escribió una descripción de puesto. Sí sabe perfectamente, en su cabeza, qué hace cada
  persona de su equipo — el problema es que nunca lo dijo en voz alta ni lo escribió.

**Cada respuesta tiene que caber en un campo de una base de datos**, no ser un ensayo. Una
pregunta que produce tres párrafos hermosos y ningún dato utilizable es una pregunta fallada.

### Lo que necesito que investigues

**1 · Métodos formales de análisis de puesto: cuáles preguntan bien.**
Revisá las técnicas establecidas — *critical incident technique* (Flanagan), DACUM, O*NET / PAQ,
*task inventory*, entrevista conductual estructurada, *work sampling*. Para cada una: **la
formulación literal de las preguntas que usa**, y un veredicto sobre si esa formulación funciona
con alguien que no es analista de RRHH y contesta hablando. Me interesa especialmente cuáles
producen tareas *observables* en vez de abstracciones.

**2 · Qué hace que una pregunta produzca una respuesta concreta y no un lugar común.**
Esta es la parte central. Buscá la evidencia sobre la **forma** de la pregunta:
- Preguntas sobre un episodio específico y reciente ("contame la última vez que…") contra
  preguntas de opinión o generalización ("¿qué es importante en…?").
- Preguntas en negativo o por ausencia ("¿qué se rompería si…?", "¿qué no querés que pase?")
  contra preguntas en positivo. Mi hipótesis de trabajo, a validar o refutar: **las preguntas en
  negativo producen respuestas mucho más específicas** porque se responden desde cosas que
  realmente pasaron.
- Fuentes relevantes: *The Mom Test* (Rob Fitzpatrick), entrevistas *Jobs-to-be-Done* / *switch
  interview*, entrevista etnográfica (Spradley), *appreciative inquiry*, entrevista motivacional,
  y la literatura sobre efectos de redacción de pregunta en encuestas (Schuman & Presser, Krosnick).
- Decime también **qué preguntas hacen que alguien se cierre o conteste en automático**, y por qué.

**3 · Preguntas que hacen que el dueño se dé cuenta de algo.**
Además de producir datos, quiero que algunas preguntas dejen al dueño pensando sobre cómo gestiona.
Buscá en **coaching ejecutivo y de negocios** (modelo GROW, "preguntas poderosas" de la
International Coaching Federation), **reflective practice** (Schön), y **diagnóstico organizacional**.
Qué preguntas hacen aparecer un problema que la persona no había nombrado — por ejemplo, que un
puesto no tiene dueño, que dos personas hacen lo mismo, que nadie sabe cubrir una estación, o que
lo que exige no lo tiene escrito en ningún lado. Quiero la formulación literal, no la categoría.

**4 · Los cuestionarios de diagnóstico que usan los consultores gastronómicos de verdad.**
Qué le pregunta un consultor de restaurantes al dueño en la primera reunión. Buscá material real:
guías de consultoras de hospitalidad, manuales de franquicia, checklists de auditoría operativa,
programas de formación gerencial gastronómica, cámaras y asociaciones del sector.
**Priorizá material en español de Argentina, México, España, Chile y Colombia** — el vocabulario
importa tanto como el contenido.

**5 · El lenguaje: qué palabras usar y cuáles evitar.**
En este sector, ¿qué términos hacen que el dueño se enganche y cuáles lo expulsan? Concretamente
quiero saber si conviene decir "descripción de puesto", "manual de puesto", "ficha del puesto",
"qué hace cada uno" u otra cosa; y cómo nombrar las expectativas y los límites sin que suene a
reglamento disciplinario. Si hay investigación sobre adopción de tecnología o de prácticas
formales de gestión en gastronomía, traela.

### Formato de la respuesta

Todo en **Markdown**, en **español rioplatense**, listo para pegar en un repositorio.

**A · Banco de preguntas.** El entregable principal. Una tabla con estas columnas:

| Pregunta (texto literal, como se le muestra al usuario) | Qué dato produce | La versión mala equivalente | Por qué la mala falla | Método / fuente |

Apuntá a **30-50 preguntas**, agrupadas por lo que producen: misión del puesto · tareas y
responsabilidades · el día de punta a punta · expectativas · límites y no negociables · cómo se
mide · cultura de la casa · requisitos para entrar · qué ofrece el lugar.

**B · El orden.** En qué secuencia conviene hacerlas y por qué — qué pregunta va primero para
que la persona no se cierre, cuál no puede ir al principio, dónde conviene cortar.

**C · Las 8 imprescindibles.** Si solo hay 10 minutos y una sola sesión, cuáles son las ocho
preguntas que hay que hacer sí o sí. Justificá cada una.

**D · Repreguntas.** Para las 8 imprescindibles: cómo se ve una respuesta fallada (genérica,
evasiva, de una palabra) y **la repregunta exacta** que la rescata.

**E · Qué no preguntar.** Preguntas que parecen buenas y no lo son, con el motivo.

**F · Fuentes.** Numeradas, con link, y una línea diciendo qué aportó cada una. Distinguí lo que
tiene respaldo empírico de lo que es práctica profesional sin evidencia publicada.

### Restricciones

- **No me devuelvas plantillas de descripción de puesto ya hechas.** Ya tengo ejemplos reales de
  un restaurante. Lo que necesito son **las preguntas que llevan a llenarlas**.
- **Nada de listículos de blog de RRHH** ni contenido de granja de SEO. Si una fuente no dice de
  dónde saca lo que afirma, decilo.
- Cada pregunta propuesta tiene que poder **contestarse hablando en menos de 90 segundos**.
- Marcá explícitamente cuando algo sea **tu recomendación** y no un hallazgo de una fuente.
- Si encontrás evidencia que **contradice** mi hipótesis del punto 2 (que las preguntas en
  negativo funcionan mejor), decímelo — me sirve más que una confirmación.
