/**
 * AlertasService - Alertas proactivas por email: stock bajo, caída de ventas
 * del día y mesas abiertas hace rato sin facturar. Corre en un cron
 * (config/bootstrap.js) que evalúa todos los tenants con alertas activas.
 */

const MailerService = require('../Shared/MailerService');
const InventarioService = require('./InventarioService');
const StatsRepository = require('../../repositories/Tenant/StatsRepository');
const MesaRepository = require('../../repositories/Tenant/MesaRepository');
const ConfiguracionAlertasRepository = require('../../repositories/Tenant/ConfiguracionAlertasRepository');
const { formatMoney } = require('../../utils/money');

// No reenviar la misma alerta antes de este tiempo, aunque la condición siga activa.
const COOLDOWN_HORAS = 4;
// Cuántos días de historial se usan como línea base para "caída de ventas".
const DIAS_PROMEDIO_VENTAS = 14;
// La caída de ventas solo se evalúa desde esta hora (Bogotá) en adelante: antes
// de eso el día apenas empieza y "va por debajo del promedio" no dice nada.
const HORA_MINIMA_CHEQUEO_VENTAS = 20;

function horaBogotaAhora() {
    return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour: '2-digit', hour12: false }));
}

function cooldownVencido(fecha, horas) {
    if (!fecha) {
        return true;
    }
    return Date.now() - new Date(fecha).getTime() >= horas * 60 * 60 * 1000;
}

class AlertasService {
    /**
     * Config de alertas del tenant (la crea con los defaults de la migración si no existe).
     */
    static async getConfig(tenantId) {
        let config = await ConfiguracionAlertasRepository.findOne(tenantId);
        if (!config) {
            await ConfiguracionAlertasRepository.create(tenantId, {});
            config = await ConfiguracionAlertasRepository.findOne(tenantId);
        }
        return config;
    }

    static async saveConfig(tenantId, data) {
        await ConfiguracionAlertasRepository.upsert(tenantId, data);
        return { message: 'Configuración de alertas guardada' };
    }

    /**
     * Evalúa las 3 condiciones para un tenant (recibe la fila de
     * configuracion_alertas ya unida con tenants.email/nombre) y envía por
     * email las que apliquen y no estén en cooldown.
     * @param {object} config Fila de ConfiguracionAlertasRepository.findAllActivas()
     * @returns {Promise<{ enviadas: string[] }>}
     */
    static async evaluarTenant(config) {
        const tenantId = config.tenant_id;
        const destino = config.email_notificacion || config.tenant_email;
        if (!destino) {
            return { enviadas: [] };
        }

        const enviadas = [];

        if (cooldownVencido(config.ultima_alerta_stock_at, COOLDOWN_HORAS)) {
            const resumen = await InventarioService.getResumenBajoStock(tenantId);
            if (resumen.cantidad > 0) {
                await this._enviarAlertaStock(destino, config.tenant_nombre, resumen);
                await ConfiguracionAlertasRepository.marcarAlertaEnviada(tenantId, 'stock');
                enviadas.push('stock');
            }
        }

        if (
            horaBogotaAhora() >= HORA_MINIMA_CHEQUEO_VENTAS &&
            cooldownVencido(config.ultima_alerta_ventas_at, COOLDOWN_HORAS)
        ) {
            const caida = await this._detectarCaidaVentas(tenantId, config.umbral_caida_ventas_pct);
            if (caida) {
                await this._enviarAlertaVentas(destino, config.tenant_nombre, caida);
                await ConfiguracionAlertasRepository.marcarAlertaEnviada(tenantId, 'ventas');
                enviadas.push('ventas');
            }
        }

        if (cooldownVencido(config.ultima_alerta_mesa_at, COOLDOWN_HORAS)) {
            const mesas = await MesaRepository.findAbiertasHace(tenantId, config.umbral_horas_mesa);
            if (mesas.length > 0) {
                await this._enviarAlertaMesas(destino, config.tenant_nombre, mesas);
                await ConfiguracionAlertasRepository.marcarAlertaEnviada(tenantId, 'mesa');
                enviadas.push('mesa');
            }
        }

        return { enviadas };
    }

