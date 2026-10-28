# Plan técnico — [Nombre de la capacidad]

> Spec: [`../especificaciones/NN-nombre.md`](../especificaciones/NN-nombre.md)
> Estado: `borrador` | `aprobado` | `implementado`
> Última actualización: AAAA-MM-DD

---

## 1. Resumen de la solución

En dos o tres frases: qué se construye y por qué así.

---

## 2. Archivos afectados

| Archivo | Tipo | Cambio |
|---|---|---|
| `bd/schema.sql` | SQL | Tabla / función / vista |
| `bd/migracion_….sql` | SQL | Migración para bases existentes |
| `src/paginas/….tsx` | UI | Pantalla |
| `src/componentes/….tsx` | UI | Componente compartido |
| `src/servicios/….ts` | TS | Servicio |
| `bd/pruebas/….int.test.ts` | Test | Pruebas de base |
| `e2e/….spec.ts` | Test | Pruebas de interfaz |

---

## 3. Contratos SQL

### Función nueva o modificada

```sql
create or replace function fn_nombre(
  p_parametro tipo
) returns tipo
language plpgsql
security definer
set search_path = public
as $fn$
  -- validaciones y efectos
$fn$;
```

- **Validaciones:** …
- **Errores:** …
- **Permisos:** `grant execute on function … to anon, authenticated;`
- **Bloqueo:** ¿toma `FOR UPDATE` del turno abierto? Sí / No — por qué.

### Tabla o vista

```sql
create table if not exists nombre ( … );
create index if not exists ix_nombre on nombre (columna);
```

---

## 4. Migración para bases existentes

- Archivo: `bd/migracion_….sql`
- ¿Idempotente? Sí / No
- ¿Tiene autochequeo (`raise notice` / `raise exception`)? Sí / No
- ¿Se agrega a `ARCHIVOS_ESQUEMA` en `bd/pruebas/postgres.ts`? Sí / No

---

## 5. Impacto en el frontend

- Pantallas nuevas o modificadas.
- Estados nuevos (`cargando`, `error`, paginación, filtros).
- ¿Requiere realtime? ¿En qué tablas?
- ¿Requiere leer una vista nueva?

---

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| … | … | … |

---

## 7. Pruebas

### Base (`bd/pruebas/`)

- [ ] Caso feliz.
- [ ] Validación de entrada.
- [ ] Caso borde (concurrencia, idempotencia, turno cerrado).
- [ ] Migración aplicada sobre base existente.

### Interfaz (`e2e/`)

- [ ] Flujo principal.
- [ ] Error visible para el usuario.
- [ ] Mock de Supabase actualizado para la tabla/RPC nueva.

---

## 8. Orden de implementación

1. …
2. …
3. …

Cada paso debe dejar el repo verde y ser commiteable solo.
