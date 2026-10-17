-- ============================================================
-- Alta de productos: fn_crear_producto
--
-- Hasta ahora el catálogo sólo se podía cargar con el INSERT del esquema.
-- Esta migración agrega la función que da de alta un producto desde la app.
--
-- Por qué una función y no un INSERT directo: la tabla producto tiene RLS con
-- política de sólo lectura, y anon/authenticated sólo tienen SELECT sobre las
-- tablas. La escritura pasa por una función SECURITY DEFINER, como el resto.
--
-- A diferencia de fn_agregar_stock, esta NO exige turno abierto: dar de alta un
-- producto es independiente del turno. Darle stock sí lo exige.
--
-- Idempotente: create or replace con la misma firma, se puede pegar las veces
-- que haga falta. Ojo: si algún día cambia la firma, esto crea una SOBRECARGA
-- en vez de reemplazar, y hay que borrar la versión vieja a mano.
-- ============================================================

create or replace function fn_crear_producto(
  p_nombre text,
  p_precio_cop integer,
  p_imagen_url text default ''
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id bigint;
  v_orden integer;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'NOMBRE_VACIO: escribe el nombre del producto';
  end if;
  if p_precio_cop is null or p_precio_cop <= 0 then
    raise exception 'PRECIO_INVALIDO: el precio debe ser mayor que cero';
  end if;

  -- el producto nuevo va al final del orden del catálogo
  select coalesce(max(orden), 0) + 1 into v_orden from producto;

  insert into producto (nombre, precio_cop, orden, imagen_url)
  values (btrim(p_nombre), p_precio_cop, v_orden, coalesce(btrim(p_imagen_url), ''))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    -- El único índice unique de producto es ux_producto_nombre_activo,
    -- así que por acá sólo puede venir un nombre repetido.
    raise exception 'PRODUCTO_YA_EXISTE: ya hay un producto activo con ese nombre';
end;
$fn$;

-- Permiso explícito. En Postgres las funciones nacen con EXECUTE otorgado a
-- PUBLIC, y Supabase además se lo da a anon/authenticated para las funciones
-- que crea el rol postgres en public. En el caso normal esto es REDUNDANTE.
-- Va igual porque basta con que alguien haya endurecido esos defaults
-- (revoke execute on functions from public) para que la app falle con
-- "permission denied for function" recién al abrir la pantalla de productos.
grant execute on function fn_crear_producto(text, integer, text) to anon, authenticated;

-- Autochequeo, para que la salida diga si la migración quedó aplicada de verdad
-- en vez de dejarlo a la vista.
do $$
declare
  v_oid oid;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_crear_producto';

  if v_oid is null then
    raise exception 'MIGRACION_FALLIDA: fn_crear_producto no quedó creada';
  end if;

  if not has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'MIGRACION_FALLIDA: anon no puede ejecutar fn_crear_producto';
  end if;

  raise notice 'Listo: fn_crear_producto creada y ejecutable por anon y authenticated.';
end $$;
