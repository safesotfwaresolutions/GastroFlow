const db = require('../../config/database');

class PedidoAbonoRepository {
    /**
     * @param {import('mysql2/promise').PoolConnection} [connection] Conexión de una transacción en curso (ej. FacturarPedidoService); si no se pasa, usa el pool.
     */
    static _conn(connection) {
        return connection || db;
    }

    static async create({ tenantId, pedidoId, monto, forma_pago, usuarioId, nota }, connection) {
        const [result] = await this._conn(connection).query(
            `INSERT INTO pedido_abonos (tenant_id, pedido_id, monto, forma_pago, usuario_id, nota)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [tenantId, pedidoId, monto, forma_pago, usuarioId || null, nota || null]
        );
        return result.insertId;
    }

    static async findByPedido(pedidoId, tenantId, connection) {
        const [rows] = await this._conn(connection).query(
            `SELECT pa.*, u.nombre_completo AS usuario_nombre
             FROM pedido_abonos pa
             LEFT JOIN usuarios u ON u.id = pa.usuario_id
             WHERE pa.pedido_id = ? AND pa.tenant_id = ?
             ORDER BY pa.created_at ASC`,
            [pedidoId, tenantId]
        );
        return rows;
    }

    /** Abonos que quedaron ligados a una factura ya emitida (auditoría del detalle de factura). */
    static async findByFactura(facturaId) {
        const [rows] = await db.query(
            `SELECT pa.*, u.nombre_completo AS usuario_nombre
             FROM pedido_abonos pa
             LEFT JOIN usuarios u ON u.id = pa.usuario_id
             WHERE pa.factura_id = ?
             ORDER BY pa.created_at ASC`,
            [facturaId]
        );
        return rows;
    }

    /** Suma de abonos del pedido, desglosada por forma de pago. */
    static async sumByPedido(pedidoId, tenantId, connection) {
        const [rows] = await this._conn(connection).query(
            `SELECT forma_pago, COALESCE(SUM(monto), 0) AS total
             FROM pedido_abonos
             WHERE pedido_id = ? AND tenant_id = ?
             GROUP BY forma_pago`,
            [pedidoId, tenantId]
        );
        const sumas = { efectivo: 0, transferencia: 0 };
        rows.forEach(r => {
            sumas[r.forma_pago] = Number(r.total) || 0;
        });
        return sumas;
    }

    /** Vincula los abonos del pedido a la factura recién creada (trazabilidad). */
    static async marcarFacturados(pedidoId, facturaId, connection) {
        await this._conn(connection).query(`UPDATE pedido_abonos SET factura_id = ? WHERE pedido_id = ?`, [
            facturaId,
            pedidoId
        ]);
    }

    static async findById(abonoId, tenantId) {
        const [rows] = await db.query('SELECT * FROM pedido_abonos WHERE id = ? AND tenant_id = ?', [
            abonoId,
            tenantId
        ]);
        return rows[0] || null;
    }

    static async delete(abonoId, tenantId) {
        await db.query('DELETE FROM pedido_abonos WHERE id = ? AND tenant_id = ?', [abonoId, tenantId]);
    }
}

module.exports = PedidoAbonoRepository;
