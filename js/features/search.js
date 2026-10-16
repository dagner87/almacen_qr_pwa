/* Pantalla Buscar producto. */
let lookupTimer = null,
  lookupSeq = 0;

// Consulta siempre la base de datos; usa los datos locales solo si no hay conexi\u00f3n.
function renderProductLookup(immediate) {
  const input = $('productLookupInput'),
    target = $('productLookupResults');
  if (!input || !target) return;
  clearTimeout(lookupTimer);
  const seq = ++lookupSeq;
  if (!input.value.trim()) return paintProductLookup(state.pallets, state.locations);
  if (input.value.trim().length < 3) {
    target.innerHTML = '<p class="muted small">Escribe al menos 3 caracteres para buscar.</p>';
    return;
  }
  target.innerHTML = '<div class="empty">Cargando\u2026</div>';
  lookupTimer = setTimeout(
    async () => {
      let pallets = state.pallets,
        locations = state.locations;
      if (supabaseClient && currentProfile && navigator.onLine) {
        try {
          const [p, l] = await Promise.all([
            fetchAllRows('pallets', (query) => query.eq('status', 'active')),
            fetchAllRows('locations')
          ]);
          if (!p.error && !l.error) {
            pallets = p.data || [];
            locations = l.data || [];
          }
        } catch (error) {
          /* sin conexi\u00f3n: se usan los datos locales */
        }
      }
      if (seq === lookupSeq) paintProductLookup(pallets, locations);
    },
    immediate === true ? 0 : 300
  );
}

function paintProductLookup(pallets, locations) {
  const input = $('productLookupInput'),
    target = $('productLookupResults');
  const query = input.value.trim().toLocaleLowerCase();
  if (!query) {
    target.innerHTML =
      '<p class="muted small">Escribe un c\u00f3digo o una descripci\u00f3n para ver la ubicaci\u00f3n y las cantidades disponibles.</p>';
    return;
  }
  const locLabel = (id) => locations.find((x) => x.id === id)?.code || (id ? `(${id})` : 'Sin ubicaci\u00f3n');
  const matches = [];
  for (const pallet of pallets) {
    if (pallet.status !== 'active') continue;
    for (const item of palletProducts(pallet)) {
      const productCode = String(item.productCode || '').toLocaleLowerCase(),
        description = String(productDescription(item)).toLocaleLowerCase();
      if (productCode.includes(query) || description.includes(query)) matches.push({ pallet, item });
    }
  }
  if (!matches.length) {
    target.innerHTML = '<div class="empty">No hay existencias activas para ese c\u00f3digo o descripci\u00f3n.</div>';
    return;
  }
  const showPallet = currentProfile?.role !== 'operator',
    total = matches.reduce((sum, row) => sum + Number(row.item.quantity || 0), 0);
  target.innerHTML = `<p class="lookup-total">${total.toLocaleString()} unidad(es) en ${matches.length} pallet(s)</p><div class="table-scroll"><table class="inventory-table"><thead><tr><th>C\u00f3digo</th>${showPallet ? '<th>Descripci\u00f3n</th>' : ''}<th>Cantidad</th>${showPallet ? '<th>Pallet</th>' : ''}<th>Ubicaci\u00f3n</th></tr></thead><tbody>${matches.map(({ pallet, item }) => `<tr><td>${escapeHtml(item.productCode)}</td>${showPallet ? `<td>${escapeHtml(productDescription(item))}</td>` : ''}<td>${Number(item.quantity).toLocaleString()}</td>${showPallet ? `<td>${escapeHtml(pallet.code)}</td>` : ''}<td class="location-highlight">${escapeHtml(locLabel(pallet.locationId))}</td></tr>`).join('')}</tbody></table></div>`;
}
