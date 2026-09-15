/**
 * PromocionService - Motor de promociones (Fase 1: descuento automático por
 * día de la semana y/o franja horaria, sobre productos puntuales, una
 * categoría completa, o todo el catálogo si no se le asigna ninguno).
 *
 * Un solo punto resuelve "¿aplica una promo ahora mismo a este producto?" y
 * se reusa desde los 3 lugares donde se muestra un precio (buscador de
 * Mesas, grilla del POS, Menú QR) y desde la facturación final (Mesas), para
 * que el descuento que ve el cliente sea siempre el mismo que termina en la
 * factura.
 */
const PromocionRepository = require('../../repositories/Tenant/PromocionRepository');
const cacheService = require('../Shared/CacheService');

const DIAS_SET = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
// Colombia no tiene horario de verano: offset fijo -05:00 todo el año (mismo
// supuesto que ya usa el resto del proyecto, ej. getUtcDayRangeForColombia).
const OFFSET_COLOMBIA_MS = 5 * 60 * 60 * 1000;
const VIGENTES_CACHE_TTL_SEGUNDOS = 60;

class PromocionService {
    // ---- Consulta / aplicación --------------------------------------------------

    /**
     * Anota cada producto de la lista con `precio_promocion`/`promocion_nombre`/
     * `promocion_id` si tiene una promoción de activación inmediata (cantidad_minima
     * <= 1) vigente ahora mismo. Si la promoción que le correspondería exige comprar
     * 2 o más unidades del mismo producto (cantidad_minima > 1), NO se muestra un
     * precio ya rebajado -- acá (catálogo/menú) no se sabe cuántas unidades va a
     * terminar llevando el cliente -- en cambio se anota `promocion_regla` (la
     * condición cruda) para que el frontend con carrito reactivo (POS) la recalcule
     * según lo que lleve, y para que Mesas/QR la re-resuelvan server-side al agregar.
     * No muta la entrada; devuelve una lista nueva (los productos sin promo quedan igual).
     * @param {Array<Object>} productos
     * @param {{idKey?: string, categoriaIdKey?: string, precioKey?: string}} [opts]
     */
    static async anotarProductos(tenantId, productos, opts = {}) {
        const { idKey = 'id', categoriaIdKey = 'categoria_id', precioKey = 'precio' } = opts;
        if (!Array.isArray(productos) || productos.length === 0) {
            return productos;
        }
        const vigentes = await PromocionService._getVigentesAhora(tenantId);
        if (vigentes.length === 0) {
            return productos;
        }
        return productos.map(p => {
            // Infinity: encuentra la promo que mejor calza por alcance, sin filtrar
            // todavía por cantidad_minima -- eso se decide después, abajo.
            const promo = PromocionService._resolverParaProducto(vigentes, p[idKey], p[categoriaIdKey], Infinity);
            if (!promo) {
                return p;
            }
            const cantidadMinima = Number(promo.cantidad_minima) || 1;
            if (cantidadMinima > 1) {
                return {
                    ...p,
                    promocion_regla: {
                        id: promo.id,
                        nombre: promo.nombre,
                        valor_tipo: promo.valor_tipo,
                        valor: Number(promo.valor),
                        cantidad_minima: cantidadMinima
                    }
                };
            }
            const precioOriginal = Number(p[precioKey]) || 0;
            const descuento = PromocionService.calcularDescuento(promo, precioOriginal);
            if (descuento <= 0) {
                return p;
            }
            return {
                ...p,
                precio_promocion: Math.max(0, Math.round((precioOriginal - descuento) * 100) / 100),
                promocion_id: promo.id,
                promocion_nombre: promo.nombre
            };
        });
    }

