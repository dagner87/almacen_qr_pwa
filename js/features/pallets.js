/* Pantalla Pallets. */
function productRowsMarkup(products = []) {
  return products
    .map(
      (item) =>
        `<div class="product-row"><label>Código<input class="product-code" type="text" inputmode="numeric" maxlength="100" value="${escapeHtml(item.productCode || '')}" placeholder="Ej. 19575" autocomplete="off"></label><label>Descripción<input class="product-description" type="text" maxlength="200" value="${escapeHtml(item.description || '')}" placeholder="Descripción del producto"></label><label>Cantidad<input class="product-quantity" type="number" min="1" step="1" value="${escapeHtml(item.quantity ?? '')}" placeholder="0"></label><button type="button" class="mini remove-product" aria-label="Quitar producto">Quitar</button></div>`,
    )
    .join('');
}

function addProductRow(product = {}) {
  $('palletProductRows').insertAdjacentHTML('beforeend', productRowsMarkup([product]));
  const row = $('palletProductRows').lastElementChild;
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  row.querySelector('.product-code')?.focus({ preventScroll: true });
}

function readPalletProducts() {
  const products = [],
    seen = new Map(),
    rows = [...$('palletProductRows').querySelectorAll('.product-row')];
  for (const [index, row] of rows.entries()) {
    const productCode = row.querySelector('.product-code').value.trim(),
      description = row.querySelector('.product-description').value.trim(),
      quantityText = row.querySelector('.product-quantity').value.trim();
    if (!productCode && !description && !quantityText) continue;
    if (
      !productCode ||
      !quantityText ||
      productCode.length > 100 ||
      description.length > 200 ||
      !/^[0-9]+$/.test(quantityText) ||
      !Number.isSafeInteger(Number(quantityText)) ||
      Number(quantityText) < 1
    )
      return {
        products,
        error: `Completa el c\u00f3digo y una cantidad entera mayor que cero en la fila ${index + 1}.`,
      };
    const key = productCode.toLocaleUpperCase();
    if (seen.has(key)) {
      const firstIndex = seen.get(key);
      return {
        products,
        error: `El c\u00f3digo ${productCode} ya est\u00e1 en este pallet (filas ${firstIndex + 1} y ${index + 1}). Ajusta la cantidad de la primera fila y quita la fila repetida.`,
        duplicate: { firstIndex, duplicateIndex: index },
      };
    }
    seen.set(key, index);
    products.push({ productCode, description, quantity: Number(quantityText) });
  }
  return { products, error: '' };
}

