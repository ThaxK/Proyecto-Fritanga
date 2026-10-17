import { expect, test } from '@playwright/test'
import { fingirSupabase } from './apoyo/supabase-falso.ts'

/**
 * Pruebas de alta de productos contra el Supabase simulado.
 *
 * Verifica que:
 * - Se llama a fn_crear_producto con los parámetros correctos.
 * - El producto aparece en el inventario con stock cero (AGOTADO).
 * - Los errores de la base (nombre vacío, precio <= 0, duplicado) se
 *   muestran en pantalla en vez de romper la app.
 *
 * Nota: `estado.productos` es el mismo arreglo que el mock usa para
 * responder consultas REST (v_stock_teorico) y para el RPC, así que
 * lo que se crea por RPC se ve al refrescar.
 */
test.describe('alta de productos desde el inventario', () => {
  test('crea un producto y aparece en el catálogo con stock cero', async ({ page }) => {
    const productos = [
      { id: 1, nombre: 'Empanadas', precio_cop: 2000, orden: 1, activo: true, imagen_url: '' },
    ]

    const { rpcRecibidas } = await fingirSupabase(page, {
      turnoAbierto: true,
      productos,
      rpc: {
        fn_crear_producto: (cuerpo: Record<string, unknown>) => {
          const nombre = String(cuerpo.p_nombre ?? '').trim()
          const precio = Number(cuerpo.p_precio_cop)
          const imagen = String(cuerpo.p_imagen_url ?? '')

          if (!nombre) throw new Error('NOMBRE_VACIO: escribe el nombre del producto')
          if (!precio || precio <= 0) throw new Error('PRECIO_INVALIDO: el precio debe ser mayor que cero')

          const existe = productos.some(
            (p) => p.nombre.toLowerCase() === nombre.toLowerCase() && p.activo,
          )
          if (existe) throw new Error('PRODUCTO_YA_EXISTE: ya hay un producto activo con ese nombre')

          const id = Math.max(...productos.map((p) => p.id), 0) + 1
          productos.push({
            id,
            nombre,
            precio_cop: precio,
            orden: productos.length + 1,
            activo: true,
            imagen_url: imagen,
          })
          return { id }
        },
      },
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Inventario/ }).click()
    await expect(page.getByRole('heading', { name: /Inventario/ })).toBeVisible()

    await page.getByRole('button', { name: '+ Nuevo producto' }).click()
    await page.getByPlaceholder('Ej. Arepa de huevo').fill('Arepa de huevo')
    await page.getByPlaceholder('0').fill('3500')
    await page.getByRole('button', { name: 'Crear' }).click()

    // El RPC se invocó con los parámetros correctos
    expect(
      rpcRecibidas.some(
        (r) =>
          r.nombre === 'fn_crear_producto' &&
          r.cuerpo.p_nombre === 'Arepa de huevo' &&
          r.cuerpo.p_precio_cop === 3500 &&
          r.cuerpo.p_imagen_url === '',
      ),
    ).toBe(true)

    // El producto aparece en el inventario con stock cero
    await expect(page.getByText('Arepa de huevo')).toBeVisible()
    await expect(page.getByText('AGOTADO').first()).toBeVisible()
  })

  test('no permite crear un producto con nombre duplicado', async ({ page }) => {
    const productos = [
      { id: 1, nombre: 'Arepa de huevo', precio_cop: 3500, orden: 1, activo: true, imagen_url: '' },
    ]

    await fingirSupabase(page, {
      turnoAbierto: true,
      productos,
      rpc: {
        fn_crear_producto: (cuerpo: Record<string, unknown>) => {
          const nombre = String(cuerpo.p_nombre ?? '').trim()
          const precio = Number(cuerpo.p_precio_cop)

          if (!nombre) throw new Error('NOMBRE_VACIO: escribe el nombre del producto')
          if (!precio || precio <= 0) throw new Error('PRECIO_INVALIDO: el precio debe ser mayor que cero')

          const existe = productos.some(
            (p) => p.nombre.toLowerCase() === nombre.toLowerCase() && p.activo,
          )
          if (existe) throw new Error('PRODUCTO_YA_EXISTE: ya hay un producto activo con ese nombre')

          const id = Math.max(...productos.map((p) => p.id), 0) + 1
          productos.push({
            id, nombre, precio_cop: precio, orden: productos.length + 1,
            activo: true, imagen_url: '',
          })
          return { id }
        },
      },
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Inventario/ }).click()

    await page.getByRole('button', { name: '+ Nuevo producto' }).click()
    await page.getByPlaceholder('Ej. Arepa de huevo').fill('AREPA DE HUEVO')
    await page.getByPlaceholder('0').fill('4000')
    await page.getByRole('button', { name: 'Crear' }).click()

    await expect(page.getByText(/ya hay un producto activo con ese nombre/)).toBeVisible()
  })

  test('rechaza precio cero', async ({ page }) => {
    const productos: { id: number; nombre: string; precio_cop: number; orden: number; activo: boolean; imagen_url?: string }[] = []

    await fingirSupabase(page, {
      turnoAbierto: true,
      productos,
      rpc: {
        fn_crear_producto: (cuerpo: Record<string, unknown>) => {
          const nombre = String(cuerpo.p_nombre ?? '').trim()
          const precio = Number(cuerpo.p_precio_cop)

          if (!nombre) throw new Error('NOMBRE_VACIO: escribe el nombre del producto')
          if (!precio || precio <= 0) throw new Error('PRECIO_INVALIDO: el precio debe ser mayor que cero')

          const id = Math.max(...productos.map((p) => p.id), 0) + 1
          productos.push({
            id, nombre, precio_cop: precio, orden: productos.length + 1,
            activo: true, imagen_url: '',
          })
          return { id }
        },
      },
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Inventario/ }).click()

    await page.getByRole('button', { name: '+ Nuevo producto' }).click()
    await page.getByPlaceholder('Ej. Arepa de huevo').fill('Gaseosa')
    await page.getByPlaceholder('0').fill('0')
    await page.getByRole('button', { name: 'Crear' }).click()

    await expect(page.getByText(/el precio debe ser mayor que cero/)).toBeVisible()
  })

  test('rechaza nombre vacío', async ({ page }) => {
    const productos: { id: number; nombre: string; precio_cop: number; orden: number; activo: boolean; imagen_url?: string }[] = []

    await fingirSupabase(page, {
      turnoAbierto: true,
      productos,
      rpc: {
        fn_crear_producto: (cuerpo: Record<string, unknown>) => {
          const nombre = String(cuerpo.p_nombre ?? '').trim()
          const precio = Number(cuerpo.p_precio_cop)

          if (!nombre) throw new Error('NOMBRE_VACIO: escribe el nombre del producto')
          if (!precio || precio <= 0) throw new Error('PRECIO_INVALIDO: el precio debe ser mayor que cero')

          const id = Math.max(...productos.map((p) => p.id), 0) + 1
          productos.push({
            id, nombre, precio_cop: precio, orden: productos.length + 1,
            activo: true, imagen_url: '',
          })
          return { id }
        },
      },
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Inventario/ }).click()

    await page.getByRole('button', { name: '+ Nuevo producto' }).click()
    await page.getByPlaceholder('0').fill('1000')
    await page.getByRole('button', { name: 'Crear' }).click()

    await expect(page.getByText(/escribe el nombre del producto/)).toBeVisible()
  })
})
