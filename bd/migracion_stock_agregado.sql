-- ============================================================
-- Stock agregado (reabastecimiento) separado del conteo inicial
--
-- Hasta ahora fn_agregar_stock acumulaba sobre conteo_inicial, lo que
-- imposibilitaba reconstruir cuánto había realmente al abrir el turno.
-- Esta migración crea la tabla stock_agregado para registrar cada
-- reabastecimiento por separado y modifica fn_agregar_stock,
-- fn_cerrar_turno y v_stock_teorico para usarla.
--
-- Idempotente: se puede pegar las veces que haga falta.
-- ============================================================

create table if not exists stock_agregado (
  id bigint generated always as identity primary key,
  turno_id bigint not null references turno(id),
  producto_id bigint not null references producto(id),
  cantidad integer not null check (cantidad > 0),
  creado_el timestamptz not null default now(),
  creado_por text not null default ''
);

create index if not exists ix_stock_agregado_turno on stock_agregado (turno_id);
create index if not exists ix_stock_agregado_producto on stock_agregado (producto_id);

-- fn_agregar_stock: ahora registra en stock_agregado y calcula el total
-- disponible como conteo_inicial + todo lo agregado en el turno.
create or replace function fn_agregar_stock(
  p_producto_id bigint,
  p_cantidad integer,
  p_operador text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_turno_id bigint;
  v_nuevo_total integer;
begin
  if p_producto_id is null or p_producto_id <= 0 then
    raise exception 'PRODUCTO_INVALIDO: id inválido';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA: debe ser mayor que cero';
  end if;
  if not exists (select 1 from producto where id = p_producto_id) then
    raise exception 'PRODUCTO_NO_EXISTE';
  end if;

  -- bloqueo de concurrencia
  select id into v_turno_id
  from turno where estado = 'abierto'
  order by id limit 1 for update;
  if v_turno_id is null then
    raise exception 'TURNO_CERRADO: no hay turno abierto';
  end if;

  -- registrar el reabastecimiento en stock_agregado (no toca conteo_inicial)
  insert into stock_agregado (turno_id, producto_id, cantidad, creado_por)
  values (v_turno_id, p_producto_id, p_cantidad, coalesce(p_operador, ''));

  -- nuevo total disponible = conteo_inicial + todo lo agregado en el turno
  select coalesce(ci.cantidad, 0) + coalesce(sa.total_agregado, 0)
    into v_nuevo_total
    from conteo_inicial ci
    left join (
      select turno_id, producto_id, sum(cantidad) as total_agregado
      from stock_agregado
      where turno_id = v_turno_id and producto_id = p_producto_id
      group by turno_id, producto_id
    ) sa on sa.turno_id = ci.turno_id and sa.producto_id = ci.producto_id
   where ci.turno_id = v_turno_id and ci.producto_id = p_producto_id;

  return jsonb_build_object(
    'producto_id', p_producto_id,
    'cantidad_agregada', p_cantidad,
    'nuevo_total', v_nuevo_total
  );
end;
$fn$;

-- fn_cerrar_turno: el teórico ahora incluye el stock agregado
create or replace function fn_cerrar_turno(
  p_conteos_fisicos jsonb,
  p_efectivo_fisico_cop integer,
  p_notas text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_turno_id bigint;
  v_base integer;
  v_ventas_efectivo integer := 0;
  v_retiros integer := 0;
  v_entradas integer := 0;
  v_esperado integer;
  v_item record;
begin
  -- bloqueo de concurrencia (punto único de serialización)
  select id, base_inicial_cop
    into v_turno_id, v_base
    from turno where estado = 'abierto'
    order by id limit 1 for update;
  if v_turno_id is null then
    raise exception 'NO_HAY_TURNO_ABIERTO: no hay turno abierto para cerrar';
  end if;

  if p_conteos_fisicos is null or jsonb_array_length(p_conteos_fisicos) = 0 then
    raise exception 'CONTEO_INCOMPLETO: cuenta el inventario físico antes de cerrar';
  end if;

  if p_efectivo_fisico_cop is null or p_efectivo_fisico_cop < 0 then
    raise exception 'EFECTIVO_INVALIDO: cuenta el efectivo en caja antes de cerrar';
  end if;

  -- validar entradas del conteo físico
  for v_item in
    select (it->>'producto_id')::bigint as producto_id,
           (it->>'cantidad')::integer as cantidad
    from jsonb_array_elements(p_conteos_fisicos) as it
  loop
    if v_item.producto_id is null or v_item.cantidad is null or v_item.cantidad < 0 then
      raise exception 'CONTEO_INVALIDO: revisa el conteo físico';
    end if;
  end loop;

  -- todo producto con conteo inicial debe estar en el conteo físico
  if exists (
    select 1 from conteo_inicial ci
    where ci.turno_id = v_turno_id
      and not exists (
        select 1 from jsonb_array_elements(p_conteos_fisicos) it
        where (it->>'producto_id')::bigint = ci.producto_id
      )
  ) then
    raise exception 'CONTEO_INCOMPLETO: falta el conteo físico de algún producto del turno';
  end if;

  -- no cerrar con cuentas pendientes de cobro
  if exists (select 1 from cuenta
             where turno_id = v_turno_id and estado = 'abierta') then
    raise exception 'CUENTAS_ABIERTAS: cobra las cuentas pendientes antes de cerrar';
  end if;

  -- guardar teórico vs físico (mermas) por producto
  -- teorico = conteo_inicial + stock_agregado - vendidos
  insert into reconciliacion (turno_id, producto_id, teorico, fisico)
  select
    v_turno_id,
    ci.producto_id,
    coalesce(ci.cantidad, 0) + coalesce(sa.total_agregado, 0) - coalesce(vd.vendidos, 0),
    (select max((it->>'cantidad')::integer)
     from jsonb_array_elements(p_conteos_fisicos) it
     where (it->>'producto_id')::bigint = ci.producto_id)
  from conteo_inicial ci
  left join (
    select d.producto_id, sum(d.cantidad) as vendidos
    from detalle_venta d
    join venta v on v.id = d.venta_id
    where v.turno_id = v_turno_id
    group by d.producto_id
  ) vd on vd.producto_id = ci.producto_id
  left join (
    select turno_id, producto_id, sum(cantidad) as total_agregado
    from stock_agregado
    where turno_id = v_turno_id
    group by turno_id, producto_id
  ) sa on sa.turno_id = ci.turno_id and sa.producto_id = ci.producto_id
  where ci.turno_id = v_turno_id
  on conflict (turno_id, producto_id)
  do update set teorico = excluded.teorico, fisico = excluded.fisico;

  -- dinero esperado = base + ventas en efectivo - retiros + entradas
  select coalesce(sum(total_cop), 0) into v_ventas_efectivo
  from venta
  where turno_id = v_turno_id and tipo in ('mostrador','cobro_cuenta');

  select coalesce(sum(monto_cop), 0) into v_retiros
  from movimiento_caja
  where turno_id = v_turno_id and tipo = 'retiro';

  select coalesce(sum(monto_cop), 0) into v_entradas
  from movimiento_caja
  where turno_id = v_turno_id and tipo = 'entrada';

  v_esperado := v_base + v_ventas_efectivo - v_retiros + v_entradas;

  update turno
  set estado = 'cerrado',
      cerrado_el = now(),
      efectivo_fisico_cop = p_efectivo_fisico_cop,
      notas_cierre = coalesce(p_notas, '')
  where id = v_turno_id;

  return jsonb_build_object(
    'turno_id', v_turno_id,
    'dinero_esperado', v_esperado,
    'efectivo_fisico', p_efectivo_fisico_cop,
    'diferencia', p_efectivo_fisico_cop - v_esperado,
    'ventas_efectivo', v_ventas_efectivo,
    'retiros', v_retiros,
    'entradas', v_entradas,
    'mermas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'producto_id', r.producto_id,
        'nombre', p.nombre,
        'teorico', r.teorico,
        'fisico', r.fisico,
        'diferencia', r.diferencia
      ) order by p.orden), '[]'::jsonb)
      from reconciliacion r
      join producto p on p.id = r.producto_id
      where r.turno_id = v_turno_id
    )
  );
