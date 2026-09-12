// KDS por estación: agrupa la misma cola de /api/cocina/cola por
// categoria.estacion_id en vez de por mesa. Reusa el mismo endpoint y el
// mismo SSE que la vista de Cocina por mesa (public/js/modulos/cocina.js) --
// no hay nada nuevo del lado del backend en tiempo real.

(function () {
    const UMBRAL_MEDIO_MIN = 10;
    const UMBRAL_ALTO_MIN = 20;

    function escapeHtml(str) {
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function minutosEsperando(item) {
        const desde = item.enviado_at || item.created_at;
        if (!desde) {
            return 0;
        }
        return Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 60000));
    }

    function claseEspera(minutos) {
        if (minutos >= UMBRAL_ALTO_MIN) {
            return 'espera-alta';
        }
        if (minutos >= UMBRAL_MEDIO_MIN) {
            return 'espera-media';
        }
        return 'espera-normal';
    }

    function cardItem(item) {
        const minutos = minutosEsperando(item);
        const mesaLabel = item.pedido_origen === 'caja' ? item.mesa_descripcion || 'Mostrador' : `Mesa ${item.mesa_numero}`;
        const accion =
            item.estado === 'enviado'
                ? `<button class="btn btn-sm btn-primary w-100 mt-1" data-action="prep" data-id="${item.id}"><i class="bi bi-play"></i> Preparar</button>`
                : item.estado === 'preparando'
                  ? `<button class="btn btn-sm btn-success w-100 mt-1" data-action="listo" data-id="${item.id}"><i class="bi bi-check2"></i> Listo</button>`
                  : '';

        return `
            <div class="kds-item ${claseEspera(minutos)}">
                <div class="d-flex justify-content-between">
                    <span class="kds-item-producto">${escapeHtml(item.producto_nombre)}</span>
                    <span class="badge bg-dark">${item.cantidad}</span>
                </div>
                <div class="kds-item-meta">${escapeHtml(mesaLabel)} · Pedido #${item.pedido_numero} · esperando ${minutos} min</div>
                ${item.nota ? `<div class="kds-item-nota"><i class="bi bi-chat-left-text"></i> ${escapeHtml(item.nota)}</div>` : ''}
                ${accion}
            </div>
        `;
    }

    function agruparPorEstacion(items, estaciones) {
        const grupos = new Map(estaciones.map((e) => [e.id, []]));
        const sinEstacion = [];

        for (const item of items) {
            if (item.estacion_id && grupos.has(item.estacion_id)) {
                grupos.get(item.estacion_id).push(item);
            } else {
                sinEstacion.push(item);
            }
        }

        return { grupos, sinEstacion };
    }

    function render(items, estaciones) {
        const contenedor = document.getElementById('kdsColumnas');
        const activos = items.filter((it) => it.estado !== 'listo' && it.estado !== 'servido');
        const { grupos, sinEstacion } = agruparPorEstacion(activos, estaciones);

        const columnasHtml = estaciones
            .map((estacion) => {
                const itemsEstacion = grupos.get(estacion.id) || [];
                return `
                <div class="kds-columna">
                    <div class="kds-columna-header">
                        <span>${escapeHtml(estacion.nombre)}</span>
                        <span class="badge bg-secondary">${itemsEstacion.length}</span>
                    </div>
                    <div class="kds-columna-body">
                        ${itemsEstacion.length ? itemsEstacion.map(cardItem).join('') : '<div class="kds-empty">Sin pendientes</div>'}
                    </div>
                </div>
            `;
            })
            .join('');

        const columnaSinEstacion = `
            <div class="kds-columna">
                <div class="kds-columna-header">
                    <span>Sin estación</span>
                    <span class="badge bg-secondary">${sinEstacion.length}</span>
                </div>
                <div class="kds-columna-body">
                    ${sinEstacion.length ? sinEstacion.map(cardItem).join('') : '<div class="kds-empty">Sin pendientes</div>'}
                </div>
            </div>
        `;

        contenedor.innerHTML = columnasHtml + columnaSinEstacion;
    }

    async function cargarCola(estaciones) {
        try {
            const res = await fetch('/api/cocina/cola');
            if (!res.ok) {
                throw new Error('Error al cargar la cola');
            }
            const items = await res.json();
            render(items, estaciones);
        } catch (error) {
            console.error('Error al cargar KDS:', error);
        }
    }

    async function cambiarEstado(id, estado) {
        try {
            await fetch(`/api/cocina/item/${id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado })
            });
        } catch (error) {
            console.error('Error al actualizar estado:', error);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const estaciones = JSON.parse(document.getElementById('kds-estaciones-data').textContent || '[]');

        document.getElementById('kdsColumnas').addEventListener('click', function (event) {
            const btn = event.target.closest('[data-action]');
            if (!btn) {
                return;
            }
            const estado = btn.dataset.action === 'prep' ? 'preparando' : 'listo';
            cambiarEstado(btn.dataset.id, estado).then(() => cargarCola(estaciones));
        });

        // SSE (mismo canal que Cocina por mesa) + polling de respaldo + refresco del
        // contador de minutos aunque no cambie ningún estado.
        if (window.EventSource) {
            const source = new EventSource('/api/notifications/subscribe');
            source.addEventListener('message', function (e) {
                try {
                    const data = JSON.parse(e.data);
                    if (data.event === 'orderCreated') {
                        cargarCola(estaciones);
                    }
                } catch (err) {
                    console.error('Error SSE KDS:', err);
                }
            });
            window.addEventListener('beforeunload', () => source.close());
        }

        cargarCola(estaciones);
        setInterval(() => cargarCola(estaciones), 30000);
    });
})();
