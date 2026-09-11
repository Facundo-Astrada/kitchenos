# `fiscal_config` / `fiscal_tickets` — el pendiente estaba mal planteado

**Conclusión: NO hay que agregarles policies. La postura actual es la correcta.**

`PENDIENTES.md` decía:

> `fiscal_config`/`fiscal_tickets` tienen RLS activado pero **sin ninguna
> policy** — no es un agujero (falla cerrado), pero significa que esas tablas
> están inutilizables hasta que se les agreguen policies.

Las dos mitades de la segunda frase son falsas, y actuar sobre ellas habría
abierto un agujero de verdad.

## Qué guardan esas tablas

| Tabla | Columnas sensibles |
|---|---|
| `fiscal_config` | `cert_pem`, **`key_pem`** — el certificado y la **clave privada** de AFIP del contribuyente |
| `fiscal_tickets` | `token`, `sign` — las credenciales de sesión WSAA |

Una policy `SELECT ... USING (restaurante_id = mi_restaurante_id())` — el patrón
estándar de `rls.md` — le daría a **cualquier miembro logueado del restaurante**
(un bachero incluido) la clave privada con la que se factura, leíble desde el
browser con un GET a PostgREST. Con esa clave se emiten comprobantes fiscales a
nombre del contribuyente.

## Por qué no están "inutilizables"

Se usan, y perfectamente. Los tres accesos van por `createAdminClient()` (que
bypassea RLS) desde API routes que validan sesión a mano:

- `app/api/fiscal/config/route.ts`
- `app/api/fiscal/emitir/route.ts`
- `lib/fiscal/wsfe-directo.ts` (`getConfig()` y el cache del TA)

Ninguna línea del browser toca esas tablas. RLS sin policies es exactamente lo
que se quiere: `service_role` pasa, todo lo demás rebota.

**No confundir con `config_fiscal`** (nombre invertido, tabla distinta): esa sí
tiene 4 policies y sí es de lectura del cliente — guarda CUIT, condición y
puntos de venta, nada secreto. Es la que `types/index.ts` documenta.

## Lo único que sí vale la pena (y no corre urgencia)

Hoy `anon` y `authenticated` tienen GRANT completo sobre las dos tablas; lo
único que los frena es el RLS sin policies. Funciona, pero es una sola capa, y
depende de que nadie agregue una policy "para destrabar la tabla" — que es
justo lo que este pendiente invitaba a hacer.

`revocar_grants_fiscal.sql` deja la intención explícita en vez de implícita.
**No se corrió**: no hay nada expuesto hoy, así que no justificaba DDL de
seguridad no pedido. Es de un segundo y sin impacto funcional (verificado: esas
tablas solo se tocan con `service_role`).
