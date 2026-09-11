/**
 * Tests unitarios para InsumoService: los dos arreglos de inventario.
 *  - delete: bloquea si el insumo está en una receta; si no, borra insumo + su
 *    bitácora de movimientos en una transacción (antes la FK RESTRICT lo impedía).
 *  - update: si se cambian las "existencias actuales", registra un movimiento de
 *    ajuste por la diferencia en vez de sobreescribir stock_actual.
 */

jest.mock('../../../repositories/Tenant/InsumoRepository', () => ({
    findById: jest.fn(),
    findByCodigo: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteConHistorial: jest.fn(),
    findRecetasQueUsan: jest.fn()
}));
jest.mock('../../../services/Tenant/InventarioService', () => ({
    registrarAjuste: jest.fn().mockResolvedValue({ nuevoStock: 0 })
}));
jest.mock('../../../utils/unidadesCosteo', () => ({
    derivarTipoBase: jest.fn(() => 'g')
}));

const InsumoService = require('../../../services/Tenant/InsumoService');
const InsumoRepository = require('../../../repositories/Tenant/InsumoRepository');
const InventarioService = require('../../../services/Tenant/InventarioService');

describe('InsumoService.delete', () => {
    beforeEach(() => jest.clearAllMocks());

    it('lanza "Insumo no encontrado" si no existe', async () => {
        InsumoRepository.findById.mockResolvedValue(null);
        await expect(InsumoService.delete(9, 1)).rejects.toThrow('Insumo no encontrado');
    });

    it('bloquea el borrado y nombra los productos cuando el insumo está en recetas', async () => {
        InsumoRepository.findById.mockResolvedValue({ id: 9, nombre: 'Queso', stock_actual: 0 });
        InsumoRepository.findRecetasQueUsan.mockResolvedValue([
            { nombre_receta: 'r1', producto_nombre: 'Hamburguesa' },
            { nombre_receta: 'r2', producto_nombre: 'Pizza' }
        ]);
        await expect(InsumoService.delete(9, 1)).rejects.toThrow(/Hamburguesa, Pizza/);
        expect(InsumoRepository.deleteConHistorial).not.toHaveBeenCalled();
    });

    it('borra insumo + historial de movimientos cuando NO está en ninguna receta', async () => {
        InsumoRepository.findById.mockResolvedValue({ id: 9, nombre: 'Servilletas', stock_actual: 10 });
        InsumoRepository.findRecetasQueUsan.mockResolvedValue([]);
        InsumoRepository.deleteConHistorial.mockResolvedValue({ affectedRows: 1 });

        const res = await InsumoService.delete(9, 1);

        expect(res).toEqual({ message: 'Insumo eliminado' });
        expect(InsumoRepository.deleteConHistorial).toHaveBeenCalledWith(9, 1);
    });

    it('traduce un error de llave foránea residual a un mensaje claro', async () => {
        InsumoRepository.findById.mockResolvedValue({ id: 9, nombre: 'X', stock_actual: 0 });
        InsumoRepository.findRecetasQueUsan.mockResolvedValue([]);
        const fk = new Error('FK');
        fk.code = 'ER_ROW_IS_REFERENCED_2';
        InsumoRepository.deleteConHistorial.mockRejectedValue(fk);
        await expect(InsumoService.delete(9, 1)).rejects.toThrow(/aún lo referencia/);
    });
});

describe('InsumoService.update (existencias actuales)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('registra un ajuste por la diferencia cuando cambian las existencias', async () => {
        InsumoRepository.findById.mockResolvedValue({ id: 5, nombre: 'Harina', codigo: 'H1', stock_actual: '8' });
        InsumoRepository.update.mockResolvedValue({});

        await InsumoService.update(5, 1, { stock_actual: 3 });

        expect(InventarioService.registrarAjuste).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ insumo_id: 5, cantidad: -5 })
        );
    });

    it('NO registra ajuste si las existencias no cambian', async () => {
        InsumoRepository.findById.mockResolvedValue({ id: 5, nombre: 'Harina', codigo: 'H1', stock_actual: '8' });
        InsumoRepository.update.mockResolvedValue({});

        await InsumoService.update(5, 1, { stock_actual: 8 });

        expect(InventarioService.registrarAjuste).not.toHaveBeenCalled();
    });

    it('NO registra ajuste si no se envía stock_actual', async () => {
        InsumoRepository.findById.mockResolvedValue({ id: 5, nombre: 'Harina', codigo: 'H1', stock_actual: '8' });
        InsumoRepository.update.mockResolvedValue({});

        await InsumoService.update(5, 1, { nombre: 'Harina 000' });

        expect(InventarioService.registrarAjuste).not.toHaveBeenCalled();
    });

    it('ignora un stock_actual negativo', async () => {
        InsumoRepository.findById.mockResolvedValue({ id: 5, nombre: 'Harina', codigo: 'H1', stock_actual: '8' });
        InsumoRepository.update.mockResolvedValue({});

        await InsumoService.update(5, 1, { stock_actual: -2 });

        expect(InventarioService.registrarAjuste).not.toHaveBeenCalled();
    });
});
