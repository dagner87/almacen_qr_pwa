/* Pantalla Inicio (dashboard). */
function renderDashboard() {
  $('statRacks').textContent = state.racks.length;
  $('statLocations').textContent = state.locations.length;
  $('statPallets').textContent = state.pallets.filter((p) => p.status === 'active').length;
  $('statBoxes').textContent = state.pallets
    .filter((p) => p.status === 'active')
    .reduce((n, p) => n + palletQuantity(p), 0)
    .toLocaleString();
  $('syncBadge').textContent = supabaseClient ? 'Sincronizado' : 'Local';
  renderDashboardPanels();
}

function renderDashboardPanels() {
  const active = state.pallets.filter(isOccupyingPallet),
    usedIds = new Set(active.map((p) => p.locationId).filter(Boolean)),
    total = state.locations.length,
    used = state.locations.filter((l) => usedIds.has(l.id)).length,
    free = Math.max(total - used, 0),
    pct = total ? Math.round((used / total) * 100) : 0;
  const set = (id, v) => {
    const el = $(id);
    if (el) el.textContent = v;
  };
  const hour = new Date().getHours(),
    greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  set(
    'dashGreeting',
    currentProfile?.email ? `${greet}, ${currentProfile.email.split('@')[0]}` : 'Resumen del almacén',
  );
  set('dashDate', new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));
  set('statFree', `${free.toLocaleString()} libres`);
  set('occPct', pct + '%');
  set('occUsed', used.toLocaleString());
  set('occFree', free.toLocaleString());
  const ring = $('occRing');
  if (ring) ring.style.setProperty('--pct', pct);
  const racks = [...new Set([...state.racks.map((r) => r.code), ...state.locations.map(locationRackCode)])].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true }),
  );
  const bars = $('rackBars');
  if (bars)
    bars.innerHTML = racks.length
      ? racks
          .slice(0, 12)
          .map((rack) => {
            const locs = state.locations.filter((l) => locationRackCode(l) === rack),
              u = locs.filter((l) => usedIds.has(l.id)).length,
              p = locs.length ? Math.round((u / locs.length) * 100) : 0;
            return `<div class="rack-bar"><span>${escapeHtml(rack)}</span><div class="bar"><i style="width:${p}%"></i></div><b>${u}/${locs.length}</b></div>`;
          })
          .join('')
      : '<p class="muted small">Aún no hay racks creados.</p>';
  const totals = new Map();
  for (const pallet of active)
    for (const item of palletProducts(pallet)) {
      const key = item.productCode || item.description || '—',
        row = totals.get(key) || { code: item.productCode || '', description: item.description || '', qty: 0 };
      row.qty += Number(item.quantity || 0);
      totals.set(key, row);
    }
  const top = [...totals.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
    max = top[0]?.qty || 1,
    tp = $('topProducts');
  if (tp)
    tp.innerHTML = top.length
      ? top
          .map(
            (r) =>
              `<div class="top-row"><div><b>${escapeHtml(r.code)}</b><small>${escapeHtml(r.description)}</small></div><div class="bar"><i style="width:${Math.round((r.qty / max) * 100)}%"></i></div><b>${r.qty.toLocaleString()}</b></div>`,
          )
          .join('')
      : '<p class="muted small">Aún no hay productos registrados.</p>';
}

function renderRecent() {
  const list = [...state.moves].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 8);
  $('recent').className = 'list' + (list.length ? '' : ' empty');
  $('recent').innerHTML = list.length
    ? list
        .map(
          (m) =>
            `<div class="item"><div class="item-main"><div class="item-title">${escapeHtml(m.action)} · ${escapeHtml(m.palletId || '')}</div><div class="item-sub">${escapeHtml(m.from ? locLabel(m.from) : '')} ${m.to ? '→ ' + escapeHtml(locLabel(m.to)) : ''} ${escapeHtml(m.details || '')}</div><small>${escapeHtml(m.actor_email || m.actorEmail || 'Registro histórico sin usuario')} · ${new Date(m.at).toLocaleString()}</small></div></div>`,
        )
        .join('')
    : 'Todavía no hay movimientos.';
}