    /**
     * Resuelve el descuento vigente ahora para un lote de productos, dada la
     * cantidad REAL que va a tener cada uno en el pedido (para que las promociones
     * "por cantidad" se evalúen de verdad y no solo por catálogo). Uso en
     * facturación/creación de pedido: recibe tríos producto/categoría/cantidad y
     * devuelve un Map producto_id -> { valor_tipo, valor, nombre, id } solo para
     * los que sí tienen promo activa con esa cantidad.
     * @param {Array<{producto_id: number, categoria_id: number|null, cantidad?: number}>} items
     */
    static async getDescuentoPorProductos(tenantId, items) {
        const mapa = new Map();
        if (!Array.isArray(items) || items.length === 0) {
            return mapa;
        }
        const vigentes = await PromocionService._getVigentesAhora(tenantId);
        if (vigentes.length === 0) {
            return mapa;
        }
        items.forEach(({ producto_id, categoria_id, cantidad }) => {
            if (producto_id === null || producto_id === undefined || mapa.has(producto_id)) {
                return;
            }
            const cantidadDisponible = cantidad === undefined ? Infinity : Number(cantidad) || 0;
            const promo = PromocionService._resolverParaProducto(
                vigentes,
                producto_id,
                categoria_id,
                cantidadDisponible
            );
            if (promo) {
                // Mismo shape { valor_tipo, valor } que espera calcularDescuento --
                // así el llamador puede pasar esta entrada directo sin remapear.
                mapa.set(producto_id, {
                    valor_tipo: promo.valor_tipo,
                    valor: Number(promo.valor),
                    nombre: promo.nombre,
                    id: promo.id
                });
            }
        });
        return mapa;
    }

    static calcularDescuento(promo, precio) {
        const precioNum = Number(precio) || 0;
        if (promo.valor_tipo === 'porcentaje') {
            const pct = Math.min(100, Math.max(0, Number(promo.valor) || 0));
            return Math.round(precioNum * (pct / 100) * 100) / 100;
        }
        return Math.min(precioNum, Math.max(0, Number(promo.valor) || 0));
    }

    /**
     * Promoción con mayor prioridad para un producto: específica al producto > a
     * su categoría > global. `cantidadDisponible` es cuántas unidades de ESE
     * producto va a tener el pedido en total -- una promo con `cantidad_minima`
     * > 1 (activación "por cantidad", ej. solo si compran 2 o más) se descarta
     * como candidata si no se alcanza, incluso si por alcance le correspondería.
     * Pasar Infinity cuando todavía no se conoce la cantidad final (catálogo).
     */
    static _resolverParaProducto(promosVigentes, productoId, categoriaId, cantidadDisponible = Infinity) {
        let mejor = null;
        let mejorRank = -1;
        for (const promo of promosVigentes) {
            let rank;
            if (productoId !== null && productoId !== undefined && promo.productoIds.has(Number(productoId))) {
                rank = 2;
            } else if (
                categoriaId !== null &&
                categoriaId !== undefined &&
                promo.categoriaIds.has(Number(categoriaId))
            ) {
                rank = 1;
            } else if (promo.productoIds.size === 0 && promo.categoriaIds.size === 0) {
                rank = 0; // sin restricción -> aplica a todo el catálogo
            } else {
                continue; // tiene alcance definido y este producto no cae en él
            }
            const cantidadMinima = Number(promo.cantidad_minima) || 1;
            if (cantidadDisponible < cantidadMinima) {
                continue; // no se activa todavía -- falta cantidad
            }
            if (rank > mejorRank) {
                mejor = promo;
                mejorRank = rank;
            }
        }
        return mejor;
    }

    /** Promociones activas, vigentes por fecha Y por día/hora "ahora mismo" (cacheado 60s por tenant). */
    static async _getVigentesAhora(tenantId) {
        const cacheKey = `promociones_vigentes_${tenantId}`;
        let candidatas = cacheService.get(cacheKey);
        if (!candidatas) {
            const fechaHoy = PromocionService._hoyColombia();
            const promos = await PromocionRepository.getActivasVigentes(tenantId, fechaHoy);
            const promoIds = promos.map(p => p.id);
            const { productosPorPromocion, categoriasPorPromocion } =
                await PromocionRepository.getAlcancePorPromociones(promoIds);
            candidatas = promos.map(p => ({
                ...p,
                productoIds: productosPorPromocion.get(p.id) || new Set(),
                categoriaIds: categoriasPorPromocion.get(p.id) || new Set()
            }));
            cacheService.set(cacheKey, candidatas, VIGENTES_CACHE_TTL_SEGUNDOS);
        }
        return candidatas.filter(PromocionService._aplicaAhora);
    }

