/**
 * PdfMaker - Genera PDFs a partir de un docDefinition de pdfmake.
 *
 * Reemplaza a PdfBrowser.js (Chromium headless vía Puppeteer). Los 3 reportes
 * que consumían PdfBrowser son texto/tablas puros (sin imágenes, logos ni
 * charts), así que no hace falta un motor de renderizado HTML completo -- eso
 * es lo que costaba la RAM (un Chromium por PDF).
 *
 * pdfmake usa las fuentes standard Roboto que trae el propio paquete (no hace
 * falta descargar ni embeber fuentes propias); se registran una sola vez de
 * forma perezosa, la primera vez que se pide un PDF.
 */

const path = require('node:path');

let pdfMakeInstance = null;

function getPdfMake() {
    if (pdfMakeInstance) {
        return pdfMakeInstance;
    }

    // Lazy: igual que PdfBrowser con puppeteer, no cargar el módulo hasta que
    // de verdad se genere un PDF.
    const pdfMake = require('pdfmake');
    const fontsDir = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');

    pdfMake.setFonts({
        Roboto: {
            normal: path.join(fontsDir, 'Roboto-Regular.ttf'),
            bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
            italics: path.join(fontsDir, 'Roboto-Italic.ttf'),
            bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf')
        }
    });
    // Los docDefinition de estos reportes no referencian imágenes ni archivos
    // externos -- se deniega cualquier acceso a disco/red salvo el de las
    // propias fuentes Roboto (la carga de fuentes pasa por esta misma política).
    pdfMake.setUrlAccessPolicy(() => false);
    pdfMake.setLocalAccessPolicy(filePath => path.resolve(filePath).startsWith(fontsDir));

    pdfMakeInstance = pdfMake;
    return pdfMakeInstance;
}

/**
 * @param {object} docDefinition  Documento pdfmake (content, styles, etc.).
 * @returns {Promise<Buffer>}
 */
async function renderPdf(docDefinition) {
    const pdfMake = getPdfMake();
    const doc = pdfMake.createPdf({
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40],
        defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1e293b' },
        ...docDefinition
    });
    return doc.getBuffer();
}

module.exports = { renderPdf };
