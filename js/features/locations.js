/* Pantalla Ubicaciones. */
function renderLocations() {
  const q = $('locationSearch').value.toLowerCase(),
    level = $('levelFilter').value;
  const list = state.locations
    .filter((l) => (!q || l.code.toLowerCase().includes(q)) && (!level || String(l.level) === level))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  $('locationList').innerHTML = list.length
    ? list
        .map((l) => {
          const ps = activePalletsAt(l.id),
            quantity = ps.reduce((n, p) => n + palletQuantity(p), 0);
          return `<article class="item"><div class="item-main"><div class="item-title">${escapeHtml(l.code)}</div><div class="item-sub">${ps.length} pallet(s) · ${quantity} unidade(s)/caja(s) · ${l.capacity ? 'Capacidad: ' + l.capacity : 'Capacidad no definida'}</div><span class="pill ${ps.length ? 'warn' : ''}">${ps.length ? 'Ocupada' : 'Disponible'}</span></div><div class="item-actions"><button class="mini" data-qr-loc="${l.id}">QR etiqueta</button><button class="mini" data-open-loc="${l.id}">Ver pallets</button></div></article>`;
        })
        .join('')
    : '<div class="empty">No hay ubicaciones. Pulsa “Crear racks” para generar la estructura.</div>';
}

function fillLocationOptions(selected = '') {
  const sel = $('palletLocation');
  if (!sel) return;
  const current = selected || sel.value,
    term = ($('palletLocationSearch')?.value || '').trim().toLocaleLowerCase(),
    list = [...state.locations]
      .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))
      .filter((l) => !term || String(l.code).toLocaleLowerCase().includes(term) || l.id === current);
  sel.innerHTML =
    `<option value="">${list.length ? 'Selecciona ubicación…' : 'Sin resultados'}</option>` +
    list
      .map((l) => `<option value="${l.id}" ${l.id === current ? 'selected' : ''}>${escapeHtml(l.code)}</option>`)
      .join('');
}
