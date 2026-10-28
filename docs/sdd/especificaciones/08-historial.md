# 08 — Historial de ventas

> Estado: `vigente` · Pantalla: `HistorialVentas` · Última actualización: 2026-10-27

---

## 1. Problema

Reportes da agregados por día, pero no permite ver **venta por venta** qué se
cobró, a qué hora y qué productos incluía. Para auditar o responder una
pregunta puntual hace falta el listado transaccional.

---

## 2. Flujo

1. Se entra a **Historial** desde la barra de navegación.
2. La pantalla abre en el día de hoy (zona `America/Bogota`).
3. El operador elige la fecha con **Hoy**, **Ayer** o el **calendario**.
4. La tabla muestra: fecha, hora (`HH:mm`), tipo, total y cuenta.
5. La tabla está paginada de a 10.
6. Al tocar una venta, se abre un **modal con el detalle** agrupado por producto.
7. El modal se cierra con **Cerrar detalle** o tocando fuera.

---

## 3. Reglas

1. **Solo se listan ventas cerradas:** `tipo in ('mostrador', 'cobro_cuenta')`.
   Las ventas tipo `cuenta` (ítems de cuentas abiertas) no se listan.
2. **Fecha y hora en zona del negocio.** `fechaHoyZona` y `horaMinutoEnZona`.
3. **Paginación de 10 por página.** Al cambiar de fecha se vuelve a la página 1.
4. **Las tarjetas de resumen muestran el total del día**, no el de la página:
   - **Ventas del día:** `count` exacto de todas las ventas del día.
   - **Total facturado:** suma de `total_cop` de todas las ventas del día.
5. **Detalle de una venta `mostrador`:** se lee `detalle_venta` por `venta_id`.
6. **Detalle de una venta `cobro_cuenta`:** se leen las ventas tipo `cuenta` de
   esa `cuenta_id` y sus `detalle_venta`. La venta de cobro **no tiene ítems
   propios**.
7. **El detalle se agrupa por producto**, sumando cantidad y subtotal.
8. **El calendario** marca los días con ventas y muestra el monto abreviado.

### Casos borde

- Venta de cobro de cuenta: sin este tratamiento, el detalle saldría vacío.
- Producto repetido en varias ventas de la misma cuenta: se muestra una sola
  fila con la cantidad acumulada.
- Día con más de 10 ventas: la tabla pagina, pero las tarjetas siguen mostrando
  el total del día.
- Venta sin ítems (no debería existir): el modal muestra "Sin ítems registrados".

---

## 4. Criterios de aceptación

- [ ] La tabla lista las ventas del día con fecha y hora exactas.
- [ ] La paginación muestra 10 por página y el total de páginas correcto.
- [ ] "Ventas del día" y "Total facturado" reflejan todo el día, no la página.
- [ ] Al tocar una venta de mostrador se ven sus ítems.
- [ ] Al tocar un cobro de cuenta se ven los ítems de la cuenta.
- [ ] Los ítems se agrupan por producto.
- [ ] El calendario muestra el monto abreviado en los días con ventas.

---

## 5. Datos

| Fuente | Uso |
|---|---|
| `venta` | Listado, totales del día, tipo y cuenta |
| `detalle_venta` | Ítems del detalle |
| `cuenta` | Etiqueta y número |
| `producto` | Nombre del producto en el detalle |

**Consultas:** dos en paralelo en `cargarVentas`:
1. página visible (`.range()` + `count: 'exact'`);
2. `total_cop` de todo el día para las tarjetas.

---

## 6. Fuera de alcance

- Exportar el historial.
- Filtrar por tipo, cuenta o producto.
- Anular una venta.
- Ver el recibo imprimible.

---

## 7. Pendientes conocidos

- No se puede filtrar por rango de fechas (solo día).
- El total del día se calcula trayendo todos los `total_cop`; para volúmenes
  grandes convendría una RPC de agregados.
- El calendario trae todas las ventas del mes y agrupa en el cliente.
