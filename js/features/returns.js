/* Consulta de cajas de retorno agrupadas por tienda. */
function returnPalletRows() {
  const rows = [];
  for (const pallet of state.pallets) {
    const byStore = new Map();
    for (const item of palletProducts(pallet)) {
      if (!item.externalCode) continue;
      const store = String(item.returnStore || '').trim() || 'Tienda sin indicar';
      if (!byStore.has(store)) byStore.set(store, []);
      byStore.get(store).push(String(item.productCode || '').trim());
    }
    for (const [store, codes] of byStore) rows.push({ pallet, store, codes });
  }
  return rows;
}

function isInactiveStoreName(name) {
  return state.stores.some(
    (store) => store.active === false && store.name.localeCompare(name, 'es', { sensitivity: 'base' }) === 0,
  );
}

function renderReturns() {
  const target = $('returnsList');
  if (!target) return;
  const allRows = returnPalletRows(),
    activeRows = allRows.filter(({ pallet }) => pallet.status === 'active'),
    stores = [...new Set(allRows.map((row) => row.store))]
      .filter((store) => !isInactiveStoreName(store))
      .sort((a, b) => a.localeCompare(b, 'es')),
    storeFilter = $('returnsStoreFilter'),
    selectedStore = storeFilter.value;

  $('returnsBoxTotal').textContent = activeRows.reduce((total, row) => total + row.codes.length, 0).toLocaleString();
  $('returnsPalletTotal').textContent = new Set(activeRows.map(({ pallet }) => pallet.id)).size.toLocaleString();
  $('returnsStoreTotal').textContent = new Set(activeRows.map(({ store }) => store)).size.toLocaleString();

  storeFilter.innerHTML = '<option value="">Todas las tiendas</option>' + stores
    .map((store) => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`)
    .join('');
  if (stores.includes(selectedStore)) storeFilter.value = selectedStore;

  const query = $('returnsSearch').value.trim().toLocaleLowerCase(),
    status = $('returnsStatusFilter').value,
    filtered = allRows.filter(({ pallet, store, codes }) => {
      const location = pallet.locationId ? locLabel(pallet.locationId) : 'Sin ubicación';
      return (!storeFilter.value || store === storeFilter.value) &&
        (!status || pallet.status === status) &&
        (!query || [store, pallet.code, location, ...codes].join(' ').toLocaleLowerCase().includes(query));
    }),
    groups = new Map();
  for (const row of filtered) {
    if (!groups.has(row.store)) groups.set(row.store, []);
    groups.get(row.store).push(row);
  }

  if (!allRows.length) {
    target.innerHTML = '<div class="empty">Aún no hay pallets con cajas de devolución registradas.</div>';
    return;
  }
  if (!groups.size) {
    target.innerHTML = '<div class="empty">No hay devoluciones que coincidan con los filtros.</div>';
    return;
  }

  target.innerHTML = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([store, rows]) => {
      const activeRows = rows.filter(({ pallet }) => pallet.status === 'active'),
        activeBoxes = activeRows.reduce((sum, row) => sum + row.codes.length, 0),
        activePallets = new Set(activeRows.map(({ pallet }) => pallet.id)).size;
      return `<section class="return-store-card"><header class="return-store-head"><div><p class="eyebrow">TIENDA DE ORIGEN</p><h3>${escapeHtml(store)}</h3></div><span class="return-store-total">${activeBoxes.toLocaleString()} cajas activas · ${activePallets} pallet(s) activos</span></header><div class="return-store-rows">${rows
        .sort((a, b) => (b.pallet.updatedAt || '').localeCompare(a.pallet.updatedAt || ''))
        .map(({ pallet, codes }) => {
          const location = pallet.locationId ? locLabel(pallet.locationId) : 'Sin ubicación',
            statusLabel = pallet.status === 'active' ? 'En almacén' : pallet.status === 'empty' ? 'Vacío' : 'Baja',
            statusClass = pallet.status === 'active' ? 'active' : 'inactive';
          return `<article class="return-pallet-row"><div class="return-pallet-info"><div class="return-pallet-title"><strong>${escapeHtml(pallet.code)}</strong><span class="return-status ${statusClass}">${statusLabel}</span></div><p>${codes.length} caja(s) · ${escapeHtml(location)}</p><div class="return-code-list">${codes.map((code) => `<code>${escapeHtml(code)}</code>`).join('')}</div></div><div class="item-actions"><button type="button" class="mini" data-edit-pallet="${escapeHtml(pallet.id)}" data-write>Editar</button><button type="button" class="mini" data-qr-pallet="${escapeHtml(pallet.id)}">QR</button></div></article>`;
        })
        .join('')}</div></section>`;
    })
    .join('');
  updateConnectivity();
}

function bindReturns() {
  $('returnsSearch').oninput = renderReturns;
  $('returnsStoreFilter').onchange = renderReturns;
  $('returnsStatusFilter').onchange = renderReturns;
  $('newReturnPallet').onclick = () => {
    if (!canWrite()) return;
    showPalletDialog();
    $('externalProductCodes').checked = true;
    setExternalProductMode();
    $('palletStoreId').focus();
  };
}
