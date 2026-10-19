/* Catálogo compartido de tiendas propietarias de mercancía. */
function storeById(id) {
  return state.stores.find((store) => store.id === id) || null;
}

function storeNameFor(id, fallback = 'Sin tienda asignada') {
  return storeById(id)?.name || fallback;
}

function fillPalletStoreOptions(selectedId = $('palletStoreId')?.value || '') {
  const select = $('palletStoreId');
  if (!select) return;
  const selected = storeById(selectedId),
    options = [...state.stores]
      .filter((store) => store.active !== false || store.id === selectedId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  select.innerHTML = `<option value="">Selecciona una tienda</option>${options
    .map((store) => `<option value="${escapeHtml(store.id)}">${escapeHtml(store.name)}${store.active === false ? ' (inactiva)' : ''}</option>`)
    .join('')}`;
  select.value = selected ? selected.id : '';
  select.disabled = options.length === 0;
  const hint = $('palletStoreHint');
  if (hint)
    hint.textContent = options.length
      ? 'La mercancía del pallet quedará asignada a esta tienda.'
      : 'Primero registra una tienda en Administrar almacén.';
}

function renderStores() {
  const target = $('storeList');
  if (!target) return;
  const stores = [...state.stores].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
    unassigned = state.pallets.filter((pallet) => !pallet.storeId && pallet.status !== 'retired').length,
    notice = $('storeAssignmentNotice');
  if (notice) {
    notice.hidden = !unassigned;
    notice.textContent = unassigned
      ? `${unassigned} pallet(s) activo(s) no tienen tienda propietaria. Edítalos desde Pallets para asignarles una.`
      : '';
  }
  target.innerHTML = stores.length
    ? stores
        .map((store) => {
          const palletCount = state.pallets.filter((pallet) => pallet.storeId === store.id).length;
          return `<article class="item"><div class="item-main"><div class="item-title">${escapeHtml(store.name)}</div><div class="item-sub">${store.active === false ? 'Inactiva' : 'Activa'} · ${palletCount} pallet(s) asignado(s)</div></div><div class="item-actions"><button type="button" class="mini" data-edit-store="${escapeHtml(store.id)}" data-write>Editar</button><button type="button" class="mini" data-toggle-store-active="${escapeHtml(store.id)}" data-write>${store.active === false ? 'Activar' : 'Desactivar'}</button></div></article>`;
        })
        .join('')
    : '<div class="empty">Aún no hay tiendas registradas.</div>';
  fillPalletStoreOptions();
  updateConnectivity();
}

function resetStoreForm() {
  $('storeForm')?.reset();
  $('storeId').value = '';
  $('saveStore').textContent = 'Agregar tienda';
  $('cancelStoreEdit').hidden = true;
}

function editStore(id) {
  const store = storeById(id);
  if (!store) return;
  $('storeId').value = store.id;
  $('storeName').value = store.name;
  $('saveStore').textContent = 'Guardar cambios';
  $('cancelStoreEdit').hidden = false;
  $('storeName').focus();
}

async function saveStore(event) {
  event.preventDefault();
  if (!canWrite(true)) return;
  const id = $('storeId').value,
    name = $('storeName').value.trim(),
    duplicate = state.stores.find(
      (store) => store.id !== id && store.name.localeCompare(name, 'es', { sensitivity: 'base' }) === 0,
    );
  if (!name || name.length > 100) {
    toast('Escribe un nombre de tienda de hasta 100 caracteres.');
    return;
  }
  if (duplicate) {
    toast('Ya existe una tienda con ese nombre.');
    return;
  }
  const old = storeById(id),
    row = {
      id: old?.id || uid('STO'),
      name,
      active: old?.active !== false,
      createdAt: old?.createdAt || now(),
      updatedAt: now(),
    };
  try {
    let saved = row;
    if (!AUTH_DISABLED) {
      const { data, error } = await supabaseClient.from('stores').upsert(row).select().single();
      if (error) throw error;
      saved = data;
    }
    await put('stores', saved);
    state.stores = await all('stores');
    resetStoreForm();
    renderStores();
    renderPallets();
    toast(old ? 'Tienda actualizada.' : 'Tienda agregada.');
  } catch (error) {
    toast('No se pudo guardar la tienda: ' + error.message);
  }
}

async function toggleStoreActive(id) {
  if (!canWrite(true)) return;
  const old = storeById(id);
  if (!old) return;
  const row = { ...old, active: old.active === false, updatedAt: now() };
  try {
    let saved = row;
    if (!AUTH_DISABLED) {
      const { data, error } = await supabaseClient.from('stores').upsert(row).select().single();
      if (error) throw error;
      saved = data;
    }
    await put('stores', saved);
    state.stores = await all('stores');
    renderStores();
    renderPallets();
    toast(saved.active ? 'Tienda activada.' : 'Tienda desactivada.');
  } catch (error) {
    toast('No se pudo actualizar la tienda: ' + error.message);
  }
}

function bindStores() {
  const form = $('storeForm');
  if (!form) return;
  form.onsubmit = saveStore;
  $('cancelStoreEdit').onclick = resetStoreForm;
  $('storeList').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-store]'),
      toggle = event.target.closest('[data-toggle-store-active]');
    if (edit) editStore(edit.dataset.editStore);
    if (toggle) toggleStoreActive(toggle.dataset.toggleStoreActive);
  });
  renderStores();
}
