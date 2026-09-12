const express = require('express');
const router = express.Router();
const EstacionesController = require('../../app/Http/Controllers/Tenant/EstacionesController');
const { requirePermission } = require('../../middleware/auth');

router.get('/', requirePermission('cocina.gestionar'), EstacionesController.index);
router.post('/', requirePermission('cocina.gestionar'), EstacionesController.store);
router.put('/:id', requirePermission('cocina.gestionar'), EstacionesController.update);
router.delete('/:id', requirePermission('cocina.gestionar'), EstacionesController.destroy);
router.put('/categorias/:categoriaId', requirePermission('cocina.gestionar'), EstacionesController.asignarCategoria);

module.exports = router;
