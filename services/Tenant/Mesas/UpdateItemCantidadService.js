const db = require('../../../config/database');
const SincronizarPrecioPromoService = require('./SincronizarPrecioPromoService');

class UpdateItemCantidadService {
    /**
     * @description Actualiza la cantidad de un item del pedido y sincroniza el
     * precio de TODAS las filas de ese mismo producto en el pedido con la promo
     * vigente (subir la cantidad con +/- es, en la práctica, la forma más común
     * de cruzar el mínimo de una promoción "por cantidad" -- y como puede haber
     * más de una fila del mismo producto, no basta con recalcular esta sola).
     */
    static async execute({ tenantId, itemId, cantidad }) {
        const cant = Number.parseFloat(cantidad);
        if (Number.isNaN(cant) || cant < 0.01) {
            throw new Error('Cantidad inválida (mínimo 0.01)');
        }

        const [checkRows] = await db.query(
            `SELECT pi.id, pi.producto_id, p.id as pedido_id, p.mesa_id
             FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id
             WHERE pi.id = ? AND p.tenant_id = ?`,
            [itemId, tenantId]
        );

        if (checkRows.length === 0) {
            throw new Error('Item no encontrado');
        }

        const { producto_id: productoId, pedido_id, mesa_id } = checkRows[0];

        // Cantidad y subtotal "provisorio" (precio sin tocar) -- SincronizarPrecioPromoService
        // corrige precio_unitario/subtotal de esta fila y de sus hermanas justo abajo,
        // ya con la cantidad nueva puesta.
        await db.query(`UPDATE pedido_items SET cantidad = ?, subtotal = precio_unitario * ? WHERE id = ?`, [
            cant,
            cant,
            itemId
        ]);
        await SincronizarPrecioPromoService.ejecutar(tenantId, pedido_id, productoId);

        const [actualizado] = await db.query('SELECT subtotal FROM pedido_items WHERE id = ?', [itemId]);
        const subtotal = Number(actualizado[0]?.subtotal) || 0;

        // Emitir evento SSE
        try {
            const RealtimeEvents = require('../../Shared/RealtimeEvents');
            RealtimeEvents.emit('orderCreated', {
                tenantId,
                pedidoId: pedido_id,
                mesaId: mesa_id,
                action: 'items_updated'
            });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error al emitir evento SSE en UpdateItemCantidadService:', err);
        }

        return { message: 'Cantidad actualizada', subtotal };
    }
}

module.exports = UpdateItemCantidadService;
