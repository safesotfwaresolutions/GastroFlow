-- 098_promociones.sql
-- Fase 1 de promociones: descuento automático (% o $) por día de la semana y/o
-- franja horaria, aplicable a productos puntuales, a una categoría completa, o
-- a TODO el catálogo (si no se le asignan productos ni categorías). Fases
-- siguientes (no en esta migración): por cantidad (2x1, lleva N paga M) y
-- combos a precio fijo -- por eso `tipo` ya es un ENUM abierto a esos valores
-- aunque hoy solo se use 'descuento'.
--
-- Sin permiso de plan (requirePlanFeature): disponible en todos los planes,
-- igual que Finanzas/Caja/Bonos. Solo gestionar (crear/editar/borrar) requiere
-- permiso; el descuento se ve sin permiso (lo ve cualquier cliente en el QR).
USE restaurante;

CREATE TABLE IF NOT EXISTS promociones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo ENUM('descuento', 'cantidad', 'combo') NOT NULL DEFAULT 'descuento',
    valor_tipo ENUM('porcentaje', 'valor') NOT NULL,
    valor DECIMAL(12, 2) NOT NULL,
    -- NULL = todos los días / todo el día. 'lun'..'dom' en español, consistente
    -- con el resto del proyecto (ver getFechaColombia y afines).
    dias_semana SET('lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom') NULL,
    hora_inicio TIME NULL,
    hora_fin TIME NULL,
    fecha_inicio DATE NULL,
    fecha_fin DATE NULL,
    activa BOOLEAN NOT NULL DEFAULT 1,
    usuario_creador_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_creador_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    INDEX idx_promociones_tenant_activa (tenant_id, activa)
);

-- Productos/categorías puntuales a los que aplica. Una promoción SIN filas en
-- ninguna de las dos tablas aplica a TODO el catálogo del tenant.
CREATE TABLE IF NOT EXISTS promocion_productos (
    promocion_id INT NOT NULL,
    producto_id INT NOT NULL,
    PRIMARY KEY (promocion_id, producto_id),
    FOREIGN KEY (promocion_id) REFERENCES promociones(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS promocion_categorias (
    promocion_id INT NOT NULL,
    categoria_id INT NOT NULL,
    PRIMARY KEY (promocion_id, categoria_id),
    FOREIGN KEY (promocion_id) REFERENCES promociones(id) ON DELETE CASCADE,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
);

INSERT INTO permisos (nombre, descripcion) VALUES
('promociones.ver', 'Ver promociones configuradas'),
('promociones.gestionar', 'Crear, editar y desactivar promociones')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.nombre IN ('admin', 'superadmin') AND p.nombre IN ('promociones.ver', 'promociones.gestionar')
ON DUPLICATE KEY UPDATE rol_id = rol_id;
