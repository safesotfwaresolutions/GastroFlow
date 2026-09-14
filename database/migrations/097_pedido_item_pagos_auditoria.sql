-- 097_pedido_item_pagos_auditoria.sql
-- "Pagar por producto" (PagarItemIndividualService / pagar-multiples) marca
-- pedido_items.pagado=1 + forma_pago, pero esa fila se fusiona o se borra a
-- medida que se van pagando más unidades del mismo producto (ver el merge en
-- PagarItemIndividualService) -- no queda ningún rastro de CUÁNDO se pagó ni
-- QUIÉN lo cobró. Esta tabla registra cada pago por producto como un evento
-- inmutable, igual que ya hacen pedido_abonos (095) y bono_movimientos (096),
-- para poder mostrarlo en el "Historial de pagos" del detalle de factura.
USE restaurante;

CREATE TABLE IF NOT EXISTS pedido_item_pagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    pedido_id INT NOT NULL,
    producto_id INT NULL,
    cantidad DECIMAL(10,3) NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    forma_pago ENUM('efectivo', 'transferencia') NOT NULL,
    usuario_id INT NULL,
    -- Se llena al facturar la mesa (antes de eso el pago aún no tiene
    -- factura), igual que pedido_abonos.factura_id.
    factura_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE SET NULL,
    INDEX idx_pedido_item_pagos_pedido (pedido_id)
);