    /**
     * Compara las ventas de hoy contra el promedio de los días anteriores con
     * ventas (ignora días en 0, no cuentan como "normal"). Devuelve null si no
     * hay suficiente historial o si no se superó el umbral.
     */
    static async _detectarCaidaVentas(tenantId, umbralPct) {
        const dias = await StatsRepository.getDailySales(tenantId, DIAS_PROMEDIO_VENTAS);
        if (!dias || dias.length < 2) {
            return null;
        }
        const hoy = dias[dias.length - 1];
        const diasConVentas = dias.slice(0, -1).filter(d => d.total_ventas > 0);
        if (diasConVentas.length < 3) {
            return null;
        }
        const promedio = diasConVentas.reduce((sum, d) => sum + d.total_ventas, 0) / diasConVentas.length;
        if (promedio <= 0) {
            return null;
        }
        const caidaPct = ((promedio - hoy.total_ventas) / promedio) * 100;
        if (caidaPct < umbralPct) {
            return null;
        }
        return { totalHoy: hoy.total_ventas, promedio, caidaPct };
    }

    static async _enviarAlertaStock(to, nombreTenant, resumen) {
        const filas = resumen.lista
            .map(
                i =>
                    `<tr><td>${i.nombre}</td><td style="text-align:right">${i.stock_actual} ${i.unidad_base}</td><td style="text-align:right">${i.stock_minimo} ${i.unidad_base}</td></tr>`
            )
            .join('');
        const html = `
            <p>Hola,</p>
            <p><strong>${resumen.cantidad}</strong> insumo(s) de <strong>${nombreTenant}</strong> están en o por debajo del stock mínimo:</p>
            <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
                <thead><tr><th>Insumo</th><th>Stock actual</th><th>Stock mínimo</th></tr></thead>
                <tbody>${filas}</tbody>
            </table>
            <p>Revisa el módulo de Inventario para reabastecer.</p>
            <p style="color:#888;font-size:12px">Sistema GastroFlow</p>
        `;
        await MailerService.sendMail({ to, subject: `⚠️ Stock bajo en ${nombreTenant}`, html });
    }

    static async _enviarAlertaVentas(to, nombreTenant, caida) {
        const html = `
            <p>Hola,</p>
            <p>Las ventas de hoy en <strong>${nombreTenant}</strong> van <strong>${caida.caidaPct.toFixed(0)}%</strong> por debajo del promedio reciente.</p>
            <p>Total de hoy: <strong>${formatMoney(caida.totalHoy)}</strong><br>Promedio de los últimos días: ${formatMoney(caida.promedio)}</p>
            <p style="color:#888;font-size:12px">Sistema GastroFlow</p>
        `;
        await MailerService.sendMail({ to, subject: `📉 Caída de ventas en ${nombreTenant}`, html });
    }

    static async _enviarAlertaMesas(to, nombreTenant, mesas) {
        const filas = mesas
            .map(m => `<tr><td>Mesa ${m.mesa_numero}</td><td style="text-align:right">${m.horas_abierta} h</td></tr>`)
            .join('');
        const html = `
            <p>Hola,</p>
            <p><strong>${mesas.length}</strong> mesa(s) de <strong>${nombreTenant}</strong> llevan abiertas más tiempo del esperado sin facturar:</p>
            <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
                <thead><tr><th>Mesa</th><th>Tiempo abierta</th></tr></thead>
                <tbody>${filas}</tbody>
            </table>
            <p style="color:#888;font-size:12px">Sistema GastroFlow</p>
        `;
        await MailerService.sendMail({ to, subject: `⏱️ Mesas abiertas hace rato en ${nombreTenant}`, html });
    }

    /**
     * Punto de entrada del cron: evalúa todos los tenants con alertas activas.
     * Aísla el fallo de un tenant para no tumbar el resto.
     */
    static async evaluarTodosLosTenants() {
        const configs = await ConfiguracionAlertasRepository.findAllActivas();
        for (const config of configs) {
            try {
                await this.evaluarTenant(config);
            } catch (err) {
                console.error(`[ALERTAS] Error evaluando tenant ${config.tenant_id}:`, err.message);
            }
        }
    }
}

module.exports = AlertasService;
