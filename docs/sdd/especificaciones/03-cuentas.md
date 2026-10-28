# 03 — Cuentas

> Estado: `vigente` · Pantallas: `CuentasAbiertas`, `VentaRapida` ·
> Última actualización: 2026-10-27

---

## 1. Problema

Un cliente puede consumir varias cosas y pagar al final. La cuenta acumula
ítems, descuenta stock en el momento y se cobra una sola vez.

---

## 2. Flujo

1. **Nueva cuenta** → `fn_crear_cuenta_automatica` asigna el número y la
   etiqueta `Cuenta N` bajo bloqueo del turno.
2. **Agregar items** → abre Venta en modo cuenta (`#venta/:id/:etiqueta`).
3. Los ítems se registran como ventas tipo `cuenta` y descuentan stock.
4. **Cobrar** abre el modal con el detalle agrupado por producto.
5. Se puede **restar** un ítem con `fn_restar_item_cuenta` antes de cobrar.
6. **Cobrar** llama a `fn_cobrar_cuenta`, que cierra la cuenta y crea la venta
   tipo `cobro_cuenta`.
7. Si la cuenta queda sin ítems, `fn_restar_item_cuenta` la elimina sola.
8. Si se creó por error y nunca tuvo ítems, **Eliminar** llama a
   `fn_eliminar_cuenta_vacia`.

---

## 3. Reglas

1. **Una sola cuenta abierta por etiqueta y turno.** Índice único parcial sobre
   `lower(etiqueta)`.
2. **El número de cuenta lo asigna la base** (`fn_siguiente_numero_cuenta`),
   nunca el cliente. Es la identidad real; la etiqueta es solo cómo se muestra.
3. **Idempotencia de creación:** `client_tx_id` único. Un reintento devuelve la
   misma cuenta.
4. **No se puede cobrar una cuenta de otro turno** (`CUENTA_DE_OTRO_TURNO`) ni
   una ya cobrada (`CUENTA_YA_COBRADA`).
5. **No se puede cobrar una cuenta con total ≤ 0** (`CUENTA_VACIA`).
6. **El cobro exige `recibido >= total`** (`RECIBIDO_INSUFICIENTE`).
7. **Restar ítems:** cantidad > 0; si se pide más de lo que hay,
   `NO_SE_PUEDE_RESTAR`.
8. **Eliminar cuenta vacía:** solo si está abierta y no tiene ninguna fila en
   `venta`. Si tiene ítems, `CUENTA_CON_ITEMS`.
9. **El cobro es idempotente** por `client_tx_id`.

### Casos borde

- Cuenta con ítems de precio 0: imposible por `producto.precio_cop > 0` y
  `detalle_venta.cantidad > 0`.
- Dos dispositivos cobran a la vez: el `FOR UPDATE` sobre la cuenta hace que el
  segundo reciba `CUENTA_YA_COBRADA`.
- Cuenta vacía que bloquea el cierre: se resuelve con **Eliminar**.
- Cuenta abierta al cerrar turno: `fn_cerrar_turno` rechaza con
  `CUENTAS_ABIERTAS`.

---

## 4. Criterios de aceptación

- [ ] Crear una cuenta devuelve un id y una etiqueta `Cuenta N`.
- [ ] El mismo `client_tx_id` no crea dos cuentas.
- [ ] Agregar ítems descuenta stock y suma al total de la cuenta.
- [ ] Cobrar cierra la cuenta y crea una venta tipo `cobro_cuenta` por el total.
- [ ] No se puede cobrar dos veces la misma cuenta.
- [ ] Restar el último ítem elimina la cuenta.
- [ ] Eliminar una cuenta vacía la borra; con ítems, falla.

---

## 5. Contratos

```sql
fn_crear_cuenta(p_etiqueta text, p_operador text default '') returns bigint
fn_crear_cuenta_automatica(p_client_tx_id uuid default null, p_operador text default '') returns bigint
fn_restar_item_cuenta(p_cuenta_id bigint, p_producto_id bigint, p_cantidad integer) returns jsonb
fn_eliminar_cuenta_vacia(p_cuenta_id bigint) returns void
fn_cobrar_cuenta(p_cuenta_id bigint, p_recibido_cop integer, p_client_tx_id uuid, p_operador text default '') returns jsonb
```

**Errores:** `ETIQUETA_VACIA`, `TURNO_CERRADO`, `CUENTA_YA_ABIERTA`,
`CUENTA_CERRADA`, `CUENTA_NO_EXISTE`, `CUENTA_DE_OTRO_TURNO`,
`CUENTA_YA_COBRADA`, `CUENTA_VACIA`, `CUENTA_CON_ITEMS`,
`RECIBIDO_INSUFICIENTE`, `CANTIDAD_INVALIDA`, `NO_SE_PUEDE_RESTAR`,
`TX_INVALIDA`.

### Tablas

| Tabla | Rol |
|---|---|
| `cuenta` | `numero`, `etiqueta`, `estado`, `creada_por`, `client_tx_id` |
| `venta` | Ítems (`tipo = 'cuenta'`) y cobro final (`tipo = 'cobro_cuenta'`) |

> **Importante:** una venta `cobro_cuenta` **no tiene `detalle_venta`**. Los
> ítems están en las ventas tipo `cuenta` de esa cuenta. Cualquier detalle debe
> resolver esa diferencia (ver `08-historial.md`).

---

## 6. Fuera de alcance

- Dividir una cuenta.
- Transferir ítems entre cuentas.
- Propinas.
- Crédito / pagaré.

---

## 7. Pendientes conocidos

- La UI de restar ítem siempre resta de a 1 (varias llamadas para restar más).
- `fn_crear_cuenta` existe pero la UI usa `fn_crear_cuenta_automatica`.
