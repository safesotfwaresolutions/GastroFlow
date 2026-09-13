const CocinaService = require('../../../../services/Tenant/CocinaService');
const EstacionService = require('../../../../services/Tenant/EstacionService');

/** Filtrado por permisos, compartido por index/getQueue/kds. */
function filtrarPorPermisos(items, user) {
    if (!user || user.rol === 'admin') {
        return items;
    }
    const canSeeAll = user.permisos?.includes('cocina.ver_todo');
    const canSeeReady = user.permisos?.includes('cocina.ver_listos');

    if (canSeeAll) {
        return items;
    }
    if (canSeeReady) {
        return items.filter(it => it.estado === 'listo');
    }
    return [];
}

class CocinaController {
    // GET /cocina
    // Una sola vista: agrupación por mesa (clásica) o por estación (KDS), con un
    // toggle del lado del cliente. Ambos modos comparten la misma cola de datos,
    // así que aquí se resuelven items + estaciones activas de una vez.
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });
            }

            const [items, estaciones] = await Promise.all([
                CocinaService.getQueue(tenantId),
                EstacionService.getAll(tenantId)
            ]);

            res.render('cocina/index', {
                items: filtrarPorPermisos(items, req.user) || [],
                estaciones: (estaciones || []).filter(e => e.activa),
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al cargar cocina:', error);
            res.status(500).render('errors/internal', {
                error: { message: 'Error al cargar cocina', stack: error.stack }
            });
        }
    }

    // GET /cocina/kds — ruta antigua, se conserva como redirección para no
    // romper accesos guardados (favoritos, apps de escritorio en modo kiosco).
    static redirectKds(req, res) {
        res.redirect(301, '/cocina');
    }

    // GET /cocina/cola
    static async getQueue(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }

            const items = filtrarPorPermisos(await CocinaService.getQueue(tenantId), req.user);
            res.json(items);
        } catch (error) {
            console.error('Error al obtener cola:', error);
            res.status(500).json({ error: 'Error al obtener cola' });
        }
    }

    // PUT /cocina/item/:id/estado
    static async updateItemEstado(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id);
            const { estado } = req.body || {};
            const result = await CocinaService.updateItemEstado(id, tenantId, estado);
            res.json(result);
        } catch (error) {
            console.error('Error al actualizar estado en cocina:', error);
            if (error.message === 'Estado inválido' || error.message.includes('no encontrado')) {
                const statusCode = error.message === 'Estado inválido' ? 400 : 404;
                return res.status(statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error al actualizar estado' });
        }
    }

    // PUT /cocina/preparar-lote
    static async updateGroupEstado(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }

            const { productoNombre, nota, estado, modificadoresHash } = req.body || {};
            if (!productoNombre || !estado) {
                return res.status(400).json({ error: 'productoNombre y estado son requeridos' });
            }

            const result = await CocinaService.updateGroupEstado(
                tenantId,
                productoNombre,
                nota,
                estado,
                modificadoresHash
            );
            res.json(result);
        } catch (error) {
            console.error('Error al actualizar lote en cocina:', error);
            res.status(500).json({ error: 'Error al actualizar lote' });
        }
    }

    // PUT /cocina/pedidos/:pedidoId/completar
    static async completarPedidoPOS(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const pedidoId = parseInt(req.params.pedidoId);
            const result = await CocinaService.completarPedidoPOS(pedidoId, tenantId);
            res.json(result);
        } catch (error) {
            console.error('Error al completar pedido POS:', error);
            if (error.message === 'Pedido no encontrado') {
                return res.status(404).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error al completar pedido' });
        }
    }

    // PUT /cocina/pedidos/:pedidoId/cancelar
    static async cancelarPedidoPOS(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const pedidoId = parseInt(req.params.pedidoId);
            const pedido = await CocinaService.cancelarPedidoPOS(pedidoId, tenantId);
            if (!pedido) {
                return res.status(404).json({ error: 'Pedido no encontrado' });
            }
            res.json({ message: 'Pedido cancelado' });
        } catch (error) {
            console.error('Error al cancelar pedido POS:', error);
            res.status(500).json({ error: 'Error al cancelar pedido' });
        }
    }
}

module.exports = CocinaController;
