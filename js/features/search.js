/* Pantalla Buscar producto. */
function renderProductLookup() {
  const input = $('productLookupInput'),
    target = $('productLookupResults');
  if (!input || !target) return;
  const query = input.value.trim().toLocaleLowerCase();
  if (!query) {
    target.innerHTML =
      '<p class="muted small">Escribe un c\u00f3digo o una descripci\u00f3n para ver la ubicaci\u00f3n y las cantidades disponibles.</p>';
    return;
  }
  const matches = [];
  for (const pallet of state.pallets) {
    if (pallet.status !== 'active') continue;
    for (const item of palletProducts(pallet)) {
      const productCode = String(item.productCode || '').toLocaleLowerCase(),
        description = String(item.description || '').toLocaleLowerCase();
      if (productCode.includes(query) || description.includes(query)) matches.push({ pallet, item });
    }
  }
  if (!matches.length) {
    target.innerHTML = '<div class="empty">No hay existencias activas para ese c\u00f3digo o descripci\u00f3n.</div>';
    return;
  }
  const showPallet = currentProfile?.role !== 'operator',
    total = matches.reduce((sum, row) => sum + Number(row.item.quantity || 0), 0);
  target.innerHTML = `<p class="lookup-total">${total.toLocaleString()} unidad(es) en ${matches.length} pallet(s)</p><div class="table-scroll"><table class="inventory-table"><thead><tr><th>C\u00f3digo</th><th>Descripci\u00f3n</th><th>Cantidad</th>${showPallet ? '<th>Pallet</th>' : ''}<th>Ubicaci\u00f3n</th></tr></thead><tbody>${matches.map(({ pallet, item }) => `<tr><td>${escapeHtml(item.productCode)}</td><td>${escapeHtml(item.description || '')}</td><td>${Number(item.quantity).toLocaleString()}</td>${showPallet ? `<td>${escapeHtml(pallet.code)}</td>` : ''}<td class="location-highlight">${escapeHtml(locLabel(pallet.locationId))}</td></tr>`).join('')}</tbody></table></div>`;
}
