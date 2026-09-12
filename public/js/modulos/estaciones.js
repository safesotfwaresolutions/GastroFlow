// Mantenimiento de estaciones de cocina (KDS) + asignación de categorías.
// Sin onclick inline (delegación de eventos), consistente con la convención CSP.

(function () {
    async function nuevaEstacion() {
        const { value: nombre } = await Swal.fire({
            title: 'Nueva estación',
            input: 'text',
            inputPlaceholder: 'Ej. Parrilla, Postres...',
            showCancelButton: true,
            confirmButtonText: 'Crear'
        });
        if (!nombre) {
            return;
        }
        try {
            const res = await fetch('/estaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo crear la estación');
            }
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function guardarEstacion(fila) {
        const id = fila.dataset.id;
        const nombre = fila.querySelector('.est-nombre').value.trim();
        const orden = Number.parseInt(fila.querySelector('.est-orden').value, 10) || 0;
        const activa = fila.querySelector('.est-activa').checked;

        try {
            const res = await fetch(`/estaciones/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, orden, activa })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo guardar');
            }
            Swal.fire({ icon: 'success', title: 'Guardado', timer: 900, showConfirmButton: false });
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function borrarEstacion(fila) {
        const id = fila.dataset.id;
        const result = await Swal.fire({
            title: '¿Eliminar estación?',
            text: 'Las categorías asignadas a ella quedarán sin estación.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, eliminar'
        });
        if (!result.isConfirmed) {
            return;
        }
        try {
            const res = await fetch(`/estaciones/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo eliminar');
            }
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function asignarCategoria(select) {
        const categoriaId = select.dataset.categoriaId;
        const estacionId = select.value;
        try {
            const res = await fetch(`/estaciones/categorias/${categoriaId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estacion_id: estacionId || null })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo actualizar');
            }
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const btnNueva = document.getElementById('btnNuevaEstacion');
        if (btnNueva) {
            btnNueva.addEventListener('click', nuevaEstacion);
        }

        const tbody = document.getElementById('estacionesTbody');
        if (tbody) {
            tbody.addEventListener('click', function (event) {
                const fila = event.target.closest('tr[data-id]');
                if (!fila) {
                    return;
                }
                if (event.target.closest('.btn-guardar-estacion')) {
                    guardarEstacion(fila);
                } else if (event.target.closest('.btn-borrar-estacion')) {
                    borrarEstacion(fila);
                }
            });
        }

        const categoriasTbody = document.getElementById('categoriasTbody');
        if (categoriasTbody) {
            categoriasTbody.addEventListener('change', function (event) {
                if (event.target.classList.contains('cat-estacion')) {
                    asignarCategoria(event.target);
                }
            });
        }
    });
})();
