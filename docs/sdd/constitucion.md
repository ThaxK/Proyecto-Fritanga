# Constitución del proyecto — Fritanga

> Documento raíz de Spec-Driven Development. Toda spec, plan y decisión debe
> respetar estos principios. Si una propuesta los contradice, se discute acá
> antes de escribir código.
>
> Última actualización: 2026-10-27

---

## 1. Misión

Punto de venta para una fritanga en Cali, Colombia. Un operador en mostrador,
hasta 3 dispositivos sincronizados, costo mensual $0. La prioridad es que
**vender sea rápido** y que **el cuadre de caja y el inventario sean exactos**.

---

## 2. Principios de arquitectura (no negociables)

1. **La base de datos es la fuente de verdad.** El frontend no calcula reglas
   de negocio críticas: las pide o las dispara.
2. **La escritura pasa solo por RPC `SECURITY DEFINER`.** Las tablas tienen RLS
   con política de solo lectura para `anon`. Si una feature necesita escribir,
   necesita una función SQL nueva, no un `insert` desde el cliente.
3. **El stock teórico se deriva, no se almacena.** Se calcula como
   `conteo_inicial + stock_agregado − vendidos`. Nunca hay un contador mutable
   de stock que se pueda desincronizar.
4. **La concurrencia se resuelve con `SELECT … FOR UPDATE` sobre el turno
   abierto.** Es el punto único de serialización. Toda RPC que muta estado lo
   toma primero.
5. **Idempotencia obligatoria en operaciones de venta.** `venta.client_tx_id` y
   `cuenta.client_tx_id` son únicos: un reintento de red no duplica nada.
6. **Zona horaria del negocio en el cliente.** `America/Bogota` se resuelve en
   `src/servicios/fechas.ts` con `Intl.DateTimeFormat`. Los rangos de fecha son
   semiabiertos `[desde, hasta)`. No se filtran fechas con `<= 23:59:59`.
7. **Dinero en enteros COP.** Sin decimales ni flotantes. Los subtotales son
   columnas generadas, no cálculos del frontend.

---

## 3. Reglas de dominio (no negociables)

1. **`producto.precio_cop > 0`.** No existe producto de $0. La regla está en un
   `CHECK` de la base y también en `fn_crear_producto`.
2. **Un solo turno abierto.** Índice único parcial `ux_turno_uno_abierto`.
3. **Un número de cuenta por turno.** La base asigna `cuenta.numero` bajo
   bloqueo; el cliente nunca lo deriva de un conteo.
4. **Una sola cuenta abierta por etiqueta y turno.** Índice único parcial sobre
   `lower(etiqueta)`.
5. **Nada se borra del histórico.** Las ventas y turnos no se eliminan. Un
   producto se desactiva (`activo = false`), no se borra.
6. **El cierre exige el conteo físico de todos los productos del turno** y no
   admite cuentas abiertas.
7. **`tipo = 'cobro_cuenta'` no lleva ítems propios.** Los ítems viven en las
   ventas tipo `cuenta` de esa cuenta. Cualquier pantalla que muestre detalle
   debe resolver esa diferencia.
8. **Un producto nuevo nace sin stock.** Aparece AGOTADO hasta que se le cargue
   un conteo con `fn_agregar_stock`.

---

## 4. Decisiones de negocio (explícitas)

1. **No se rastrea el operador.** No hay login ni pantalla de bienvenida. Los
   campos `etiqueta_operador`, `creada_por` y `creado_por` existen pero quedan
   vacíos. No agregar esa funcionalidad sin una decisión de negocio nueva.
2. **El reabastecimiento se paga fuera del cajón.** Por eso `fn_movimiento_caja`
   no tiene UI: no se registran retiros por compra de mercancía. Si algún día se
   paga del cajón, hay que agregar la UI y registrar el retiro.
3. **El catálogo lo administra el negocio desde la app** (`fn_crear_producto`).
   Editar y desactivar productos es un incremento pendiente, no un olvido.

---

## 5. Reglas de ingeniería

1. **TypeScript estricto.** `npm run build` (`tsc -b && vite build`) debe pasar.
2. **Toda regla de negocio nueva en SQL lleva pruebas de base** en `bd/pruebas/`
   con el harness de PostgreSQL embebido (`levantarBaseDeDatos`).
3. **Toda pantalla nueva o flujo de UI crítico lleva prueba de Playwright** en
   `e2e/`. El mock de Supabase debe contemplar la tabla o RPC usada; si no,
   devuelve 500 a propósito.
4. **Antes de commitear:** `npm test`, `npm run test:ui`, `npm run build`,
   `npm run lint`. Sin errores nuevos de lint (los warnings preexistentes se
   toleran).
5. **Commits convencionales en español, sin acentos**, sin atribución de IA
   (`Co-Authored-By` prohibido). Un commit por unidad de trabajo revisable.
6. **No hacer `git push` sin aprobación explícita del usuario.** Se puede
   commitear localmente, pero el push lo decide quien prueba.
7. **Artefactos en español.** El proyecto documenta, nombra pantallas y escribe
   mensajes de error en español. Los identificadores de código y tipos siguen
   las convenciones de TypeScript/SQL en inglés cuando corresponde.

---

## 6. Stack y límites

| Capa | Tecnología | Nota |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind v4 | SPA estática, mobile-first |
| Backend | Supabase (PostgreSQL 18) | Sin backend propio |
| Lógica | Funciones PL/pgSQL `SECURITY DEFINER` | Única vía de escritura |
| Pruebas de base | Vitest + `embedded-postgres` | PostgreSQL real, no mocks |
| Pruebas de UI | Playwright | Dos servidores: sin config / con Supabase simulado |
| Lint | oxlint | |

**Fuera de alcance:** facturación electrónica DIAN, multi-sede, crédito,
modo offline, apps nativas, roles/permisos finos.

---

## 7. Documentos de referencia

- [`analisis-arquitectura.md`](../analisis-arquitectura.md) — arquitectura y
  decisiones originales (revisar contra el código: algunas secciones quedaron
  desactualizadas).
- [`mer-tecnico.md`](../mer-tecnico.md) — modelo de datos. **Ojo:** no incluye
  todavía `stock_agregado`, `producto.imagen_url`, `cuenta.numero`,
  `cuenta.creada_por` ni `cuenta.client_tx_id`.
- [`mer-visual.md`](../mer-visual.md) — explicación para el dueño del negocio.
- [`README.md`](../../README.md) — instalación, comandos y estado del proyecto.
