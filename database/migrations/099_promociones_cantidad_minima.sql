-- 099_promociones_cantidad_minima.sql
-- Condición de activación de la promoción: "por venta del producto" (siempre,
-- cantidad_minima=1, comportamiento de 098) o "solo si compran N o más del
-- mismo producto" (cantidad_minima > 1). No es "2x1" (ahí solo la unidad
-- extra sale gratis) -- acá el % o $ configurado se aplica a TODAS las
-- unidades una vez se alcanza el mínimo, sobre el mismo producto/categoría/
-- alcance que ya definía la promoción.
USE restaurante;

ALTER TABLE promociones ADD COLUMN cantidad_minima INT NOT NULL DEFAULT 1 AFTER valor;
