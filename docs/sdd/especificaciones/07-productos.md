# 07 — Productos

> Estado: `vigente` · UI: `FormularioProducto` en `Inventario` y `AperturaTurno` ·
> Última actualización: 2026-10-27

---

## 1. Problema

El catálogo no puede depender de editar SQL en Supabase. El dueño necesita dar
de alta un producto desde la app, incluso antes de abrir el turno.

---

## 2. Flujo

1. En **Inventario** o en **Apertura de turno**, tocar **+ Nuevo producto**.
2. Completar nombre, precio (obligatorios) e imagen (opcional).
3. **Crear** llama a `fn_crear_producto`.
4. El producto aparece al final del catálogo, activo y **con stock 0**.
5. Para poder venderlo, hay que cargarle stock con **+ Agregar stock**
   (requiere turno abierto) o contarlo al abrir el turno.

---

## 3. Reglas

1. **Nombre obligatorio y no vacío** (`NOMBRE_VACIO`). Se recorta con `btrim`.
2. **Precio > 0** (`PRECIO_INVALIDO`). Es la regla de negocio central: no existe
   producto de $0.
3. **No se repite un nombre activo**, sin importar mayúsculas
   (`PRODUCTO_YA_EXISTE`). El índice `ux_producto_nombre_activo` es sobre
   `lower(nombre) where activo`.
4. **El nombre de un producto desactivado se puede reutilizar** (índice parcial).
5. **`orden = max(orden) + 1`**: el producto nuevo va al final.
6. **`imagen_url` vacía si no se envía.**
7. **Crear producto NO requiere turno abierto.** Darle stock sí.
8. **No se puede escribir la tabla directamente.** RLS de solo lectura; la
   escritura va por la RPC `SECURITY DEFINER`.

### Casos borde

- Nombre repetido con distinta capitalización → `PRODUCTO_YA_EXISTE`.
- Precio 0 o negativo → `PRECIO_INVALIDO` (validación de la RPC + `CHECK`).
- Producto nuevo en un turno abierto: aparece en `v_stock_teorico` con
  `inicial = 0`, `agregado = 0`, `teorico = 0` → AGOTADO.
- Dos altas simultáneas podrían empatar en `orden`; no hay unique sobre `orden`.
- Producto desactivado: no aparece en el catálogo, pero su histórico de ventas
  queda intacto.

---

## 4. Criterios de aceptación

- [ ] Crear un producto válido devuelve el id y lo deja activo.
- [ ] El nombre se recorta.
- [ ] Se rechaza nombre vacío y solo espacios.
- [ ] Se rechaza precio 0 y negativo.
- [ ] Se rechaza un nombre repetido, aun con otra capitalización, sin filtrar el
      error crudo de Postgres.
- [ ] El nombre de un producto desactivado se puede reusar.
- [ ] Crear un producto sin turno abierto funciona.
- [ ] El producto nace sin stock y aparece AGOTADO.

---

## 5. Contrato

```sql
fn_crear_producto(
  p_nombre text,
  p_precio_cop integer,
  p_imagen_url text default ''
) returns bigint
```

**Errores:** `NOMBRE_VACIO`, `PRECIO_INVALIDO`, `PRODUCTO_YA_EXISTE`.

**Permisos:** `grant execute … to anon, authenticated`.

### Tabla `producto`

| Columna | Nota |
|---|---|
| `nombre` | `not null`; único donde `activo` |
| `precio_cop` | `check (precio_cop > 0)` |
| `orden` | `not null default 0` |
| `activo` | `not null default true` |
| `imagen_url` | `not null default ''` |

---

## 6. Fuera de alcance

- Editar un producto.
- Desactivar/activar un producto.
- Reordenar el catálogo.
- Borrar un producto (rompería `detalle_venta` y `conteo_inicial`).

---

## 7. Pendientes conocidos

- No hay UI para editar ni desactivar. Desactivar es el borrado correcto.
- `p_operador` no existe en la RPC: `producto` no tiene columna donde guardarlo.
- El reordenamiento no existe; el orden solo se asigna al crear.
