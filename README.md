# Proyecto-Fritanga

Punto de venta (POS) para una fritanga en Cali, Colombia. App de una sola página
(React + TypeScript + Vite) con Supabase como backend. Toda la escritura a la
base pasa por funciones `SECURITY DEFINER`; la app (rol `anon`) solo puede leer
tablas directamente.

> **¿Retomás el proyecto?** Empezá por [`AGENTS.md`](./AGENTS.md) y por
> [`docs/sdd/README.md`](./docs/sdd/README.md). Ahí está el flujo de trabajo y
> las reglas no negociables.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4
- **Backend:** Supabase (PostgreSQL 18), funciones PL/pgSQL `SECURITY DEFINER`,
  RLS (solo lectura para `anon`)
- **Pruebas de base:** Vitest + embedded PostgreSQL (`embedded-postgres`) —
  **64 pruebas en 7 archivos**
- **Pruebas de interfaz:** Playwright (Chromium) — **11 pruebas**, dos servidores
  (sin configuración / con Supabase simulado)
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

PowerShell en Windows tiene la execution policy bloqueada para `.ps1`; usar
`cmd /c "npm ..."` o `cmd /c "npx ..."` en lugar de `npm`/`npx` directos.

## Documentación

| Documento | Qué contiene |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | Punto de entrada para personas y agentes: comandos, reglas, trampas. |
| [`docs/sdd/README.md`](./docs/sdd/README.md) | Flujo Spec-Driven Development: spec → plan → tareas → código. |
| [`docs/sdd/constitucion.md`](./docs/sdd/constitucion.md) | Principios de arquitectura y reglas de dominio no negociables. |
| [`docs/sdd/especificaciones/`](./docs/sdd/especificaciones/README.md) | Una spec por capacidad, con estado y contratos. |
| [`docs/sdd/plantillas/`](./docs/sdd/plantillas/) | Plantillas de spec, plan y tareas. |
| [`docs/analisis-arquitectura.md`](./docs/analisis-arquitectura.md) | Arquitectura y decisiones originales. |
| [`docs/mer-tecnico.md`](./docs/mer-tecnico.md) | Modelo de datos técnico. |
| [`docs/mer-visual.md`](./docs/mer-visual.md) | Explicación del modelo para el dueño del negocio. |

> El `mer-tecnico.md` está desactualizado en algunos puntos: no incluye
> `stock_agregado`, `producto.imagen_url`, `cuenta.numero`, `cuenta.creada_por`
> ni `cuenta.client_tx_id`. La fuente de verdad del esquema es
> `bd/schema.sql`.

## Estructura

```
bd/                 Esquema SQL y migraciones (aplicar en Supabase SQL Editor)
  schema.sql        Esquema completo (tablas, índices, RLS, vistas, RPCs, seed)
  migracion_*.sql   Migraciones idempotentes para bases existentes
  pruebas/          Harness de PostgreSQL embebido + pruebas de integración
src/                App React
  paginas/          AperturaTurno, VentaRapida, CuentasAbiertas, Inventario,
                    CierreCaja, Reportes, HistorialVentas
  componentes/      FormularioProducto, CalendarioVentas
  servicios/        supabase.ts, fechas.ts, reportes.ts
e2e/                Pruebas de interfaz (Playwright) + mock de Supabase
docs/               Arquitectura, MER y documentación SDD
```

## Reglas de negocio (aplicadas en la base)

- **`precio_cop > 0`**: no existe un producto que valga 0. `CHECK` en
  `schema.sql` y `bd/migracion_precio_positivo.sql`.
- **Un solo turno abierto**: índice único parcial `ux_turno_uno_abierto`.
- **Un número de cuenta por turno**: índice `ux_cuenta_turno_numero`. La base es
  dueña del número (`fn_siguiente_numero_cuenta` bajo `FOR UPDATE`).
- **Idempotencia**: `cuenta.client_tx_id` y `venta.client_tx_id` con índices
  únicos para reintentos tras cortes de red.
- **Stock teórico**: `conteo_inicial + stock_agregado − vendidos`, calculado en
  `v_stock_teorico`. El reabastecimiento no infla el conteo inicial.
- **Cierre de turno**: requiere conteo físico de todos los productos del turno,
  no acepta cuentas abiertas, y calcula
  `dinero_esperado = base + ventas_efectivo − retiros + entradas`.

## Arquitectura de escritura

La app no escribe tablas directamente. RLS tiene política de solo lectura
(`anon_lectura`) en todas las tablas, y los grants son `SELECT` en tablas +
`EXECUTE` en funciones. Toda mutación pasa por funciones `SECURITY DEFINER` en
`bd/schema.sql`:

- `fn_abrir_turno`, `fn_crear_cuenta`, `fn_crear_cuenta_automatica`,
  `fn_eliminar_cuenta_vacia`
- `fn_registrar_venta`, `fn_cobrar_cuenta`, `fn_movimiento_caja`,
  `fn_restar_item_cuenta`
- `fn_agregar_stock`, `fn_cerrar_turno`, `fn_crear_producto`

## Configuración de Supabase

Copiar `.env.example` a `.env.local` y completar:

```
VITE_SUPABASE_URL=tu-url-de-supabase
VITE_SUPABASE_ANON_KEY=tu-clave-anon
```

**Importante:** `process.env` pisa a `.env.local` en el `loadEnv` de Vite,
incluso con valor vacío. Las pruebas de Playwright no tocan `.env.local` ni el
Supabase real: usan dos servidores locales propios (puerto 4173 sin
configuración, 4174 con Supabase simulado).

## Migraciones en Supabase

Estado de las migraciones:

| Archivo | Estado |
|---|---|
| `bd/migracion_cuentas.sql` | aplicada |
| `bd/migracion_precio_positivo.sql` | aplicada |
| `bd/migracion_productos.sql` | aplicada |
| `bd/migracion_stock_agregado.sql` | **pendiente** |

La pendiente crea `stock_agregado` y actualiza `fn_agregar_stock`,
`fn_cerrar_turno` y `v_stock_teorico`. Es idempotente y trae autochequeo
(`raise notice` al finalizar).

## Decisiones de diseño relevantes

- **Zona horaria:** manejada del lado del cliente en `src/servicios/fechas.ts`
  (deriva el offset con `Intl.DateTimeFormat`), para no imponer una migración en
  SQL.
- **Rango de fechas semiabierto** `[desde, hasta)` en vez de `<= 23:59:59`, para
  no descartar ventas del último segundo.
- **Stock cero al crear producto:** un producto nuevo aparece AGOTADO hasta que
  se le cargue stock. Crear un producto no requiere turno abierto; darle stock
  sí.
- **Operador:** por decisión del negocio no se rastrea. No hay login ni pantalla
  de bienvenida. Los campos `etiqueta_operador`, `creada_por` y `creado_por`
  quedan vacíos.

## Licencia

Privado — uso interno del negocio.
