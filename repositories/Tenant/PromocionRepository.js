/**
 * PromocionRepository - Acceso a datos de promociones (Fase 1: descuento
 * automático por día/hora sobre productos, categorías, o todo el catálogo).
 */
const db = require('../../config/database');

class PromocionRepository {
    static async create({
        tenantId,
        nombre,
        valorTipo,
        valor,
        cantidadMinima,
        diasSemana,
        horaInicio,
        horaFin,
        fechaInicio,
        fechaFin,
        activa,
        usuarioCreadorId
    }) {
        const [result] = await db.query(
            `INSERT INTO promociones
                (tenant_id, nombre, tipo, valor_tipo, valor, cantidad_minima, dias_semana, hora_inicio, hora_fin, fecha_inicio, fecha_fin, activa, usuario_creador_id)
             VALUES (?, ?, 'descuento', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId,
                nombre,
                valorTipo,
                valor,
                cantidadMinima || 1,
                diasSemana || null,
                horaInicio || null,
                horaFin || null,
                fechaInicio || null,
                fechaFin || null,
                activa === undefined ? true : !!activa,
                usuarioCreadorId || null
            ]
        );
        return result.insertId;
    }

    static async update(id, tenantId, fields) {
        const columnas = {
            nombre: 'nombre',
            valorTipo: 'valor_tipo',
            valor: 'valor',
            cantidadMinima: 'cantidad_minima',
            diasSemana: 'dias_semana',
            horaInicio: 'hora_inicio',
            horaFin: 'hora_fin',
            fechaInicio: 'fecha_inicio',
            fechaFin: 'fecha_fin',
            activa: 'activa'
        };
        const sets = [];
        const params = [];
        for (const [key, column] of Object.entries(columnas)) {
            if (Object.prototype.hasOwnProperty.call(fields, key)) {
                sets.push(`${column} = ?`);
                params.push(fields[key]);
            }
        }
        if (sets.length === 0) {
            return;
        }
        params.push(id, tenantId);
        await db.query(`UPDATE promociones SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
    }

    static async delete(id, tenantId) {
        await db.query('DELETE FROM promociones WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    }

    static async findById(id, tenantId) {
        const [rows] = await db.query('SELECT * FROM promociones WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        return rows[0] || null;
    }

    static async getAll(tenantId) {
        const [rows] = await db.query(
            `SELECT p.*,
                    (SELECT COUNT(*) FROM promocion_productos pp WHERE pp.promocion_id = p.id) AS productos_count,
                    (SELECT COUNT(*) FROM promocion_categorias pc WHERE pc.promocion_id = p.id) AS categorias_count
             FROM promociones p
             WHERE p.tenant_id = ?
             ORDER BY p.created_at DESC`,
            [tenantId]
        );
        return rows;
    }

    /** Promociones activas y dentro de su vigencia por fecha (día de la semana/hora se filtran en el servicio). */
    static async getActivasVigentes(tenantId, fechaHoy) {
        const [rows] = await db.query(
            `SELECT * FROM promociones
             WHERE tenant_id = ? AND activa = 1
               AND (fecha_inicio IS NULL OR fecha_inicio <= ?)
               AND (fecha_fin IS NULL OR fecha_fin >= ?)`,
            [tenantId, fechaHoy, fechaHoy]
        );
        return rows;
    }

    static async setProductos(promocionId, productoIds) {
        await db.query('DELETE FROM promocion_productos WHERE promocion_id = ?', [promocionId]);
        if (productoIds && productoIds.length > 0) {
            await db.query('INSERT INTO promocion_productos (promocion_id, producto_id) VALUES ?', [
                productoIds.map(pid => [promocionId, pid])
            ]);
        }
    }

    static async setCategorias(promocionId, categoriaIds) {
        await db.query('DELETE FROM promocion_categorias WHERE promocion_id = ?', [promocionId]);
        if (categoriaIds && categoriaIds.length > 0) {
            await db.query('INSERT INTO promocion_categorias (promocion_id, categoria_id) VALUES ?', [
                categoriaIds.map(cid => [promocionId, cid])
            ]);
        }
    }

    static async getProductoIds(promocionId) {
        const [rows] = await db.query('SELECT producto_id FROM promocion_productos WHERE promocion_id = ?', [
            promocionId
        ]);
        return rows.map(r => r.producto_id);
    }

    static async getCategoriaIds(promocionId) {
        const [rows] = await db.query('SELECT categoria_id FROM promocion_categorias WHERE promocion_id = ?', [
            promocionId
        ]);
        return rows.map(r => r.categoria_id);
    }

    /** Alcance (producto_id[]/categoria_id[]) de un lote de promociones, en 2 queries en vez de N+1. */
    static async getAlcancePorPromociones(promocionIds) {
        if (!promocionIds || promocionIds.length === 0) {
            return { productosPorPromocion: new Map(), categoriasPorPromocion: new Map() };
        }
        const [productosRows] = await db.query(
            'SELECT promocion_id, producto_id FROM promocion_productos WHERE promocion_id IN (?)',
            [promocionIds]
        );
        const [categoriasRows] = await db.query(
            'SELECT promocion_id, categoria_id FROM promocion_categorias WHERE promocion_id IN (?)',
            [promocionIds]
        );

        const productosPorPromocion = new Map();
        productosRows.forEach(r => {
            if (!productosPorPromocion.has(r.promocion_id)) {
                productosPorPromocion.set(r.promocion_id, new Set());
            }
            productosPorPromocion.get(r.promocion_id).add(r.producto_id);
        });

        const categoriasPorPromocion = new Map();
        categoriasRows.forEach(r => {
            if (!categoriasPorPromocion.has(r.promocion_id)) {
                categoriasPorPromocion.set(r.promocion_id, new Set());
            }
            categoriasPorPromocion.get(r.promocion_id).add(r.categoria_id);
        });

        return { productosPorPromocion, categoriasPorPromocion };
    }
}

module.exports = PromocionRepository;
