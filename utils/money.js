/**
 * formatMoney - Formato de moneda es-CO (COP, sin decimales), compartido por
 * los reportes PDF (PdfDocHelpers) y las alertas proactivas por email.
 */
function formatMoney(amount) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
}

module.exports = { formatMoney };
