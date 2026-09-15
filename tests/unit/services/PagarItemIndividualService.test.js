jest.mock('../../../config/database', () => ({
    query: jest.fn()
}));
jest.mock('../../../repositories/Tenant/PedidoItemPagoRepository');

const db = require('../../../config/database');
const PedidoItemPagoRepository = require('../../../repositories/Tenant/PedidoItemPagoRepository');
const PagarItemIndividualService = require('../../../services/Tenant/Mesas/PagarItemIndividualService');

describe('PagarItemIndividualService (auditoría de pago por producto)', () => {
    const itemRow = {
        id: 5,
        cantidad: 2,
        precio_unitario: 8000,
        pedido_id: 10,
        producto_id: 3,
        unidad_medida: 'UND',
        estado: 'servido',
        nota: null,
        enviado_at: null,
        preparado_at: null,
        listo_at: null,
        servido_at: null,
        subtotal: 16000,
        mesa_id: 1
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('registra el pago completo del item con la cantidad, monto y usuario correctos', async () => {
        db.query
            .mockResolvedValueOnce([[itemRow]]) // SELECT item
            .mockResolvedValueOnce([[]]) // SELECT existingPaidRows (ninguna fila ya pagada de este producto)
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE pedido_items SET pagado = 1 ...

        await PagarItemIndividualService.execute({
            tenantId: 1,
            itemId: 5,
            forma_pago: 'efectivo',
            cantidad: 2,
            usuarioId: 7,
            skipEvent: true
        });

        expect(PedidoItemPagoRepository.create).toHaveBeenCalledWith({
            tenantId: 1,
            pedidoId: 10,
            productoId: 3,
            cantidad: 2,
            monto: 16000, // 2 * 8000
            formaPago: 'efectivo',
            usuarioId: 7
        });
    });

    it('registra solo la cantidad pagada, no la del item completo, en un pago parcial', async () => {
        db.query
            .mockResolvedValueOnce([[itemRow]]) // SELECT item (cantidad total = 2)
            .mockResolvedValueOnce([[]]) // sin fila ya pagada
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE deja el sobrante
            .mockResolvedValueOnce([{ insertId: 99 }]) // INSERT del sobrante como nueva fila sin pagar
            .mockResolvedValueOnce([[]]); // SELECT pedido_item_modificadores del item original (sin toppings)

        await PagarItemIndividualService.execute({
            tenantId: 1,
            itemId: 5,
            forma_pago: 'transferencia',
            cantidad: 1, // paga solo 1 de las 2 unidades
            usuarioId: 9,
            skipEvent: true
        });

        expect(PedidoItemPagoRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ cantidad: 1, monto: 8000, formaPago: 'transferencia', usuarioId: 9 })
        );
    });

    it('no lanza si falla el registro de auditoría (no bloqueante: el pago del item ya se aplicó)', async () => {
        db.query
            .mockResolvedValueOnce([[itemRow]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        PedidoItemPagoRepository.create.mockRejectedValue(new Error('auditoría caída'));

        await expect(
            PagarItemIndividualService.execute({
                tenantId: 1,
                itemId: 5,
                forma_pago: 'efectivo',
                cantidad: 2,
                usuarioId: 7,
                skipEvent: true
            })
        ).resolves.toEqual({ message: 'Item pagado correctamente' });
    });

    it('busca la fila ya pagada a fusionar filtrando también por precio_unitario y modificadores_hash (no solo producto_id)', async () => {
        const itemConTopping = { ...itemRow, precio_unitario: 14000, modificadores_hash: '797,802,806' };
        db.query
            .mockResolvedValueOnce([[itemConTopping]]) // SELECT item
            .mockResolvedValueOnce([[]]) // SELECT existingPaidRows
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE pedido_items SET pagado = 1 ...

        await PagarItemIndividualService.execute({
            tenantId: 1,
            itemId: 5,
            forma_pago: 'efectivo',
            cantidad: 2,
            usuarioId: 7,
            skipEvent: true
        });

        const [existingPaidQuery, existingPaidParams] = db.query.mock.calls[1];
        expect(existingPaidQuery).toMatch(/precio_unitario\s*=\s*\?/);
        expect(existingPaidQuery).toMatch(/modificadores_hash/);
        expect(existingPaidParams).toEqual([10, 3, 'efectivo', 14000, '797,802,806']);
    });

    it('usuarioId es null si no se pasa (compatibilidad con llamadas viejas)', async () => {
        db.query
            .mockResolvedValueOnce([[itemRow]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await PagarItemIndividualService.execute({
            tenantId: 1,
            itemId: 5,
            forma_pago: 'efectivo',
            cantidad: 2,
            skipEvent: true
        });

        expect(PedidoItemPagoRepository.create).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: null }));
    });
});