function renderPallets() {
  const q = $('palletSearch').value.toLowerCase(),
    f = $('palletStatusFilter').value;
  const list = state.pallets
    .filter(
      (p) =>
        (!q ||
          [
            p.code,
            p.description,
            p.brand,
            p.notes,
            ...palletProducts(p).flatMap((item) => [item.productCode, item.description]),
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)) &&
        (!f || p.status === f),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $('palletList').innerHTML = list.length
    ? list
        .map((p) => {
          const products = palletProducts(p),
            detail = products.length
              ? `${products.length} productos · ${palletQuantity(p)} unidades · ${escapeHtml(locLabel(p.locationId))}`
              : `${escapeHtml(p.brand || 'Sin marca')} · ${Number(p.boxes || 0)} cajas · ${escapeHtml(locLabel(p.locationId))}`;
          return `<article class="item"><div class="item-main"><div class="item-title">${escapeHtml(p.code)} · ${escapeHtml(p.description)}</div><div class="item-sub">${detail}</div><div class="item-sub">Creado: ${escapeHtml(formatDateTime(p.createdAt))} · ${movementCountFor(p.code)} movimiento(s)</div>${p.placed_by_email ? `<div class="item-sub">Ubicado por ${escapeHtml(p.placed_by_email)} · ${escapeHtml(formatDateTime(p.placed_at))}</div>` : ''}${products.length ? `<div class="product-summary">${products.map((item) => `<span>${escapeHtml(item.productCode)} × ${Number(item.quantity)}</span>`).join('')}</div>` : ''}<span class="pill ${p.status === 'active' ? '' : 'warn'}">${p.status === 'active' ? 'Activo' : p.status === 'empty' ? 'Vacío' : 'Baja'}</span></div><div class="item-actions"><button class="mini" data-edit-pallet="${p.id}" data-write>Editar</button><button class="mini" data-qr-pallet="${p.id}">QR</button><button class="mini" data-move-pallet="${p.id}" data-write>Mover</button><button class="mini" data-delete-pallet="${p.id}" data-role="admin" data-write hidden>Eliminar</button></div></article>`;
        })
        .join('')
    : '<div class="empty">No hay pallets registrados.</div>';
  updateConnectivity();
}

function showPalletDialog(p = null, presetLocationId = '') {
  $('palletForm').reset();
  $('palletId').value = p?.id || '';
  $('palletDialogTitle').textContent = p ? 'Editar pallet' : 'Nuevo pallet';
  $('palletNotes').value = p?.notes || '';
  fillLocationOptions(p?.locationId || presetLocationId);
  const products = palletProducts(p);
  $('palletProductRows').innerHTML = productRowsMarkup(products.length ? products : [{}]);
  $('palletQrPreview').innerHTML = p
    ? `<button type="button" class="mini" id="previewExistingQr">Mostrar QR: ${escapeHtml(p.code)}</button>`
    : '';
  $('palletDialog').showModal();
  if (p)
    setTimeout(() => {
      const b = $('previewExistingQr');
      if (b) b.onclick = () => openPalletQr(p);
    }, 0);
}

async function savePallet(event) {
  event.preventDefault();
  if (!canWrite()) return;
  const id = $('palletId').value,
    old = state.pallets.find((item) => item.id === id),
    locationId = resolveLocationInput(true)?.id || '';
  if (!locationId) {
    toast('Selecciona una ubicación.');
    return;
  }
  if (!state.locations.some((location) => location.id === locationId)) {
    toast('La ubicación ya no existe. Actualiza el inventario e inténtalo nuevamente.');
    return;
  }
  const result = readPalletProducts();
  if (result.error) {
    toast(result.error);
    if (result.duplicate) {
      const firstRow = [...$('palletProductRows').querySelectorAll('.product-row')][result.duplicate.firstIndex],
        quantityInput = firstRow?.querySelector('.product-quantity');
      if (quantityInput) {
        quantityInput.focus();
        quantityInput.select();
      }
    }
    return;
  }
  const products = result.products,
    mergePlans = new Map(),
    mergeSummary = [];
  for (const product of products) {
    const matches = findActiveProductMatches(product.productCode, old?.id);
    if (!matches.length) continue;
    const groups = new Map();
    for (const match of matches) {
      let group = groups.get(match.pallet.id);
      if (!group) {
        group = { pallet: match.pallet, items: [], quantity: 0 };
        groups.set(match.pallet.id, group);
      }
      group.items.push(match.item);
      group.quantity += Number(match.item.quantity || 0);
    }
    const locations = [...groups.values()]
      .map(
        (group) => `${group.pallet.code}: ${group.quantity.toLocaleString()} en ${locLabel(group.pallet.locationId)}`,
      )
      .join('\n');
    const unify = confirm(
      `El c\u00f3digo ${product.productCode} ya existe en otros pallets:\n${locations}\n\nAceptar: trasladar esas cantidades al pallet actual y quitarlas de los pallets indicados.\nCancelar: mantener las existencias en sus ubicaciones separadas.`,
    );
    if (!unify) continue;
    const transferQuantity = [...groups.values()].reduce((sum, group) => sum + group.quantity, 0),
      combinedQuantity = product.quantity + transferQuantity;
    if (!Number.isSafeInteger(combinedQuantity)) {
      toast(`La cantidad unificada del c\u00f3digo ${product.productCode} excede el l\u00edmite permitido.`);
      return;
    }
    product.quantity = combinedQuantity;
    if (!product.description)
      product.description = matches.find((match) => match.item.description)?.item.description || '';
    mergeSummary.push({ productCode: product.productCode, quantity: transferQuantity });
    for (const group of groups.values()) {
      const plan = mergePlans.get(group.pallet.id) || { pallet: group.pallet, codes: new Map() };
      plan.codes.set(product.productCode.trim().toLocaleUpperCase(), group.quantity);
      mergePlans.set(group.pallet.id, plan);
    }
  }
  const quantity = products.reduce((sum, item) => sum + item.quantity, 0);
  if (!Number.isSafeInteger(quantity)) {
    toast('La suma de cantidades es demasiado grande.');
    return;
  }
  const maxPalletNum = state.pallets.reduce(
      (max, item) => Math.max(max, Number((item.code || '').match(/(\d+)$/)?.[1] || 0)),
      0,
    ),
    code = old?.code || 'PLT-' + String(maxPalletNum + 1).padStart(6, '0'),
    boxes = products.length ? quantity : Number(old?.boxes || 0);
  const pallet = {
    id: old?.id || uid('PAL'),
    code,
    locationId,
    description: products.length ? 'Pallet mixto' : old?.description || 'Pallet vacío',
    brand: old?.brand || '',
    products,
    boxes,
    notes: $('palletNotes').value.trim(),
    status: boxes === 0 ? 'empty' : 'active',
    createdAt: old?.createdAt || now(),
    updatedAt: now(),
  };
  const sourceUpdates = [...mergePlans.values()].map((plan) => {
    const remainingProducts = palletProducts(plan.pallet).filter(
        (item) =>
          !plan.codes.has(
            String(item.productCode || '')
              .trim()
              .toLocaleUpperCase(),
          ),
      ),
      remainingQuantity = remainingProducts.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return {
      ...plan.pallet,
      products: remainingProducts,
      boxes: remainingQuantity,
      status: remainingQuantity > 0 ? 'active' : 'empty',
      description: remainingQuantity > 0 ? plan.pallet.description : 'Pallet vacío',
      updatedAt: now(),
    };
  });
  try {
    let savedRows = [pallet, ...sourceUpdates];
    if (!AUTH_DISABLED) {
      const { data, error } = await supabaseClient.from('pallets').upsert(savedRows).select();
      if (error) throw error;
      savedRows = data || savedRows;
    }
    await putMany('pallets', savedRows);
    const savedPallet = savedRows.find((item) => item.id === pallet.id) || pallet;
    if (AUTH_DISABLED) {
      const action = !old ? 'Alta de pallet' : old.locationId !== locationId ? 'Movimiento' : 'Actualización de stock';
      await logMove(
        action,
        pallet.code,
        old?.locationId || '',
        locationId,
        `${quantity} unidades · ${products.length} productos`,
        products,
      );
      for (const plan of mergePlans.values()) {
        const details = [...plan.codes.entries()]
          .map(([productCode, moved]) => `${productCode}: ${moved} unidades`)
          .join(', ');
        await logMove('Consolidación de producto', plan.pallet.code, plan.pallet.locationId, locationId, details);
      }
    }
    await loadState();
    $('palletDialog').close();
    toast(
      mergeSummary.length
        ? `Pallet guardado. Se unificaron ${mergeSummary.map((item) => `${item.productCode} (+${item.quantity})`).join(', ')}.`
        : AUTH_DISABLED
          ? 'Pallet guardado en este dispositivo.'
          : 'Pallet guardado.',
    );
    if (!old) openPalletQr(savedPallet);
  } catch (error) {
    toast('No se pudo guardar el pallet: ' + error.message);
  }
}

async function savePalletLocation(pallet, destination) {
  if (!canWrite()) return null;
  if (pallet.locationId === destination.id) {
    toast(`El pallet ${pallet.code} ya está en ${destination.code}.`);
    return pallet;
  }
  const updated = { ...pallet, locationId: destination.id, updatedAt: now() };
  try {
    let saved = updated;
    if (!AUTH_DISABLED) {
      const { data, error } = await supabaseClient
        .from('pallets')
        .update(updated)
        .eq('id', pallet.id)
        .select()
        .single();
      if (error) throw error;
      saved = data;
    }
    await put('pallets', saved);
    if (AUTH_DISABLED)
      await logMove(
        'Movimiento',
        pallet.code,
        pallet.locationId,
        destination.id,
        `${palletQuantity(pallet)} ${palletQuantityLabel(pallet)}`,
        palletProducts(pallet),
      );
    await loadState();
    toast(AUTH_DISABLED ? 'Ubicación actualizada en este dispositivo.' : 'Ubicación actualizada.');
    return saved;
  } catch (error) {
    toast('No se pudo mover el pallet: ' + error.message);
    return null;
  }
}

async function movePallet(id) {
  if (!canWrite()) return;
  const pallet = state.pallets.find((item) => item.id === id);
  if (!pallet) return;
  const options = state.locations
      .map((location) => `${location.code} (${activePalletsAt(location.id).length} pallet(s))`)
      .join('\n'),
    code = prompt('Escribe el código de destino exacto:\n' + options, locLabel(pallet.locationId));
  if (!code) return;
  const destination = state.locations.find((location) => location.code.toLowerCase() === code.trim().toLowerCase());
  if (!destination) {
    toast('No se encontró ese código de ubicación.');
    return;
  }
  await savePalletLocation(pallet, destination);
}

async function deletePallet(id) {
  if (!canWrite(true)) return;
  const pallet = state.pallets.find((item) => item.id === id);
  if (
    !pallet ||
    !confirm(
      AUTH_DISABLED
        ? `¿Eliminar el pallet ${pallet.code}? Esta acción no se puede deshacer.`
        : `¿Eliminar el pallet ${pallet.code}? Esta acción quedará registrada en el historial.`,
    )
  )
    return;
  try {
    if (!AUTH_DISABLED) {
      const { data, error } = await supabaseClient.from('pallets').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length)
        throw new Error('Supabase no eliminó el registro. Verifica que tu usuario tenga rol de administrador.');
    }
    if (AUTH_DISABLED)
      await logMove('Baja de pallet', pallet.code, pallet.locationId, '', 'Eliminado desde la administración');
    await del('pallets', id);
    await loadState();
    toast('Pallet eliminado.');
  } catch (error) {
    toast('No se pudo eliminar el pallet: ' + error.message);
  }
}
