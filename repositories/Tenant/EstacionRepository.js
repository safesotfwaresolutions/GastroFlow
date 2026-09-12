/**
 * EstacionRepository - Estaciones de cocina (KDS) y su asignación a categorías.
 */

const db = require('../../config/database');

class EstacionRepository {
    static async findAll(tenantId, { soloActivas } = {}) {
        let sql = 'SELECT * FROM estaciones WHERE tenant_id = ?';
        const params = [tenantId];
        if (soloActivas) {
            sql += ' AND activa = 1';
        }
        sql += ' ORDER BY orden ASC, nombre ASC';
        const [rows] = await db.query(sql, params);
        return rows;
    }

    static async findById(id, tenantId) {
        const [rows] = await db.query('SELECT * FROM estaciones WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        return rows[0] || null;
    }

    static async create(tenantId, { nombre, orden }) {
        const [result] = await db.query('INSERT INTO estaciones (tenant_id, nombre, orden) VALUES (?, ?, ?)', [
            tenantId,
            nombre,
            orden ?? 0
        ]);
        return result.insertId;
    }

    static async update(id, tenantId, { nombre, orden, activa }) {
        const [result] = await db.query(
            `UPDATE estaciones SET
                nombre = COALESCE(?, nombre),
                orden = COALESCE(?, orden),
                activa = COALESCE(?, activa)
             WHERE id = ? AND tenant_id = ?`,
            [nombre, orden, activa === undefined || activa === null ? null : activa ? 1 : 0, id, tenantId]
        );
        return result.affectedRows;
    }

    static async delete(id, tenantId) {
        // Las categorías que apuntaban a esta estación quedan sin estación
        // (ON DELETE SET NULL en categorias.estacion_id), no se bloquea el borrado.
        const [result] = await db.query('DELETE FROM estaciones WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        return result.affectedRows;
    }

    /**
     * Categorías del tenant con su estación asignada (o NULL), para la pantalla
     * de mapeo categoría -> estación.
     */
    static async findCategoriasConEstacion(tenantId) {
        const [rows] = await db.query(
            `SELECT c.id, c.nombre, c.estacion_id, e.nombre AS estacion_nombre
             FROM categorias c
             LEFT JOIN estaciones e ON e.id = c.estacion_id
             WHERE c.tenant_id = ? AND c.activa = 1
             ORDER BY c.nombre ASC`,
            [tenantId]
        );
        return rows;
    }

    static async asignarEstacion(categoriaId, tenantId, estacionId) {
        const [result] = await db.query('UPDATE categorias SET estacion_id = ? WHERE id = ? AND tenant_id = ?', [
            estacionId || null,
            categoriaId,
            tenantId
        ]);
        return result.affectedRows;
    }
}

module.exports = EstacionRepository;
