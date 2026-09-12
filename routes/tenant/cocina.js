const express = require('express');
const router = express.Router();
const CocinaController = require('../../app/Http/Controllers/Tenant/CocinaController');

// GET /cocina - Cola cocina vista
router.get('/', CocinaController.index);

// GET /cocina/kds - Vista KDS por estación (reusa /cocina/cola para los datos)
router.get('/kds', CocinaController.kds);

// API Cola
router.get('/cola', CocinaController.getQueue);

// API Estado item
router.put('/item/:id/estado', CocinaController.updateItemEstado);

// API Lote
router.put('/preparar-lote', CocinaController.updateGroupEstado);

// API Completar pedido de mostrador (POS)
router.put('/pedidos/:pedidoId/completar', CocinaController.completarPedidoPOS);

// API Cancelar pedido de mostrador (POS)
router.put('/pedidos/:pedidoId/cancelar', CocinaController.cancelarPedidoPOS);

module.exports = router;
