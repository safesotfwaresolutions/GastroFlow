// Módulo Órdenes de Compra: crear (con líneas dinámicas), ver detalle, recibir
// (cantidad editable por línea) y cancelar. Sin onclick inline (delegación de
// eventos), consistente con la migración de CSP del resto de la app.

(function () {
    let insumosCache = null;

    function money(valor) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(valor || 0);
    }

    async function cargarInsumos() {
        if (insumosCache) {
            return insumosCache;
        }
        const res = await fetch('/inventario/api/insumos');
        const data = await res.json();
        insumosCache = Array.isArray(data) ? data : data.insumos || [];
        return insumosCache;
    }

    function opcionesInsumosHtml(insumos) {
        return insumos.map((i) => `<option value="${i.id}" data-unidad="${i.unidad_base || ''}">${i.nombre} (${i.codigo})</option>`).join('');
    }

    async function agregarLinea() {
        const insumos = await cargarInsumos();
        const template = document.getElementById('ocLineaTemplate');
        const clone = template.content.cloneNode(true);
        const select = clone.querySelector('.oc-linea-insumo');
        select.insertAdjacentHTML('beforeend', opcionesInsumosHtml(insumos));
        document.getElementById('ocLineasContainer').appendChild(clone);
    }

    function leerLineasFormulario() {
        const filas = document.querySelectorAll('#ocLineasContainer .oc-linea');
        const items = [];
        for (const fila of filas) {
            const insumoId = fila.querySelector('.oc-linea-insumo').value;
            const cantidad = fila.querySelector('.oc-linea-cantidad').value;
            const costo = fila.querySelector('.oc-linea-costo').value;
            if (!insumoId || !cantidad) {
                continue;
            }
            items.push({
                insumo_id: Number.parseInt(insumoId, 10),
                cantidad_pedida: Number.parseFloat(cantidad),
                costo_unitario_estimado: costo ? Number.parseFloat(costo) : null
            });
        }
        return items;
    }

    async function crearOrden(event) {
        event.preventDefault();
        const proveedorId = document.getElementById('oc_proveedor_id').value;
        const notas = document.getElementById('oc_notas').value;
        const items = leerLineasFormulario();

        if (!proveedorId) {
            return Swal.fire('Falta el proveedor', 'Selecciona un proveedor.', 'warning');
        }
        if (items.length === 0) {
            return Swal.fire('Sin insumos', 'Agrega al menos un insumo con cantidad.', 'warning');
        }

        try {
            const res = await fetch('/ordenes-compra', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proveedor_id: Number.parseInt(proveedorId, 10), notas, items })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo crear la orden');
            }
            await Swal.fire('Creada', 'La orden de compra se creó correctamente.', 'success');
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function verDetalle(id) {
        try {
            const res = await fetch(`/ordenes-compra/${id}`);
            const orden = await res.json();
            if (!res.ok) {
                throw new Error(orden.error || 'No se pudo cargar la orden');
            }

            document.getElementById('detalleOrdenTitulo').textContent = `#${orden.id} · ${orden.proveedor_nombre}`;
            document.getElementById('detalleNotas').textContent = orden.notas || '';
            const tbody = document.getElementById('detalleLineasTbody');
            tbody.innerHTML = orden.items
                .map(
                    (i) => `
                <tr>
                    <td>${i.insumo_nombre}</td>
                    <td class="text-end">${i.cantidad_pedida} ${i.unidad_base || ''}</td>
                    <td class="text-end">${i.cantidad_recibida !== null ? i.cantidad_recibida + ' ' + (i.unidad_base || '') : '-'}</td>
                    <td class="text-end">${i.costo_unitario_estimado !== null ? money(i.costo_unitario_estimado) : '-'}</td>
                </tr>
            `
                )
                .join('');

            new bootstrap.Modal(document.getElementById('detalleOrdenModal')).show();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function abrirRecibir(id) {
        try {
            const res = await fetch(`/ordenes-compra/${id}`);
            const orden = await res.json();
            if (!res.ok) {
                throw new Error(orden.error || 'No se pudo cargar la orden');
            }

            document.getElementById('recibirOrdenTitulo').textContent = `#${orden.id} · ${orden.proveedor_nombre}`;
            const tbody = document.getElementById('recibirLineasTbody');
            tbody.innerHTML = orden.items
                .map(
                    (i) => `
                <tr data-item-id="${i.id}">
                    <td>${i.insumo_nombre}</td>
                    <td class="text-end">${i.cantidad_pedida} ${i.unidad_base || ''}</td>
                    <td class="text-end">
                        <input type="number" class="form-control form-control-sm text-end recibir-cantidad"
                            min="0" step="0.001" value="${i.cantidad_pedida}">
                    </td>
                </tr>
            `
                )
                .join('');

            const modalEl = document.getElementById('recibirOrdenModal');
            modalEl.dataset.ordenId = id;
            new bootstrap.Modal(modalEl).show();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function confirmarRecibir() {
        const modalEl = document.getElementById('recibirOrdenModal');
        const ordenId = modalEl.dataset.ordenId;
        const filas = document.querySelectorAll('#recibirLineasTbody tr');
        const items = Array.from(filas).map((fila) => ({
            id: Number.parseInt(fila.dataset.itemId, 10),
            cantidad_recibida: Number.parseFloat(fila.querySelector('.recibir-cantidad').value) || 0
        }));

        try {
            const res = await fetch(`/ordenes-compra/${ordenId}/recibir`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo recibir la orden');
            }
            await Swal.fire('Recibida', data.message, 'success');
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function cancelarOrden(id) {
        const result = await Swal.fire({
            title: '¿Cancelar orden?',
            text: 'No se podrá recibir después de cancelarla.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, cancelar'
        });
        if (!result.isConfirmed) {
            return;
        }
        try {
            const res = await fetch(`/ordenes-compra/${id}/cancelar`, { method: 'PUT' });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo cancelar');
            }
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const btnAgregarLinea = document.getElementById('btnAgregarLinea');
        if (btnAgregarLinea) {
            btnAgregarLinea.addEventListener('click', agregarLinea);
            agregarLinea(); // arranca con una línea lista
        }

        const form = document.getElementById('ordenCompraForm');
        if (form) {
            form.addEventListener('submit', crearOrden);
        }

        const lineasContainer = document.getElementById('ocLineasContainer');
        if (lineasContainer) {
            lineasContainer.addEventListener('click', function (event) {
                if (event.target.closest('.btn-quitar-linea')) {
                    event.target.closest('.oc-linea').remove();
                }
            });
        }

        const tbody = document.getElementById('ordenesTbody');
        if (tbody) {
            tbody.addEventListener('click', function (event) {
                const btnVer = event.target.closest('.btn-ver-orden');
                const btnRecibir = event.target.closest('.btn-recibir-orden');
                const btnCancelar = event.target.closest('.btn-cancelar-orden');
                if (btnVer) {
                    verDetalle(btnVer.dataset.id);
                } else if (btnRecibir) {
                    abrirRecibir(btnRecibir.dataset.id);
                } else if (btnCancelar) {
                    cancelarOrden(btnCancelar.dataset.id);
                }
            });
        }

        const btnConfirmarRecibir = document.getElementById('btnConfirmarRecibir');
        if (btnConfirmarRecibir) {
            btnConfirmarRecibir.addEventListener('click', confirmarRecibir);
        }

        // Reinicia el formulario de creación cada vez que se abre (evita arrastrar
        // líneas de un intento anterior si el usuario cerró el modal sin guardar).
        const ordenCompraModal = document.getElementById('ordenCompraModal');
        if (ordenCompraModal) {
            ordenCompraModal.addEventListener('show.bs.modal', function () {
                document.getElementById('ordenCompraForm').reset();
                document.getElementById('ocLineasContainer').innerHTML = '';
                agregarLinea();
            });
        }
    });
})();
