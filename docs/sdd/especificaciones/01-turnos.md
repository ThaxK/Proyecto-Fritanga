# 01 — Turnos

> Estado: `vigente` · Pantalla: `AperturaTurno` · Última actualización: 2026-10-27

---

## 1. Problema

Cada jornada necesita una base de caja para dar cambio y un punto de corte para
saber qué se vendió, qué quedó y cuánto dinero debería haber. Sin un turno
explícito no hay cuadre posible.

---

## 2. Flujo

1. El operador abre la app sin turno abierto.
2. La app muestra **Reportes** con el banner **"No hay turno abierto"** y el
   botón **Iniciar turno**.
3. Al tocar **Iniciar turno**, se abre `AperturaTurno`:
   - base de caja (default 70000),
   - conteo inicial por cada producto activo.
4. El operador ingresa los valores y confirma.
5. La base crea el turno y los conteos en una sola transacción.
6. La app pasa a **Venta**.

---

## 3. Reglas

1. **Solo un turno abierto a la vez.** Si ya hay uno, la apertura falla con
   `TURNO_YA_ABIERTO`.
2. **La base de caja no puede ser negativa** (`BASE_INVALIDA`).
3. **Se debe enviar el conteo de todos los productos activos.** Si falta uno,
   `CONTEO_INCOMPLETO`.
4. **Cada cantidad de conteo debe ser un entero ≥ 0.** Si no,
   `CONTEO_INVALIDO`.
5. **El producto debe existir** (`PRODUCTO_NO_EXISTE`).
6. **`p_conteos` no puede venir vacío** (`CONTEO_INCOMPLETO`).

### Casos borde

- Producto desactivado: no se exige su conteo (la validación es sobre
  `producto.activo = true`).
- Conteo en 0: es válido. Significa que ese producto arranca agotado.
- Dos aperturas simultáneas: el índice único parcial hace que una falle.

---

## 4. Criterios de aceptación

- [ ] Con base y conteos válidos, se crea un turno `abierto` y sus
      `conteo_inicial`.
- [ ] Con un turno ya abierto, la segunda apertura falla con `TURNO_YA_ABIERTO`.
- [ ] Si falta el conteo de un producto activo, falla con `CONTEO_INCOMPLETO`.
- [ ] El turno guarda `abierto_el` y `base_inicial_cop`.
- [ ] Al abrir, la app navega a Venta y el header muestra `🟢 Turno abierto`.

---

## 5. Contrato

```sql
fn_abrir_turno(
  p_base_inicial_cop integer,
  p_conteos jsonb,          -- [{"producto_id": 1, "cantidad": 100}, ...]
  p_operador text default ''
) returns bigint
```

- **Efecto:** inserta `turno` (`estado = 'abierto'`) y un `conteo_inicial` por
  producto.
- **Errores:** `BASE_INVALIDA`, `TURNO_YA_ABIERTO`, `CONTEO_INCOMPLETO`,
  `CONTEO_INVALIDO`, `PRODUCTO_NO_EXISTE`.
- **Concurrencia:** no toma `FOR UPDATE` porque el turno todavía no existe; el
  índice único parcial resuelve la carrera.

### Tabla `turno`

| Columna | Nota |
|---|---|
| `estado` | `abierto` \| `cerrado` |
| `abierto_el` / `cerrado_el` | timestamptz |
| `base_inicial_cop` | entero ≥ 0 |
| `etiqueta_operador` | queda `''` (no se rastrea operador) |
| `efectivo_fisico_cop` | se completa al cerrar |
| `notas_cierre` | `''` por ahora (la UI no las envía) |

---

## 6. Fuera de alcance

- Editar la base de caja después de abrir.
- Múltiples turnos simultáneos.
- Reabrir un turno cerrado.

---

## 7. Pendientes conocidos

- `AperturaTurno` usa `70000` hardcodeado en lugar de leer
  `ajustes.base_inicial_defecto_cop`.
- `AperturaTurno` no permite escribir notas de cierre (eso es del cierre).
