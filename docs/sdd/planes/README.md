# Planes técnicos

> Un plan por feature, escrito **después** de la spec y **antes** del código.

## Convención

- Un archivo por feature: `NN-nombre.md`, con el mismo `NN` que la spec.
- Usar la plantilla [`../plantillas/plan.md`](../plantillas/plan.md).
- El plan explica **cómo** se cumple la spec: archivos, contratos SQL,
  migraciones, riesgos y pruebas.
- Cuando la feature se implementa, el plan se marca `implementado` y se deja
  como registro de la decisión.

## Planes actuales

Todavía no hay planes formales: las capacidades existentes se implementaron antes
de adoptar SDD. Sus specs están en
[`../especificaciones/`](../especificaciones/README.md) y describen el estado
actual. Los próximos cambios sí deben tener plan.
