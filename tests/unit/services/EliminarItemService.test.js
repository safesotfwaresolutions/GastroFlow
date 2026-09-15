jest.mock('../../../config/database', () => {
    const mockConnection = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn()
    };
    return { getConnection: jest.fn().mockResolvedValue(mockConnection) };
});
jest.mock('../../../services/Tenant/Mesas/SincronizarPrecioPromoService');

const db = require('../../../config/database');
const SincronizarPrecioPromoService = require('../../../services/Tenant/Mesas/SincronizarPrecioPromoService');
const EliminarItemService = require('../../../services/Tenant/Mesas/EliminarItemService');

describe('EliminarItemService', () => {
    let mockConn;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockConn = await db.getConnection();
    });

    it('elimina el item y sincroniza el precio de promo de las filas hermanas restantes', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ id: 5, producto_id: 3, pedido_id: 10, mesa_id: 1 }]]) // SELECT ... FOR UPDATE
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // DELETE
            .mockResolvedValueOnce([[{ cnt: 1 }]]); // quedan otras filas -> no cancela el pedido

        await EliminarItemService.execute({ tenantId: 1, itemId: 5 });

        expect(mockConn.commit).toHaveBeenCalled();
        // La sync corre DESPUÉS del commit, sobre el producto de la fila borrada.
        expect(SincronizarPrecioPromoService.ejecutar).toHaveBeenCalledWith(1, 10, 3);
    });

    it('no rompe el borrado si la sincronización de promo falla (no bloqueante)', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ id: 5, producto_id: 3, pedido_id: 10, mesa_id: 1 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ cnt: 1 }]]);
        SincronizarPrecioPromoService.ejecutar.mockRejectedValue(new Error('boom'));

        await expect(EliminarItemService.execute({ tenantId: 1, itemId: 5 })).resolves.toEqual({
            message: 'Item eliminado y estado de mesa validado'
        });
    });

    it('lanza si el item no existe (y no llega a intentar sincronizar nada)', async () => {
        mockConn.query.mockResolvedValueOnce([[]]);
        await expect(EliminarItemService.execute({ tenantId: 1, itemId: 999 })).rejects.toThrow('Item no encontrado');
        expect(SincronizarPrecioPromoService.ejecutar).not.toHaveBeenCalled();
        expect(mockConn.rollback).toHaveBeenCalled();
    });
});
