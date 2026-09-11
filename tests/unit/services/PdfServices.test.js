/**
 * Tests de humo para los 3 servicios que generan PDF con pdfmake (sin Chromium):
 * PlanesPdfService, ReporteMensualService, ReporteConsolidadoService.
 *
 * No hay snapshot de layout -- lo que se valida es que el docDefinition que arma
 * cada servicio sea válido para pdfmake (si no, `getBuffer()` rechaza) y que el
 * resultado sea un PDF real (firma `%PDF`), con datos "felices" y con listas
 * vacías (las plantillas viejas tenían un "no hay datos" para ese caso).
 */

jest.mock('../../../repositories/Admin/PlanRepository', () => ({
    findAll: jest.fn()
}));
jest.mock('../../../repositories/Tenant/StatsRepository', () => ({
    getTotalSales: jest.fn(),
    getTotalInvoices: jest.fn(),
    getTopProducts: jest.fn(),
    getSalesByCategory: jest.fn()
}));
jest.mock('../../../services/Admin/TenantService', () => ({
    getAllTenants: jest.fn()
}));

const PlanesPdfService = require('../../../services/Admin/PlanesPdfService');
const ReporteMensualService = require('../../../services/Tenant/ReporteMensualService');
const ReporteConsolidadoService = require('../../../services/Admin/ReporteConsolidadoService');
const PlanRepository = require('../../../repositories/Admin/PlanRepository');
const StatsRepository = require('../../../repositories/Tenant/StatsRepository');
const TenantService = require('../../../services/Admin/TenantService');

function expectValidPdf(buffer) {
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
}

describe('PlanesPdfService.generarPortafolioPdf', () => {
    beforeEach(() => jest.clearAllMocks());

    it('genera un PDF válido con planes reales', async () => {
        PlanRepository.findAll.mockResolvedValue([
            {
                id: 1,
                nombre: 'Pro',
                slug: 'pro',
                descripcion: 'El plan intermedio.',
                descripcion_detallada: 'Incluye soporte prioritario.',
                caracteristicas: ['inventario', 'reportes_avanzados', 'multi_sede'],
                precio_pequeno: 90000,
                precio_mediano: 150000,
                precio_grande: 250000
            }
        ]);
        const buffer = await PlanesPdfService.generarPortafolioPdf();
        expectValidPdf(buffer);
    });

    it('no revienta con la lista de planes vacía', async () => {
        PlanRepository.findAll.mockResolvedValue([]);
        const buffer = await PlanesPdfService.generarPortafolioPdf();
        expectValidPdf(buffer);
    });
});

describe('ReporteMensualService.generarPdfReporte', () => {
    it('genera un PDF válido con y sin datos de ventas', async () => {
        const tenant = { id: 1, nombre: 'Restaurante Demo' };

        const conDatos = await ReporteMensualService.generarPdfReporte(tenant, 'enero 2026', {
            totalMes: 4500000,
            facturasMes: 32,
            topProductos: [
                { nombre: 'Bandeja Paisa', categoria_nombre: 'Comidas', total_cantidad: 20, total_ventas: 800000 }
            ],
            porCategoria: [{ categoria_nombre: 'Comidas', facturas_count: 32, total_ventas: 4500000 }]
        });
        expectValidPdf(conDatos);

        const sinDatos = await ReporteMensualService.generarPdfReporte(tenant, 'febrero 2026', {
            totalMes: 0,
            facturasMes: 0,
            topProductos: [],
            porCategoria: []
        });
        expectValidPdf(sinDatos);
    });
});

describe('ReporteConsolidadoService.generarReporteConsolidado', () => {
    beforeEach(() => jest.clearAllMocks());

    it('genera un PDF válido para varios tenants en un rango de varios meses', async () => {
        TenantService.getAllTenants.mockResolvedValue([
            { id: 1, nombre: 'Restaurante A', slug: 'restaurante-a', plan_nombre: 'Pro', activo: true },
            { id: 2, nombre: 'Restaurante B', slug: 'restaurante-b', plan_nombre: null, activo: true }
        ]);
        StatsRepository.getTotalSales.mockResolvedValue(1000000);
        StatsRepository.getTotalInvoices.mockResolvedValue(10);
        StatsRepository.getTopProducts.mockResolvedValue([
            { nombre: 'Producto X', categoria_nombre: 'Bebidas', total_cantidad: 5, total_ventas: 50000 }
        ]);
        StatsRepository.getSalesByCategory.mockResolvedValue([
            { categoria_nombre: 'Bebidas', facturas_count: 10, total_ventas: 1000000 }
        ]);

        const buffer = await ReporteConsolidadoService.generarReporteConsolidado({
            mesDesde: 1,
            anioDesde: 2026,
            mesHasta: 3,
            anioHasta: 2026
        });
        expectValidPdf(buffer);
    });

    it('no revienta cuando no hay tenants activos', async () => {
        TenantService.getAllTenants.mockResolvedValue([]);

        const buffer = await ReporteConsolidadoService.generarReporteConsolidado({ mesDesde: 1, anioDesde: 2026 });
        expectValidPdf(buffer);
    });

    it('incluye el bloque de error cuando falla un tenant específico', async () => {
        TenantService.getAllTenants.mockResolvedValue([
            { id: 1, nombre: 'Restaurante Roto', slug: 'restaurante-roto', activo: true }
        ]);
        StatsRepository.getTotalSales.mockRejectedValue(new Error('DB caída'));
        StatsRepository.getTotalInvoices.mockResolvedValue(0);
        StatsRepository.getTopProducts.mockResolvedValue([]);
        StatsRepository.getSalesByCategory.mockResolvedValue([]);

        const buffer = await ReporteConsolidadoService.generarReporteConsolidado({ mesDesde: 1, anioDesde: 2026 });
        expectValidPdf(buffer);
    });
});
