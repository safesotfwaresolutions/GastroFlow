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
jest.mock('../../../services/Tenant/PromocionService');

const db = require('../../../config/database');
const PromocionService = require('../../../services/Tenant/PromocionService');
const AgregarItemService = require('../../../services/Tenant/Mesas/AgregarItemService');

describe('AgregarItemService._resolverPrecioConPromo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('cae al precio del cliente si el producto no existe en el catálogo', async () => {
        db.query.mockResolvedValueOnce([[]]); // SELECT productos -> vacío

        const precio = await AgregarItemService._resolverPrecioConPromo(1, 99, 10, 1, 5000);

        expect(precio).toBe(5000);
        expect(PromocionService.getDescuentoPorProductos).not.toHaveBeenCalled();
    });

    it('cae al precio del cliente si no hay ninguna promo activa', async () => {
        db.query
            .mockResolvedValueOnce([[{ precio_unidad: 10000, categoria_id: 2 }]]) // SELECT productos
            .mockResolvedValueOnce([[{ total: 0 }]]); // SELECT SUM cantidad ya en el pedido
        PromocionService.getDescuentoPorProductos.mockResolvedValue(new Map());

        const precio = await AgregarItemService._resolverPrecioConPromo(1, 7, 10, 1, 8000);

        expect(precio).toBe(8000); // precio del cliente, no el de catálogo
    });

    it('usa el precio de catálogo menos el descuento cuando la promo sí aplica', async () => {
        db.query
            .mockResolvedValueOnce([[{ precio_unidad: 10000, categoria_id: 2 }]])
            .mockResolvedValueOnce([[{ total: 0 }]]);
        PromocionService.getDescuentoPorProductos.mockResolvedValue(
            new Map([[7, { valor_tipo: 'porcentaje', valor: 20 }]])
        );
        PromocionService.calcularDescuento.mockReturnValue(2000);

        const precio = await AgregarItemService._resolverPrecioConPromo(1, 7, 10, 1, 999999);

        // 10000 (catálogo) - 2000 (descuento) = 8000, ignorando el precio absurdo del cliente
        expect(precio).toBe(8000);
    });

    it('suma lo que ya había en el pedido + lo nuevo antes de resolver la promo (activación por cantidad)', async () => {
        db.query.mockResolvedValueOnce([[{ precio_unidad: 5000, categoria_id: 3 }]]).mockResolvedValueOnce([
            [{ total: 1 }] // ya había 1 unidad en el pedido
        ]);
        PromocionService.getDescuentoPorProductos.mockResolvedValue(new Map());

        await AgregarItemService._resolverPrecioConPromo(1, 7, 10, 1, 5000); // agrega 1 más

        expect(PromocionService.getDescuentoPorProductos).toHaveBeenCalledWith(1, [
            { producto_id: 7, categoria_id: 3, cantidad: 2 } // 1 existente + 1 nueva
        ]);
    });

    it('nunca queda un precio negativo si el descuento supera el precio de catálogo', async () => {
        db.query
            .mockResolvedValueOnce([[{ precio_unidad: 1000, categoria_id: 2 }]])
            .mockResolvedValueOnce([[{ total: 0 }]]);
        PromocionService.getDescuentoPorProductos.mockResolvedValue(
            new Map([[7, { valor_tipo: 'valor', valor: 999 }]])
        );
        PromocionService.calcularDescuento.mockReturnValue(999);

        const precio = await AgregarItemService._resolverPrecioConPromo(1, 7, 10, 1, 1000);
        expect(precio).toBe(1);
    });
});
