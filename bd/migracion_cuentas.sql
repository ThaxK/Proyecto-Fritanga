-- Migración: numeración y eliminación de cuentas
-- Ejecutar en Supabase SQL Editor sobre la base ya existente.
-- Se puede re-ejecutar sin dañar datos.
--
-- Motivo 1 — numeración:
-- La app armaba el nombre "Cuenta N" con un conteo de cuentas abiertas en el
-- cliente. Al eliminar una cuenta vacía, el conteo bajaba y el nombre propuesto
-- volvía a coincidir con una cuenta abierta de otro cliente; como
-- fn_crear_cuenta reutiliza la cuenta abierta que tenga la misma etiqueta, los
-- ítems terminaban cargándose en la cuenta equivocada.
-- Ahora el número de cuenta es una columna de la base, asignada dentro del
-- bloqueo del turno: es la identidad de la cuenta, y la etiqueta es sólo cómo
-- se muestra.
--
-- Motivo 2 — eliminación:
-- fn_restar_item_cuenta sólo elimina una cuenta cuando le queda algún ítem que
-- restar, así que una cuenta creada por error y nunca usada quedaba abierta
-- para siempre. fn_cerrar_turno la rechaza con CUENTAS_ABIERTAS y no había
-- ninguna acción en la UI para sacarla: el turno quedaba imposible de cerrar.
-- Se agrega fn_eliminar_cuenta_vacia.

-- ============================================================
-- 1. Columna numero
-- ============================================================

alter table cuenta add column if not exists numero integer;

-- Numerar las cuentas existentes por turno, en orden de creación.
with numeradas as (
  select id,
         row_number() over (partition by turno_id order by creada_el, id) as n
  from cuenta
  where numero is null
)
update cuenta c
set numero = n.n
from numeradas n
where c.id = n.id;

alter table cuenta alter column numero set not null;

-- ============================================================
-- 2. Índices
-- ============================================================

-- Un solo número por turno: es la identidad real de la cuenta
create unique index if not exists ux_cuenta_turno_numero
  on cuenta (turno_id, numero);

-- Idempotencia de la creación de cuentas (un reintento de red no abre otra)
alter table cuenta add column if not exists client_tx_id uuid;

create unique index if not exists ux_cuenta_client_tx
  on cuenta (client_tx_id) where client_tx_id is not null;

-- ============================================================
-- 3. Funciones
-- ============================================================

-- Siguiente número de cuenta del turno.
-- DEBE llamarse con la fila del turno ya bloqueada (FOR UPDATE): es el punto
-- único de serialización, así que dos creaciones simultáneas no pueden obtener
-- el mismo número. Como el número elegido siempre supera al máximo existente,
-- nunca choca con otro número; y si una cuenta se eliminó por quedar vacía, su
-- número queda libre y se puede reutilizar sin riesgo.
create or replace function fn_siguiente_numero_cuenta(p_turno_id bigint)
returns integer
language sql
security definer
set search_path = public
as $fn$
  select coalesce(max(numero), 0) + 1
  from cuenta
  where turno_id = p_turno_id;
$fn$;

