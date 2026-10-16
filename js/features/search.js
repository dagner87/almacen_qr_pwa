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
    target.innerHTML = '<p class="muted small">Escribe un código o una descripción para ver la ubicación y las cantidades disponibles.</p>';
    return;
  }
  const locLabel = (id) => locations.find((x) => x.id === id)?.code || (id ? `(${id})` : 'Sin ubicación');
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
    target.innerHTML = '<div class="empty">No hay existencias activas para ese código o descripción.</div>';
    return;
  }
  const operator = currentProfile?.role === 'operator',
    canAdjust = operator && canAccessModule('pallets'),
    total = matches.reduce((sum, row) => sum + Number(row.item.quantity || 0), 0);
  target.innerHTML = `<p class="lookup-total">${total.toLocaleString()} unidad(es) en ${new Set(matches.map((row) => locLabel(row.pallet.locationId))).size} ubicación(es)</p><div class="operator-stock-results">${matches.map(({ pallet, item }) => `<article class="panel operator-stock-result"><div><strong>${escapeHtml(item.productCode)}</strong><div class="item-sub">${escapeHtml(productDescription(item))}</div><div class="item-sub">Ubicación: <b>${escapeHtml(locLabel(pallet.locationId))}</b> · Pallet ${escapeHtml(pallet.code)}</div></div><div class="operator-stock-controls"><span class="small muted">Actual: ${Number(item.quantity).toLocaleString()}</span>${canAdjust ? `<div class="operator-stock-edit"><button type="button" class="mini secondary" data-stock-delta="-1" data-stock-pallet="${escapeHtml(pallet.id)}" data-stock-code="${escapeHtml(item.productCode)}" aria-label="Restar una unidad">-</button><input type="number" min="0" step="1" inputmode="numeric" value="${Number(item.quantity)}" data-stock-value="${escapeHtml(pallet.id)}|${escapeHtml(item.productCode)}" aria-label="Nueva cantidad para ${escapeHtml(item.productCode)}"><button type="button" class="mini secondary" data-stock-delta="1" data-stock-pallet="${escapeHtml(pallet.id)}" data-stock-code="${escapeHtml(item.productCode)}" aria-label="Sumar una unidad">+</button><button type="button" class="primary" data-stock-save="${escapeHtml(pallet.id)}" data-stock-code="${escapeHtml(item.productCode)}">Guardar</button></div>` : ''}</div></article>`).join('')}</div>`;
}

async function updateOperatorProductQuantity(palletId, productCode, quantity) {
  if (!canWrite()) return;
  const pallet = state.pallets.find((item) => item.id === palletId);
  if (!pallet || pallet.status !== 'active') {
    toast('El pallet ya no está activo. Actualiza la búsqueda.');
    return;
  }
  const key = String(productCode || '').trim().toLocaleUpperCase(),
    oldItem = palletProducts(pallet).find((item) => String(item.productCode || '').trim().toLocaleUpperCase() === key),
    next = Number(quantity);
  if (!oldItem || !Number.isSafeInteger(next) || next < 0) {
    toast('Escribe una cantidad entera igual o mayor que cero.');
    return;
  }
  if (next === Number(oldItem.quantity)) return;
  const products = palletProducts(pallet)
      .map((item) => item === oldItem ? { ...item, quantity: next } : item)
      .filter((item) => Number(item.quantity) > 0),
    total = products.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    updated = { ...pallet, products, boxes: total, status: total > 0 ? 'active' : 'empty', description: total > 0 ? pallet.description : 'Pallet vacío', updatedAt: now() };
  try {
    let saved = updated;
    if (!AUTH_DISABLED) {
      const { data, error } = await supabaseClient.from('pallets').update(updated).eq('id', pallet.id).select().single();
      if (error) throw error;
      saved = data;
    }
    await put('pallets', saved);
    if (AUTH_DISABLED) {
      const action = next > Number(oldItem.quantity) ? 'Entrada de stock' : 'Salida de stock';
      await logMove(action, pallet.code, pallet.locationId, pallet.locationId, `${productCode}: ${oldItem.quantity} a ${next}`, [{ ...oldItem, quantity: next }]);
    }
    await loadState();
    notifyStockChange();
    renderProductLookup(true);
    toast(`${productCode}: cantidad actualizada a ${next}.`);
  } catch (error) {
    toast('No se pudo actualizar la cantidad: ' + error.message);
  }
}