    /** Día de la semana + hora, evaluados sobre la promoción cacheada (día/hora cambian más rápido que el caché). */
    static _aplicaAhora(promo) {
        const { diaActual, horaActual } = PromocionService._ahoraColombia();

        if (promo.dias_semana) {
            const dias = String(promo.dias_semana).split(',');
            if (!dias.includes(diaActual)) {
                return false;
            }
        }

        if (promo.hora_inicio && promo.hora_fin) {
            if (!PromocionService._horaEnRango(horaActual, promo.hora_inicio, promo.hora_fin)) {
                return false;
            }
        }

        return true;
    }

    /** Compara strings 'HH:MM:SS' (formato que devuelve mysql2 con dateStrings). Soporta rangos que cruzan medianoche. */
    static _horaEnRango(horaActual, horaInicio, horaFin) {
        if (horaInicio <= horaFin) {
            return horaActual >= horaInicio && horaActual <= horaFin;
        }
        // Rango nocturno, ej. 22:00:00 - 02:00:00
        return horaActual >= horaInicio || horaActual <= horaFin;
    }

    /** { diaActual: 'lun'..'dom', horaActual: 'HH:MM:SS' } en hora Colombia, sin depender de locale/ICU. */
    static _ahoraColombia() {
        const colombiaMs = Date.now() - OFFSET_COLOMBIA_MS;
        const d = new Date(colombiaMs);
        const diaActual = DIAS_SET[d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1];
        const pad = n => String(n).padStart(2, '0');
        const horaActual = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
        return { diaActual, horaActual };
    }

    static _hoyColombia() {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    }

    static _invalidarCache(tenantId) {
        cacheService.delete(`promociones_vigentes_${tenantId}`);
    }

    // ---- CRUD (gestión) ----------------------------------------------------------

    static _validar(data) {
        if (!data.nombre || !data.nombre.trim()) {
            throw new Error('El nombre de la promoción es obligatorio');
        }
        if (!['porcentaje', 'valor'].includes(data.valor_tipo)) {
            throw new Error('El tipo de descuento debe ser "porcentaje" o "valor"');
        }
        const valorNum = Number(data.valor);
        if (!valorNum || valorNum <= 0) {
            throw new Error('El valor del descuento debe ser mayor a 0');
        }
        if (data.valor_tipo === 'porcentaje' && valorNum > 100) {
            throw new Error('Un descuento de porcentaje no puede ser mayor a 100');
        }
        if (data.cantidad_minima !== undefined && data.cantidad_minima !== null && data.cantidad_minima !== '') {
            const cantidadMinimaNum = Number(data.cantidad_minima);
            if (!Number.isInteger(cantidadMinimaNum) || cantidadMinimaNum < 1) {
                throw new Error('La cantidad mínima debe ser un número entero de al menos 1');
            }
        }
        if ((data.hora_inicio && !data.hora_fin) || (!data.hora_inicio && data.hora_fin)) {
            throw new Error('Debes indicar tanto la hora de inicio como la de fin, o ninguna');
        }
        if (data.fecha_inicio && data.fecha_fin && data.fecha_inicio > data.fecha_fin) {
            throw new Error('La fecha de inicio no puede ser posterior a la fecha de fin');
        }
        if (Array.isArray(data.dias_semana)) {
            const invalidos = data.dias_semana.filter(d => !DIAS_SET.includes(d));
            if (invalidos.length > 0) {
                throw new Error(`Días inválidos: ${invalidos.join(', ')}`);
            }
        }
    }

