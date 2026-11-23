'use strict';

const QRCode = require('qrcode');

const DEFAULT_COLOR = { dark: '#2c2530', light: '#ffffff' };

/**
 * Render a QR code as a PNG buffer.
 *
 * @param {string} text
 * @param {number} [width]
 * @returns {Promise<Buffer>}
 */
const toPng = (text, width = 720) => QRCode.toBuffer(text, {
    type: 'png',
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: DEFAULT_COLOR,
});

/**
 * Render a QR code as a data URL.
 *
 * @param {string} text
 * @param {number} [width]
 * @returns {Promise<string>}
 */
const toDataUrl = (text, width = 320) => QRCode.toDataURL(text, {
    type: 'image/png',
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: DEFAULT_COLOR,
});

/**
 * Render a QR code as an SVG string.
 *
 * @param {string} text
 * @returns {Promise<string>}
 */
const toSvg = (text) => QRCode.toString(text, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'M',
    color: DEFAULT_COLOR,
});

module.exports = { toPng, toDataUrl, toSvg };
