// Edge Function: envía un correo (Resend) cuando un producto llega cerca o por debajo del mínimo.
// Secrets requeridos: RESEND_API_KEY y, opcionalmente, ALERT_FROM (ej. "Almacén <alertas@tudominio.com>").
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const REPEAT_HOURS = 24;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));

  const { data: config } = await db.from('alert_config').select('*').eq('id', 1).single();
  const recipients = String(config?.emails || '')
    .split(/[,;\s]+/)
    .filter((e: string) => e.includes('@'));
  const [{ data: limits }, { data: pallets }, { data: state }] = await Promise.all([
    db.from('stock_limits').select('*'),
    db.from('pallets').select('products,status').eq('status', 'active'),
    db.from('stock_alert_state').select('*'),
  ]);

  const totals = new Map<string, number>();
  for (const pallet of pallets || [])
    for (const item of Array.isArray(pallet.products) ? pallet.products : []) {
      const code = String(item.productCode || '').trim().toUpperCase();
      if (code) totals.set(code, (totals.get(code) || 0) + Number(item.quantity || 0));
    }

  const warnPct = Number(config?.warn_pct ?? 20);
  const levels = new Map<string, { level: string; row: any; stock: number }>();
  for (const row of limits || []) {
    const code = String(row.product_code).toUpperCase();
    const stock = totals.get(code) || 0;
    const min = Number(row.min_qty || 0);
    if (min <= 0) continue;
    const level = stock <= min ? 'critical' : stock <= min * (1 + warnPct / 100) ? 'warning' : 'ok';
    levels.set(code, { level, row, stock });
  }

  const previous = new Map((state || []).map((s: any) => [s.product_code, s]));
  const now = Date.now();
  const due: { level: string; row: any; stock: number }[] = [];
  for (const [code, info] of levels) {
    const last: any = previous.get(code);
    if (info.level === 'ok') {
      if (last) await db.from('stock_alert_state').delete().eq('product_code', code);
      continue;
    }
    const age = last ? (now - new Date(last.last_sent_at).getTime()) / 36e5 : Infinity;
    const worse = last && last.level === 'warning' && info.level === 'critical';
    if (!last || worse || age >= REPEAT_HOURS) due.push(info);
  }

  if (!config?.enabled || !recipients.length || !due.length)
    return json({ sent: 0, pending: due.length, enabled: !!config?.enabled, recipients: recipients.length });

  const rows = due
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1))
    .map(
      ({ level, row, stock }) =>
        `<tr><td>${level === 'critical' ? '🔴 Crítico' : '🟠 Casi al mínimo'}</td><td><b>${row.product_code}</b></td><td>${
          row.description || ''
        }</td><td align="right">${stock}</td><td align="right">${row.min_qty}</td><td align="right">${row.max_qty ?? '—'}</td><td align="right">${
          row.max_qty ? Math.max(row.max_qty - stock, 0) : '—'
        }</td></tr>`,
    )
    .join('');
  const html = `<h2>Productos por reponer</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse"><tr><th>Estado</th><th>Código</th><th>Descripción</th><th>Stock</th><th>Mínimo</th><th>Máximo</th><th>Sugerido pedir</th></tr>${rows}</table><p>Almacén QR</p>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('ALERT_FROM') || 'Almacén QR <onboarding@resend.dev>',
      to: recipients,
      subject: `Almacén: ${due.length} producto(s) por reponer`,
      html,
    }),
  });
  if (!res.ok) return json({ error: await res.text() }, 502);

  await db.from('stock_alert_state').upsert(
    due.map((d) => ({ product_code: String(d.row.product_code).toUpperCase(), level: d.level, last_sent_at: new Date().toISOString() })),
  );
  return json({ sent: due.length, test: !!body?.test });
});
