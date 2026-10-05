const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Canvas uploads are still WebP images. Validate RIFF framing and both canvas
// and encoded frame dimensions before storing them. Specification:
// https://developers.google.com/speed/webp/docs/riff_container
function validarAvatarWebP(buffer) {
    const invalid = () => { const error = new Error('Avatar inválido. Envie uma imagem pelo seletor do painel.'); error.status = 400; throw error; };
    if (!Buffer.isBuffer(buffer) || buffer.length < 30 || buffer.length > 128 * 1024 ||
        buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP' ||
        buffer.readUInt32LE(4) + 8 !== buffer.length) invalid();
    let canvas, image, offset = 12;
    while (offset < buffer.length) {
        if (offset + 8 > buffer.length) invalid();
        const chunk = buffer.toString('ascii', offset, offset + 4);
        const length = buffer.readUInt32LE(offset + 4);
        const start = offset + 8, end = start + length;
        if (end + (length % 2) > buffer.length || !['VP8X', 'ALPH', 'VP8 ', 'VP8L'].includes(chunk)) invalid();
        if (chunk === 'VP8X') {
            if (canvas || offset !== 12 || length !== 10 || (buffer[start] & 0x02)) invalid();
            canvas = [buffer.readUIntLE(start + 4, 3) + 1, buffer.readUIntLE(start + 7, 3) + 1];
        } else if (chunk === 'VP8 ') {
            if (image || length < 10 || (buffer[start] & 1) || buffer.toString('hex', start + 3, start + 6) !== '9d012a') invalid();
            image = [buffer.readUInt16LE(start + 6) & 0x3fff, buffer.readUInt16LE(start + 8) & 0x3fff];
        } else if (chunk === 'VP8L') {
            if (image || length < 5 || buffer[start] !== 0x2f) invalid();
            const bits = buffer.readUInt32LE(start + 1);
            if (bits >>> 29) invalid();
            image = [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
        }
        offset = end + (length % 2);
    }
    if (!image || image.some(size => size < 1 || size > 256) ||
        (canvas && (canvas[0] !== image[0] || canvas[1] !== image[1]))) invalid();
    return { width: image[0], height: image[1] };
}

function salvarArquivoAvatar(buffer, directory) {
    validarAvatarWebP(buffer);
    fs.mkdirSync(directory, { recursive: true });
    const id = randomUUID();
    fs.writeFileSync(path.join(directory, `${id}.webp`), buffer, { flag: 'wx', mode: 0o644 });
    return `custom/${id}`;
}

module.exports = { validarAvatarWebP, salvarArquivoAvatar };
