-- 096_bonos_redimibles.sql
-- Bonos redimibles: saldo prepago (comprado por el cliente) o regalado
-- (fidelización), identificado por código, que se redime como parte del pago
-- de una factura. Se compone con efectivo/transferencia igual que ya hacen
-- los abonos libres (095_pedido_abonos.sql), pero acá el saldo viene de
-- ANTES de esta visita (no se acumula durante el pedido abierto).
--
-- origen 'comprado' vs 'regalo' importa para Finanzas: un bono comprado ya
-- generó un ingreso real al emitirse (BonoService.crear registra el
-- movimiento ahí); uno regalado nunca genera ingreso, en ningún momento --
-- al redimirse actúa como un descuento puro sobre la cuenta.

USE restaurante;

CREATE TABLE IF NOT EXISTS bonos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    codigo VARCHAR(20) NOT NULL,
    origen ENUM('comprado', 'regalo') NOT NULL,
    valor_inicial DECIMAL(12,2) NOT NULL,
    saldo_actual DECIMAL(12,2) NOT NULL,
    cliente_id INT NULL,
    estado ENUM('activo', 'agotado', 'vencido', 'anulado') NOT NULL DEFAULT 'activo',
    fecha_vencimiento DATE NULL,
    nota VARCHAR(255) NULL,
    usuario_creador_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bonos_tenant_codigo (tenant_id, codigo),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    FOREIGN KEY (usuario_creador_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    INDEX idx_bonos_estado (tenant_id, estado)
);

CREATE TABLE IF NOT EXISTS bono_movimientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bono_id INT NOT NULL,
    tenant_id INT NOT NULL,
    factura_id INT NULL,
    tipo ENUM('emision', 'redencion', 'anulacion') NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    usuario_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bono_id) REFERENCES bonos(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE SET NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    INDEX idx_bono_movimientos_bono (bono_id)
);

-- La redención se compone con efectivo/transferencia igual que un abono, así
-- que la factura necesita su propio monto_bono y forma_pago necesita poder
-- decir "se pagó solo con bono" (sin efectivo ni transferencia de por medio)
-- además de 'mixto' para cuando se combina con otro método.
ALTER TABLE facturas ADD COLUMN monto_bono DECIMAL(12,2) DEFAULT 0 AFTER efectivo_recibido;
ALTER TABLE facturas MODIFY COLUMN forma_pago ENUM('efectivo', 'transferencia', 'mixto', 'bono') NOT NULL DEFAULT 'efectivo';

INSERT INTO permisos (nombre, descripcion) VALUES
('bonos.ver', 'Ver bonos redimibles y su historial de movimientos'),
('bonos.gestionar', 'Emitir y anular bonos redimibles')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.nombre IN ('admin', 'superadmin') AND p.nombre IN ('bonos.ver', 'bonos.gestionar')
ON DUPLICATE KEY UPDATE rol_id = rol_id;
