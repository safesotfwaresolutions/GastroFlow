-- 093_ordenes_compra.sql
-- Órdenes de compra a proveedor: OC -> recepción -> entrada de inventario.
-- proveedores/proveedor_facturas (043/047) ya cubren el catálogo de
-- proveedores y el archivo de facturas, pero no había un flujo de "pedí esto,
-- me llegó esto" que alimentara movimientos_inventario. La recepción llama a
-- InventarioService.registrarEntrada (ya soporta proveedor_id/documento_referencia).

USE restaurante;

CREATE TABLE IF NOT EXISTS ordenes_compra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    proveedor_id INT NOT NULL,
    estado ENUM('pendiente','recibida','cancelada') NOT NULL DEFAULT 'pendiente',
    notas TEXT NULL,
    fecha_recepcion TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS orden_compra_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orden_compra_id INT NOT NULL,
    insumo_id INT NOT NULL,
    cantidad_pedida DECIMAL(12,3) NOT NULL,
    costo_unitario_estimado DECIMAL(12,2) NULL,
    cantidad_recibida DECIMAL(12,3) NULL COMMENT 'NULL hasta que se recibe la OC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orden_compra_id) REFERENCES ordenes_compra(id) ON DELETE CASCADE,
    FOREIGN KEY (insumo_id) REFERENCES insumos(id) ON DELETE RESTRICT
);

INSERT INTO permisos (nombre, descripcion) VALUES
('proveedores.ordenes', 'Crear y recibir órdenes de compra a proveedores')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.nombre IN ('admin','superadmin') AND p.nombre IN ('proveedores.ordenes')
ON DUPLICATE KEY UPDATE rol_id = rol_id;
