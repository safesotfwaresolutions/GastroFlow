/**
 * EstacionService - Estaciones de cocina (KDS): CRUD + asignación de categorías.
 */

const EstacionRepository = require('../../repositories/Tenant/EstacionRepository');

class EstacionService {
    static async getAll(tenantId) {
        return EstacionRepository.findAll(tenantId);
    }

    static async create(tenantId, data) {
        if (!data.nombre || !data.nombre.trim()) {
            throw new Error('El nombre de la estación es requerido');
        }
        const id = await EstacionRepository.create(tenantId, { nombre: data.nombre.trim(), orden: data.orden });
        return { id, message: 'Estación creada correctamente' };
    }

    static async update(id, tenantId, data) {
        const affectedRows = await EstacionRepository.update(id, tenantId, data);
        if (affectedRows === 0) {
            throw new Error('Estación no encontrada');
        }
        return { message: 'Estación actualizada correctamente' };
    }

    static async delete(id, tenantId) {
        const affectedRows = await EstacionRepository.delete(id, tenantId);
        if (affectedRows === 0) {
            throw new Error('Estación no encontrada');
        }
        return { message: 'Estación eliminada' };
    }

    static async getCategoriasConEstacion(tenantId) {
        return EstacionRepository.findCategoriasConEstacion(tenantId);
    }

    static async asignarEstacion(categoriaId, tenantId, estacionId) {
        const affectedRows = await EstacionRepository.asignarEstacion(categoriaId, tenantId, estacionId || null);
        if (affectedRows === 0) {
            throw new Error('Categoría no encontrada');
        }
        return { message: 'Categoría actualizada' };
    }
}

module.exports = EstacionService;
