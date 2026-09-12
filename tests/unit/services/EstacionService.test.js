/**
 * Tests unitarios para EstacionService (repository mockeado).
 */

jest.mock('../../../repositories/Tenant/EstacionRepository', () => ({
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findCategoriasConEstacion: jest.fn(),
    asignarEstacion: jest.fn()
}));

const EstacionService = require('../../../services/Tenant/EstacionService');
const EstacionRepository = require('../../../repositories/Tenant/EstacionRepository');

describe('EstacionService', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('create', () => {
        it('rechaza un nombre vacío', async () => {
            await expect(EstacionService.create(1, { nombre: '   ' })).rejects.toThrow(
                'nombre de la estación es requerido'
            );
            expect(EstacionRepository.create).not.toHaveBeenCalled();
        });

        it('crea la estación con el nombre recortado', async () => {
            EstacionRepository.create.mockResolvedValue(7);
            const result = await EstacionService.create(1, { nombre: '  Parrilla  ', orden: 4 });
            expect(EstacionRepository.create).toHaveBeenCalledWith(1, { nombre: 'Parrilla', orden: 4 });
            expect(result.id).toBe(7);
        });
    });

    describe('update', () => {
        it('lanza si no se actualizó ninguna fila (no existe o no es del tenant)', async () => {
            EstacionRepository.update.mockResolvedValue(0);
            await expect(EstacionService.update(99, 1, { nombre: 'X' })).rejects.toThrow('Estación no encontrada');
        });

        it('actualiza correctamente', async () => {
            EstacionRepository.update.mockResolvedValue(1);
            const result = await EstacionService.update(1, 1, { nombre: 'Fría' });
            expect(result.message).toMatch(/actualizada/i);
        });
    });

    describe('delete', () => {
        it('lanza si no existe', async () => {
            EstacionRepository.delete.mockResolvedValue(0);
            await expect(EstacionService.delete(99, 1)).rejects.toThrow('Estación no encontrada');
        });

        it('elimina correctamente', async () => {
            EstacionRepository.delete.mockResolvedValue(1);
            const result = await EstacionService.delete(1, 1);
            expect(result.message).toMatch(/eliminada/i);
        });
    });

    describe('asignarEstacion', () => {
        it('lanza si la categoría no existe/no es del tenant', async () => {
            EstacionRepository.asignarEstacion.mockResolvedValue(0);
            await expect(EstacionService.asignarEstacion(99, 1, 2)).rejects.toThrow('Categoría no encontrada');
        });

        it('permite desasignar (estacion_id null)', async () => {
            EstacionRepository.asignarEstacion.mockResolvedValue(1);
            const result = await EstacionService.asignarEstacion(1, 1, null);
            expect(EstacionRepository.asignarEstacion).toHaveBeenCalledWith(1, 1, null);
            expect(result.message).toMatch(/actualizada/i);
        });
    });
});
