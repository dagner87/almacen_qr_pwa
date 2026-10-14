const fs = require('node:fs');
const path = require('node:path');

const config = {
  url: (process.env.SUPABASE_URL || '').trim(),
  anonKey: (process.env.SUPABASE_ANON_KEY || '').trim()
};

if (!config.url || !config.anonKey) {
  console.warn('Supabase no está configurado. Se genera un archivo local vacío; la app seguirá en modo local hasta definir SUPABASE_URL y SUPABASE_ANON_KEY.');
}

if (config.url && !/^https:\/\//.test(config.url)) {
  console.error('SUPABASE_URL debe ser la URL HTTPS del proyecto de Supabase.');
  process.exit(1);
}

const output = `window.ALMACEN_SUPABASE_CONFIG = ${JSON.stringify(config)};\n`;
fs.writeFileSync(path.join(__dirname, '..', 'supabase-config.js'), output, 'utf8');
