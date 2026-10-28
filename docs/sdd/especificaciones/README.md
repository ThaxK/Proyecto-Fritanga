# Especificaciones — índice

> Estado de cada capacidad tal como está implementada hoy (2026-10-27).
> `vigente` = coincide con el código · `borrador` = propuesta ·
> `en progreso` = se está implementando · `obsoleta` = ya no aplica.

| # | Capacidad | Archivo | Estado | Pantalla / UI | RPCs principales |
|---|---|---|---|---|---|
| 00 | Visión general | [`00-vision.md`](./00-vision.md) | vigente | — | — |
| 01 | Turnos | [`01-turnos.md`](./01-turnos.md) | vigente | `AperturaTurno` | `fn_abrir_turno` |
| 02 | Ventas | [`02-ventas.md`](./02-ventas.md) | vigente | `VentaRapida` | `fn_registrar_venta` |
| 03 | Cuentas | [`03-cuentas.md`](./03-cuentas.md) | vigente | `CuentasAbiertas`, `VentaRapida` | `fn_crear_cuenta_automatica`, `fn_restar_item_cuenta`, `fn_eliminar_cuenta_vacia`, `fn_cobrar_cuenta` |
| 04 | Inventario | [`04-inventario.md`](./04-inventario.md) | vigente | `Inventario` | `fn_agregar_stock` |
| 05 | Cierre de caja | [`05-cierre.md`](./05-cierre.md) | vigente | `CierreCaja` | `fn_cerrar_turno` |
| 06 | Reportes | [`06-reportes.md`](./06-reportes.md) | vigente | `Reportes` | — (lectura de vistas) |
| 07 | Productos | [`07-productos.md`](./07-productos.md) | vigente | `FormularioProducto` en `Inventario` y `AperturaTurno` | `fn_crear_producto` |
| 08 | Historial de ventas | [`08-historial.md`](./08-historial.md) | vigente | `HistorialVentas` | — (lectura) |

---

## Capacidades pendientes (sin spec todavía)

Estas están identificadas en el análisis QA y **no** están implementadas. Si se
encaran, primero se escribe su spec.

| Pendiente | Por qué no está |
|---|---|
| Editar / desactivar productos | Hoy solo se pueden crear. Desactivar es el borrado correcto (el histórico referencia `producto`). |
| UI de `fn_movimiento_caja` | Decisión de negocio: el reabastecimiento se paga fuera del cajón. Si se paga del cajón, hace falta registrar el retiro. |
| Rechazar conteos físicos en cero en el cierre | Hoy el cierre acepta todos los conteos en 0. |
| Leer `ajustes.base_inicial_defecto_cop` en la apertura | Hoy `AperturaTurno` usa 70000 hardcodeado. |
| Sección "Mermas" real en Reportes | Hoy es un placeholder estático. Los datos existen en `reconciliacion`. |
| Operador | Descartado por decisión de negocio. No hay login ni pantalla de bienvenida. |
