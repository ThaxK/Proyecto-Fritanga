# 05 — Cierre de caja

> Estado: `vigente` · Pantalla: `CierreCaja` · Última actualización: 2026-10-27

---

## 1. Problema

Al terminar la jornada hay que saber cuánto dinero debería haber en el cajón,
cuánto hay de verdad, y qué producto falta. Sin un cierre formal no hay control
de mermas ni de faltantes.

---

## 2. Flujo

1. El operador entra a **Cierre** con un turno abierto.
2. **Paso 1 — Conteo físico de productos:** ingresa lo que contó por producto.
   `0` es válido.
3. **Paso 2 — Conteo de efectivo:** ingresa el efectivo físico. La pantalla
   muestra el dinero esperado y la diferencia en vivo.
4. **Paso 3 — Resumen:** cuadre de caja y mermas por producto.
5. **CERRAR TURNO** llama a `fn_cerrar_turno`.
6. La base guarda `reconciliacion`, cierra el turno y devuelve el resumen.
7. La app vuelve a la apertura.

---

## 3. Reglas

1. **No se cierra sin turno abierto** (`NO_HAY_TURNO_ABIERTO`).
2. **El conteo físico no puede venir vacío** (`CONTEO_INCOMPLETO`).
3. **Todo producto con `conteo_inicial` debe estar en el conteo físico.** Si
   falta uno, `CONTEO_INCOMPLETO`.
4. **El efectivo físico no puede ser nulo ni negativo** (`EFECTIVO_INVALIDO`).
5. **No se cierra con cuentas abiertas** (`CUENTAS_ABIERTAS`).
6. **El teórico incluye el stock agregado:**
   `teorico = conteo_inicial + stock_agregado − vendidos`.
7. **La merma es `fisico − teorico`.** Negativo = faltante de producto.
8. **El dinero esperado es:**
   `base_inicial + ventas_efectivo − retiros + entradas`.
   `ventas_efectivo` incluye `mostrador` y `cobro_cuenta`.
9. **La diferencia de caja es `efectivo_fisico − dinero_esperado`.**
10. **El cierre es transaccional:** o se guarda todo, o no se cierra.

### Casos borde

- Conteos todos en 0: **hoy se aceptan**. Genera mermas negativas grandes.
- Retiros/entradas: la tabla `movimiento_caja` existe, pero **no hay UI** que la
  escriba. Siempre valen 0.
- Reabastecimiento pagado del cajón: al no registrarse un retiro, el cierre
  muestra un faltante fantasma. Decisión de negocio: se paga fuera del cajón.
- Cuenta vacía abierta: bloquea el cierre (`CUENTAS_ABIERTAS`). Se resuelve
  eliminándola desde Cuentas.

---

## 4. Criterios de aceptación

- [ ] Con conteos completos y efectivo válido, el turno pasa a `cerrado`.
- [ ] Se crea una fila de `reconciliacion` por producto del turno.
- [ ] El teórico incluye `stock_agregado`.
- [ ] Con una cuenta abierta, el cierre falla con `CUENTAS_ABIERTAS`.
- [ ] Si falta un producto en el conteo físico, falla con `CONTEO_INCOMPLETO`.
- [ ] El resumen devuelve `dinero_esperado`, `diferencia`, `ventas_efectivo`,
      `retiros`, `entradas` y `mermas`.

---

## 5. Contrato

```sql
fn_cerrar_turno(
  p_conteos_fisicos jsonb,      -- [{"producto_id": 1, "cantidad": 12}, ...]
  p_efectivo_fisico_cop integer,
  p_notas text default ''
) returns jsonb
```

**Devuelve:**

```json
{
  "turno_id": 1,
  "dinero_esperado": 120000,
  "efectivo_fisico": 118000,
  "diferencia": -2000,
  "ventas_efectivo": 50000,
  "retiros": 0,
  "entradas": 0,
  "mermas": [
    { "producto_id": 1, "nombre": "Empanadas", "teorico": 12, "fisico": 10, "diferencia": -2 }
  ]
}
```

**Errores:** `NO_HAY_TURNO_ABIERTO`, `CONTEO_INCOMPLETO`, `EFECTIVO_INVALIDO`,
`CONTEO_INVALIDO`, `CUENTAS_ABIERTAS`.

**Concurrencia:** bloquea el turno abierto con `FOR UPDATE`.

### Tabla `reconciliacion`

| Columna | Nota |
|---|---|
| `turno_id`, `producto_id` | PK compuesta |
| `teorico` | inicial + agregado − vendidos |
| `fisico` | conteo manual |
| `diferencia` | generada: `fisico − teorico` |

---

## 6. Fuera de alcance

- Reabrir un turno cerrado.
- Editar un cierre.
- Notas de cierre desde la UI (el campo existe, la UI manda `''`).

---

## 7. Pendientes conocidos

- El cierre acepta todos los conteos en 0.
- `CierreCaja` manda `p_notas: ''` siempre.
- No hay UI para `fn_movimiento_caja`; retiros y entradas siempre son 0.
- La sección "Mermas" de Reportes no lee `reconciliacion` (es un placeholder).
