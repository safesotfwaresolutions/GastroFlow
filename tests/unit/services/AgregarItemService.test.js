jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../services/Tenant/InventarioService', () => ({
    checkStockParaProducto: jest.fn().mockResolvedValue({ ok: true })
}));
jest.mock('../../../services/Tenant/ModificadorService', () => ({
    validarYCalcularSeleccion: jest.fn().mockResolvedValue({
        precioAdicionalTotal: 0,
        lineasSnapshot: [],
        modificadoresHash: null
    })
}));
jest.mock('../../../services/Tenant/Mesas/SincronizarPrecioPromoService');

const db = require('../../../config/database');
const SincronizarPrecioPromoService = require('../../../services/Tenant/Mesas/SincronizarPrecioPromoService');
const AgregarItemService = require('../../../services/Tenant/Mesas/AgregarItemService');

describe('AgregarItemService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('inserta el item y sincroniza el precio de promo del producto agregado', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 10, mesa_id: 1 }]]) // SELECT pedidos
            .mockResolvedValueOnce([{ insertId: 55 }]) // INSERT pedido_items
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE mesas -> ocupada

        const result = await AgregarItemService.execute({
            tenantId: 1,
            pedidoId: 10,
            producto_id: 7,
            cantidad: 1,
            unidad: 'UND',
            precio: 10000
        });

        expect(result).toEqual({ id: 55 });
        expect(SincronizarPrecioPromoService.ejecutar).toHaveBeenCalledWith(1, 10, 7);
    });

    it('rechaza si falta producto_id, cantidad o precio', async () => {
        await expect(
            AgregarItemService.execute({ tenantId: 1, pedidoId: 10, cantidad: 1, precio: 5000 })
        ).rejects.toThrow('producto_id, cantidad y precio son requeridos');
        expect(db.query).not.toHaveBeenCalled();
    });

    it('lanza si el pedido no existe', async () => {
        db.query.mockResolvedValueOnce([[]]); // SELECT pedidos -> vacío
        await expect(
            AgregarItemService.execute({ tenantId: 1, pedidoId: 999, producto_id: 7, cantidad: 1, precio: 5000 })
        ).rejects.toThrow('Pedido no encontrado');
        expect(SincronizarPrecioPromoService.ejecutar).not.toHaveBeenCalled();
    });

    it('sincroniza con el producto REAL (espejo) cuando el id es un insumo virtual (>= 1.000.000)', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 3, codigo: 'CER1', nombre: 'Taza', precio_venta: 8000 }]]) // SELECT insumos
            .mockResolvedValueOnce([[{ id: 42 }]]) // SELECT productos existente con ese código -> ya existe el espejo
            .mockResolvedValueOnce([[{ id: 10, mesa_id: 1 }]]) // SELECT pedidos
            .mockResolvedValueOnce([{ insertId: 60 }]) // INSERT pedido_items
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE mesas

        await AgregarItemService.execute({
            tenantId: 1,
            pedidoId: 10,
            producto_id: 1000003, // insumo virtual (1000000 + 3)
            cantidad: 1,
            precio: 8000
        });

        // La promo se resuelve sobre el producto espejo real (42), no sobre el id virtual.
        expect(SincronizarPrecioPromoService.ejecutar).toHaveBeenCalledWith(1, 10, 42);
    });
});
