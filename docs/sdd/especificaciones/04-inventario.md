# 04 — Inventario

> Estado: `vigente` · Pantalla: `Inventario` · Última actualización: 2026-10-27

---

## 1. Problema

El dueño necesita saber cuánto queda de cada producto en el turno abierto y
poder cargar mercancía que llegó después de la apertura, sin perder de vista
cuánto había realmente al abrir.

---

## 2. Flujo

1. Al abrir turno se carga el **conteo inicial** de cada producto.
2. `Inventario` muestra, por producto: inicial, agregado, vendidos y disponible
   (teórico).
3. Si llega mercancía, **+ Agregar stock** pide la cantidad y llama a
   `fn_agregar_stock`.
4. El reabastecimiento se registra en `stock_agregado`, no se suma al conteo
   inicial.
5. Un producto con disponible ≤ 0 se muestra **AGOTADO**; con disponible 1–5,
   **STOCK BAJO**.
6. Realtime refresca la lista cuando cambian `venta`, `detalle_venta` o
   `conteo_inicial`.

---

## 3. Reglas

1. **El stock teórico se deriva:**
   `conteo_inicial + stock_agregado − vendidos`. No hay columna de stock.
2. **`conteo_inicial` es lo que se contó al abrir.** Un reabastecimiento no lo
   modifica.
3. **`stock_agregado` registra cada reabastecimiento** con `turno_id`,
   `producto_id`, `cantidad > 0`, `creado_el`.
4. **Agregar stock exige turno abierto** (`TURNO_CERRADO`).
5. **El producto debe existir** (`PRODUCTO_NO_EXISTE`) y el id ser válido
   (`PRODUCTO_INVALIDO`).
6. **Cantidad > 0** (`CANTIDAD_INVALIDA`).
7. **No se permite stock negativo**: si el disponible llega a 0, el producto se
   deshabilita en la venta.

### Casos borde

- Producto nuevo sin conteo inicial: aparece con `inicial = 0`, `agregado = 0`,
  `teorico = 0` → AGOTADO hasta que se le agregue stock.
- Reabastecimiento con el mismo producto varias veces: se acumula en
  `stock_agregado`.
- Sin turno abierto: la vista `v_stock_teorico` devuelve **cero filas** (hace
  `cross join` con el turno abierto). La pantalla se ve vacía aunque el catálogo
  tenga productos.

---

## 4. Criterios de aceptación

- [ ] La pantalla muestra inicial, agregado, vendidos y teórico.
- [ ] Agregar stock aumenta el teórico sin tocar el conteo inicial.
- [ ] Agregar stock sin turno abierto falla con `TURNO_CERRADO`.
- [ ] Cantidad 0 o negativa falla con `CANTIDAD_INVALIDA`.
- [ ] Un producto sin stock se muestra AGOTADO y no se puede vender.
- [ ] El cierre calcula el teórico con el stock agregado incluido.

---

## 5. Contrato

```sql
fn_agregar_stock(
  p_producto_id bigint,
  p_cantidad integer,
  p_operador text default ''
) returns jsonb
```

**Devuelve:** `{ producto_id, cantidad_agregada, nuevo_total }`.

**Errores:** `PRODUCTO_INVALIDO`, `CANTIDAD_INVALIDA`, `PRODUCTO_NO_EXISTE`,
`TURNO_CERRADO`.

**Concurrencia:** bloquea el turno abierto con `FOR UPDATE`.

### Vistas

```sql
v_stock_teorico:
  turno_id, producto_id, nombre, precio_cop, orden, imagen_url,
  inicial, agregado, vendidos, teorico
```

`teorico = inicial + agregado − vendidos`.

### Tablas

| Tabla | Rol |
|---|---|
| `conteo_inicial` | Lo contado al abrir. `unique(turno_id, producto_id)` |
| `stock_agregado` | Reabastecimientos. `cantidad > 0` |

---

## 6. Fuera de alcance

- Inventario global fuera de un turno (el stock es por turno).
- Transferencia entre productos.
- Mermas automáticas (se calculan al cerrar, ver `05-cierre.md`).

---

## 7. Pendientes conocidos

- Sin turno abierto, `Inventario` no puede mostrar el catálogo porque lee
  `v_stock_teorico`. Se ve vacío.
- El canal realtime de `Inventario` no escucha `producto`: un producto creado
  desde otra pestaña no aparece hasta refrescar.
