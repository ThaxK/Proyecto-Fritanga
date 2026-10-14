-- ============================================================
-- Fritanga — Esquema de base de datos (PostgreSQL / Supabase)
-- Idioma: español · Se puede re-ejecutar sin dañar datos
-- ============================================================
-- CÓMO USARLO:
--   1. Crea un proyecto gratuito en https://supabase.com
--   2. Abre SQL Editor → New query → pega todo este archivo → Run
--   3. Verifica en Table Editor: deben aparecer las 9 tablas
--      y en el catálogo los 6 productos con precios de ejemplo
--
-- CONVENCIÓN DE ERRORES: las funciones lanzan mensajes en español
--   iniciados con un código (ej. TURNO_YA_ABIERTO) que la app
--   puede mostrar tal cual al usuario.
--
-- CONCURRENCIA (RF2): toda mutación bloquea primero la fila del
--   turno abierto (SELECT ... FOR UPDATE). Ese único punto de
--   serialización garantiza que 2 dispositivos no vendan la
--   última unidad al mismo tiempo, sin riesgo de deadlocks.
-- ============================================================


-- ============================================================
-- 1. TABLAS
-- ============================================================

create table if not exists ajustes (
  id smallint primary key check (id = 1),
  base_inicial_defecto_cop integer not null default 70000
    check (base_inicial_defecto_cop >= 0),
  zona_horaria text not null default 'America/Bogota'
);

create table if not exists producto (
  id bigint generated always as identity primary key,
  nombre text not null,
  precio_cop integer not null check (precio_cop >= 0),
  orden integer not null default 0,
  activo boolean not null default true,
  imagen_url text not null default ''
);

create table if not exists turno (
  id bigint generated always as identity primary key,
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  abierto_el timestamptz not null default now(),
  cerrado_el timestamptz check (cerrado_el is null or cerrado_el >= abierto_el),
  base_inicial_cop integer not null check (base_inicial_cop >= 0),
  etiqueta_operador text not null default '',
  efectivo_fisico_cop integer
    check (efectivo_fisico_cop is null or efectivo_fisico_cop >= 0),
  notas_cierre text not null default ''
);

create table if not exists conteo_inicial (
  id bigint generated always as identity primary key,
  turno_id bigint not null references turno(id),
  producto_id bigint not null references producto(id),
  cantidad integer not null check (cantidad >= 0),
  unique (turno_id, producto_id)
);

create table if not exists cuenta (
  id bigint generated always as identity primary key,
  turno_id bigint not null references turno(id),
  etiqueta text not null check (btrim(etiqueta) <> ''),
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  creada_el timestamptz not null default now(),
  cerrada_el timestamptz,
  creada_por text not null default ''
);

create table if not exists venta (
  id bigint generated always as identity primary key,
  turno_id bigint not null references turno(id),
  cuenta_id bigint references cuenta(id),
  tipo text not null check (tipo in ('mostrador','cuenta','cobro_cuenta')),
  total_cop integer not null check (total_cop >= 0),
  recibido_cop integer not null default 0 check (recibido_cop >= 0),
  vuelto_cop integer not null default 0 check (vuelto_cop >= 0),
  etiqueta_operador text not null default '',
  client_tx_id uuid not null,
  creada_el timestamptz not null default now(),
  -- venta directa: sin cuenta; ítem de cuenta o cobro: con cuenta
  constraint chk_venta_tipo_cuenta check (
    (tipo = 'mostrador' and cuenta_id is null) or
    (tipo in ('cuenta','cobro_cuenta') and cuenta_id is not null)
  )
  -- nota: el total de 'cobro_cuenta' = suma de ventas tipo 'cuenta'
  -- de la misma cuenta; se garantiza en fn_cobrar_cuenta.
);

create table if not exists detalle_venta (
  id bigint generated always as identity primary key,
  venta_id bigint not null references venta(id) on delete cascade,
  producto_id bigint not null references producto(id),
  cantidad integer not null check (cantidad > 0),
  precio_unit_cop integer not null check (precio_unit_cop >= 0),
  subtotal_cop integer generated always as (cantidad * precio_unit_cop) stored
);