end;
$fn$;

-- v_stock_teorico: incluye la columna agregado y el teórico la considera
drop view if exists v_stock_teorico;
create view v_stock_teorico as
select
  t.id as turno_id,
  p.id as producto_id,
  p.nombre,
  p.precio_cop,
  p.orden,
  p.imagen_url,
  coalesce(ci.cantidad, 0) as inicial,
  coalesce(sa.total_agregado, 0) as agregado,
  coalesce(vd.vendidos, 0) as vendidos,
  coalesce(ci.cantidad, 0) + coalesce(sa.total_agregado, 0) - coalesce(vd.vendidos, 0) as teorico
from turno t
cross join producto p
left join conteo_inicial ci
  on ci.turno_id = t.id and ci.producto_id = p.id
left join (
  select turno_id, producto_id, sum(cantidad) as total_agregado
  from stock_agregado
  group by turno_id, producto_id
) sa on sa.turno_id = t.id and sa.producto_id = p.id
left join (
  select v.turno_id, d.producto_id, sum(d.cantidad) as vendidos
  from detalle_venta d
  join venta v on v.id = d.venta_id
  group by v.turno_id, d.producto_id
) vd on vd.turno_id = t.id and vd.producto_id = p.id
where t.estado = 'abierto' and p.activo;

-- Permisos (coherentes con el resto del esquema)
grant select on table stock_agregado to anon, authenticated;
alter default privileges in schema public grant select on tables to anon, authenticated;

-- Autochequeo
do $$
declare
  v_oid oid;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_agregar_stock';

  if v_oid is null then
    raise exception 'MIGRACION_FALLIDA: fn_agregar_stock no quedó creada';
  end if;

  if not has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'MIGRACION_FALLIDA: anon no puede ejecutar fn_agregar_stock';
  end if;

  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_cerrar_turno';

  if v_oid is null then
    raise exception 'MIGRACION_FALLIDA: fn_cerrar_turno no quedó creada';
  end if;

  raise notice 'Listo: stock_agregado creada y funciones actualizadas.';
end $$;
