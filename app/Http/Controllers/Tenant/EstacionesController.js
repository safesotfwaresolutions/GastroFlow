const EstacionService = require('../../../../services/Tenant/EstacionService');

class EstacionesController {
    // GET /estaciones
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/generic', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const [estaciones, categorias] = await Promise.all([
                EstacionService.getAll(tenantId),
                EstacionService.getCategoriasConEstacion(tenantId)
            ]);
            res.render('estaciones/index', {
                estaciones: estaciones || [],
                categorias: categorias || [],
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al obtener estaciones:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al obtener estaciones' } });
        }
    }

    // POST /estaciones
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await EstacionService.create(tenantId, req.body);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /estaciones/:id
    static async update(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await EstacionService.update(Number.parseInt(req.params.id, 10), tenantId, req.body);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /estaciones/:id
    static async destroy(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await EstacionService.delete(Number.parseInt(req.params.id, 10), tenantId);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /estaciones/categorias/:categoriaId
    static async asignarCategoria(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await EstacionService.asignarEstacion(
                Number.parseInt(req.params.categoriaId, 10),
                tenantId,
                req.body.estacion_id ? Number.parseInt(req.body.estacion_id, 10) : null
            );
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = EstacionesController;