create table if not exists movimiento_caja (
  id bigint generated always as identity primary key,
  turno_id bigint not null references turno(id),
  tipo text not null check (tipo in ('retiro','entrada')),
  monto_cop integer not null check (monto_cop > 0),
  concepto text not null default '',
  creado_el timestamptz not null default now(),
  creado_por text not null default ''
);

create table if not exists reconciliacion (
  turno_id bigint not null references turno(id),
  producto_id bigint not null references producto(id),
  teorico integer not null,
  fisico integer not null check (fisico >= 0),
  diferencia integer generated always as (fisico - teorico) stored,
  primary key (turno_id, producto_id)
);


-- ============================================================
-- 2. ÍNDICES
-- ============================================================

-- Solo puede existir UN turno abierto (regla RF1)
create unique index if not exists ux_turno_uno_abierto
  on turno (estado) where estado = 'abierto';

-- Solo UNA cuenta abierta por etiqueta y turno (regla RF3)
create unique index if not exists ux_cuenta_abierta_etiqueta
  on cuenta (turno_id, lower(etiqueta)) where estado = 'abierta';

-- Un solo registro por client_tx_id (idempotencia de ventas)
create unique index if not exists ux_venta_client_tx
  on venta (client_tx_id);

-- No duplicar productos activos con el mismo nombre
create unique index if not exists ux_producto_nombre_activo
  on producto (lower(nombre)) where activo;

create index if not exists ix_producto_orden on producto (orden) where activo;
create index if not exists ix_venta_turno on venta (turno_id);
create index if not exists ix_venta_cuenta on venta (cuenta_id);
create index if not exists ix_detalle_venta on detalle_venta (venta_id);
create index if not exists ix_detalle_producto on detalle_venta (producto_id);
create index if not exists ix_conteo_turno on conteo_inicial (turno_id);
create index if not exists ix_cuenta_turno on cuenta (turno_id);
create index if not exists ix_movimiento_turno on movimiento_caja (turno_id);


-- ============================================================
-- 3. SEGURIDAD (RLS) — la app sin login solo LEE;
--    toda escritura pasa por las funciones (RPCs) de la sección 5
-- ============================================================

alter table ajustes           enable row level security;
alter table producto          enable row level security;
alter table turno             enable row level security;
alter table conteo_inicial    enable row level security;
alter table cuenta            enable row level security;
alter table venta             enable row level security;
alter table detalle_venta     enable row level security;
alter table movimiento_caja   enable row level security;
alter table reconciliacion    enable row level security;

-- Lectura para el rol anon (la app no usa login)
do $$
declare
  t text;
begin
  foreach t in array array[
    'ajustes','producto','turno','conteo_inicial',
    'cuenta','venta','detalle_venta','movimiento_caja','reconciliacion'
  ] loop
    execute format('drop policy if exists anon_lectura on %I', t);
    execute format(
      'create policy anon_lectura on %I for select to anon using (true)', t);
  end loop;
end $$;


-- ============================================================
-- 4. VISTAS (lectura para la app)
-- ============================================================

-- Stock teórico del turno abierto (RF2): inicial - vendidos
create or replace view v_stock_teorico as
select
  t.id as turno_id,
  p.id as producto_id,
  p.nombre,
  p.orden,
  p.imagen_url,
  coalesce(ci.cantidad, 0) as inicial,
  coalesce(vd.vendidos, 0) as vendidos,
  coalesce(ci.cantidad, 0) - coalesce(vd.vendidos, 0) as teorico
from turno t
cross join producto p
left join conteo_inicial ci
  on ci.turno_id = t.id and ci.producto_id = p.id