    static async crear(tenantId, data, usuarioId) {
        PromocionService._validar(data);

        const id = await PromocionRepository.create({
            tenantId,
            nombre: data.nombre.trim(),
            valorTipo: data.valor_tipo,
            valor: Number(data.valor),
            cantidadMinima: data.cantidad_minima ? Number.parseInt(data.cantidad_minima, 10) : 1,
            diasSemana:
                Array.isArray(data.dias_semana) && data.dias_semana.length > 0 ? data.dias_semana.join(',') : null,
            horaInicio: data.hora_inicio || null,
            horaFin: data.hora_fin || null,
            fechaInicio: data.fecha_inicio || null,
            fechaFin: data.fecha_fin || null,
            activa: data.activa,
            usuarioCreadorId: usuarioId
        });

        if (Array.isArray(data.producto_ids) && data.producto_ids.length > 0) {
            await PromocionRepository.setProductos(id, data.producto_ids);
        }
        if (Array.isArray(data.categoria_ids) && data.categoria_ids.length > 0) {
            await PromocionRepository.setCategorias(id, data.categoria_ids);
        }

        PromocionService._invalidarCache(tenantId);
        return { id };
    }

    static async actualizar(id, tenantId, data) {
        const existente = await PromocionRepository.findById(id, tenantId);
        if (!existente) {
            throw new Error('Promoción no encontrada');
        }
        PromocionService._validar({ ...existente, ...data, dias_semana: data.dias_semana });

        const fields = {};
        if (data.nombre !== undefined) {
            fields.nombre = data.nombre.trim();
        }
        if (data.valor_tipo !== undefined) {
            fields.valorTipo = data.valor_tipo;
        }
        if (data.valor !== undefined) {
            fields.valor = Number(data.valor);
        }
        if (data.cantidad_minima !== undefined) {
            fields.cantidadMinima = data.cantidad_minima ? Number.parseInt(data.cantidad_minima, 10) : 1;
        }
        if (data.dias_semana !== undefined) {
            fields.diasSemana =
                Array.isArray(data.dias_semana) && data.dias_semana.length > 0 ? data.dias_semana.join(',') : null;
        }
        if (data.hora_inicio !== undefined) {
            fields.horaInicio = data.hora_inicio || null;
        }
        if (data.hora_fin !== undefined) {
            fields.horaFin = data.hora_fin || null;
        }
        if (data.fecha_inicio !== undefined) {
            fields.fechaInicio = data.fecha_inicio || null;
        }
        if (data.fecha_fin !== undefined) {
            fields.fechaFin = data.fecha_fin || null;
        }
        if (data.activa !== undefined) {
            fields.activa = !!data.activa;
        }

        await PromocionRepository.update(id, tenantId, fields);
        if (data.producto_ids !== undefined) {
            await PromocionRepository.setProductos(id, data.producto_ids);
        }
        if (data.categoria_ids !== undefined) {
            await PromocionRepository.setCategorias(id, data.categoria_ids);
        }

        PromocionService._invalidarCache(tenantId);
        return { success: true };
    }

    static async eliminar(id, tenantId) {
        const existente = await PromocionRepository.findById(id, tenantId);
        if (!existente) {
            throw new Error('Promoción no encontrada');
        }
        await PromocionRepository.delete(id, tenantId);
        PromocionService._invalidarCache(tenantId);
        return { success: true };
    }

    static async listar(tenantId) {
        return PromocionRepository.getAll(tenantId);
    }

    static async getDetalle(id, tenantId) {
        const promocion = await PromocionRepository.findById(id, tenantId);
        if (!promocion) {
            throw new Error('Promoción no encontrada');
        }
        const [productoIds, categoriaIds] = await Promise.all([
            PromocionRepository.getProductoIds(id),
            PromocionRepository.getCategoriaIds(id)
        ]);
        return { ...promocion, producto_ids: productoIds, categoria_ids: categoriaIds };
    }
}

module.exports = PromocionService;
