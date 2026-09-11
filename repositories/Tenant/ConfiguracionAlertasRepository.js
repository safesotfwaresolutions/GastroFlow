/**
 * ConfiguracionAlertasRepository - Config de alertas proactivas por email (1:1 con tenant).
 * Mismo patrón que ConfiguracionCosteoRepository.
 */

const db = require('../../config/database');

const COLUMNA_COOLDOWN = {
    stock: 'ultima_alerta_stock_at',
    ventas: 'ultima_alerta_ventas_at',
    mesa: 'ultima_alerta_mesa_at'
};

class ConfiguracionAlertasRepository {
    static async findOne(tenantId) {
        const [rows] = await db.query('SELECT * FROM configuracion_alertas WHERE tenant_id = ? LIMIT 1', [tenantId]);
        return rows[0] || null;
    }

    static async create(tenantId, data) {
        const {
            alertas_activas = 1,
            email_notificacion = null,
            umbral_horas_mesa = 2,
            umbral_caida_ventas_pct = 40
        } = data || {};
        const [result] = await db.query(
            `INSERT INTO configuracion_alertas
             (tenant_id, alertas_activas, email_notificacion, umbral_horas_mesa, umbral_caida_ventas_pct)
             VALUES (?, ?, ?, ?, ?)`,
            [tenantId, alertas_activas ? 1 : 0, email_notificacion, umbral_horas_mesa, umbral_caida_ventas_pct]
        );
        return result.insertId;
    }

    static async update(tenantId, data) {
        const { alertas_activas, email_notificacion, umbral_horas_mesa, umbral_caida_ventas_pct } = data;
        const [result] = await db.query(
            `UPDATE configuracion_alertas SET
             alertas_activas = COALESCE(?, alertas_activas),
             email_notificacion = ?,
             umbral_horas_mesa = COALESCE(?, umbral_horas_mesa),
             umbral_caida_ventas_pct = COALESCE(?, umbral_caida_ventas_pct)
             WHERE tenant_id = ?`,
            [
                alertas_activas === undefined || alertas_activas === null ? null : alertas_activas ? 1 : 0,
                email_notificacion === undefined ? null : email_notificacion,
                umbral_horas_mesa,
                umbral_caida_ventas_pct,
                tenantId
            ]
        );
        return result;
    }

    static async upsert(tenantId, data) {
        const existing = await this.findOne(tenantId);
        if (existing) {
            await this.update(tenantId, data);
            return existing.id;
        }
        return this.create(tenantId, data);
    }

    /**
     * Config de todos los tenants con alertas activas (para el cron).
     */
    static async findAllActivas() {
        const [rows] = await db.query(
            `SELECT ca.*, t.email AS tenant_email, t.nombre AS tenant_nombre, t.activo AS tenant_activo
             FROM configuracion_alertas ca
             JOIN tenants t ON t.id = ca.tenant_id
             WHERE ca.alertas_activas = 1 AND t.activo = 1`
        );
        return rows;
    }

    /**
     * @param {'stock'|'ventas'|'mesa'} tipo
     */
    static async marcarAlertaEnviada(tenantId, tipo) {
        const columna = COLUMNA_COOLDOWN[tipo];
        if (!columna) {
            throw new Error(`Tipo de alerta desconocido: ${tipo}`);
        }
        await db.query(`UPDATE configuracion_alertas SET ${columna} = NOW() WHERE tenant_id = ?`, [tenantId]);
    }
}

module.exports = ConfiguracionAlertasRepository;
