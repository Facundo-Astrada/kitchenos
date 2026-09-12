// Marcador de error dentro del stream de texto del Coach.
// El endpoint /api/coach responde con un stream de texto plano (deltas del modelo).
// Los errores que ocurren DESPUÉS de abrir el stream (ej. rate limit de Anthropic en
// una ronda de tools) no pueden cambiar el status HTTP, así que se emiten inline con
// este prefijo. El cliente lo detecta y lo trata como error en vez de texto visible.
// El token es intencionalmente improbable en una respuesta natural del modelo.
export const COACH_ERROR_MARK = '␞__COACH_STREAM_ERROR__␞'

// Mismo mecanismo que COACH_ERROR_MARK: metadata fuera de banda al final del stream de
// texto plano. El server la agrega DESPUÉS del texto/JSON normal del turno (en el `finally`
// del loop agéntico, para que salga incluso si el modelo no llegó a cerrar con texto), y el
// cliente extrae y parsea el JSON de la tarjeta de acción pendiente (propose -> confirm).
export const COACH_PENDING_MARK = '␞__COACH_PENDING_ACTION__␞'

// Tercer marcador con el mismo mecanismo: accesos directos a la pantalla de la
// entidad que resolvió una herramienta (la ficha de una receta, un producto del
// stock). El texto del chat se renderiza plano — no hay markdown ni links — así
// que la navegación no puede viajar adentro de la respuesta del modelo; además
// hacerlo dependería de que copie bien un UUID. Los arma el SERVER con el id que
// ya resolvió la tool, y el cliente los pinta como botones.
export const COACH_LINKS_MARK = '␞__COACH_LINKS__␞'
