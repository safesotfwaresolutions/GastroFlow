-- 095_pedido_abonos.sql
-- Abonos libres a la cuenta: pagos parciales de un pedido ABIERTO que no van
-- ligados a ningún producto puntual (ej. "me dieron 15.000 en efectivo, el
-- resto lo pasan por transferencia más tarde"). Se acumulan mientras la mesa
-- sigue abierta y, al facturar, se suman a lo que ya viene marcado por ítem
-- (pagar-multiples) para componer correctamente `facturas.forma_pago` como
-- 'mixto' con sus montos reales — así la caja no se descuadra por facturas
-- marcadas enteras a un solo método cuando en realidad se cobraron mezcladas.
--
-- Es el equivalente a nivel de pedido de lo que pedido_items.pagado/forma_pago
-- ya hace a nivel de ítem (ver 054_pagos_individuales_mesas.sql).
USE restaurante;

CREATE TABLE IF NOT EXISTS pedido_abonos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    pedido_id INT NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    forma_pago ENUM('efectivo', 'transferencia') NOT NULL,
    usuario_id INT NULL,
    nota VARCHAR(150) NULL,
    -- Se llena al facturar la mesa (antes de eso el abono aún no tiene
    -- factura): permite ver desde una factura qué abonos la componen.
    factura_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE SET NULL,
    INDEX idx_pedido_abonos_pedido (pedido_id)
);
