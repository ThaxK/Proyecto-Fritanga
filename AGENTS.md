# AGENTS.md — Cómo trabajar en Proyecto-Fritanga

> Este archivo es el punto de entrada para cualquier persona o agente de IA que
> retome el proyecto. Leer en este orden:
>
> 1. [`docs/sdd/constitucion.md`](./docs/sdd/constitucion.md) — reglas no negociables.
> 2. [`docs/sdd/README.md`](./docs/sdd/README.md) — flujo Spec-Driven Development.
> 3. [`docs/sdd/especificaciones/README.md`](./docs/sdd/especificaciones/README.md) — qué existe y qué falta.
> 4. [`README.md`](./README.md) — comandos e instalación.

---

## 1. Antes de tocar código

1. **Buscá la spec de la capacidad** en `docs/sdd/especificaciones/`. Si no
   existe, escribila antes de implementar.
2. **Si el cambio es de comportamiento o de contrato**, la spec se actualiza en
   el mismo cambio. Si es un typo o un label, no hace falta.
3. **Si el cambio toca la base**, leé la sección de SQL de la constitución:
   escritura solo por RPC `SECURITY DEFINER`, stock derivado, idempotencia,
   `FOR UPDATE` sobre el turno abierto.

---

## 2. Reglas duras (resumen)

- La app **no escribe tablas**: llama RPCs.
- El stock es `conteo_inicial + stock_agregado − vendidos`. Nunca un contador.
- Dinero en enteros COP. Fechas de negocio en `America/Bogota`, rangos
  semiabiertos `[desde, hasta)`.
- `precio_cop > 0`. Un solo turno abierto. Nada se borra del histórico.
- **No se rastrea el operador** (decisión de negocio).
- **No hacer `git push` sin aprobación explícita del usuario.**
- Commits convencionales en español, sin acentos, sin atribución de IA.

---

## 3. Comandos

En Windows/PowerShell la execution policy bloquea `.ps1`; usar `cmd /c`.

```bash
cmd /c "npm run dev"        # servidor de desarrollo
cmd /c "npm test"           # pruebas de base (PostgreSQL embebido)
cmd /c "npm run test:ui"    # pruebas de interfaz (Playwright)
cmd /c "npm run build"      # tsc -b && vite build
cmd /c "npm run lint"       # oxlint
```

Antes de commitear, los cuatro deben pasar. Los warnings de lint preexistentes se
toleran; los errores nuevos no.

---

## 4. Dónde está cada cosa

| Querés tocar… | Archivo |
|---|---|
| Esquema, RPCs, vistas | `bd/schema.sql` |
| Migración para una base existente | `bd/migracion_*.sql` |
| Pruebas de base | `bd/pruebas/*.int.test.ts` |
| Ruteo y estado del turno | `src/App.tsx` |
| Pantallas | `src/paginas/*.tsx` |
| Componentes compartidos | `src/componentes/*.tsx` |
| Zona horaria y fechas | `src/servicios/fechas.ts` |
| Agregados del calendario | `src/servicios/reportes.ts` |
| Pruebas de UI | `e2e/*.spec.ts` |
| Mock de Supabase | `e2e/apoyo/supabase-falso.ts` |

Las migraciones se registran en `ARCHIVOS_ESQUEMA` de
`bd/pruebas/postgres.ts` para que el harness las aplique.

---

## 5. Flujo para una feature nueva

1. Copiar `docs/sdd/plantillas/spec.md` a
   `docs/sdd/especificaciones/NN-nombre.md` y completarla.
2. Copiar `docs/sdd/plantillas/plan.md` a `docs/sdd/planes/NN-nombre.md`.
3. Copiar `docs/sdd/plantillas/tareas.md` y desglosar.
4. Implementar en pasos que dejen el repo verde.
5. Agregar pruebas de base y de UI.
6. Actualizar la spec, marcarla `vigente` y actualizar el índice.
7. Commit(s) convencionales. **Push solo con aprobación.**

---

## 6. Trampas conocidas

- `v_stock_teorico` devuelve **cero filas** sin turno abierto.
- Una venta `cobro_cuenta` **no tiene `detalle_venta`**; los ítems están en las
  ventas tipo `cuenta`.
- PostgREST **no devuelve `producto_id`** en un join `producto:producto_id
  (nombre)`; agrupar por nombre, no por id.
- El mock de Supabase devuelve **500** si no contempla una tabla o RPC.
- `process.env` pisa a `.env.local` en Vite, incluso con valor vacío. Las pruebas
  de UI no tocan el Supabase real.
- `embedded-postgres` en Windows a veces falla con `Unknown Error: undefined`;
  volver a correr `npm test` suele resolverlo.
