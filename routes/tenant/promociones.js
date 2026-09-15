const express = require('express');
const router = express.Router();
const PromocionesController = require('../../app/Http/Controllers/Tenant/PromocionesController');
const { requirePermission } = require('../../middleware/auth');

// GET /promociones - listado + vista de administración
router.get('/', requirePermission('promociones.ver'), PromocionesController.index);

// POST /promociones - crear
router.post('/', requirePermission('promociones.gestionar'), PromocionesController.store);

// GET /promociones/:id - detalle (productos/categorías asignadas)
router.get('/:id', requirePermission('promociones.ver'), PromocionesController.show);

// PUT /promociones/:id - editar
router.put('/:id', requirePermission('promociones.gestionar'), PromocionesController.update);

// DELETE /promociones/:id
router.delete('/:id', requirePermission('promociones.gestionar'), PromocionesController.destroy);

module.exports = router;
