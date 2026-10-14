/* Verifica que index.html y el service worker referencien solo archivos existentes
   y que todo archivo de js/ esté precacheado. Se ejecuta en el build de Netlify. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const errors = [];

const html = read('index.html');
const local = (url) => !/^(https?:)?\/\//.test(url) && url !== 'supabase-config.js';
const referenced = [...html.matchAll(/<(?:script src|link[^>]*href)="([^"]+)"/g)].map((m) => m[1]).filter(local);
for (const file of referenced) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`index.html referencia un archivo inexistente: ${file}`);
}

const sw = read('sw.js');
const core = [...(sw.match(/const CORE=\[(.*?)\];/s)?.[1] || '').matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
for (const file of core) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`sw.js precachea un archivo inexistente: ${file}`);
}

const jsFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) jsFiles.push(path.relative(root, full).split(path.sep).join('/'));
  }
})(path.join(root, 'js'));

for (const file of jsFiles) {
  if (!referenced.includes(file)) errors.push(`${file} no está cargado en index.html`);
  if (!core.includes(file)) errors.push(`${file} no está en la lista CORE de sw.js`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Archivos verificados: ${referenced.length} en index.html, ${core.length} en sw.js.`);
