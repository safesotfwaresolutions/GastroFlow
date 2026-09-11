/**
 * Tests unitarios para AlertasService (repositorios y MailerService mockeados).
 */

jest.mock('../../../services/Shared/MailerService', () => ({
    sendMail: jest.fn().mockResolvedValue({ ok: true })
}));
jest.mock('../../../services/Tenant/InventarioService', () => ({
    getResumenBajoStock: jest.fn()
}));
jest.mock('../../../repositories/Tenant/StatsRepository', () => ({
    getDailySales: jest.fn()
}));
jest.mock('../../../repositories/Tenant/MesaRepository', () => ({
    findAbiertasHace: jest.fn()
}));
jest.mock('../../../repositories/Tenant/ConfiguracionAlertasRepository', () => ({
    findOne: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    findAllActivas: jest.fn(),
    marcarAlertaEnviada: jest.fn()
}));

const AlertasService = require('../../../services/Tenant/AlertasService');
const MailerService = require('../../../services/Shared/MailerService');
const InventarioService = require('../../../services/Tenant/InventarioService');
const StatsRepository = require('../../../repositories/Tenant/StatsRepository');
const MesaRepository = require('../../../repositories/Tenant/MesaRepository');
const ConfiguracionAlertasRepository = require('../../../repositories/Tenant/ConfiguracionAlertasRepository');

function baseConfig(overrides = {}) {
    return {
        tenant_id: 1,
        tenant_nombre: 'Restaurante Demo',
        tenant_email: 'demo@restaurante.com',
        email_notificacion: null,
        umbral_horas_mesa: 2,
        umbral_caida_ventas_pct: 40,
        ultima_alerta_stock_at: null,
        ultima_alerta_ventas_at: null,
        ultima_alerta_mesa_at: null,
        ...overrides
    };
}

describe('AlertasService.evaluarTenant', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        InventarioService.getResumenBajoStock.mockResolvedValue({ cantidad: 0, lista: [] });
        StatsRepository.getDailySales.mockResolvedValue([]);
        MesaRepository.findAbiertasHace.mockResolvedValue([]);
    });

    it('no envía nada si no hay ningún destino (ni config.email_notificacion ni tenant_email)', async () => {
        const config = baseConfig({ tenant_email: null, email_notificacion: null });
        const result = await AlertasService.evaluarTenant(config);
        expect(result.enviadas).toEqual([]);
        expect(MailerService.sendMail).not.toHaveBeenCalled();
    });

    it('envía alerta de stock bajo y marca el cooldown cuando hay insumos bajo mínimo', async () => {
        InventarioService.getResumenBajoStock.mockResolvedValue({
            cantidad: 2,
            lista: [{ nombre: 'Tomate', stock_actual: 1, stock_minimo: 5, unidad_base: 'kg' }]
        });

        const result = await AlertasService.evaluarTenant(baseConfig());

        expect(result.enviadas).toContain('stock');
        expect(MailerService.sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'demo@restaurante.com', subject: expect.stringContaining('Stock bajo') })
        );
        expect(ConfiguracionAlertasRepository.marcarAlertaEnviada).toHaveBeenCalledWith(1, 'stock');
    });

    it('no reenvía la alerta de stock si el cooldown no venció', async () => {
        InventarioService.getResumenBajoStock.mockResolvedValue({ cantidad: 3, lista: [] });
        const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        const result = await AlertasService.evaluarTenant(baseConfig({ ultima_alerta_stock_at: haceUnaHora }));

        expect(result.enviadas).not.toContain('stock');
        expect(MailerService.sendMail).not.toHaveBeenCalled();
    });

    it('usa email_notificacion por encima de tenant_email cuando ambos existen', async () => {
        InventarioService.getResumenBajoStock.mockResolvedValue({
            cantidad: 1,
            lista: [{ nombre: 'Sal', stock_actual: 0, stock_minimo: 1, unidad_base: 'kg' }]
        });

        await AlertasService.evaluarTenant(baseConfig({ email_notificacion: 'alertas@restaurante.com' }));

        expect(MailerService.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alertas@restaurante.com' }));
    });

    it('envía alerta de mesas abiertas hace rato sin facturar', async () => {
        MesaRepository.findAbiertasHace.mockResolvedValue([{ mesa_numero: '5', horas_abierta: 3 }]);

        const result = await AlertasService.evaluarTenant(baseConfig());

        expect(result.enviadas).toContain('mesa');
        expect(MesaRepository.findAbiertasHace).toHaveBeenCalledWith(1, 2);
        expect(MailerService.sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ subject: expect.stringContaining('Mesas abiertas') })
        );
        expect(ConfiguracionAlertasRepository.marcarAlertaEnviada).toHaveBeenCalledWith(1, 'mesa');
    });

    it('no envía alerta de mesas si ninguna supera el umbral', async () => {
        MesaRepository.findAbiertasHace.mockResolvedValue([]);
        const result = await AlertasService.evaluarTenant(baseConfig());
        expect(result.enviadas).not.toContain('mesa');
    });
});

