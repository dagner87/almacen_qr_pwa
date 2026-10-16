/* Pantalla Pallets. */
function productRowsMarkup(products = []) {
  return products
    .map(
      (item) =>
        `<div class="product-row${item.externalCode ? ' external-return-row' : ''}"><label>Código<input class="product-code" list="catalogCodes" type="text" inputmode="numeric" maxlength="100" value="${escapeHtml(item.productCode || '')}" placeholder="Ej. 19575" autocomplete="off"></label><label>Descripción<input class="product-description" type="text" maxlength="200" value="${escapeHtml(productDescription(item))}" placeholder="Descripción del producto"></label><label>Cantidad<input class="product-quantity" type="number" min="1" step="1" value="${escapeHtml(item.quantity ?? '')}" placeholder="0"></label><button type="button" class="mini remove-product" aria-label="Quitar producto">Quitar</button>${item.externalCode ? `<label class="product-store-label">Tienda de origen<input class="product-store" type="text" maxlength="100" value="${escapeHtml(item.returnStore || '')}" placeholder="Ej. Tienda Centro"></label>` : ''}</div>`,
    )
    .join('');
}

function addProductRow(product = {}) {
  $('palletProductRows').insertAdjacentHTML('beforeend', productRowsMarkup([product]));
  const row = $('palletProductRows').lastElementChild;
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  row.querySelector('.product-code')?.focus({ preventScroll: true });
}

function setExternalProductMode() {
  const isReturn = $('externalProductCodes').checked;
  $('returnEntry').hidden = !isReturn;
  $('standardProductEntry').hidden = isReturn;
  updateReturnBoxCount();
}

function updateReturnBoxCount() {
  const codes = $('palletBulkCodes').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  $('returnBoxCount').textContent = codes.length;
}

