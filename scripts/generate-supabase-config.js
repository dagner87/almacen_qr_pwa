const fs = require('node:fs');
const path = require('node:path');

const config = {
  url: (process.env.SUPABASE_URL || '').trim(),
  anonKey: (process.env.SUPABASE_ANON_KEY || '').trim()
};

if (!config.url || !config.anonKey) {
  console.warn('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in the Netlify environment.');
}

const output = `window.ALMACEN_SUPABASE_CONFIG = ${JSON.stringify(config)};\n`;
fs.writeFileSync(path.join(__dirname, '..', 'supabase-config.js'), output, 'utf8');
