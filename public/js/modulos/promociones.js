// CRUD de promociones (descuento automático por día/hora sobre productos,
// categorías, o todo el catálogo). Sin onclick inline (delegación de eventos).

(function () {
    function getModal() {
        const el = document.getElementById('modalPromocion');
        return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
    }

    function limpiarFormulario() {
        document.getElementById('promocionId').value = '';
        document.getElementById('promoNombre').value = '';
        document.getElementById('promoValorTipo').value = 'porcentaje';
        document.getElementById('promoValor').value = '';
        document.getElementById('activacionVenta').checked = true;
        document.getElementById('promoCantidadMinima').value = 2;
        document.getElementById('promoCantidadMinima').disabled = true;
        document.querySelectorAll('.promo-dia').forEach(cb => { cb.checked = false; });
        document.getElementById('promoHoraInicio').value = '';
        document.getElementById('promoHoraFin').value = '';
        document.getElementById('promoFechaInicio').value = '';
        document.getElementById('promoFechaFin').value = '';
        document.getElementById('promoProductos').querySelectorAll('option').forEach(o => { o.selected = false; });
        document.getElementById('promoCategorias').querySelectorAll('option').forEach(o => { o.selected = false; });
        document.getElementById('promoActiva').checked = true;
        document.getElementById('modalPromocionTitulo').textContent = 'Nueva promoción';
    }

    function abrirNueva() {
        limpiarFormulario();
        getModal()?.show();
    }

    function seleccionarOpciones(select, ids) {
        const idsStr = (ids || []).map(String);
        select.querySelectorAll('option').forEach(o => {
            o.selected = idsStr.includes(o.value);
        });
    }

    async function abrirEditar(fila) {
        const id = fila.dataset.id;
        try {
            const r = await fetch(`/promociones/${id}`);
            const p = await r.json();
            if (!r.ok) throw new Error(p.error || 'No se pudo cargar la promoción');

            limpiarFormulario();
            document.getElementById('promocionId').value = p.id;
            document.getElementById('promoNombre').value = p.nombre;
            document.getElementById('promoValorTipo').value = p.valor_tipo;
            document.getElementById('promoValor').value = p.valor;
            const cantidadMinima = Number(p.cantidad_minima) || 1;
            if (cantidadMinima > 1) {
                document.getElementById('activacionCantidad').checked = true;
                document.getElementById('promoCantidadMinima').value = cantidadMinima;
                document.getElementById('promoCantidadMinima').disabled = false;
            }
            if (p.dias_semana) {
                p.dias_semana.split(',').forEach(d => {
                    const cb = document.getElementById('dia-' + d);
                    if (cb) cb.checked = true;
                });
            }
            document.getElementById('promoHoraInicio').value = p.hora_inicio ? p.hora_inicio.slice(0, 5) : '';
            document.getElementById('promoHoraFin').value = p.hora_fin ? p.hora_fin.slice(0, 5) : '';
            document.getElementById('promoFechaInicio').value = p.fecha_inicio || '';
            document.getElementById('promoFechaFin').value = p.fecha_fin || '';
            seleccionarOpciones(document.getElementById('promoProductos'), p.producto_ids);
            seleccionarOpciones(document.getElementById('promoCategorias'), p.categoria_ids);
            document.getElementById('promoActiva').checked = !!p.activa;
            document.getElementById('modalPromocionTitulo').textContent = 'Editar promoción';

            getModal()?.show();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    function leerSeleccionMultiple(select) {
        return Array.from(select.selectedOptions).map(o => Number(o.value));
    }

    async function guardar() {
        const id = document.getElementById('promocionId').value;
        const dias = Array.from(document.querySelectorAll('.promo-dia:checked')).map(cb => cb.value);
        const porCantidad = document.getElementById('activacionCantidad').checked;
        const payload = {
            nombre: document.getElementById('promoNombre').value.trim(),
            valor_tipo: document.getElementById('promoValorTipo').value,
            valor: Number(document.getElementById('promoValor').value),
            cantidad_minima: porCantidad ? Number(document.getElementById('promoCantidadMinima').value) : 1,
            dias_semana: dias,
            hora_inicio: document.getElementById('promoHoraInicio').value ? document.getElementById('promoHoraInicio').value + ':00' : null,
            hora_fin: document.getElementById('promoHoraFin').value ? document.getElementById('promoHoraFin').value + ':00' : null,
            fecha_inicio: document.getElementById('promoFechaInicio').value || null,
            fecha_fin: document.getElementById('promoFechaFin').value || null,
            producto_ids: leerSeleccionMultiple(document.getElementById('promoProductos')),
            categoria_ids: leerSeleccionMultiple(document.getElementById('promoCategorias')),
            activa: document.getElementById('promoActiva').checked
        };

        try {
            const url = id ? `/promociones/${id}` : '/promociones';
            const method = id ? 'PUT' : 'POST';
            const r = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo guardar la promoción');

            getModal()?.hide();
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function borrar(fila) {
        const id = fila.dataset.id;
        const result = await Swal.fire({
            title: '¿Eliminar esta promoción?',
            text: 'Dejará de aplicar de inmediato.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, eliminar'
        });
        if (!result.isConfirmed) return;

        try {
            const r = await fetch(`/promociones/${id}`, { method: 'DELETE' });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo eliminar');
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.getElementById('btnNuevaPromocion')?.addEventListener('click', abrirNueva);
        document.getElementById('btnGuardarPromocion')?.addEventListener('click', guardar);

        document.querySelectorAll('input[name="promoActivacion"]').forEach(radio => {
            radio.addEventListener('change', function () {
                document.getElementById('promoCantidadMinima').disabled = this.value !== 'cantidad';
            });
        });

        const tbody = document.getElementById('promocionesTbody');
        if (tbody) {
            tbody.addEventListener('click', function (event) {
                const fila = event.target.closest('tr[data-id]');
                if (!fila) return;
                if (event.target.closest('.btn-editar-promocion')) {
                    abrirEditar(fila);
                } else if (event.target.closest('.btn-borrar-promocion')) {
                    borrar(fila);
                }
            });
        }
    });
})();
