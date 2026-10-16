/* Sincronización con la nube y tiempo real. */
/* Supabase devuelve como máximo 1000 filas por consulta: se pide por páginas. */
async function fetchAllRows(table, build = (query) => query) {
  const rows = [],
    PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(supabaseClient.from(table).select('*'))
      .order(table === 'settings' ? 'key' : 'id')
      .range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { data: rows, error: null };
  }
}
async function reconcileRealtime() {
  try {
    await syncFromCloud();
    renderAll();
  } catch (e) {
    syncMessage('No se pudo actualizar la vista en tiempo real: ' + e.message);
  }
}

async function startRealtime() {
  if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel);
  realtimeReady = false;
  realtimeFirstSubscription = true;
  const channel = supabaseClient
    .channel('almacen-qr-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'racks' }, (payload) =>
      applyRemoteChange('racks', payload),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, (payload) =>
      applyRemoteChange('locations', payload),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pallets' }, (payload) =>
      applyRemoteChange('pallets', payload),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'moves' }, (payload) =>
      applyRemoteChange('moves', payload),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'product_catalog' }, () => {
      refreshCatalog().then(renderAll);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) =>
      applyRemoteChange('profiles', payload),
    );
  realtimeChannel = channel;
  return new Promise((resolve) => {
    let settled = false;
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        realtimeReady = true;
        updateConnectivity();
        if (settled) {
          reconcileRealtime();
          return;
        }
        settled = true;
        resolve(true);
        realtimeFirstSubscription = false;
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        realtimeReady = false;
        updateConnectivity();
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }
    });
  });
}

async function syncToCloud() {
  if (!supabaseClient || !currentProfile) return;
  if (!canWrite(currentProfile.role === 'admin'))
    throw new Error('Solo el administrador puede sincronizar cambios estructurales.');
  if (currentProfile.role === 'admin') {
    for (const store of ['racks', 'locations', 'pallets']) {
      const localRows = await all(store);
      if (!localRows.length) continue;
      const { data, error } = await fetchAllRows(store);
      if (error) throw error;
      const cloudById = new Map((data || []).map((row) => [row.id, row]));
      const changed = localRows.filter((row) => {
        const cloud = cloudById.get(row.id);
        if (!cloud) return true;
        const localAt = new Date(row.updatedAt || row.createdAt || 0).getTime(),
          cloudAt = new Date(cloud.updatedAt || cloud.createdAt || 0).getTime();
        return localAt > cloudAt;
      });
      if (changed.length) {
        const { error: writeError } = await supabaseClient.from(store).upsert(changed);
        if (writeError) throw writeError;
      }
    }
  }
  syncMessage('Sincronización completada: ' + new Date().toLocaleTimeString());
  updateConnectivity();
}

async function applyRemoteChange(store, payload) {
  if (store === 'profiles') {
    const row = payload.new || payload.old;
    const ownProfileChanged = row?.user_id === currentUser?.id;
    if (ownProfileChanged) {
      try {
        currentProfile = await loadProfile(currentUser);
      } catch (error) {
        lockApplication('Tu rol ya no está habilitado: ' + error.message);
        return;
      }
    }
    updateConnectivity();
    if (ownProfileChanged) {
      try {
        await syncFromCloud();
        renderAll();
      } catch (error) {
        syncMessage('No se pudo actualizar el acceso: ' + error.message);
      }
    }
    if (currentProfile?.role === 'admin' && $('admin').classList.contains('active')) renderUserRoles();
    return;
  }
  const row = payload.new || payload.old;
  if (!row) return;
  const id = store === 'settings' ? row.key : row.id;
  if (payload.eventType === 'DELETE') await del(store, id);
  else await put(store, row);
  state[store] = await all(store);
  if (store === 'settings') state.settings = Object.fromEntries(state.settings.map((item) => [item.key, item.value]));
  renderAll();
  updateConnectivity();
}

async function syncFromCloud() {
  if (!supabaseClient || !currentProfile) return;
  const remoteByStore = {};
  for (const store of sharedStores) {
    const { data, error } = await fetchAllRows(store);
    if (error) throw error;
    remoteByStore[store] = data || [];
  }
  const remoteHasInventory = ['racks', 'locations', 'pallets'].some((store) => remoteByStore[store].length > 0);
  for (const store of sharedStores) {
    const remoteRows = remoteByStore[store],
      localRows = await all(store);
    if (currentProfile.role === 'operator' || remoteHasInventory) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      for (const row of remoteRows) await put(store, row);
      continue;
    }
    for (const row of remoteRows) {
      const local = localRows.find((item) => item.id === row.id);
      const cloudAt = new Date(row.updatedAt || row.at || row.createdAt || 0).getTime();
      const localAt = new Date(local?.updatedAt || local?.at || local?.createdAt || 0).getTime();
      if (!local || cloudAt >= localAt) await put(store, row);
    }
  }
  await loadState();
}
