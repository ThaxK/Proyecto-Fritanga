# Spec — [Nombre de la capacidad]

> Estado: `borrador` | `vigente` | `en progreso` | `obsoleta`
> Última actualización: AAAA-MM-DD
> Capacidad: (ventas / cuentas / inventario / cierre / reportes / productos / turnos)

---

## 1. Problema y motivación

¿Qué dolor resuelve? ¿Qué pasa hoy si no existe? Una o dos frases, sin
tecnicismos.

---

## 2. Actor y flujo principal

**Actor:** (operador de mostrador / responsable de cierre / dueño del negocio)

**Flujo:**

1. El actor…
2. El sistema…
3. …

---

## 3. Reglas de negocio

Listar reglas verificables. Cada regla debe poder convertirse en una prueba.

1. …
2. …

### Casos borde

- ¿Qué pasa si el valor es cero, negativo o vacío?
- ¿Qué pasa si dos dispositivos hacen lo mismo a la vez?
- ¿Qué pasa si se reintenta por un corte de red?
- ¿Qué pasa si no hay turno abierto?
- ¿Qué pasa con datos históricos?

---

## 4. Criterios de aceptación

Cada uno debe ser observable y comprobable.

- [ ] Dado …, cuando …, entonces …
- [ ] Dado …, cuando …, entonces …

---

## 5. Contratos afectados

| Objeto | Tipo | Cambio |
|---|---|---|
| `fn_…` | RPC | Nueva / modificada |
| `tabla` | Tabla | Nueva columna / restricción |
| `v_…` | Vista | Nuevo campo |

### Errores esperados

| Código | Cuándo |
|---|---|
| `CODIGO: mensaje` | … |

---

## 6. Impacto en datos

- ¿Requiere migración? Sí / No
- ¿Es idempotente? Sí / No
- ¿Afecta filas existentes? Sí / No — cómo
- ¿Rompe compatibilidad con el frontend actual? Sí / No

---

## 7. Fuera de alcance

Lo que esta spec **no** cubre, para que no se cuele en la implementación.

- …

---

## 8. Pendientes conocidos

Problemas o huecos que se detectaron pero no se resuelven en esta entrega.

- …