left join (
  select v.turno_id, d.producto_id, sum(d.cantidad) as vendidos
  from detalle_venta d
  join venta v on v.id = d.venta_id
  group by v.turno_id, d.producto_id
) vd on vd.turno_id = t.id and vd.producto_id = p.id
where t.estado = 'abierto' and p.activo;

-- Cuadre del turno (RF5): esperado, retiros, diferencia, cuentas
create or replace view v_reporte_turno as
select
  t.id as turno_id,
  t.abierto_el,
  t.cerrado_el,
  t.estado,
  t.base_inicial_cop,
  coalesce(ef.ventas_efectivo, 0)     as ventas_efectivo,
  coalesce(it.ingresos_totales, 0)    as ingresos_totales,
  coalesce(re.retiros, 0)             as retiros,
  coalesce(en.entradas, 0)            as entradas,
  t.base_inicial_cop
    + coalesce(ef.ventas_efectivo, 0)
    - coalesce(re.retiros, 0)
    + coalesce(en.entradas, 0)          as dinero_esperado,
  t.efectivo_fisico_cop,
  case when t.efectivo_fisico_cop is not null
    then t.efectivo_fisico_cop - (
      t.base_inicial_cop
      + coalesce(ef.ventas_efectivo, 0)
      - coalesce(re.retiros, 0)
      + coalesce(en.entradas, 0))
  end                                 as diferencia_caja,
  coalesce(ca.cuentas_abiertas, 0)    as cuentas_abiertas
from turno t
left join (
  select turno_id, sum(total_cop) as ventas_efectivo
  from venta where tipo in ('mostrador','cobro_cuenta') group by turno_id
) ef on ef.turno_id = t.id
left join (
  select turno_id, sum(total_cop) as ingresos_totales
  from venta where tipo in ('mostrador','cuenta') group by turno_id
) it on it.turno_id = t.id
left join (
  select turno_id, sum(monto_cop) as retiros
  from movimiento_caja where tipo = 'retiro' group by turno_id
) re on re.turno_id = t.id
left join (
  select turno_id, sum(monto_cop) as entradas
  from movimiento_caja where tipo = 'entrada' group by turno_id
) en on en.turno_id = t.id
left join (
  select turno_id, count(*) as cuentas_abiertas
  from cuenta where estado = 'abierta' group by turno_id
) ca on ca.turno_id = t.id;

-- Ventas por producto (reportes)
create or replace view v_ventas_por_producto as
select
  v.turno_id,
  d.producto_id,
  p.nombre,
  sum(d.cantidad) as unidades,
  sum(d.subtotal_cop) as total_cop
from detalle_venta d
join venta v on v.id = d.venta_id
join producto p on p.id = d.producto_id
group by v.turno_id, d.producto_id, p.nombre;


-- ============================================================
-- 5. FUNCIONES (RPCs) — toda la lógica de negocio vive aquí
--    (SECURITY DEFINER: corren como dueño de la tabla, sin RLS)
-- ============================================================

