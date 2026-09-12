-- 094_estaciones_cocina.sql
-- KDS por estación: cada tenant define sus propias estaciones (fría, caliente,
-- bebidas, o las que quiera) y les asigna categorías de producto. No hay
-- pantalla de edición de categorías hoy (se crean al vuelo desde productos),
-- así que la asignación categoría->estación vive en la propia vista de
-- mantenimiento de estaciones.

USE restaurante;

CREATE TABLE IF NOT EXISTS estaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(80) NOT NULL,
    orden INT NOT NULL DEFAULT 0,
    activa TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

ALTER TABLE categorias
ADD COLUMN estacion_id INT NULL AFTER descripcion,
ADD CONSTRAINT fk_categoria_estacion FOREIGN KEY (estacion_id) REFERENCES estaciones(id) ON DELETE SET NULL;

-- El permiso `cocina.gestionar` ya existía (001_create_users_and_roles.sql)
-- pero no lo exigía ninguna ruta todavía; se reusa aquí para administrar
-- estaciones y la asignación de categorías, en vez de crear uno nuevo.

-- Seed de 3 estaciones default por cada tenant activo, para que el KDS no
-- arranque vacío. Quedan sin categorías asignadas hasta que el tenant las
-- mapee en /estaciones.
INSERT INTO estaciones (tenant_id, nombre, orden)
SELECT t.id, e.nombre, e.orden
FROM tenants t
CROSS JOIN (
    SELECT 'Fría' AS nombre, 1 AS orden
    UNION ALL SELECT 'Caliente', 2
    UNION ALL SELECT 'Bebidas', 3
) e
WHERE t.activo = 1
  AND NOT EXISTS (SELECT 1 FROM estaciones ex WHERE ex.tenant_id = t.id);
