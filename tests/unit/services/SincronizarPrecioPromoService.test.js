jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../services/Tenant/PromocionService');

const db = require('../../../config/database');
const PromocionService = require('../../../services/Tenant/PromocionService');
const SincronizarPrecioPromoService = require('../../../services/Tenant/Mesas/SincronizarPrecioPromoService');

describe('SincronizarPrecioPromoService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('no hace nada si no se pasa producto_id (línea de servicio)', async () => {
        await SincronizarPrecioPromoService.ejecutar(1, 10, null);
        expect(db.query).not.toHaveBeenCalled();
    });

    it('no hace nada si el producto no existe en el catálogo', async () => {
        db.query.mockResolvedValueOnce([[]]); // SELECT productos -> vacío
        await SincronizarPrecioPromoService.ejecutar(1, 10, 99);
        expect(PromocionService.getDescuentoPorProductos).not.toHaveBeenCalled();
    });

    it('no hace nada si el producto no tiene ninguna fila viva en el pedido', async () => {
        db.query
            .mockResolvedValueOnce([[{ precio_unidad: 10000, categoria_id: 2 }]]) // productos
            .mockResolvedValueOnce([[]]); // pedido_items -> ninguna fila
        await SincronizarPrecioPromoService.ejecutar(1, 10, 7);
        expect(PromocionService.getDescuentoPorProductos).not.toHaveBeenCalled();
    });

    it('el caso reportado: 2 filas de "papa" (1 c/u) se activan las DOS al alcanzar el mínimo', async () => {
        db.query
            .mockResolvedValueOnce([[{ precio_unidad: 10000, categoria_id: 2 }]]) // productos
            .mockResolvedValueOnce([
                [
                    { id: 100, cantidad: 1 },
                    { id: 101, cantidad: 1 }
                ]
            ]) // pedido_items: 2 filas de 1 unidad cada una = total 2
            .mockResolvedValueOnce([[{ total: 0 }]]) // toppings fila 100
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE fila 100
            .mockResolvedValueOnce([[{ total: 0 }]]) // toppings fila 101
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE fila 101

        PromocionService.getDescuentoPorProductos.mockResolvedValue(
            new Map([[7, { valor_tipo: 'porcentaje', valor: 20 }]])
        );
        PromocionService.calcularDescuento.mockReturnValue(2000);

        await SincronizarPrecioPromoService.ejecutar(1, 10, 7);

        expect(PromocionService.getDescuentoPorProductos).toHaveBeenCalledWith(1, [
            { producto_id: 7, categoria_id: 2, cantidad: 2 } // 1 + 1, no solo la fila nueva
        ]);

        const updates = db.query.mock.calls.filter(
            call => typeof call[0] === 'string' && call[0].startsWith('UPDATE pedido_items')
        );
        expect(updates).toHaveLength(2);
        // AMBAS filas quedan a 8000 (10000 - 2000), no solo la que "completó" el mínimo.
        expect(updates[0][1]).toEqual([8000, '8000.00', 100]);
        expect(updates[1][1]).toEqual([8000, '8000.00', 101]);
    });

    it('revierte al precio de catálogo si, tras quitar una fila, ya no se alcanza el mínimo', async () => {
        db.query
            .mockResolvedValueOnce([[{ precio_unidad: 10000, categoria_id: 2 }]])
            .mockResolvedValueOnce([[{ id: 100, cantidad: 1 }]]) // solo queda 1 unidad
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        PromocionService.getDescuentoPorProductos.mockResolvedValue(new Map()); // ya no aplica con cantidad=1

        await SincronizarPrecioPromoService.ejecutar(1, 10, 7);

        const updateCall = db.query.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].startsWith('UPDATE pedido_items')
        );
        expect(updateCall[1]).toEqual([10000, '10000.00', 100]); // vuelve al precio lleno
    });

    it('preserva los toppings propios de cada fila al recalcular', async () => {
        db.query
            .mockResolvedValueOnce([[{ precio_unidad: 10000, categoria_id: 2 }]])
            .mockResolvedValueOnce([[{ id: 100, cantidad: 2 }]])
            .mockResolvedValueOnce([[{ total: 1500 }]]) // esta fila tiene $1.500 en toppings
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        PromocionService.getDescuentoPorProductos.mockResolvedValue(
            new Map([[7, { valor_tipo: 'valor', valor: 2000 }]])
        );
        PromocionService.calcularDescuento.mockReturnValue(2000);

        await SincronizarPrecioPromoService.ejecutar(1, 10, 7);

        const updateCall = db.query.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].startsWith('UPDATE pedido_items')
        );
        // (10000 - 2000) + 1500 toppings = 9500, x2 cantidad = 19000
        expect(updateCall[1]).toEqual([9500, '19000.00', 100]);
    });
});
