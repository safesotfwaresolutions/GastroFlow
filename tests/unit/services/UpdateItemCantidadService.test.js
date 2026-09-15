jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../services/Tenant/PromocionService');

const db = require('../../../config/database');
const PromocionService = require('../../../services/Tenant/PromocionService');
const UpdateItemCantidadService = require('../../../services/Tenant/Mesas/UpdateItemCantidadService');

describe('UpdateItemCantidadService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rechaza cantidades inválidas sin tocar la base de datos', async () => {
        await expect(UpdateItemCantidadService.execute({ tenantId: 1, itemId: 5, cantidad: 0 })).rejects.toThrow(
            'Cantidad inválida (mínimo 0.01)'
        );
        expect(db.query).not.toHaveBeenCalled();
    });

    it('lanza si el item no existe', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(UpdateItemCantidadService.execute({ tenantId: 1, itemId: 5, cantidad: 2 })).rejects.toThrow(
            'Item no encontrado'
        );
    });

    it('activa la promo "por cantidad" al subir la cantidad con +/- (el bug reportado)', async () => {
        // Item de "papa": tenía cantidad 1 sin promo, el usuario le da "+" para pasar a 2.
        db.query
            .mockResolvedValueOnce([[{ id: 5, producto_id: 3, precio_unitario: 10000, pedido_id: 10, mesa_id: 1 }]]) // SELECT item
            .mockResolvedValueOnce([[{ precio_unidad: 10000, categoria_id: 2 }]]) // SELECT productos
            .mockResolvedValueOnce([[{ total: 0 }]]) // SELECT toppings de esta fila
            .mockResolvedValueOnce([[{ total: 0 }]]) // SELECT otras filas del mismo producto (ninguna)
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE pedido_items
        PromocionService.getDescuentoPorProductos.mockResolvedValue(
            new Map([[3, { valor_tipo: 'porcentaje', valor: 20 }]])
        );
        PromocionService.calcularDescuento.mockReturnValue(2000);

        const result = await UpdateItemCantidadService.execute({ tenantId: 1, itemId: 5, cantidad: 2 });

        // 10000 - 2000 (promo) = 8000 unitario -> subtotal 16000, no 20000
        expect(result.subtotal).toBe(16000);
        const updateCall = db.query.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].startsWith('UPDATE pedido_items')
        );
        expect(updateCall[1]).toEqual([2, 8000, '16000.00', 5]);

        // La cantidad total consultada para resolver la promo fue la nueva (2),
        // no la vieja (1) ni cero.
        expect(PromocionService.getDescuentoPorProductos).toHaveBeenCalledWith(1, [
            { producto_id: 3, categoria_id: 2, cantidad: 2 }
        ]);
    });

    it('suma OTRAS filas del mismo producto (excluyendo esta) al calcular la cantidad total', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5, producto_id: 3, precio_unitario: 8000, pedido_id: 10, mesa_id: 1 }]])
            .mockResolvedValueOnce([[{ precio_unidad: 10000, categoria_id: 2 }]])
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[{ total: 1 }]]) // ya hay 1 unidad de "papa" en otra fila
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        PromocionService.getDescuentoPorProductos.mockResolvedValue(new Map());

        await UpdateItemCantidadService.execute({ tenantId: 1, itemId: 5, cantidad: 3 });

        expect(PromocionService.getDescuentoPorProductos).toHaveBeenCalledWith(1, [
            { producto_id: 3, categoria_id: 2, cantidad: 4 } // 1 (otra fila) + 3 (esta fila)
        ]);
    });

    it('preserva el valor de los toppings de la fila al recalcular', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5, producto_id: 3, precio_unitario: 11500, pedido_id: 10, mesa_id: 1 }]])
            .mockResolvedValueOnce([[{ precio_unidad: 10000, categoria_id: 2 }]])
            .mockResolvedValueOnce([[{ total: 1500 }]]) // $1.500 en toppings de esta fila
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        PromocionService.getDescuentoPorProductos.mockResolvedValue(new Map()); // sin promo

        const result = await UpdateItemCantidadService.execute({ tenantId: 1, itemId: 5, cantidad: 1 });

        // 10000 (catálogo, sin promo) + 1500 (toppings) = 11500
        const updateCall = db.query.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].startsWith('UPDATE pedido_items')
        );
        expect(updateCall[1][1]).toBe(11500);
        expect(result.subtotal).toBe(11500);
    });

    it('conserva el precio actual si la fila es un servicio (sin producto_id)', async () => {
        db.query.mockResolvedValueOnce([
            [{ id: 5, producto_id: null, precio_unitario: 6000, pedido_id: 10, mesa_id: 1 }]
        ]);
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE, sin pasar por PromocionService

        const result = await UpdateItemCantidadService.execute({ tenantId: 1, itemId: 5, cantidad: 2 });

        expect(result.subtotal).toBe(12000); // 2 * 6000, precio intacto
        expect(PromocionService.getDescuentoPorProductos).not.toHaveBeenCalled();
    });
});
