jest.mock('../../../repositories/Tenant/PromocionRepository');

const PromocionRepository = require('../../../repositories/Tenant/PromocionRepository');
const PromocionService = require('../../../services/Tenant/PromocionService');
const cacheService = require('../../../services/Shared/CacheService');

describe('PromocionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        cacheService.clear();
    });

    describe('calcularDescuento', () => {
        it('porcentaje: calcula el % sobre el precio', () => {
            expect(PromocionService.calcularDescuento({ valor_tipo: 'porcentaje', valor: 20 }, 10000)).toBe(2000);
        });

        it('porcentaje: nunca pasa de 100%', () => {
            expect(PromocionService.calcularDescuento({ valor_tipo: 'porcentaje', valor: 150 }, 10000)).toBe(10000);
        });

        it('valor: nunca supera el precio (no puede dar un total negativo)', () => {
            expect(PromocionService.calcularDescuento({ valor_tipo: 'valor', valor: 99999 }, 5000)).toBe(5000);
        });

        it('valor: descuenta el monto fijo tal cual si cabe', () => {
            expect(PromocionService.calcularDescuento({ valor_tipo: 'valor', valor: 2000 }, 10000)).toBe(2000);
        });
    });

    describe('_resolverParaProducto (prioridad de alcance)', () => {
        const promoProducto = { id: 1, productoIds: new Set([7]), categoriaIds: new Set() };
        const promoCategoria = { id: 2, productoIds: new Set(), categoriaIds: new Set([3]) };
        const promoGlobal = { id: 3, productoIds: new Set(), categoriaIds: new Set() };

        it('una promo específica al producto gana sobre una de categoría y una global', () => {
            const resultado = PromocionService._resolverParaProducto(
                [promoGlobal, promoCategoria, promoProducto],
                7,
                3
            );
            expect(resultado.id).toBe(1);
        });

        it('sin promo de producto, gana la de categoría sobre la global', () => {
            const resultado = PromocionService._resolverParaProducto([promoGlobal, promoCategoria], 999, 3);
            expect(resultado.id).toBe(2);
        });

        it('sin match de producto ni categoría, aplica la global', () => {
            const resultado = PromocionService._resolverParaProducto([promoGlobal], 999, 888);
            expect(resultado.id).toBe(3);
        });

        it('una promo con alcance definido que no incluye este producto/categoría no aplica', () => {
            const resultado = PromocionService._resolverParaProducto([promoProducto, promoCategoria], 999, 888);
            expect(resultado).toBeNull();
        });

        it('sin ninguna promoción vigente, retorna null', () => {
            expect(PromocionService._resolverParaProducto([], 7, 3)).toBeNull();
        });
    });

    describe('_resolverParaProducto (activación por cantidad)', () => {
        const promoPorCantidad = { id: 5, productoIds: new Set([7]), categoriaIds: new Set(), cantidad_minima: 2 };
        const promoSiempre = { id: 6, productoIds: new Set(), categoriaIds: new Set(), cantidad_minima: 1 };

        it('no se activa si la cantidad disponible es menor al mínimo', () => {
            expect(PromocionService._resolverParaProducto([promoPorCantidad], 7, null, 1)).toBeNull();
        });

        it('se activa justo al alcanzar la cantidad mínima', () => {
            expect(PromocionService._resolverParaProducto([promoPorCantidad], 7, null, 2)?.id).toBe(5);
        });

        it('se activa con más de la cantidad mínima', () => {
            expect(PromocionService._resolverParaProducto([promoPorCantidad], 7, null, 5)?.id).toBe(5);
        });

        it('sin especificar cantidad (default), se asume Infinity -- siempre se activa', () => {
            expect(PromocionService._resolverParaProducto([promoPorCantidad], 7, null)?.id).toBe(5);
        });

        it('una promo sin cantidad_minima (undefined) se trata como 1 -- siempre activa', () => {
            const promoSinCampo = { id: 7, productoIds: new Set([7]), categoriaIds: new Set() };
            expect(PromocionService._resolverParaProducto([promoSinCampo], 7, null, 1)?.id).toBe(7);
        });

        it('cuando la de cantidad no alcanza, no cae a una promo "siempre" de menor rango si esta no aplica al producto', () => {
            // promoSiempre es global (rank 0) y sí aplicaría, pero promoPorCantidad es
            // específica al producto (rank 2) y bloquea -- no hay "segunda opción": o
            // gana la más específica (si cumple cantidad) o no gana ninguna de las que
            // sí calzan por alcance y no cumplen cantidad.
            const resultado = PromocionService._resolverParaProducto([promoPorCantidad, promoSiempre], 7, null, 1);
            expect(resultado?.id).toBe(6); // la global sí se activa (cantidad_minima=1)
        });
    });

    describe('_horaEnRango', () => {
        it('rango normal (no cruza medianoche): dentro del rango', () => {
            expect(PromocionService._horaEnRango('13:00:00', '12:00:00', '15:00:00')).toBe(true);
        });

        it('rango normal: fuera del rango', () => {
            expect(PromocionService._horaEnRango('20:00:00', '12:00:00', '15:00:00')).toBe(false);
        });

        it('rango normal: los límites son inclusivos', () => {
            expect(PromocionService._horaEnRango('12:00:00', '12:00:00', '15:00:00')).toBe(true);
            expect(PromocionService._horaEnRango('15:00:00', '12:00:00', '15:00:00')).toBe(true);
        });

        it('rango nocturno (cruza medianoche): dentro después de medianoche', () => {
            expect(PromocionService._horaEnRango('01:00:00', '22:00:00', '02:00:00')).toBe(true);
        });

        it('rango nocturno: dentro antes de medianoche', () => {
            expect(PromocionService._horaEnRango('23:30:00', '22:00:00', '02:00:00')).toBe(true);
        });

        it('rango nocturno: fuera del rango', () => {
            expect(PromocionService._horaEnRango('12:00:00', '22:00:00', '02:00:00')).toBe(false);
        });
    });

    describe('_aplicaAhora', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('sin días ni horario configurados, aplica siempre', () => {
            jest.spyOn(PromocionService, '_ahoraColombia').mockReturnValue({
                diaActual: 'mar',
                horaActual: '10:00:00'
            });
            expect(PromocionService._aplicaAhora({ dias_semana: null, hora_inicio: null, hora_fin: null })).toBe(true);
        });

        it('rechaza si hoy no está en dias_semana', () => {
            jest.spyOn(PromocionService, '_ahoraColombia').mockReturnValue({
                diaActual: 'mar',
                horaActual: '10:00:00'
            });
            expect(PromocionService._aplicaAhora({ dias_semana: 'lun,mie', hora_inicio: null, hora_fin: null })).toBe(
                false
            );
        });

        it('acepta si hoy sí está en dias_semana', () => {
            jest.spyOn(PromocionService, '_ahoraColombia').mockReturnValue({
                diaActual: 'mie',
                horaActual: '10:00:00'
            });
            expect(PromocionService._aplicaAhora({ dias_semana: 'lun,mie', hora_inicio: null, hora_fin: null })).toBe(
                true
            );
        });

        it('rechaza si la hora actual está fuera del rango horario', () => {
            jest.spyOn(PromocionService, '_ahoraColombia').mockReturnValue({
                diaActual: 'mar',
                horaActual: '20:00:00'
            });
            expect(
                PromocionService._aplicaAhora({ dias_semana: null, hora_inicio: '12:00:00', hora_fin: '15:00:00' })
            ).toBe(false);
        });

        it('exige ambas condiciones cuando las dos están configuradas', () => {
            jest.spyOn(PromocionService, '_ahoraColombia').mockReturnValue({
                diaActual: 'dom',
                horaActual: '13:00:00'
            });
            expect(
                PromocionService._aplicaAhora({ dias_semana: 'mar', hora_inicio: '12:00:00', hora_fin: '15:00:00' })
            ).toBe(false);
        });
    });

    describe('anotarProductos', () => {
        it('no hace ninguna consulta si la lista de productos está vacía', async () => {
            const resultado = await PromocionService.anotarProductos(1, []);
            expect(resultado).toEqual([]);
            expect(PromocionRepository.getActivasVigentes).not.toHaveBeenCalled();
        });

        it('anota precio_promocion solo en los productos con promo aplicable', async () => {
            PromocionRepository.getActivasVigentes.mockResolvedValue([
                { id: 1, valor_tipo: 'porcentaje', valor: 10, dias_semana: null, hora_inicio: null, hora_fin: null }
            ]);
            PromocionRepository.getAlcancePorPromociones.mockResolvedValue({
                productosPorPromocion: new Map([[1, new Set([5])]]),
                categoriasPorPromocion: new Map()
            });

            const productos = [
                { id: 5, categoria_id: 1, precio: 10000 },
                { id: 6, categoria_id: 1, precio: 10000 }
            ];
            const resultado = await PromocionService.anotarProductos(1, productos);

            expect(resultado[0].precio_promocion).toBe(9000);
            expect(resultado[0].promocion_id).toBe(1);
            expect(resultado[1].precio_promocion).toBeUndefined();
        });

        it('usa las claves personalizadas (idKey/categoriaIdKey/precioKey) cuando se pasan', async () => {
            PromocionRepository.getActivasVigentes.mockResolvedValue([
                { id: 1, valor_tipo: 'valor', valor: 1000, dias_semana: null, hora_inicio: null, hora_fin: null }
            ]);
            PromocionRepository.getAlcancePorPromociones.mockResolvedValue({
                productosPorPromocion: new Map(),
                categoriasPorPromocion: new Map()
            });

            const productos = [{ producto_id: 5, precio_unidad: 5000 }];
            const resultado = await PromocionService.anotarProductos(1, productos, {
                idKey: 'producto_id',
                precioKey: 'precio_unidad'
            });

            // Promo sin alcance definido = global, aplica a todos.
            expect(resultado[0].precio_promocion).toBe(4000);
        });

        it('promo "por cantidad" (cantidad_minima > 1): NO anota precio_promocion, anota promocion_regla', async () => {
            PromocionRepository.getActivasVigentes.mockResolvedValue([
                {
                    id: 2,
                    nombre: 'Lleva 2 o más',
                    valor_tipo: 'porcentaje',
                    valor: 20,
                    cantidad_minima: 2,
                    dias_semana: null,
                    hora_inicio: null,
                    hora_fin: null
                }
            ]);
            PromocionRepository.getAlcancePorPromociones.mockResolvedValue({
                productosPorPromocion: new Map([[2, new Set([5])]]),
                categoriasPorPromocion: new Map()
            });

            const resultado = await PromocionService.anotarProductos(1, [{ id: 5, categoria_id: 1, precio: 10000 }]);

            expect(resultado[0].precio_promocion).toBeUndefined();
            expect(resultado[0].promocion_regla).toEqual({
                id: 2,
                nombre: 'Lleva 2 o más',
                valor_tipo: 'porcentaje',
                valor: 20,
                cantidad_minima: 2
            });
        });
    });

    describe('getDescuentoPorProductos', () => {
        it('retorna un Map vacío si no hay promociones vigentes', async () => {
            PromocionRepository.getActivasVigentes.mockResolvedValue([]);
            const mapa = await PromocionService.getDescuentoPorProductos(1, [{ producto_id: 5, categoria_id: 1 }]);
            expect(mapa.size).toBe(0);
        });

        it('devuelve un shape { valor_tipo, valor } listo para calcularDescuento', async () => {
            PromocionRepository.getActivasVigentes.mockResolvedValue([
                {
                    id: 9,
                    nombre: 'Promo test',
                    valor_tipo: 'porcentaje',
                    valor: 15,
                    dias_semana: null,
                    hora_inicio: null,
                    hora_fin: null
                }
            ]);
            PromocionRepository.getAlcancePorPromociones.mockResolvedValue({
                productosPorPromocion: new Map(),
                categoriasPorPromocion: new Map()
            });

            const mapa = await PromocionService.getDescuentoPorProductos(1, [{ producto_id: 5, categoria_id: null }]);
            const entrada = mapa.get(5);
            expect(entrada.valor_tipo).toBe('porcentaje');
            expect(PromocionService.calcularDescuento(entrada, 10000)).toBe(1500);
        });

        it('respeta la cantidad_minima: no incluye el producto si la cantidad pedida no alcanza', async () => {
            PromocionRepository.getActivasVigentes.mockResolvedValue([
                {
                    id: 9,
                    valor_tipo: 'porcentaje',
                    valor: 15,
                    cantidad_minima: 3,
                    dias_semana: null,
                    hora_inicio: null,
                    hora_fin: null
                }
            ]);
            PromocionRepository.getAlcancePorPromociones.mockResolvedValue({
                productosPorPromocion: new Map(),
                categoriasPorPromocion: new Map()
            });

            const mapa = await PromocionService.getDescuentoPorProductos(1, [
                { producto_id: 5, categoria_id: null, cantidad: 2 }
            ]);
            expect(mapa.has(5)).toBe(false);
        });

        it('incluye el producto en cuanto la cantidad pedida alcanza cantidad_minima', async () => {
            PromocionRepository.getActivasVigentes.mockResolvedValue([
                {
                    id: 9,
                    valor_tipo: 'porcentaje',
                    valor: 15,
                    cantidad_minima: 3,
                    dias_semana: null,
                    hora_inicio: null,
                    hora_fin: null
                }
            ]);
            PromocionRepository.getAlcancePorPromociones.mockResolvedValue({
                productosPorPromocion: new Map(),
                categoriasPorPromocion: new Map()
            });

            const mapa = await PromocionService.getDescuentoPorProductos(1, [
                { producto_id: 5, categoria_id: null, cantidad: 3 }
            ]);
            expect(mapa.has(5)).toBe(true);
        });
    });

    describe('_validar (reglas de negocio al crear/editar)', () => {
        it('exige nombre', () => {
            expect(() => PromocionService._validar({ nombre: '  ', valor_tipo: 'porcentaje', valor: 10 })).toThrow(
                'El nombre de la promoción es obligatorio'
            );
        });

        it('exige valor_tipo válido', () => {
            expect(() => PromocionService._validar({ nombre: 'x', valor_tipo: 'descuento', valor: 10 })).toThrow(
                'El tipo de descuento debe ser "porcentaje" o "valor"'
            );
        });

        it('exige valor > 0', () => {
            expect(() => PromocionService._validar({ nombre: 'x', valor_tipo: 'valor', valor: 0 })).toThrow(
                'El valor del descuento debe ser mayor a 0'
            );
        });

        it('rechaza porcentaje > 100', () => {
            expect(() => PromocionService._validar({ nombre: 'x', valor_tipo: 'porcentaje', valor: 150 })).toThrow(
                'Un descuento de porcentaje no puede ser mayor a 100'
            );
        });

        it('rechaza cantidad_minima menor a 1', () => {
            expect(() =>
                PromocionService._validar({ nombre: 'x', valor_tipo: 'valor', valor: 10, cantidad_minima: 0 })
            ).toThrow('La cantidad mínima debe ser un número entero de al menos 1');
        });

        it('rechaza cantidad_minima no entera', () => {
            expect(() =>
                PromocionService._validar({ nombre: 'x', valor_tipo: 'valor', valor: 10, cantidad_minima: 2.5 })
            ).toThrow('La cantidad mínima debe ser un número entero de al menos 1');
        });

        it('acepta cantidad_minima >= 1', () => {
            expect(() =>
                PromocionService._validar({ nombre: 'x', valor_tipo: 'valor', valor: 10, cantidad_minima: 2 })
            ).not.toThrow();
        });

        it('exige hora_inicio y hora_fin juntas, no una sola', () => {
            expect(() =>
                PromocionService._validar({ nombre: 'x', valor_tipo: 'valor', valor: 10, hora_inicio: '10:00' })
            ).toThrow('Debes indicar tanto la hora de inicio como la de fin, o ninguna');
        });

        it('rechaza fecha_inicio posterior a fecha_fin', () => {
            expect(() =>
                PromocionService._validar({
                    nombre: 'x',
                    valor_tipo: 'valor',
                    valor: 10,
                    fecha_inicio: '2026-02-01',
                    fecha_fin: '2026-01-01'
                })
            ).toThrow('La fecha de inicio no puede ser posterior a la fecha de fin');
        });

        it('rechaza días de la semana inválidos', () => {
            expect(() =>
                PromocionService._validar({
                    nombre: 'x',
                    valor_tipo: 'valor',
                    valor: 10,
                    dias_semana: ['lun', 'martes']
                })
            ).toThrow('Días inválidos: martes');
        });

        it('acepta una configuración válida sin lanzar', () => {
            expect(() =>
                PromocionService._validar({
                    nombre: 'Martes de pizza',
                    valor_tipo: 'porcentaje',
                    valor: 20,
                    dias_semana: ['mar'],
                    hora_inicio: '12:00',
                    hora_fin: '15:00',
                    fecha_inicio: '2026-01-01',
                    fecha_fin: '2026-12-31'
                })
            ).not.toThrow();
        });
    });

    describe('crear', () => {
        it('crea la promoción y asigna productos/categorías, e invalida el caché del tenant', async () => {
            PromocionRepository.create.mockResolvedValue(10);
            cacheService.set('promociones_vigentes_1', ['algo-viejo'], 60);

            const result = await PromocionService.crear(
                1,
                {
                    nombre: 'Martes de pizza',
                    valor_tipo: 'porcentaje',
                    valor: 20,
                    dias_semana: ['mar'],
                    producto_ids: [7, 8],
                    categoria_ids: [3]
                },
                99
            );

            expect(result).toEqual({ id: 10 });
            expect(PromocionRepository.setProductos).toHaveBeenCalledWith(10, [7, 8]);
            expect(PromocionRepository.setCategorias).toHaveBeenCalledWith(10, [3]);
            expect(cacheService.get('promociones_vigentes_1')).toBeNull();
        });

        it('propaga el error de validación sin llegar a tocar el repositorio', async () => {
            await expect(PromocionService.crear(1, { nombre: '', valor_tipo: 'valor', valor: 10 })).rejects.toThrow(
                'El nombre de la promoción es obligatorio'
            );
            expect(PromocionRepository.create).not.toHaveBeenCalled();
        });
    });

    describe('eliminar', () => {
        it('lanza si la promoción no existe (o es de otro tenant)', async () => {
            PromocionRepository.findById.mockResolvedValue(null);
            await expect(PromocionService.eliminar(1, 1)).rejects.toThrow('Promoción no encontrada');
            expect(PromocionRepository.delete).not.toHaveBeenCalled();
        });

        it('elimina e invalida el caché', async () => {
            PromocionRepository.findById.mockResolvedValue({ id: 1 });
            cacheService.set('promociones_vigentes_1', ['algo'], 60);

            await PromocionService.eliminar(1, 1);

            expect(PromocionRepository.delete).toHaveBeenCalledWith(1, 1);
            expect(cacheService.get('promociones_vigentes_1')).toBeNull();
        });
    });
});
