# 06 — Reportes

> Estado: `vigente` · Pantalla: `Reportes` · Última actualización: 2026-10-27

---

## 1. Problema

El dueño necesita saber cómo fue el día: cuánto se vendió, en qué horarios, qué
productos se movieron y qué días del mes tuvieron ventas. Sin esto, decide a
ciegas.

---

## 2. Flujo

1. La pantalla abre en el día de hoy (zona `America/Bogota`).
2. El operador elige una fecha con **Hoy**, **Ayer** o el **calendario**.
3. El calendario marca los días con ventas y muestra el monto abreviado
   (`$45k`, `$1,2M`).
4. La pantalla muestra:
   - **Resumen del día:** ventas totales, efectivo, cuentas cobradas, productos
     vendidos, número de ventas.
   - **Ventas por producto:** ranking con unidades y porcentaje, paginado de a
     10.
   - **Ventas por hora:** ventas y total por hora.
   - **Mermas:** placeholder estático (no lee datos).

---

## 3. Reglas

1. **El corte del día es la zona del negocio**, no UTC ni la del dispositivo.
   Se usa `rangoDiaZona(fecha)` → `[desde, hasta)`.
2. **Ventas del resumen:** `tipo in ('mostrador', 'cobro_cuenta')`.
3. **Efectivo:** suma `mostrador` + `cobro_cuenta`, porque ambas son dinero que
   entró al cajón.
4. **Productos vendidos:** se calcula sobre `detalle_venta` de **todas** las
   ventas creadas ese día, incluyendo `tipo = 'cuenta'`, porque los ítems se
   registran al agregar a la cuenta, no al cobrar.
5. **Agrupación por nombre de producto**, no por `producto_id` (el join de
   PostgREST no devuelve `producto_id` de forma confiable).
6. **Porcentaje:** sobre el total de los detalles mostrados, no sobre
   `venta.total_cop`.
7. **Ventas por hora:** se agrupan con `horaEnZona` (0–23).
8. **Cuentas cobradas:** cantidad de `cuenta_id` distintos entre las ventas del
   día.

### Casos borde

- Día sin ventas: resumen en 0, listas vacías.
- Venta a las 23:59:59.500: entra en el día correcto por el rango semiabierto.
- Venta de cuenta cobrada hoy pero registrada ayer: sus ítems aparecen el día en
  que se agregaron, no el día del cobro.
- Producto desactivado: sus ventas históricas siguen apareciendo.

---

## 4. Criterios de aceptación

- [ ] El resumen coincide con las ventas del día en zona del negocio.
- [ ] El efectivo incluye mostrador y cobros de cuenta.
- [ ] "Ventas por producto" muestra todos los productos vendidos, no solo los
      de mostrador.
- [ ] El porcentaje suma 100% entre los productos mostrados.
- [ ] El calendario marca los días con ventas y muestra el monto abreviado.
- [ ] Al elegir un día, el reporte se recarga con esa fecha.

---

## 5. Datos

| Fuente | Uso |
|---|---|
| `venta` | Resumen, horas, calendario |
| `detalle_venta` | Productos vendidos y unidades |
| `v_stock_teorico` | Referencia de stock (no se usa en Reportes hoy) |
| `reconciliacion` | Mermas (pendiente: hoy no se lee) |

### Servicio `src/servicios/reportes.ts`

```ts
cargarDiasConVentas(anio, mes): Promise<Map<'aaaa-mm-dd', { total, numVentas }>>
```

Agrupa en el cliente por día del negocio. Sin migración SQL.

### Componente `CalendarioVentas`

Props: `fechaSeleccionada`, `onSeleccionar`.
Carga los días del mes visible y muestra el monto abreviado.

---

## 6. Fuera de alcance

- Exportar a PDF/Excel.
- Comparativas entre meses.
- Reportes por turno (hoy es por día).
- Mermas reales en esta pantalla (ver pendientes).

---

## 7. Pendientes conocidos

- La sección **Mermas** es un placeholder estático.
- No hay reporte por turno; el resumen es por día.
- El calendario trae todas las ventas del mes y agrupa en el cliente; para
  volúmenes grandes convendría una vista SQL.
