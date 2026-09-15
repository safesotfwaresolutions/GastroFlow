const db = require('../../../config/database');
const PromocionService = require('../PromocionService');

class UpdateItemCantidadService {
    /**
     * @description Actualiza la cantidad, precio y subtotal de un item del pedido.
     * El precio se vuelve a resolver (no se deja el que ya tenía la fila) porque
     * subir la cantidad con +/- es, en la práctica, la forma más común de cruzar
     * el mínimo de una promoción "por cantidad" (ej. activa desde 2 unidades) --
     * si solo se actualizara cantidad*precio_viejo, esa promo nunca se activaría
     * por este camino, solo agregando una línea nueva por separado.
     */
    static async execute({ tenantId, itemId, cantidad }) {
        const cant = Number.parseFloat(cantidad);
        if (Number.isNaN(cant) || cant < 0.01) {
            throw new Error('Cantidad inválida (mínimo 0.01)');
        }

        const [checkRows] = await db.query(
            `SELECT pi.id, pi.producto_id, pi.precio_unitario, p.id as pedido_id, p.mesa_id
             FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id
             WHERE pi.id = ? AND p.tenant_id = ?`,
            [itemId, tenantId]
        );

        if (checkRows.length === 0) {
            throw new Error('Item no encontrado');
        }

        const { producto_id: productoId, pedido_id, mesa_id } = checkRows[0];
        const precio = await UpdateItemCantidadService._resolverPrecioUnitario(
            tenantId,
            productoId,
            pedido_id,
            itemId,
            cant,
            Number(checkRows[0].precio_unitario)
        );
        const subtotal = (cant * precio).toFixed(2);

        await db.query('UPDATE pedido_items SET cantidad = ?, precio_unitario = ?, subtotal = ? WHERE id = ?', [
            cant,
            precio,
            subtotal,
            itemId
        ]);

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

        return { message: 'Cantidad actualizada', subtotal: Number.parseFloat(subtotal) };
    }

    /**
     * Precio unitario (base de catálogo - promo vigente + toppings de esta
     * misma fila) para `cantidadNueva` unidades de `productoId` en `pedidoId`.
     * La cantidad total real del producto en el pedido es la de las DEMÁS
     * filas (se excluye esta, `itemId`, para no contarla dos veces) + la nueva
     * cantidad de esta fila. Si no es un producto real (línea de servicio,
     * `productoId` null) o no se encuentra en catálogo, conserva el precio que
     * ya tenía la fila -- no hay nada que resolver.
     */
    static async _resolverPrecioUnitario(tenantId, productoId, pedidoId, itemId, cantidadNueva, precioActual) {
        if (!productoId) {
            return precioActual;
        }
        const [prodRows] = await db.query(
            'SELECT precio_unidad, categoria_id FROM productos WHERE id = ? AND tenant_id = ?',
            [productoId, tenantId]
        );
        if (prodRows.length === 0) {
            return precioActual;
        }
        const { precio_unidad: precioCatalogo, categoria_id: categoriaId } = prodRows[0];

        // Toppings de ESTA fila: no cambian con la cantidad, se preservan tal cual.
        const [modRows] = await db.query(
            'SELECT COALESCE(SUM(precio_adicional * cantidad), 0) AS total FROM pedido_item_modificadores WHERE pedido_item_id = ?',
            [itemId]
        );
        const toppingsTotal = Number(modRows[0].total) || 0;

        const [otrasRows] = await db.query(
            `SELECT COALESCE(SUM(cantidad), 0) AS total FROM pedido_items
             WHERE pedido_id = ? AND producto_id = ? AND estado <> 'cancelado' AND id <> ?`,
            [pedidoId, productoId, itemId]
        );
        const cantidadTotal = Number(otrasRows[0].total) + cantidadNueva;

        const descuentosPromo = await PromocionService.getDescuentoPorProductos(tenantId, [
            { producto_id: productoId, categoria_id: categoriaId, cantidad: cantidadTotal }
        ]);
        const promo = descuentosPromo.get(productoId);
        const precioBase = Number(precioCatalogo);
        const precioConDescuento = promo
            ? Math.max(0, precioBase - PromocionService.calcularDescuento(promo, precioBase))
            : precioBase;

        return precioConDescuento + toppingsTotal;
    }
}

module.exports = UpdateItemCantidadService;
