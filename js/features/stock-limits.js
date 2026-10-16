/* Mínimos/máximos por producto y alertas de stock bajo. */
let stockLimits = [];
let alertConfig = { enabled: true, emails: '', warn_pct: 20 };
let notifyTimer = null;

function stockTotals() {
  const totals = new Map();
  for (const pallet of state.pallets) {
    if (pallet.status !== 'active') continue;
    for (const item of palletProducts(pallet)) {
      const code = String(item.productCode || '').trim().toLocaleUpperCase();
      if (!code) continue;
      const row = totals.get(code) || { code, description: productDescription(item), qty: 0 };
      row.qty += Number(item.quantity || 0);
      if (!row.description) row.description = productDescription(item);
      totals.set(code, row);
    }
  }
  return totals;
}

function stockLevel(stock, limit) {
  const min = Number(limit?.min_qty || 0);
  if (min <= 0) return 'none';
  if (stock <= min) return 'critical';
  return stock <= min * (1 + Number(alertConfig.warn_pct ?? 20) / 100) ? 'warning' : 'ok';
}

async function refreshStockLimits() {
  if (!supabaseClient || AUTH_DISABLED) return;
  try {
    const { data } = await supabaseClient.from('stock_limits').select('*');
    stockLimits = data || [];
    if (currentProfile?.role === 'admin') {
      const { data: cfg } = await supabaseClient.from('alert_config').select('*').eq('id', 1).maybeSingle();
      if (cfg) alertConfig = cfg;
    } else {
      alertConfig = { ...alertConfig };
    }
  } catch (error) {
    stockLimits = [];
  }
  renderLowStock();
  renderStockSettings();
}

function lowStockItems() {
  const totals = stockTotals();
  return stockLimits
    .map((limit) => {
      const code = String(limit.product_code).toLocaleUpperCase(),
        stock = totals.get(code)?.qty || 0;
      return { limit, stock, level: stockLevel(stock, limit) };
    })
    .filter((row) => row.level === 'critical' || row.level === 'warning')
    .sort((a, b) => (a.level === b.level ? a.stock - b.stock : a.level === 'critical' ? -1 : 1));
}

function renderLowStock() {
  const target = $('lowStock');
  if (!target) return;
  const items = lowStockItems();
  target.innerHTML = items.length
    ? items
        .slice(0, 10)
        .map(
          ({ limit, stock, level }) =>
            `<div class="low-row ${level}"><div><b>${escapeHtml(limit.product_code)}</b><small>${escapeHtml(catalogLookup(limit.product_code)?.description || limit.description || '')}</small></div><span>${stock.toLocaleString()} / mín ${Number(limit.min_qty).toLocaleString()}</span></div>`,
        )
        .join('')
    : `<p class="muted small">${stockLimits.length ? 'Todo el stock está sobre el mínimo.' : 'Aún no hay mínimos configurados (Configuración).'}</p>`;
}