-- 5.1 Apertura de turno (RF1 + RF2): base de caja + conteo inicial
create or replace function fn_abrir_turno(
  p_base_inicial_cop integer,
  p_conteos jsonb,
  p_operador text default ''
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_turno_id bigint;
  v_item record;
begin
  if p_base_inicial_cop is null or p_base_inicial_cop < 0 then
    raise exception 'BASE_INVALIDA: la base de caja no puede ser negativa';
  end if;

  if exists (select 1 from turno where estado = 'abierto') then
    raise exception 'TURNO_YA_ABIERTO: cierra el turno actual antes de abrir otro';
  end if;

  if p_conteos is null or jsonb_array_length(p_conteos) = 0 then
    raise exception 'CONTEO_INCOMPLETO: debes ingresar el conteo inicial de todos los productos';
  end if;

  -- validar cada conteo
  for v_item in
    select (it->>'producto_id')::bigint as producto_id,
           (it->>'cantidad')::integer as cantidad
    from jsonb_array_elements(p_conteos) as it
  loop
    if v_item.producto_id is null then
      raise exception 'CONTEO_INVALIDO: falta producto_id en un conteo';
    end if;
    if v_item.cantidad is null or v_item.cantidad < 0 then
      raise exception 'CONTEO_INVALIDO: cantidad inválida para el producto %', v_item.producto_id;
    end if;
    if not exists (select 1 from producto where id = v_item.producto_id) then
      raise exception 'PRODUCTO_NO_EXISTE: el producto % no existe', v_item.producto_id;
    end if;
  end loop;

  -- todos los productos activos deben tener conteo
  if exists (
    select 1 from producto p
    where p.activo
      and not exists (
        select 1 from jsonb_array_elements(p_conteos) it
        where (it->>'producto_id')::bigint = p.id
      )
  ) then
    raise exception 'CONTEO_INCOMPLETO: falta el conteo de algún producto activo';
  end if;

  begin
    insert into turno (estado, base_inicial_cop, etiqueta_operador)
    values ('abierto', p_base_inicial_cop, coalesce(p_operador, ''))
    returning id into v_turno_id;
  exception when unique_violation then
    raise exception 'TURNO_YA_ABIERTO: ya hay un turno abierto';
  end;

  with conteos as (
    select (it->>'producto_id')::bigint as producto_id,
           max((it->>'cantidad')::integer) as cantidad
    from jsonb_array_elements(p_conteos) as it
    group by 1
  )
  insert into conteo_inicial (turno_id, producto_id, cantidad)
  select v_turno_id, c.producto_id, c.cantidad
  from conteos c
  on conflict (turno_id, producto_id)
  do update set cantidad = excluded.cantidad;

  return v_turno_id;
end;
$fn$;

-- 5.2 Crear cuenta abierta (RF3): reutiliza la abierta con la misma etiqueta
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

  begin
    insert into cuenta (turno_id, etiqueta, creada_por)
    values (v_turno_id, btrim(p_etiqueta), coalesce(p_operador, ''))
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

-- 5.3 Registrar venta (RF2 + RF3 + RF4)
--     p_items: [{"producto_id": 1, "cantidad": 2}, ...]
--     Con p_cuenta_id: acumula ítems a una cuenta abierta (sin cobrar).
--     Sin p_cuenta_id: venta directa en mostrador con efectivo.
create or replace function fn_registrar_venta(
  p_items jsonb,
  p_recibido_cop integer,
  p_client_tx_id uuid,
  p_cuenta_id bigint default null,
  p_operador text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_turno_id bigint;
  v_venta_id bigint;
  v_total integer := 0;
  v_vuelto integer := 0;
  v_stock integer;
  item record;
begin
  if p_client_tx_id is null then
    raise exception 'TX_INVALIDA: falta el identificador idempotente de la venta';
  end if;

  -- idempotencia: la venta ya se registró antes
  select id, total_cop, vuelto_cop
    into v_venta_id, v_total, v_vuelto
    from venta where client_tx_id = p_client_tx_id;
  if found then
    return jsonb_build_object(
      'venta_id', v_venta_id, 'total', v_total, 'vuelto', v_vuelto,
      'ya_registrada', true);
  end if;
  v_total := 0;

  -- bloqueo de concurrencia (punto único de serialización)
  select id into v_turno_id
  from turno where estado = 'abierto'
  order by id limit 1 for update;
  if v_turno_id is null then
    raise exception 'TURNO_CERRADO: no se puede vender sin turno abierto';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'VENTA_SIN_ITEMS: agrega al menos un producto';
  end if;

  if p_cuenta_id is not null then
    perform 1 from cuenta
    where id = p_cuenta_id and turno_id = v_turno_id and estado = 'abierta';
    if not found then
      raise exception 'CUENTA_CERRADA: la cuenta no está abierta en este turno';
    end if;
  end if;

  -- validar productos y stock (el stock se DERIVA: inicial - vendidos)
  for item in
    select sub.producto_id, sub.cantidad, p.precio_cop, p.activo, p.nombre
    from (
      select (it->>'producto_id')::bigint as producto_id,
             sum((it->>'cantidad')::integer)::integer as cantidad
      from jsonb_array_elements(p_items) as it
      group by 1
    ) sub
    left join producto p on p.id = sub.producto_id
    order by sub.producto_id
  loop
    if item.producto_id is null then
      raise exception 'ITEM_INVALIDO: producto_id inválido';
    end if;
    if item.precio_cop is null then
      raise exception 'PRODUCTO_NO_EXISTE: el producto % no existe', item.producto_id;
    end if;
    if not item.activo then
      raise exception 'PRODUCTO_INACTIVO: % ya no está en el menú', item.nombre;
    end if;
    if item.cantidad is null or item.cantidad <= 0 then
      raise exception 'CANTIDAD_INVALIDA: cantidad inválida de %', item.nombre;
    end if;

    select
      coalesce((
        select ci.cantidad from conteo_inicial ci
        where ci.turno_id = v_turno_id and ci.producto_id = item.producto_id), 0)
      - coalesce((
        select sum(d.cantidad)
        from detalle_venta d
        join venta v on v.id = d.venta_id
        where v.turno_id = v_turno_id and d.producto_id = item.producto_id), 0)
    into v_stock;

    if v_stock < item.cantidad then
      raise exception 'STOCK_INSUFICIENTE: quedan % de %', v_stock, item.nombre;
    end if;

    v_total := v_total + item.precio_cop * item.cantidad;
  end loop;

  -- venta directa: el efectivo recibido debe cubrir el total
  if p_cuenta_id is null then
    if p_recibido_cop is null or p_recibido_cop < v_total then
      raise exception 'RECIBIDO_INSUFICIENTE: faltan % para cubrir el total',
        (coalesce(p_recibido_cop, 0) - v_total);
    end if;
    v_vuelto := p_recibido_cop - v_total;
  end if;

  begin
    insert into venta (turno_id, cuenta_id, tipo, total_cop,
                       recibido_cop, vuelto_cop, etiqueta_operador, client_tx_id)
    values (
      v_turno_id,
      p_cuenta_id,
      case when p_cuenta_id is null then 'mostrador' else 'cuenta' end,
      v_total,
      case when p_cuenta_id is null then p_recibido_cop else 0 end,
      case when p_cuenta_id is null then v_vuelto else 0 end,
      coalesce(p_operador, ''),
      p_client_tx_id)
    returning id into v_venta_id;

    insert into detalle_venta (venta_id, producto_id, cantidad, precio_unit_cop)
    select v_venta_id, sub.producto_id, sub.cantidad, p.precio_cop
    from (
      select (it->>'producto_id')::bigint as producto_id,
             sum((it->>'cantidad')::integer)::integer as cantidad
      from jsonb_array_elements(p_items) as it
      group by 1
    ) sub
    join producto p on p.id = sub.producto_id;
  exception when unique_violation then
    -- carrera con el mismo client_tx_id: devolver la venta ya registrada
    select id, total_cop, vuelto_cop
      into v_venta_id, v_total, v_vuelto
      from venta where client_tx_id = p_client_tx_id;
    if found then
      return jsonb_build_object(
        'venta_id', v_venta_id, 'total', v_total, 'vuelto', v_vuelto,
        'ya_registrada', true);
    end if;
    raise;
  end;

  return jsonb_build_object(
    'venta_id', v_venta_id,
    'total', v_total,
    'vuelto', case when p_cuenta_id is null then v_vuelto else 0 end,
    'cuenta_id', p_cuenta_id,
    'ya_registrada', false);
end;
$fn$;

-- 5.4 Cobrar cuenta (RF3): cierra la cuenta y registra el efectivo
create or replace function fn_cobrar_cuenta(
  p_cuenta_id bigint,
  p_recibido_cop integer,
  p_client_tx_id uuid,
  p_operador text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_turno_id bigint;
  v_cuenta record;
  v_venta_id bigint;
  v_total integer;
  v_vuelto integer;
begin
  if p_client_tx_id is null then
    raise exception 'TX_INVALIDA: falta el identificador idempotente del cobro';
  end if;

  select id, total_cop, vuelto_cop
    into v_venta_id, v_total, v_vuelto
    from venta where client_tx_id = p_client_tx_id;
  if found then
    return jsonb_build_object(
      'venta_id', v_venta_id, 'total', v_total, 'vuelto', v_vuelto,
      'ya_registrada', true);
  end if;

  -- bloqueo de concurrencia (punto único de serialización)
  select id into v_turno_id
  from turno where estado = 'abierto'
  order by id limit 1 for update;
  if v_turno_id is null then
    raise exception 'TURNO_CERRADO: no hay turno abierto';
  end if;

  select * into v_cuenta
  from cuenta where id = p_cuenta_id
  for update;
  if not found then
    raise exception 'CUENTA_NO_EXISTE: no existe la cuenta %', p_cuenta_id;
  end if;
  if v_cuenta.turno_id <> v_turno_id then
    raise exception 'CUENTA_DE_OTRO_TURNO: la cuenta pertenece a otro turno';
  end if;
  if v_cuenta.estado <> 'abierta' then
    raise exception 'CUENTA_YA_COBRADA: esta cuenta ya fue cobrada';
  end if;

  -- total de la cuenta = suma de sus ítems (ventas tipo 'cuenta')
  select coalesce(sum(total_cop), 0) into v_total
  from venta where cuenta_id = p_cuenta_id and tipo = 'cuenta';

  if v_total <= 0 then
    raise exception 'CUENTA_VACIA: la cuenta no tiene productos';
  end if;

  if p_recibido_cop is null or p_recibido_cop < v_total then
    raise exception 'RECIBIDO_INSUFICIENTE: faltan % para cubrir el total',
      (coalesce(p_recibido_cop, 0) - v_total);
  end if;

  v_vuelto := p_recibido_cop - v_total;

  begin
    insert into venta (turno_id, cuenta_id, tipo, total_cop,
                       recibido_cop, vuelto_cop, etiqueta_operador, client_tx_id)
    values (v_turno_id, p_cuenta_id, 'cobro_cuenta', v_total,
            p_recibido_cop, v_vuelto, coalesce(p_operador, ''), p_client_tx_id)
    returning id into v_venta_id;

    update cuenta
    set estado = 'cerrada', cerrada_el = now()
    where id = p_cuenta_id;
  exception when unique_violation then
    select id, total_cop, vuelto_cop
      into v_venta_id, v_total, v_vuelto
      from venta where client_tx_id = p_client_tx_id;
    if found then
      return jsonb_build_object(
        'venta_id', v_venta_id, 'total', v_total, 'vuelto', v_vuelto,
        'ya_registrada', true);
    end if;
    raise;
  end;

  return jsonb_build_object(
    'venta_id', v_venta_id,
    'total', v_total,
    'vuelto', v_vuelto,
    'cuenta_id', p_cuenta_id,
    'ya_registrada', false);
end;
$fn$;

-- 5.5 Movimiento de caja (RF5): retiros y entradas de efectivo
create or replace function fn_movimiento_caja(
  p_tipo text,
  p_monto_cop integer,
  p_concepto text default '',
  p_operador text default ''
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_turno_id bigint;
  v_id bigint;
begin
  if p_tipo not in ('retiro','entrada') then
    raise exception 'TIPO_INVALIDO: debe ser retiro o entrada';
  end if;
  if p_monto_cop is null or p_monto_cop <= 0 then
    raise exception 'MONTO_INVALIDO: el monto debe ser mayor que cero';
  end if;

  -- bloqueo de concurrencia (punto único de serialización)
  select id into v_turno_id
  from turno where estado = 'abierto'
  order by id limit 1 for update;
  if v_turno_id is null then
    raise exception 'TURNO_CERRADO: no hay turno abierto';
  end if;

  insert into movimiento_caja (turno_id, tipo, monto_cop, concepto, creado_por)
  values (v_turno_id, p_tipo, p_monto_cop,
          coalesce(p_concepto, ''), coalesce(p_operador, ''))
  returning id into v_id;

  return v_id;
end;
$fn$;

-- 5.7 Restar items de una cuenta abierta (antes de cobrar)
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

  return jsonb_build_object('total_cuenta', v_total_cuenta);
end;
$fn$;

-- 5.8 Agregar stock durante el turno (reabastecimiento)
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

  -- insertar o actualizar el conteo inicial del producto
  insert into conteo_inicial (turno_id, producto_id, cantidad)
  values (v_turno_id, p_producto_id, p_cantidad)
  on conflict (turno_id, producto_id)
  do update set cantidad = conteo_inicial.cantidad + excluded.cantidad
  returning cantidad into v_nuevo_total;

  return jsonb_build_object(
    'producto_id', p_producto_id,
    'cantidad_agregada', p_cantidad,
    'nuevo_total', v_nuevo_total
  );
end;
$fn$;

-- 5.6 Cierre de turno (RF2 + RF5): conteo físico, mermas y cuadre
--     p_conteos_fisicos: [{"producto_id": 1, "cantidad": 12}, ...]
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
  insert into reconciliacion (turno_id, producto_id, teorico, fisico)
  select
    v_turno_id,
    ci.producto_id,
    ci.cantidad - coalesce(vd.vendidos, 0),
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


-- ============================================================
-- 6. REALTIME — tablas publicadas para sincronizar los
--    3 dispositivos con Supabase Realtime (postgres_changes)
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'producto','turno','conteo_inicial','cuenta',
    'venta','detalle_venta','movimiento_caja','reconciliacion'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null; -- ya estaba publicada
      when undefined_object
        then raise notice 'La publicación supabase_realtime no existe; omite %', t;
    end;
  end loop;
end $$;


-- ============================================================
-- 7. DATOS INICIALES
-- ============================================================

-- Ajustes globales: base de caja por defecto $70.000 (RF1)
insert into ajustes (id, base_inicial_defecto_cop, zona_horaria)
values (1, 70000, 'America/Bogota')
on conflict (id) do nothing;

-- Catálogo base con PRECIOS DE EJEMPLO:
--   ajústalos aquí (re-ejecuta este INSERT) o desde Supabase Studio
insert into producto (nombre, precio_cop, orden, imagen_url)
select v.nombre, v.precio_cop, v.orden, v.imagen_url
from (values
  ('Empanadas',      2000, 1, 'https://images.unsplash.com/photo-1556280725-d0a1d82c811b?w=400&h=400&fit=crop'),
  ('Papas rellenas', 2500, 2, 'https://images.unsplash.com/photo-1559847844-b0915a3800c6?w=400&h=400&fit=crop'),
  ('Marranitas',     2500, 3, 'https://images.unsplash.com/photo-1540714605746-4f474eefc6d4?w=400&h=400&fit=crop'),
  ('Café',           1500, 4, 'https://images.unsplash.com/photo-1594736130597-11a78f1f575b?w=400&h=400&fit=crop'),
  ('Café con leche', 2000, 5, 'https://images.unsplash.com/photo-1573074699584-303c79998c3a?w=400&h=400&fit=crop'),
  ('Gaseosa',        3000, 6, 'https://images.unsplash.com/photo-1567705323043-d0e489de300d?w=400&h=400&fit=crop')
) as v(nombre, precio_cop, orden, imagen_url)
where not exists (
  select 1 from producto p
  where lower(p.nombre) = lower(v.nombre) and p.activo
);


-- ============================================================
-- 8. PERMISOS
--    - Lectura para anon en todo (la app no usa login)
--    - Escritura: SOLO a través de las funciones (SECURITY DEFINER)
-- ============================================================

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- objetos futuros creados en esta sesión también heredan estos permisos
alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
