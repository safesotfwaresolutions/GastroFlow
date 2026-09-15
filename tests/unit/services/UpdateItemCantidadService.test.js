jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../services/Tenant/Mesas/SincronizarPrecioPromoService');

const db = require('../../../config/database');
const SincronizarPrecioPromoService = require('../../../services/Tenant/Mesas/SincronizarPrecioPromoService');
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
        expect(SincronizarPrecioPromoService.ejecutar).not.toHaveBeenCalled();
    });

    it('actualiza la cantidad y sincroniza el precio de promo del producto (el bug reportado con +/-)', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5, producto_id: 3, pedido_id: 10, mesa_id: 1 }]]) // SELECT item
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE cantidad provisoria
            .mockResolvedValueOnce([[{ subtotal: 16000 }]]); // SELECT subtotal ya sincronizado

        const result = await UpdateItemCantidadService.execute({ tenantId: 1, itemId: 5, cantidad: 2 });

        expect(SincronizarPrecioPromoService.ejecutar).toHaveBeenCalledWith(1, 10, 3);
        expect(result).toEqual({ message: 'Cantidad actualizada', subtotal: 16000 });
    });

    it('llama a SincronizarPrecioPromoService incluso para líneas de servicio (producto_id null) -- ahí no hace nada', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5, producto_id: null, pedido_id: 10, mesa_id: 1 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ subtotal: 12000 }]]);

        await UpdateItemCantidadService.execute({ tenantId: 1, itemId: 5, cantidad: 2 });

        expect(SincronizarPrecioPromoService.ejecutar).toHaveBeenCalledWith(1, 10, null);
    });
});
