// Offline: verify every pixel of the bundled QR against the official URL's encoding.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const qr = require('../docs/vendor/qrcode.min.js');
const url = 'https://docs.google.com/forms/d/e/1FAIpQLSeeleFRJ3PbTeX9nmxFtfqF_3VMD6bBGixNGFODEtqjbHGK9A/viewform?entry.52413313=Shredder.exe';
const matrix = qr.create(url, {errorCorrectionLevel: 'M'}).modules;
const png = fs.readFileSync(path.join(root, 'Assets/Resources/Avaliacao/shredder-avaliacao.png'));
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
let width, height; const chunks = [];
for (let i = 8; i < png.length;) {
 const length = png.readUInt32BE(i); const type = png.toString('ascii', i + 4, i + 8);
 const data = png.subarray(i + 8, i + 8 + length);
 if (type === 'IHDR') {width = data.readUInt32BE(0); height = data.readUInt32BE(4); assert.equal(data[8], 8); assert.equal(data[9], 0);}
 if (type === 'IDAT') chunks.push(data);
 i += length + 12;
}
assert.equal(width, (matrix.size + 8) * 6); assert.equal(height, width);
const raw = zlib.inflateSync(Buffer.concat(chunks));
assert.equal(raw.length, height * (width + 1));
for (let y = 0; y < height; y++) {
 assert.equal(raw[y * (width + 1)], 0);
 for (let x = 0; x < width; x++) {
  const a = Math.floor(x / 6) - 4, b = Math.floor(y / 6) - 4;
  const dark = a >= 0 && b >= 0 && a < matrix.size && b < matrix.size && matrix.get(b, a);
  assert.equal(raw[y * (width + 1) + x + 1], dark ? 0 : 255);
 }
}
const view = fs.readFileSync(path.join(root, 'Assets/Script/Menu/ScoreScreen/GameEvaluationView.cs'), 'utf8');
assert.ok(view.includes('"' + url + '"'));
console.log('PASS: bundled QR pixels, quiet zone, official form URL and prefilled game name. No network calls.');
