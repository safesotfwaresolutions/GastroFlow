const OrdenCompraService = require('../../../../services/Tenant/OrdenCompraService');
const ProveedorService = require('../../../../services/Tenant/ProveedorService');

class OrdenesCompraController {
    // GET /ordenes-compra
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/generic', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const [ordenes, proveedores] = await Promise.all([
                OrdenCompraService.listar(tenantId, {}),
                ProveedorService.getAll(tenantId)
            ]);
            res.render('ordenes_compra/index', {
                ordenes: ordenes || [],
                proveedores: proveedores || [],
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al obtener órdenes de compra:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al obtener órdenes de compra' } });
        }
    }

    // GET /ordenes-compra/:id
    static async show(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const orden = await OrdenCompraService.getDetalle(Number.parseInt(req.params.id, 10), tenantId);
            res.json(orden);
        } catch (error) {
            res.status(error.message === 'Orden de compra no encontrada' ? 404 : 500).json({ error: error.message });
        }
    }

    // POST /ordenes-compra
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await OrdenCompraService.crear(tenantId, req.body);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /ordenes-compra/:id/recibir
    static async recibir(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await OrdenCompraService.recibir(
                Number.parseInt(req.params.id, 10),
                tenantId,
                req.body.items
            );
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /ordenes-compra/:id/cancelar
    static async cancelar(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await OrdenCompraService.cancelar(Number.parseInt(req.params.id, 10), tenantId);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = OrdenesCompraController;
