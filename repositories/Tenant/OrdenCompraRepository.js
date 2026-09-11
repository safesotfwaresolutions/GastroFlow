/**
 * OrdenCompraRepository - Órdenes de compra a proveedor (header + líneas).
 */

const db = require('../../config/database');

class OrdenCompraRepository {
    static async findAll(tenantId, { estado, proveedor_id } = {}) {
        let sql = `
            SELECT oc.*, p.nombre AS proveedor_nombre,
                   (SELECT COUNT(*) FROM orden_compra_items i WHERE i.orden_compra_id = oc.id) AS total_items
            FROM ordenes_compra oc
            JOIN proveedores p ON p.id = oc.proveedor_id
            WHERE oc.tenant_id = ?
        `;
        const params = [tenantId];
        if (estado) {
            sql += ' AND oc.estado = ?';
            params.push(estado);
        }
        if (proveedor_id) {
            sql += ' AND oc.proveedor_id = ?';
            params.push(proveedor_id);
        }
        sql += ' ORDER BY oc.created_at DESC';
        const [rows] = await db.query(sql, params);
        return rows;
    }

    static async findById(id, tenantId) {
        const [ordenes] = await db.query(
            `SELECT oc.*, p.nombre AS proveedor_nombre
             FROM ordenes_compra oc
             JOIN proveedores p ON p.id = oc.proveedor_id
             WHERE oc.id = ? AND oc.tenant_id = ?`,
            [id, tenantId]
        );
        const orden = ordenes[0];
        if (!orden) {
            return null;
        }

        const [items] = await db.query(
            `SELECT oci.*, i.nombre AS insumo_nombre, i.codigo AS insumo_codigo, i.unidad_base
             FROM orden_compra_items oci
             JOIN insumos i ON i.id = oci.insumo_id
             WHERE oci.orden_compra_id = ?
             ORDER BY oci.id ASC`,
            [id]
        );
        orden.items = items;
        return orden;
    }

    /**
     * @param {number} tenantId
     * @param {{proveedor_id:number, notas?:string, items: Array<{insumo_id:number, cantidad_pedida:number, costo_unitario_estimado?:number}>}} data
     */
    static async create(tenantId, data) {
        const { proveedor_id, notas, items } = data;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [result] = await conn.query(
                'INSERT INTO ordenes_compra (tenant_id, proveedor_id, notas) VALUES (?, ?, ?)',
                [tenantId, proveedor_id, notas || null]
            );
            const ordenId = result.insertId;

            for (const item of items) {
                await conn.query(
                    `INSERT INTO orden_compra_items (orden_compra_id, insumo_id, cantidad_pedida, costo_unitario_estimado)
                     VALUES (?, ?, ?, ?)`,
                    [ordenId, item.insumo_id, item.cantidad_pedida, item.costo_unitario_estimado ?? null]
                );
            }

            await conn.commit();
            return ordenId;
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    }

    /**
     * Marca la orden como recibida y guarda la cantidad realmente recibida por línea.
     * No toca inventario -- eso lo hace OrdenCompraService (llama a InventarioService).
     * @param {Array<{id:number, cantidad_recibida:number}>} itemsRecibidos
     */
    static async marcarRecibida(id, tenantId, itemsRecibidos) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [ordenes] = await conn.query(
                'SELECT id, estado FROM ordenes_compra WHERE id = ? AND tenant_id = ? FOR UPDATE',
                [id, tenantId]
            );
            const orden = ordenes[0];
            if (!orden) {
                throw new Error('Orden de compra no encontrada');
            }
            if (orden.estado !== 'pendiente') {
                throw new Error(`La orden ya está ${orden.estado}, no se puede recibir`);
            }

            for (const item of itemsRecibidos) {
                await conn.query(
                    'UPDATE orden_compra_items SET cantidad_recibida = ? WHERE id = ? AND orden_compra_id = ?',
                    [item.cantidad_recibida, item.id, id]
                );
            }

            await conn.query("UPDATE ordenes_compra SET estado = 'recibida', fecha_recepcion = NOW() WHERE id = ?", [
                id
            ]);

            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    }

    static async cancelar(id, tenantId) {
        const [result] = await db.query(
            "UPDATE ordenes_compra SET estado = 'cancelada' WHERE id = ? AND tenant_id = ? AND estado = 'pendiente'",
            [id, tenantId]
        );
        return result.affectedRows;
    }
}

module.exports = OrdenCompraRepository;
