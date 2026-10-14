-- Migración: imágenes de productos (Unsplash)
-- Ejecutar en Supabase SQL Editor sobre la base ya existente.

-- 1. Columna imagen_url en producto
alter table producto
  add column if not exists imagen_url text not null default '';

-- 2. Vista v_stock_teorico expone imagen_url
-- (CREATE OR REPLACE no permite reordenar columnas, hay que dropearla primero;
--  ningún objeto de la BD depende de esta vista)
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

-- 3. URLs de las fotos (Unsplash, licencia gratuita)
update producto set imagen_url = 'https://images.unsplash.com/photo-1556280725-d0a1d82c811b?w=400&h=400&fit=crop' where lower(nombre) = 'empanadas';
update producto set imagen_url = 'https://images.unsplash.com/photo-1559847844-b0915a3800c6?w=400&h=400&fit=crop' where lower(nombre) = 'papas rellenas';
update producto set imagen_url = 'https://images.unsplash.com/photo-1540714605746-4f474eefc6d4?w=400&h=400&fit=crop' where lower(nombre) = 'marranitas';
update producto set imagen_url = 'https://images.unsplash.com/photo-1594736130597-11a78f1f575b?w=400&h=400&fit=crop' where lower(nombre) = 'café';
update producto set imagen_url = 'https://images.unsplash.com/photo-1573074699584-303c79998c3a?w=400&h=400&fit=crop' where lower(nombre) = 'café con leche';
update producto set imagen_url = 'https://images.unsplash.com/photo-1567705323043-d0e489de300d?w=400&h=400&fit=crop' where lower(nombre) = 'gaseosa';

-- Verificación
select nombre, imagen_url from producto where activo order by orden;
