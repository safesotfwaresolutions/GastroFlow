-- 091_limpiar_permisos_whatsapp.sql
-- La integración de WhatsApp se eliminó por completo del código (2026-09, ver
-- docs/modulos/10_whatsapp_bot.md). Los permisos whatsapp.ver / whatsapp.ajustes
-- (migracion 044) quedaron muertos: ninguna ruta los exige. Se borran del
-- catálogo; rol_permisos y user_permisos los referencian con ON DELETE CASCADE,
-- así que las asignaciones existentes se limpian solas.
--
-- Las tablas whatsapp_configs / whatsapp_conversations NO se tocan aquí: son
-- datos históricos (quién tuvo el bot conectado) y no bloquean nada.

USE restaurante;

DELETE FROM permisos WHERE nombre IN ('whatsapp.ver', 'whatsapp.ajustes');
