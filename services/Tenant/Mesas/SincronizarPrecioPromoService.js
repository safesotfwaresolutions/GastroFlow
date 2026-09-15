/**
 * SincronizarPrecioPromoService - Recalcula precio_unitario/subtotal de TODAS
 * las filas no canceladas de un producto en un pedido, según la cantidad TOTAL
 * real que tiene ese producto en ese momento (sumando todas sus filas).
 *
 * Sin esto, una promoción "por cantidad" (ej. activa desde 2 unidades) solo se
 * aplicaba a la unidad que causaba que se cruzara el mínimo, dejando las
 * unidades que ya estaban en el pedido con el precio de antes -- dos filas del
 * mismo producto con precios distintos aunque la promo ya esté activa para
 * las dos. Se llama después de agregar, cambiar cantidad, o eliminar un ítem
 * (agregar/subir puede activar la promo retroactivamente para lo que ya
 * había; quitar puede desactivarla si baja del mínimo).
 */
const db = require('../../../config/database');
const PromocionService = require('../PromocionService');

class SincronizarPrecioPromoService {
    static async ejecutar(tenantId, pedidoId, productoId) {
        if (!productoId) {
            return;
        }

        const [prodRows] = await db.query(
            'SELECT precio_unidad, categoria_id FROM productos WHERE id = ? AND tenant_id = ?',
            [productoId, tenantId]
        );
        if (prodRows.length === 0) {
            return;
        }
        const { precio_unidad: precioCatalogo, categoria_id: categoriaId } = prodRows[0];

        const [filas] = await db.query(
            `SELECT id, cantidad FROM pedido_items WHERE pedido_id = ? AND producto_id = ? AND estado <> 'cancelado'`,
            [pedidoId, productoId]
        );
        if (filas.length === 0) {
            return;
        }

        const cantidadTotal = filas.reduce((suma, f) => suma + Number(f.cantidad), 0);

        const descuentosPromo = await PromocionService.getDescuentoPorProductos(tenantId, [
            { producto_id: productoId, categoria_id: categoriaId, cantidad: cantidadTotal }
        ]);
        const promo = descuentosPromo.get(productoId);
        const precioBase = Number(precioCatalogo);
        const precioConDescuento = promo
            ? Math.max(0, precioBase - PromocionService.calcularDescuento(promo, precioBase))
            : precioBase;

        // Pocas filas por producto en un mismo pedido -- secuencial es suficiente, no
        // hace falta Promise.all.
        for (const fila of filas) {
            const [modRows] = await db.query(
                'SELECT COALESCE(SUM(precio_adicional * cantidad), 0) AS total FROM pedido_item_modificadores WHERE pedido_item_id = ?',
                [fila.id]
            );
            const toppingsTotal = Number(modRows[0].total) || 0;
            const nuevoPrecio = precioConDescuento + toppingsTotal;
            const nuevoSubtotal = (Number(fila.cantidad) * nuevoPrecio).toFixed(2);
            await db.query('UPDATE pedido_items SET precio_unitario = ?, subtotal = ? WHERE id = ?', [
                nuevoPrecio,
                nuevoSubtotal,
                fila.id
            ]);
        }
    }
}

module.exports = SincronizarPrecioPromoService;
