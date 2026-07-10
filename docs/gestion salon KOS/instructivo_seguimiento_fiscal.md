# Instructivo — Seguimiento de datos fiscales (kitchenOS, WSFE directo)

> Para qué sirve: qué datos fiscales hay que **guardar y vigilar** cuando kitchenOS emite facturas conectándose directo a ARCA (Opción A / WSFEv1), siendo un producto que sirve a **varios restaurantes** (cada uno es un emisor con su propia config fiscal).
>
> Sirve para dos cosas: (1) decirle a Claude Code qué construir en el módulo fiscal, y (2) saber vos qué monitorear día a día.
>
> ⚠️ No es asesoramiento contable. Los detalles fiscales cambian y dependen de cada contribuyente; confirmá con un contador lo que aplique a cada cliente.

---

## 0. Modelo mental: cada restaurante es un "emisor"

kitchenOS no tiene una condición fiscal: la tiene cada restaurante que lo usa. Por eso la config fiscal es **por cliente (tenant)** y aislada:

- CUIT del restaurante.
- Condición: Monotributo o Responsable Inscripto.
- Certificado digital (`.crt`) + clave privada (`.key`) propios.
- Uno o más puntos de venta electrónicos habilitados en ARCA.

Todo lo de abajo se trackea **por cada restaurante por separado**.

---

## 1. Qué guardar por cada comprobante emitido

Cada vez que se emite una factura/nota, persistir como mínimo:

- Tipo de comprobante (A / B / C / Nota de Crédito / Nota de Débito).
- Punto de venta + número correlativo.
- **CAE** y **fecha de vencimiento del CAE**.
- Estado (ver punto 2).
- Datos del receptor: CUIT/DNI, condición fiscal, y tipo elegido en consecuencia.
- Detalle de importes e **IVA discriminado por alícuota** (relevante para RI).
- La **respuesta cruda de ARCA** (para auditoría y para resolver rechazos).
- Timestamp de emisión y el ID interno de la venta/cuenta que la originó.

Regla de oro: una factura con CAE **no se modifica ni se borra**. Si hay un error, se compensa con una **Nota de Crédito** que la referencia.

---

## 2. Estados de comprobante a seguir

Modelá el comprobante como una máquina de estados y mostrá cada estado en un panel:

- **Pendiente** — se intentó emitir pero ARCA no respondió (estaba caído o timeout). El cobro NO se bloquea; queda en cola para reintentar.
- **Emitido** — ARCA devolvió CAE. Comprobante válido.
- **Rechazado** — ARCA respondió con error (ver punto 5). Requiere acción.
- **Anulado por NC** — se compensó con una nota de crédito.

Alerta operativa: si un comprobante queda **Pendiente** más de X horas, avisá.

---

## 3. Correlatividad (lo que más rechaza ARCA)

Los comprobantes deben ser **correlativos, sin saltos ni duplicados**, por punto de venta y tipo.

- Antes de emitir, consultar a ARCA el último número autorizado
  (método `FECompUltimoAutorizado`) y emitir el siguiente.
- Guardar la secuencia localmente y reconciliar contra ARCA periódicamente.
- Vigilar y alertar ante cualquier salto o número duplicado.

---

## 4. Vencimientos a vigilar (dos relojes distintos)

1. **Vencimiento del CAE** (~10 días hábiles): el CAE se obtiene al emitir y
   tiene plazo. No emitir comprobantes con fecha fuera de rango. Vigilar que
   cada comprobante se emita dentro de su ventana.
2. **Vencimiento del certificado digital** (~1 año, por restaurante): si vence,
   el restaurante deja de poder facturar. **Alertar 30 días antes** del
   vencimiento de cada certificado, por tenant. Agendar la renovación.

---

## 5. Panel de rechazos

Cuando ARCA rechaza, devuelve un **código de error**. Guardalo y mostralo claro (no críptico). Los más comunes:

- CUIT del receptor inválido o inactivo (verificar contra el padrón de ARCA).
- Tipo de comprobante incorrecto para la condición fiscal (A donde iba B, etc.).
- Punto de venta no habilitado.
- Monto fuera de rango / IVA mal calculado (redondeos).
- Fecha del comprobante fuera de plazo.

Tener una pantalla de "comprobantes rechazados" con el motivo y la acción sugerida, por restaurante.

---

## 6. Cola de pendientes y reintentos (resiliencia ante ARCA caído)

ARCA se cae seguido. El diseño debe garantizar que **la operación nunca se frene**:

- Si ARCA no responde, el cobro se completa igual y el comprobante queda
  **Pendiente de emisión**.
- Un job reintenta los pendientes automáticamente.
- Alertar si quedan pendientes viejos sin resolver.
- (Opcional avanzado) Evaluar **CAEA** como respaldo: un código que ARCA
  otorga por adelantado para seguir facturando durante contingencias. Sumarlo
  más adelante si el volumen lo justifica.

---

## 7. Libro IVA Digital (solo Responsables Inscriptos)

- Es una declaración **mensual** obligatoria para RI (no para monotributo).
- Como kitchenOS ya tiene todos los comprobantes emitidos con su IVA
  discriminado, puede **asistir a armar/exportar** el Libro IVA del período.
- No reemplaza al contador, pero le ahorra el armado manual. Generar un export
  conciliable por restaurante.

---

## 8. Seguridad de credenciales (no negociable)

- El certificado (`.crt`) y la clave privada (`.key`) son credenciales
  sensibles, **por restaurante**.
- Guardar cifrados en un secret store; **nunca** en el repo, en logs, ni en
  el cliente/tablet.
- El token de WSAA dura ~12hs: cachearlo y reusarlo, no re-autenticar por cada
  comprobante.

---

## 9. Antes de producción: homologación

- ARCA tiene un ambiente de **homologación** (pruebas) separado de producción,
  con certificados y endpoints distintos.
- Probar todo el flujo ahí (emisión A/B/C, notas de crédito, rechazos,
  reintentos) **antes** de tocar producción con un cliente real.

---

## 10. Checklist de monitoreo (resumen operativo)

Panel fiscal por restaurante, idealmente con estas vistas y alertas:

- [ ] Emitidos hoy / este mes (por tipo).
- [ ] Pendientes de emisión (y cuántos están "viejos").
- [ ] Rechazados sin resolver (con motivo).
- [ ] Próximos vencimientos de certificado (alerta a 30 días).
- [ ] Correlatividad OK (sin saltos/duplicados).
- [ ] Export de Libro IVA del mes (para RI).
- [ ] Estado del servicio de ARCA (arriba/caído).

---

### Verificar siempre contra la fuente oficial
La normativa de ARCA cambia. Antes de implementar o ante un error, consultar la
documentación oficial de web services en arca.gob.ar (manuales WSAA / WSFEv1) y,
para lo contable, al contador del cliente.
