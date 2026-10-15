-- Migración: eliminar cuenta automáticamente cuando queda sin items
-- Ejecutar en Supabase SQL Editor sobre la base ya existente.
-- (create or replace con la misma firma = seguro de re-ejecutar)

create or replace function fn_restar_item_cuenta(
  p_cuenta_id bigint,
  p_producto_id bigint,
  p_cantidad integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_turno_id bigint;
  v_restante integer := p_cantidad;
  v_detalle record;
  v_total_cuenta integer;
  v_cuenta_eliminada boolean := false;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA: la cantidad a restar debe ser mayor a 0';
  end if;

  -- bloqueo de concurrencia
  select id into v_turno_id
  from turno where estado = 'abierto'
  order by id limit 1 for update;
  if v_turno_id is null then
    raise exception 'TURNO_CERRADO';
  end if;

  -- verificar que la cuenta está abierta
  perform 1 from cuenta
  where id = p_cuenta_id and turno_id = v_turno_id and estado = 'abierta';
  if not found then
    raise exception 'CUENTA_CERRADA: la cuenta no está abierta';
  end if;

  -- restar desde las ventas más recientes
  for v_detalle in
    select d.id as detalle_id, d.cantidad, d.venta_id
    from detalle_venta d
    join venta v on v.id = d.venta_id
    where v.cuenta_id = p_cuenta_id
      and v.tipo = 'cuenta'
      and d.producto_id = p_producto_id
    order by d.venta_id desc
  loop
    exit when v_restante <= 0;

    if v_detalle.cantidad <= v_restante then
      v_restante := v_restante - v_detalle.cantidad;
      delete from detalle_venta where id = v_detalle.detalle_id;
    else
      update detalle_venta set cantidad = cantidad - v_restante
      where id = v_detalle.detalle_id;
      v_restante := 0;
    end if;

    -- recalcular total de la venta afectada
    update venta set total_cop = coalesce((
      select sum(subtotal_cop) from detalle_venta where venta_id = v_detalle.venta_id
    ), 0)
    where id = v_detalle.venta_id;
  end loop;

  if v_restante > 0 then
    raise exception 'NO_SE_PUEDE_RESTAR: solo hay % disponibles', (p_cantidad - v_restante);
  end if;

  -- eliminar ventas que quedaron sin detalles
  delete from venta
  where cuenta_id = p_cuenta_id and tipo = 'cuenta'
    and not exists (select 1 from detalle_venta d where d.venta_id = venta.id);

  -- total actualizado de la cuenta
  select coalesce(sum(total_cop), 0) into v_total_cuenta
  from venta where cuenta_id = p_cuenta_id and tipo = 'cuenta';

  -- si la cuenta quedó sin items, eliminarla
  -- (las ventas tipo 'cuenta' vacías ya se eliminaron arriba; ninguna otra
  --  la referencia mientras esté abierta, así que la FK de venta se respeta)
  v_cuenta_eliminada := not exists (
    select 1 from venta v where v.cuenta_id = p_cuenta_id
  );
  if v_cuenta_eliminada then
    delete from cuenta where id = p_cuenta_id;
  end if;

  return jsonb_build_object(
    'total_cuenta', v_total_cuenta,
    'cuenta_eliminada', v_cuenta_eliminada
  );
end;
$fn$;
