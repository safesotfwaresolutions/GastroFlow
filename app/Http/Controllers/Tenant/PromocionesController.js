const PromocionService = require('../../../../services/Tenant/PromocionService');
const ProductRepository = require('../../../../repositories/Tenant/ProductRepository');
// Reusa la misma consulta de categorías que ya usa /estaciones para su selector
// de "asignar categoría" -- misma necesidad (listar categorías del tenant).
const EstacionRepository = require('../../../../repositories/Tenant/EstacionRepository');

class PromocionesController {
    // GET /promociones
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/generic', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const [promociones, productos, categorias] = await Promise.all([
                PromocionService.listar(tenantId),
                ProductRepository.findAll(tenantId),
                EstacionRepository.findCategoriasConEstacion(tenantId)
            ]);
            res.render('promociones/index', {
                promociones: promociones || [],
                productos: productos || [],
                categorias: categorias || [],
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al obtener promociones:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al obtener promociones' } });
        }
    }

    // POST /promociones
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await PromocionService.crear(tenantId, req.body, req.user?.id || null);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // GET /promociones/:id
    static async show(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const detalle = await PromocionService.getDetalle(Number.parseInt(req.params.id, 10), tenantId);
            res.json(detalle);
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    // PUT /promociones/:id
    static async update(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await PromocionService.actualizar(Number.parseInt(req.params.id, 10), tenantId, req.body);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /promociones/:id
    static async destroy(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await PromocionService.eliminar(Number.parseInt(req.params.id, 10), tenantId);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = PromocionesController;