function readReturnProducts(old) {
  const lines = $('palletBulkCodes').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    existing = new Map(palletProducts(old).filter((item) => item.externalCode).map((item) => [String(item.productCode || '').trim().toLocaleUpperCase(), item])),
    store = $('returnStoreName').value.trim(),
    seen = new Set(),
    products = [];
  if (!lines.length) return { products, error: 'Pega al menos un código de caja.' };
  if (lines.length > 25) return { products, error: 'Un pallet de retorno admite un máximo de 25 cajas.' };
  for (const [index, code] of lines.entries()) {
    const key = code.toLocaleUpperCase();
    if (code.length > 100 || /[\t,;]/.test(code))
      return { products, error: `El código de la línea ${index + 1} no es válido.` };
    if (seen.has(key)) return { products, error: `El código ${code} está repetido. Cada caja debe tener un código único.` };
    seen.add(key);
    const prior = existing.get(key), returnStore = prior?.returnStore || store;
    if (!returnStore) return { products, error: `Indica la tienda de origen para el código ${code}.` };
    products.push({ productCode: code, description: '', quantity: 1, externalCode: true, returnStore });
  }
  return { products, error: '' };
}
function readPalletProducts() {
  const products = [],
    seen = new Map(),
    rows = [...$('palletProductRows').querySelectorAll('.product-row')];
  for (const [index, row] of rows.entries()) {
    const productCode = row.querySelector('.product-code').value.trim(),
      description = row.querySelector('.product-description').value.trim(),
      returnStore = row.querySelector('.product-store')?.value.trim() || '',
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
    products.push({ productCode, description, quantity: Number(quantityText), ...(row.querySelector('.product-store') ? { externalCode: true, returnStore } : {}) });
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
            ...palletProducts(p).flatMap((item) => [item.productCode, item.returnStore, productDescription(item)]),
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
            returnBoxes = products.filter((item) => item.externalCode).length,
            palletLocation = p.locationId ? escapeHtml(locLabel(p.locationId)) : '<span class="missing-location">Sin ubicación</span>',
            detail = products.length && returnBoxes === products.length
              ? `${returnBoxes} cajas de retorno · ${palletLocation}`
              : products.length
                ? `${products.length} productos · ${palletQuantity(p)} unidades · ${palletLocation}`
              : `${escapeHtml(p.brand || 'Sin marca')} · ${Number(p.boxes || 0)} cajas · ${palletLocation}`;
          return `<article class="item"><div class="item-main"><div class="item-title">${escapeHtml(p.code)} · ${escapeHtml(p.description)}</div><div class="item-sub">${detail}</div><div class="item-sub">Creado: ${escapeHtml(formatDateTime(p.createdAt))} · ${movementCountFor(p.code)} movimiento(s)</div>${p.placed_by_email ? `<div class="item-sub">Ubicado por ${escapeHtml(p.placed_by_email)} · ${escapeHtml(formatDateTime(p.placed_at))}</div>` : ''}${products.length ? `<div class="product-summary">${products.map((item) => `<span>${escapeHtml(item.productCode)} × ${Number(item.quantity)}${item.externalCode ? ` · Retorno · ${escapeHtml(item.returnStore || 'Tienda sin indicar')}` : ''}</span>`).join('')}</div>` : ''}<span class="pill ${p.status === 'active' ? '' : 'warn'}">${p.status === 'active' ? 'Activo' : p.status === 'empty' ? 'Vacío' : 'Baja'}</span></div><div class="item-actions"><button class="mini" data-edit-pallet="${p.id}" data-write>Editar</button><button class="mini" data-qr-pallet="${p.id}">QR</button><button class="mini" data-move-pallet="${p.id}" data-write>Mover</button><button class="mini" data-delete-pallet="${p.id}" data-role="admin" data-write hidden>Eliminar</button></div></article>`;
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
  document.getElementById('externalProductCodes').checked = Boolean(p?.products?.length && p.products.every((item) => item.externalCode));
  document.getElementById('palletBulkCodes').value = '';
  document.getElementById('returnStoreName').value = '';
  fillLocationOptions(p?.locationId || presetLocationId);
  const products = palletProducts(p);
  if (p?.products?.length && p.products.every((item) => item.externalCode)) {
    $('palletBulkCodes').value = products.map((item) => item.productCode).join('\n');
    const stores = [...new Set(products.map((item) => item.returnStore).filter(Boolean))];
    $('returnStoreName').value = stores.length === 1 ? stores[0] : '';
  }
  $('palletProductRows').innerHTML = productRowsMarkup(products.length ? products : [{}]);
  setExternalProductMode();
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
    selectedLocation = resolveLocationInput(true);
  const locationId = selectedLocation?.id || old?.locationId || null;
  if (locationId && !state.locations.some((location) => location.id === locationId)) {
    toast('La ubicación ya no existe. Actualiza el inventario e inténtalo nuevamente.');
    return;
  }
  const isReturnMode = $('externalProductCodes').checked,
    result = isReturnMode ? readReturnProducts(old) : readPalletProducts();
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
  const products = result.products.map((item) => {
      const { externalCode, ...plainItem } = item;
      return externalCode ? { ...plainItem, externalCode: true } : plainItem;
    }),
    isExternal = products.some((item) => item.externalCode),
    mergePlans = new Map(),
    mergeSummary = [];
  if (isExternal && products.some((item) => item.quantity !== 1)) {
    toast('Cada código externo identifica una sola pieza; la cantidad debe ser 1.');
    return;
  }
  if (isExternal && products.some((item) => !item.returnStore)) {
    toast('Indica la tienda de origen para cada código de retorno.');
    return;
  }
  for (const product of products) {
    if (product.externalCode) {
      const duplicate = state.pallets.find((pallet) => pallet.id !== old?.id && palletProducts(pallet).some((item) => item.externalCode && String(item.productCode || '').trim().toLocaleUpperCase() === product.productCode.trim().toLocaleUpperCase()));
      if (duplicate) {
        toast(`El código externo ${product.productCode} ya está registrado en el pallet ${duplicate.code}.`);
        return;
      }
      continue;
    }
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
    description: products.length ? (isExternal ? 'Retorno de tienda' : 'Pallet mixto') : old?.description || 'Pallet vacío',
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
    await saveCatalogFromProducts(products.filter((item) => !item.externalCode));
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
    notifyStockChange();
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
    notifyStockChange();
    toast('Pallet eliminado.');
  } catch (error) {
    toast('No se pudo eliminar el pallet: ' + error.message);
  }
}
