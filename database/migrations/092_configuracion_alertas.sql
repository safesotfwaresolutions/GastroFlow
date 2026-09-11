-- 092_configuracion_alertas.sql
-- Alertas proactivas por email: stock bajo, caída de ventas del día, mesa
-- abierta hace más de N horas sin facturar. Config 1:1 por tenant, mismo
-- patrón que configuracion_costeo (006_costeo.sql).

USE restaurante;

CREATE TABLE IF NOT EXISTS configuracion_alertas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL UNIQUE,
    alertas_activas TINYINT(1) NOT NULL DEFAULT 1,
    email_notificacion VARCHAR(150) NULL COMMENT 'Si es NULL se usa tenants.email',
    umbral_horas_mesa INT NOT NULL DEFAULT 2 COMMENT 'Horas sin facturar antes de alertar',
    umbral_caida_ventas_pct INT NOT NULL DEFAULT 40 COMMENT 'Caida porcentual de ventas de hoy vs el promedio reciente',
    ultima_alerta_stock_at TIMESTAMP NULL COMMENT 'Cooldown: no reenviar antes de unas horas',
    ultima_alerta_ventas_at TIMESTAMP NULL,
    ultima_alerta_mesa_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT INTO permisos (nombre, descripcion) VALUES
('alertas.configurar', 'Configurar alertas proactivas (stock bajo, ventas, mesas)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.nombre IN ('admin','superadmin') AND p.nombre IN ('alertas.configurar')
ON DUPLICATE KEY UPDATE rol_id = rol_id;
