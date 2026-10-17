# Proyecto-Fritanga

Punto de venta (POS) para una fritanga en Cali, Colombia. App de una sola página (React + TypeScript + Vite) con Supabase como backend. Toda la escritura a la base pasa por funciones `SECURITY DEFINER`; la app (rol `anon`) solo puede leer tablas directamente.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4
- **Backend:** Supabase (PostgreSQL 18), funciones PL/pgSQL `SECURITY DEFINER`, RLS (solo lectura para `anon`)
- **Pruebas de base:** Vitest + embedded PostgreSQL (`embedded-postgres`) — 36 pruebas en 5 archivos
- **Pruebas de interfaz:** Playwright (Chromium) — 5 pruebas, dos servidores (sin configuración / con Supabase simulado)
- **Lint:** oxlint

## Comandos

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo
npm run dev

# Pruebas de base (vitest, sin navegador)
npm test

# Pruebas de interfaz (Playwright, necesita Chromium instalado)
npm run test:ui

# Build de producción (tipado + vite)
npm run build

# Lint
npm run lint
```

PowerShell en Windows tiene la execution policy bloqueada para `.ps1`; usar `cmd /c "npm ..."` o `cmd /c "npx ..."` en lugar de `npm`/`npx` directos.

## Estructura

```
bd/                 Esquema SQL y migraciones (aplicar en Supabase SQL Editor)
  schema.sql        Esquema completo (tablas, índices, RLS, vistas, funciones RPC, seed)
  migracion_cuentas.sql   Numeracion de cuentas + eliminacion de cuentas vacias (idempotente)
  migracion_precio_positivo.sql  Check precio_cop > 0 (idempotente) — PENDIENTE de aplicar en Supabase
  migracion_productos.sql  Funcion fn_crear_producto (idempotente) — PENDIENTE de aplicar en Supabase
  pruebas/          Harness de PostgreSQL embebido + pruebas de integracion
src/                App React
  paginas/          AperturaTurno, Inventario, VentaRapida, CuentasAbiertas, CierreCaja, Reportes, Bienvenida
  componentes/      FormularioProducto (compartido)
  servicios/        supabase.ts, fechas.ts (zona horaria America/Bogota)
e2e/                Pruebas de interfaz (Playwright)
docs/               Documentacion de arquitectura
```

## Reglas de negocio (aplicadas en la base)

- **`precio_cop > 0`**: no existe un producto que valga 0. Aplicado mediante `CHECK` en `schema.sql` y `bd/migracion_precio_positivo.sql`.
- **Un solo turno abierto**: índice único parcial `ux_turno_uno_abierto`.
- **Un número de cuenta por turno**: índice `ux_cuenta_turno_numero`. La base es dueña del número de cuenta (`fn_siguiente_numero_cuenta` bajo bloqueo `FOR UPDATE`).
- **Idempotencia**: `cuenta.client_tx_id` y `venta.client_tx_id` con índices únicos para reintentos tras cortes de red.
- **Stock teórico**: `conteo_inicial − vendidos`, calculado en la vista `v_stock_teorico`.
- **Cierre de turno**: requiere conteo físico de todos los productos del turno, no acepta cuentas abiertas, y calcula `dinero_esperado = base + ventas_efectivo − retiros + entradas`.

## Arquitectura de escritura

La app no escribe tablas directamente. RLS tiene política de solo lectura (`anon_lectura`) en todas las tablas, y los grants son `SELECT` en tablas + `EXECUTE` en funciones. Toda mutación pasa por funciones `SECURITY DEFINER` en `bd/schema.sql`:

- `fn_abrir_turno`, `fn_crear_cuenta`, `fn_crear_cuenta_automatica`, `fn_eliminar_cuenta_vacia`
- `fn_registrar_venta`, `fn_cobrar_cuenta`, `fn_movimiento_caja`, `fn_restar_item_cuenta`
- `fn_agregar_stock`, `fn_cerrar_turno`, `fn_crear_producto`

## Configuración de Supabase

Copiar `.env.example` a `.env.local` y completar:

```
VITE_SUPABASE_URL=tu-url-de-supabase
VITE_SUPABASE_ANON_KEY=tu-clave-anon
```

**Importante:** `process.env` pisa a `.env.local` en el `loadEnv` de Vite, incluso con valor vacío. Las pruebas de Playwright no tocan `.env.local` ni el Supabase real: usan dos servidores locales propios (puerto 4173 sin configuración, 4174 con Supabase simulado).

## Migraciones pendientes en Supabase

Estos archivos deben pegarse en el SQL Editor de Supabase (en este orden):

1. `bd/migracion_cuentas.sql` (ya aplicado en producción)
2. `bd/migracion_precio_positivo.sql` — aplica `check (precio_cop > 0)` y avisa de cuentas con total $0
3. `bd/migracion_productos.sql` — crea `fn_crear_producto` para dar de alta productos desde la app

Cada archivo es idempotente y trae su propio autochequeo (`raise notice` al finalizar).

## Decisiones de diseño relevantes

- **Zona horaria:** manejada del lado del cliente en `src/servicios/fechas.ts` (deriva el offset con `Intl.DateTimeFormat`), para no imponer una migración en SQL.
- **Rango de fechas semiabierto** `[desde, hasta)` en vez de `<= 23:59:59`, para no descartar ventas del último segundo.
- **Stock cero al crear producto:** un producto nuevo aparece con stock 0 (AGOTADO) hasta que se le cargue un conteo con `fn_agregar_stock`. Dar de alta un producto no requiere turno abierto; darle stock sí.
- **Operador:** por decisión del negocio, no se rastrea quién opera el mostrador. `Bienvenida.tsx` existe pero no se renderiza en `App.tsx`. Los campos `etiqueta_operador`, `creada_por` y `creado_por` quedan vacíos.

## Próximos pasos

- Aplicar `bd/migracion_precio_positivo.sql` y `bd/migracion_productos.sql` en el SQL Editor de Supabase.
- (Opcional) Editar/desactivar productos (incremento aparte: hoy solo se pueden crear).
- (Opcional) UI para `fn_movimiento_caja` (hoy no hay pantalla que registre retiros/entradas de caja).

## Licencia

Privado — uso interno del negocio.