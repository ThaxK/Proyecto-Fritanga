# 02 — Ventas

> Estado: `vigente` · Pantalla: `VentaRapida` · Última actualización: 2026-10-27

---

## 1. Problema

El operador necesita cobrar rápido en horas pico, con botones grandes, vuelto
inmediato y sin riesgo de vender la última unidad dos veces desde dos
dispositivos.

---

## 2. Flujos

### A. Venta directa (mostrador)

1. El operador toca productos en el grid; se acumulan en el carrito.
2. Ingresa el efectivo recibido (o toca una denominación / **EXACTO**).
3. La app muestra el vuelto.
4. **Cobrar** llama a `fn_registrar_venta` sin `p_cuenta_id`.
5. La base valida stock, inserta `venta` (`tipo = 'mostrador'`) y sus
   `detalle_venta`, y devuelve total y vuelto.
6. El carrito se vacía y se renueva `client_tx_id`.

### B. Agregar a una cuenta

1. Desde `CuentasAbiertas` o el hash `#venta/:id/:etiqueta`, se abre Venta en
   modo cuenta.
2. Mismo carrito y pago, pero **Agregar a la cuenta** llama a
   `fn_registrar_venta` con `p_cuenta_id`.
3. La base inserta `venta` (`tipo = 'cuenta'`) y descuenta stock en ese momento.
4. La cuenta sigue abierta hasta que se cobre (ver `03-cuentas.md`).

### C. Crear cuenta con el carrito

1. En modo mostrador, **→ Cuenta** crea la cuenta y registra los ítems.
2. Usa dos UUID de idempotencia: uno para la cuenta y otro para los ítems.
3. Si el paso 2 falla, el reintento reutiliza los mismos UUID.

---

## 3. Reglas

1. **Sin turno abierto no se vende** (`TURNO_CERRADO`).
2. **`p_client_tx_id` es obligatorio** (`TX_INVALIDA`).
3. **Al menos un ítem** (`VENTA_SIN_ITEMS`).
4. **La cuenta, si se pasa, debe estar abierta y del turno actual**
   (`CUENTA_CERRADA`).
5. **Producto debe existir** (`PRODUCTO_NO_EXISTE`) y estar activo
   (`PRODUCTO_INACTIVO`).
6. **Cantidad > 0 por producto** (`CANTIDAD_INVALIDA`). Los ítems repetidos se
   agrupan por `producto_id`.
7. **Stock suficiente**: `conteo_inicial + stock_agregado − vendidos >= cantidad`
   (`STOCK_INSUFICIENTE`).
8. **Venta directa:** `recibido_cop >= total` (`RECIBIDO_INSUFICIENTE`).
9. **Idempotencia:** si `client_tx_id` ya existe, devuelve la venta registrada
   con `ya_registrada: true` y no duplica.
10. **El precio unitario se copia del producto** al momento de la venta. Un
    cambio de precio posterior no altera la historia.

### Casos borde

- Dos dispositivos venden la última unidad: el `FOR UPDATE` sobre el turno
  serializa; el segundo recibe `STOCK_INSUFICIENTE`.
- Reintento tras corte de red: mismo `client_tx_id` → no duplica.
- Carrito con el mismo producto dos veces: se suma la cantidad antes de validar.
- `p_recibido_cop` menor al total en venta directa: la base rechaza. **Ojo:** la
  UI actual fuerza `recibido = total` si el operador ingresó menos, así que el
  error casi nunca se ve.

---

## 4. Criterios de aceptación

- [ ] Una venta directa válida crea `venta` + `detalle_venta` y devuelve total y
      vuelto.
- [ ] Vender sin turno falla con `TURNO_CERRADO`.
- [ ] Vender más que el stock falla con `STOCK_INSUFICIENTE`.
- [ ] El mismo `client_tx_id` no duplica la venta.
- [ ] Una venta a cuenta deja la cuenta abierta y descuenta stock.
- [ ] El vuelto es `recibido − total`.

---

## 5. Contrato

```sql
fn_registrar_venta(
  p_items jsonb,                 -- [{"producto_id": 1, "cantidad": 2}, ...]
  p_recibido_cop integer,
  p_client_tx_id uuid,
  p_cuenta_id bigint default null,
  p_operador text default ''
) returns jsonb
```

**Devuelve:** `{ venta_id, total, vuelto, cuenta_id, ya_registrada }`.

**Errores:** `TX_INVALIDA`, `TURNO_CERRADO`, `VENTA_SIN_ITEMS`, `CUENTA_CERRADA`,
`ITEM_INVALIDO`, `PRODUCTO_NO_EXISTE`, `PRODUCTO_INACTIVO`, `CANTIDAD_INVALIDA`,
`STOCK_INSUFICIENTE`, `RECIBIDO_INSUFICIENTE`.

**Concurrencia:** bloquea el turno abierto con `FOR UPDATE` antes de validar
stock.

### Tablas

| Tabla | Rol |
|---|---|
| `venta` | Cabecera: `tipo`, `total_cop`, `recibido_cop`, `vuelto_cop`, `client_tx_id` |
| `detalle_venta` | Ítems: `cantidad > 0`, `precio_unit_cop >= 0`, `subtotal_cop` generado |

### Vista `v_stock_teorico`

`inicial + agregado − vendidos` por producto del turno abierto.

---

## 6. Fuera de alcance

- Devoluciones.
- Descuentos.
- Múltiples formas de pago en una venta.
- Facturación electrónica.

---

## 7. Pendientes conocidos

- `VentaRapida` disfraza pagos insuficientes (`recibidoFinal = total` si el
  operador ingresó menos).
- `txVenta` no se renueva tras un fallo por stock: un reintento podría devolver
  `ya_registrada` de una venta que nunca se registró.