-- fn_crear_cuenta pasa a asignar número (mantiene la etiqueta libre y la
-- reutilización de la cuenta abierta con la misma etiqueta).
create or replace function fn_crear_cuenta(
  p_etiqueta text,
  p_operador text default ''
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_turno_id bigint;
  v_cuenta_id bigint;
  v_numero integer;
begin
  if p_etiqueta is null or btrim(p_etiqueta) = '' then
    raise exception 'ETIQUETA_VACIA: escribe un nombre para la cuenta (ej. Mesa 1)';
  end if;

  -- bloqueo de concurrencia (punto único de serialización)
  select id into v_turno_id
  from turno where estado = 'abierto'
  order by id limit 1 for update;
  if v_turno_id is null then
    raise exception 'TURNO_CERRADO: abre un turno antes de crear cuentas';
  end if;

  -- si ya existe una cuenta abierta con la misma etiqueta, devolverla
  select id into v_cuenta_id
  from cuenta
  where turno_id = v_turno_id and estado = 'abierta'
    and lower(etiqueta) = lower(btrim(p_etiqueta));

  if v_cuenta_id is not null then
    return v_cuenta_id;
  end if;

  v_numero := fn_siguiente_numero_cuenta(v_turno_id);

  begin
    insert into cuenta (turno_id, numero, etiqueta, creada_por)
    values (v_turno_id, v_numero, btrim(p_etiqueta), coalesce(p_operador, ''))
    returning id into v_cuenta_id;
  exception when unique_violation then
    select id into v_cuenta_id
    from cuenta
    where turno_id = v_turno_id and estado = 'abierta'
      and lower(etiqueta) = lower(btrim(p_etiqueta));
    if v_cuenta_id is null then
      raise exception 'CUENTA_YA_ABIERTA: ya existe una cuenta con ese nombre';
    end if;
  end;

  return v_cuenta_id;
end;
$fn$;

-- Cuenta con nombre automático "Cuenta N" (lo que usa el botón "Nueva cuenta").
create or replace function fn_crear_cuenta_automatica(
  p_client_tx_id uuid default null,
  p_operador text default ''
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_turno_id bigint;
  v_cuenta_id bigint;
  v_numero integer;
  v_etiqueta text;
begin
  if p_client_tx_id is not null then
    select id into v_cuenta_id from cuenta where client_tx_id = p_client_tx_id;
    if found then
      return v_cuenta_id;
    end if;
  end if;

  -- bloqueo de concurrencia (punto único de serialización)
  select id into v_turno_id
  from turno where estado = 'abierto'
  order by id limit 1 for update;
  if v_turno_id is null then
    raise exception 'TURNO_CERRADO: abre un turno antes de crear cuentas';
  end if;

  v_numero := fn_siguiente_numero_cuenta(v_turno_id);

  -- Un número por encima del máximo del turno siempre está libre; si además la
  -- etiqueta "Cuenta N" está tomada por una cuenta con nombre manual, se sigue
  -- subiendo (subir el número nunca puede chocar con otro número).
  loop
    v_etiqueta := 'Cuenta ' || v_numero;
    exit when not exists (
      select 1 from cuenta
      where turno_id = v_turno_id
        and estado = 'abierta'
        and lower(etiqueta) = lower(v_etiqueta)
    );
    v_numero := v_numero + 1;
  end loop;

  begin
    insert into cuenta (turno_id, numero, etiqueta, creada_por, client_tx_id)
    values (v_turno_id, v_numero, v_etiqueta, coalesce(p_operador, ''), p_client_tx_id)
    returning id into v_cuenta_id;
  exception when unique_violation then
    -- carrera con el mismo client_tx_id: devolver la cuenta ya creada
    if p_client_tx_id is not null then
      select id into v_cuenta_id from cuenta where client_tx_id = p_client_tx_id;
      if found then
        return v_cuenta_id;
      end if;
    end if;
    raise;
  end;

  return v_cuenta_id;
end;
$fn$;

-- Eliminar una cuenta abierta que todavía no tiene ventas.
-- Sin esto, un toque de más en "Nueva cuenta" deja una cuenta vacía que no se
-- puede sacar, y fn_cerrar_turno rechaza el cierre con CUENTAS_ABIERTAS.
create or replace function fn_eliminar_cuenta_vacia(p_cuenta_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_turno_id bigint;
begin
  -- bloqueo de concurrencia (mismo punto único de serialización)
  select id into v_turno_id
  from turno where estado = 'abierto'
  order by id limit 1 for update;
  if v_turno_id is null then
    raise exception 'TURNO_CERRADO: no hay turno abierto';
  end if;

  perform 1 from cuenta
  where id = p_cuenta_id and turno_id = v_turno_id and estado = 'abierta';
  if not found then
    raise exception 'CUENTA_CERRADA: la cuenta no está abierta';
  end if;

  -- mismo criterio de "vacía" que fn_restar_item_cuenta
  if exists (select 1 from venta where cuenta_id = p_cuenta_id) then
    raise exception 'CUENTA_CON_ITEMS: vacía la cuenta antes de eliminarla';
  end if;

  delete from cuenta where id = p_cuenta_id;
end;
$fn$;