describe('AlertasService._detectarCaidaVentas', () => {
    beforeEach(() => jest.clearAllMocks());

    it('detecta una caída que supera el umbral', async () => {
        StatsRepository.getDailySales.mockResolvedValue([
            { fecha: '2026-01-01', total_ventas: 1000000 },
            { fecha: '2026-01-02', total_ventas: 1200000 },
            { fecha: '2026-01-03', total_ventas: 900000 },
            { fecha: '2026-01-04', total_ventas: 100000 } // hoy: muy por debajo del promedio (~1.03M)
        ]);

        const caida = await AlertasService._detectarCaidaVentas(1, 40);

        expect(caida).not.toBeNull();
        expect(caida.totalHoy).toBe(100000);
        expect(caida.caidaPct).toBeGreaterThan(40);
    });

    it('devuelve null si la caída no supera el umbral', async () => {
        StatsRepository.getDailySales.mockResolvedValue([
            { fecha: '2026-01-01', total_ventas: 1000000 },
            { fecha: '2026-01-02', total_ventas: 1000000 },
            { fecha: '2026-01-03', total_ventas: 1000000 },
            { fecha: '2026-01-04', total_ventas: 950000 }
        ]);

        const caida = await AlertasService._detectarCaidaVentas(1, 40);
        expect(caida).toBeNull();
    });

    it('devuelve null si no hay suficiente historial de días con ventas', async () => {
        StatsRepository.getDailySales.mockResolvedValue([
            { fecha: '2026-01-01', total_ventas: 0 },
            { fecha: '2026-01-02', total_ventas: 0 },
            { fecha: '2026-01-03', total_ventas: 500000 }
        ]);

        const caida = await AlertasService._detectarCaidaVentas(1, 40);
        expect(caida).toBeNull();
    });
});

describe('AlertasService.getConfig', () => {
    beforeEach(() => jest.clearAllMocks());

    it('crea la configuración con defaults si el tenant no tiene una todavía', async () => {
        ConfiguracionAlertasRepository.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ tenant_id: 1, alertas_activas: 1 });

        const config = await AlertasService.getConfig(1);

        expect(ConfiguracionAlertasRepository.create).toHaveBeenCalledWith(1, {});
        expect(config).toEqual({ tenant_id: 1, alertas_activas: 1 });
    });

    it('devuelve la configuración existente sin crear una nueva', async () => {
        ConfiguracionAlertasRepository.findOne.mockResolvedValue({ tenant_id: 1, alertas_activas: 0 });

        const config = await AlertasService.getConfig(1);

        expect(ConfiguracionAlertasRepository.create).not.toHaveBeenCalled();
        expect(config.alertas_activas).toBe(0);
    });
});
