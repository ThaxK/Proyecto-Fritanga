# Tareas — [Nombre de la capacidad]

> Plan: [`../planes/NN-nombre.md`](../planes/NN-nombre.md)
> Cada tarea debe dejar el repo verde y poder commitearse sola.

---

## Convenciones

- `[ ]` pendiente · `[x]` hecha · `[~]` en curso · `[!]` bloqueada
- Una tarea = un cambio revisable. Si toca base + UI + tests, se parte.
- El mensaje de commit se anota al lado cuando se completa.

---

## Tareas

### Base de datos

- [ ] Crear/modificar tabla, restricción o índice.
      Commit: `feat(bd): …`
- [ ] Crear/modificar la RPC con validaciones y errores.
      Commit: `feat(bd): …`
- [ ] Crear la migración idempotente con autochequeo.
      Commit: `feat(bd): …`
- [ ] Registrar la migración en `ARCHIVOS_ESQUEMA` (`bd/pruebas/postgres.ts`).

### Pruebas de base

- [ ] Caso feliz.
- [ ] Validaciones de entrada.
- [ ] Casos borde (concurrencia, idempotencia, turno cerrado).
- [ ] Migración sobre base existente.

### Frontend

- [ ] Servicio o helper de datos.
- [ ] Componente o pantalla.
- [ ] Integración en el ruteo (`App.tsx`) si aplica.
- [ ] Estados de carga, error y vacío.

### Pruebas de interfaz

- [ ] Extender el mock (`e2e/apoyo/supabase-falso.ts`).
- [ ] Flujo principal.
- [ ] Error visible.

### Cierre

- [ ] `npm test` verde.
- [ ] `npm run test:ui` verde.
- [ ] `npm run build` limpio.
- [ ] `npm run lint` sin errores nuevos.
- [ ] Spec actualizada y marcada `vigente`.
- [ ] Índice de especificaciones actualizado.
- [ ] Commit(s) convencionales en español, sin acentos.
- [ ] **Push solo con aprobación del usuario.**
