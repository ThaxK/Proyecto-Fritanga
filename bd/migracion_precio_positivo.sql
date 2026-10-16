-- ============================================================
-- Precio de producto estrictamente positivo
--
-- "Nunca existe un producto de $0" era una suposición del negocio, no una
-- regla: el check permitía 0. Eso dejaba alcanzable una cuenta con ítems y
-- total $0, que no se puede cobrar (fn_cobrar_cuenta lanza CUENTA_VACIA)
-- ni eliminar (fn_eliminar_cuenta_vacia exige que no queden ítems).
--
-- Con el precio en > 0 esa cuenta es imposible de armar: cada línea de venta
-- tiene cantidad > 0 (detalle_venta) y precio_unit_cop copiado del producto.
--
-- Idempotente: se puede pegar las veces que haga falta.
-- ============================================================

do $$
declare
  v_productos text;
  v_cuentas text;
begin
  -- Chequeo previo: si ya hay productos en $0, el ALTER de abajo fallaría con
  -- un mensaje genérico que no dice CUÁL producto es el problema.
  select string_agg(format('%s (id %s)', nombre, id), ', ' order by orden)
    into v_productos
  from producto
  where precio_cop <= 0;

  if v_productos is not null then
    raise exception
      'PRODUCTO_CON_PRECIO_INVALIDO: corrige el precio de estos productos antes de continuar -> %',
      v_productos;
  end if;

  -- Cuentas que YA nacieron trabadas. Esta migración no las arregla (no se
  -- puede inventar un precio), pero conviene verlas: sin aviso quedan
  -- invisibles y además impiden cerrar el turno.
  select string_agg(format('cuenta %s (%s)', c.id, c.etiqueta), ', ')
    into v_cuentas
  from cuenta c
  where c.estado = 'abierta'
    and exists (select 1 from venta v where v.cuenta_id = c.id and v.tipo = 'cuenta')
    and coalesce((
      select sum(v.total_cop) from venta v
      where v.cuenta_id = c.id and v.tipo = 'cuenta'
    ), 0) <= 0;

  if v_cuentas is not null then
    raise notice
      'Aviso: estas cuentas abiertas tienen ítems y total $0, no se pueden cobrar ni eliminar -> %',
      v_cuentas;
  end if;
end $$;

-- Se conserva el nombre que Postgres le dio al check inline del esquema, así
-- la base queda idéntica viniendo del esquema nuevo o de esta migración.
alter table producto drop constraint if exists producto_precio_cop_check;
alter table producto add constraint producto_precio_cop_check check (precio_cop > 0);