function renderStockSettings() {
  const grid = $('stockLimitsGrid');
  if (!grid) return;
  const totals = stockTotals(),
    byCode = new Map(stockLimits.map((l) => [String(l.product_code).toLocaleUpperCase(), l])),
    query = ($('stockLimitsSearch')?.value || '').trim().toLocaleLowerCase();
  for (const l of stockLimits) {
    const code = String(l.product_code).toLocaleUpperCase();
    if (!totals.has(code)) totals.set(code, { code, description: catalogLookup(code)?.description || l.description || '', qty: 0 });
  }
  const rows = [...totals.values()]
    .filter((r) => !query || `${r.code} ${r.description}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  $('alertEnabled').checked = alertConfig.enabled !== false;
  $('alertEmails').value = alertConfig.emails || '';
  $('alertWarnPct').value = alertConfig.warn_pct ?? 20;
  grid.innerHTML = rows.length
    ? `<table class="inventory-table stock-limits-table"><thead><tr><th>Código</th><th>Descripción</th><th>Stock</th><th>Mínimo</th><th>Máximo</th><th>Estado</th></tr></thead><tbody>${rows
        .map((r) => {
          const limit = byCode.get(r.code),
            level = stockLevel(r.qty, limit),
            label = { critical: 'Crítico', warning: 'Casi al mínimo', ok: 'OK', none: '—' }[level];
          return `<tr data-code="${escapeHtml(r.code)}" data-desc="${escapeHtml(r.description)}"><td><b>${escapeHtml(r.code)}</b></td><td>${escapeHtml(r.description)}</td><td>${r.qty.toLocaleString()}</td><td><input class="limit-min" type="number" min="0" inputmode="numeric" value="${limit ? Number(limit.min_qty) : ''}" placeholder="—"></td><td><input class="limit-max" type="number" min="0" inputmode="numeric" value="${limit?.max_qty ?? ''}" placeholder="—"></td><td><span class="pill ${level === 'critical' ? 'danger' : level === 'warning' ? 'warn' : ''}">${label}</span></td></tr>`;
        })
        .join('')}</tbody></table>`
    : '<div class="empty">No hay productos todavía.</div>';
}

async function saveStockLimits() {
  if (!canWrite(true)) return;
  const upserts = [],
    removals = [],
    byCode = new Map(stockLimits.map((l) => [String(l.product_code).toLocaleUpperCase(), l]));
  for (const tr of document.querySelectorAll('#stockLimitsGrid tbody tr')) {
    const code = tr.dataset.code,
      minRaw = tr.querySelector('.limit-min').value.trim(),
      maxRaw = tr.querySelector('.limit-max').value.trim(),
      current = byCode.get(code);
    if (minRaw === '' && maxRaw === '') {
      if (current) removals.push(current.product_code);
      continue;
    }
    const min = Math.max(0, parseInt(minRaw || '0', 10) || 0),
      max = maxRaw === '' ? null : Math.max(0, parseInt(maxRaw, 10) || 0);
    if (max !== null && max < min) return toast(`${code}: el máximo no puede ser menor que el mínimo.`);
    if (current && Number(current.min_qty) === min && (current.max_qty ?? null) === max) continue;
    upserts.push({
      product_code: code,
      description: tr.dataset.desc || '',
      min_qty: min,
      max_qty: max,
      updated_at: new Date().toISOString(),
      updated_by_email: currentProfile?.email || '',
    });
  }
  if (!upserts.length && !removals.length) return toast('No hay cambios que guardar.');
  try {
    if (upserts.length) {
      const { error } = await supabaseClient.from('stock_limits').upsert(upserts);
      if (error) throw error;
    }
    if (removals.length) {
      const { error } = await supabaseClient.from('stock_limits').delete().in('product_code', removals);
      if (error) throw error;
    }
    toast('Límites guardados.');
    await refreshStockLimits();
    notifyStockChange(true);
  } catch (error) {
    toast('No se pudieron guardar los límites: ' + error.message);
  }
}

async function saveAlertConfig() {
  if (!canWrite(true)) return;
  const emails = $('alertEmails').value.trim(),
    bad = emails.split(/[,;\s]+/).filter(Boolean).filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (bad.length) return toast('Correo no válido: ' + bad[0]);
  const row = {
    id: 1,
    enabled: $('alertEnabled').checked,
    emails,
    warn_pct: Math.min(100, Math.max(0, parseInt($('alertWarnPct').value, 10) || 0)),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseClient.from('alert_config').upsert(row);
  if (error) return toast('No se pudo guardar: ' + error.message);
  alertConfig = row;
  renderStockSettings();
  renderLowStock();
  toast('Alertas guardadas.');
}

async function runStockAlerts(manual) {
  if (!supabaseClient || AUTH_DISABLED || !stockLimits.length) return;
  try {
    const { data, error } = await supabaseClient.functions.invoke('stock-alerts', { body: { test: !!manual } });
    if (error) throw error;
    if (manual)
      toast(
        data?.sent
          ? `Correo enviado (${data.sent} producto(s)).`
          : data?.recipients === 0
            ? 'Agrega al menos un correo y guarda.'
            : 'No hay productos por reponer, o ya se avisó en las últimas 24 h.',
      );
  } catch (error) {
    if (manual) toast('No se pudo ejecutar la alerta: ' + (error.message || error));
  }
}

function notifyStockChange(immediate) {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => runStockAlerts(false), immediate ? 500 : 4000);
}

function bindStockLimits() {
  if ($('deleteAllPallets')) $('deleteAllPallets').onclick = deleteAllPallets;
  if (!$('saveStockLimits')) return;
  $('saveStockLimits').onclick = saveStockLimits;
  $('saveAlertConfig').onclick = saveAlertConfig;
  $('testStockAlert').onclick = () => runStockAlerts(true);
  $('stockLimitsSearch').oninput = renderStockSettings;
}

async function deleteAllPallets() {
  if (!canWrite(true)) return;
  const total = state.pallets.length;
  const typed = prompt(`Se eliminarán ${total} pallet(s) de la base de datos. Esta acción no se puede deshacer.\n\nEscribe BORRAR para confirmar:`);
  if (typed === null) return;
  if (typed.trim().toUpperCase() !== 'BORRAR') return toast('Cancelado: no escribiste BORRAR.');
  try {
    if (!AUTH_DISABLED) {
      const { error } = await supabaseClient.from('pallets').delete().neq('id', '');
      if (error) throw error;
      const { count, error: checkError } = await supabaseClient.from('pallets').select('id', { count: 'exact', head: true });
      if (checkError) throw checkError;
      if (count) throw new Error(`Quedaron ${count} pallet(s). Verifica que tu usuario sea administrador.`);
    }
    for (const pallet of state.pallets) await del('pallets', pallet.id);
    await loadState();
    toast('Todos los pallets fueron eliminados. Ya puedes importar el JSON.');
  } catch (error) {
    toast('No se pudo borrar: ' + error.message);
  }
}