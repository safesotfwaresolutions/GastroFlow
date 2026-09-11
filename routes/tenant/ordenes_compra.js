const express = require('express');
const router = express.Router();
const OrdenesCompraController = require('../../app/Http/Controllers/Tenant/OrdenesCompraController');
const { requirePermission } = require('../../middleware/auth');

router.get('/', requirePermission('proveedores.ordenes'), OrdenesCompraController.index);
router.get('/:id', requirePermission('proveedores.ordenes'), OrdenesCompraController.show);
router.post('/', requirePermission('proveedores.ordenes'), OrdenesCompraController.store);
router.put('/:id/recibir', requirePermission('proveedores.ordenes'), OrdenesCompraController.recibir);
router.put('/:id/cancelar', requirePermission('proveedores.ordenes'), OrdenesCompraController.cancelar);

module.exports = router;
