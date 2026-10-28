# Spec-Driven Development — Fritanga

> Cómo trabajar en este proyecto: primero la especificación, después el plan,
> después las tareas, y recién ahí el código. La spec es la fuente de verdad:
> si el código y la spec no coinciden, uno de los dos está mal y hay que
> corregirlo.

---

## 1. Para qué sirve

Este proyecto lo puede retomar otra persona (o un agente de IA) sin contexto
previo. En vez de adivinar leyendo el código, encuentra:

- **Qué** hace el sistema y **por qué** (especificaciones).
- **Cómo** está construido y con qué reglas (constitución y planes).
- **Qué** falta y en qué orden (tareas).

Sin esto, cada cambio arranca con una arqueología de código y decisiones
implícitas que se pierden. Con esto, el cambio arranca con una spec.

---

## 2. Flujo de trabajo

```
[1] Especificar  →  [2] Planificar  →  [3] Desglosar  →  [4] Implementar  →  [5] Verificar
    spec.md           plan.md            tareas.md        código + tests      diff + spec actualizada
```

### Paso 1 — Especificar (`spec.md`)

Describir **el comportamiento esperado**, no la implementación:

- Problema y motivación.
- Actor y flujo principal.
- Reglas de negocio y casos borde.
- Criterios de aceptación verificables.
- Fuera de alcance.

Usar [`plantillas/spec.md`](./plantillas/spec.md). Una spec por capacidad, no
una spec gigante. Si la feature toca varias capacidades, se escribe una spec
por cada una o una spec transversal justificada.

### Paso 2 — Planificar (`plan.md`)

Traducir la spec a decisiones técnicas:

- Archivos a tocar.
- Contratos SQL nuevos o modificados (firma, errores, permisos).
- Migración para bases existentes (idempotente).
- Impacto en datos y compatibilidad.
- Riesgos y cómo se mitigan.
- Pruebas a escribir.

Usar [`plantillas/plan.md`](./plantillas/plan.md). El plan no repite la spec:
explica **cómo** se cumple.

### Paso 3 — Desglosar (`tareas.md`)

Convertir el plan en tareas pequeñas y verificables. Cada tarea debe poder
commitearse sola y dejar el repo verde. Usar
[`plantillas/tareas.md`](./plantillas/tareas.md).

### Paso 4 — Implementar

- Respetar la [`constitucion.md`](./constitucion.md).
- Escribir primero la prueba cuando la regla vive en la base.
- Mantener la spec y el plan actualizados si aparece un hallazgo que cambia el
  alcance. Un cambio de alcance sin actualizar la spec es un bug de proceso.

### Paso 5 — Verificar

Antes de commitear:

```bash
npm test          # pruebas de base (PostgreSQL embebido)
npm run test:ui   # pruebas de interfaz (Playwright)
npm run build     # tsc -b && vite build
npm run lint      # oxlint
```

Después:

- Commit convencional en español, sin acentos, sin atribución de IA.
- **No pushear** hasta que el usuario lo pruebe y lo pida.
- Actualizar la spec si el comportamiento final difiere de lo especificado.

---

## 3. Estructura de esta carpeta

```
docs/sdd/
  README.md              Esta guía
  constitucion.md        Principios y reglas no negociables
  plantillas/
    spec.md              Plantilla de especificación
    plan.md              Plantilla de plan técnico
    tareas.md            Plantilla de desglose de tareas
  especificaciones/
    README.md            Índice y estado de cada capacidad
    00-vision.md         Alcance, actores, glosario, reglas transversales
    01-turnos.md
    02-ventas.md
    03-cuentas.md
    04-inventario.md
    05-cierre.md
    06-reportes.md
    07-productos.md
```

---

## 4. Reglas de convivencia entre spec y código

1. **La spec describe el comportamiento actual**, no un futuro ideal. Lo que
   todavía no existe va en "Fuera de alcance" o "Pendientes".
2. **Un cambio de comportamiento empieza por la spec.** Si no hay spec, se crea
   antes de tocar código.
3. **Las decisiones técnicas con tradeoff van al plan**, no se esconden en un
   commit.
4. **Los datos sensibles de la spec son los contratos**: firmas de RPC, errores,
   tablas y restricciones. Si cambia un contrato, cambia la spec.
5. **Cada spec tiene un estado**: `vigente`, `en progreso`, `borrador` o
   `obsoleta`. El índice lo refleja.

---

## 5. Cómo arrancar una feature nueva

1. Copiar `plantillas/spec.md` a `especificaciones/NN-nombre.md`.
2. Completar la spec y marcarla `borrador`.
3. Copiar `plantillas/plan.md` a `planes/NN-nombre.md` (crear la carpeta
   `planes/` la primera vez).
4. Copiar `plantillas/tareas.md` al mismo plan o a un archivo aparte.
5. Implementar tarea por tarea, dejando el repo verde.
6. Marcar la spec `vigente` y actualizar el índice.

---

## 6. Qué NO es SDD acá

- No es escribir documentos que nadie lee. Si una spec no se puede verificar,
  sobra.
- No es congelar el diseño para siempre. La spec se actualiza con el código.
- No es burocracia para un cambio de una línea: un typo o un label no necesitan
  spec nueva. El criterio es **cambio de comportamiento o de contrato**.
