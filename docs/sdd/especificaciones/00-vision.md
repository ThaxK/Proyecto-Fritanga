# 00 — Visión general

> Estado: `vigente` · Última actualización: 2026-10-27

---

## 1. Qué es el sistema

Un punto de venta (POS) para una fritanga en Cali, Colombia. Corre como SPA en
el navegador y usa Supabase (PostgreSQL) como backend. No hay servidor propio:
la lógica de negocio vive en funciones SQL.

**Objetivo operativo:** registrar una venta en menos de 3 segundos, mantener el
inventario exacto aunque haya hasta 3 dispositivos vendiendo a la vez, y cerrar
la caja con un cuadre que cuadre matemáticamente.

---

## 2. Actores

| Actor | Qué hace |
|---|---|
| **Operador de mostrador** | Vende, abre/cobra cuentas, agrega stock. No hay login; cualquiera con la URL puede operar. |
| **Responsable de cierre** | Abre el turno con la base de caja, cierra con conteo físico y revisa reportes. Es un rol por convención, no técnico. |
| **Dueño del negocio** | Administra el catálogo, revisa reportes e histórico. |

**No se rastrea el operador.** Es una decisión de negocio: no hay login ni
pantalla de bienvenida, y los campos de operador quedan vacíos.

---

## 3. Glosario

| Término | Significado |
|---|---|
| **Turno** | La jornada. Se abre con una base de caja y el conteo inicial de productos; se cierra con el conteo físico. Solo puede haber uno abierto. |
| **Conteo inicial** | Unidades de cada producto al abrir el turno. |
| **Stock agregado** | Reabastecimiento cargado durante el turno. Se registra aparte del conteo inicial. |
| **Stock teórico** | `conteo_inicial + stock_agregado − vendidos`. Se deriva, no se guarda. |
| **Cuenta** | Pestaña de un cliente o mesa. Acumula ítems hasta que se cobra. |
| **Venta de mostrador** | Venta directa, sin cuenta, pagada en efectivo. |
| **Venta de cuenta** | Ítem acumulado a una cuenta abierta. Descuenta stock en el momento, no cobra todavía. |
| **Cobro de cuenta** | Venta final que cierra la cuenta por el total. No lleva ítems propios. |
| **Reconciliación / merma** | Al cerrar, la diferencia entre el stock teórico y el físico contado. Negativo = merma. |
| **Diferencia de caja** | `efectivo físico − dinero esperado`. Negativo = faltante. |

---

## 4. Reglas transversales

1. **Un solo turno abierto.** Índice único parcial.
2. **Escritura solo por RPC.** RLS de solo lectura para `anon`.
3. **Stock derivado.** Nunca un contador mutable.
4. **Idempotencia por `client_tx_id`** en ventas y cuentas.
5. **Zona horaria `America/Bogota`** resuelta en el cliente; rangos semiabiertos.
6. **Dinero en enteros COP.**
7. **Nada se borra del histórico.**
8. **`precio_cop > 0`** siempre.

La versión completa y no negociable está en
[`../constitucion.md`](../constitucion.md).

---

## 5. Mapa de pantallas

| Pantalla | Archivo | Qué hace |
|---|---|---|
| Apertura de turno | `src/paginas/AperturaTurno.tsx` | Base de caja + conteo inicial. También permite crear productos antes de abrir. |
| Venta rápida | `src/paginas/VentaRapida.tsx` | Grid de productos, carrito, efectivo, vuelto. Venta directa o a cuenta. |
| Cuentas abiertas | `src/paginas/CuentasAbiertas.tsx` | Lista de cuentas, detalle, cobro, eliminación de cuentas vacías. |
| Inventario | `src/paginas/Inventario.tsx` | Stock teórico por producto, agregar stock, crear producto. |
| Cierre de caja | `src/paginas/CierreCaja.tsx` | Conteo físico, efectivo, resumen de mermas y cuadre. |
| Reportes | `src/paginas/Reportes.tsx` | Resumen del día, ventas por producto y por hora, calendario de ventas. |
| Historial de ventas | `src/paginas/HistorialVentas.tsx` | Listado paginado de ventas con fecha/hora, detalle y calendario. |

**Componentes compartidos:** `FormularioProducto` (alta de producto) y
`CalendarioVentas` (selector de fecha con montos).

---

## 6. Estado del ruteo

`App.tsx` no fuerza la apertura de turno. Si no hay turno abierto:

- entra a **Reportes** (métricas accesibles sin iniciar turno);
- **Venta** y **Cuentas** quedan deshabilitadas;
- se muestra un banner **"No hay turno abierto"** con botón **Iniciar turno**;
- el header muestra siempre `🟢 Turno abierto` o `🔴 Turno cerrado`.
