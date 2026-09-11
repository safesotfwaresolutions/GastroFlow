// Tarjeta "Alertas Proactivas" en /configuracion: guardado independiente del
// formulario principal de impresión de facturas (tabla/dominio distintos).
document.addEventListener('DOMContentLoaded', function () {
    const btnGuardar = document.getElementById('btnGuardarAlertas');
    if (!btnGuardar) {
        return;
    }

    const feedback = document.getElementById('alertasFeedback');

    function mostrarFeedback(mensaje, esError) {
        feedback.textContent = mensaje;
        feedback.classList.remove('alert-success', 'alert-danger');
        feedback.classList.add(esError ? 'alert-danger' : 'alert-success');
        feedback.hidden = false;
    }

    btnGuardar.addEventListener('click', async function () {
        const payload = {
            alertas_activas: document.getElementById('alertasActivas').checked,
            email_notificacion: document.getElementById('alertasEmail').value.trim(),
            umbral_horas_mesa: document.getElementById('alertasUmbralHorasMesa').value,
            umbral_caida_ventas_pct: document.getElementById('alertasUmbralVentas').value
        };

        btnGuardar.disabled = true;
        try {
            const res = await fetch('/configuracion/alertas', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo guardar la configuración de alertas');
            }
            mostrarFeedback('Configuración de alertas guardada.', false);
        } catch (err) {
            mostrarFeedback(err.message, true);
        } finally {
            btnGuardar.disabled = false;
        }
    });
});
