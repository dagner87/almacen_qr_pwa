/* Acceso a IndexedDB (almacenamiento local) y registro de movimientos. */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      ['racks', 'locations', 'pallets', 'moves', 'settings'].forEach((s) => {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: s === 'settings' ? 'key' : 'id' });
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function all(store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly'),
      r = tx.objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function put(store, obj) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => resolve(obj);
    tx.onerror = () => reject(tx.error);
  });
}

function del(store, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadState() {
  for (const s of ['racks', 'locations', 'pallets', 'moves', 'settings']) state[s] = await all(s);
  state.settings = Object.fromEntries(state.settings.map((x) => [x.key, x.value]));
  renderAll();
}

async function logMove(action, palletId, from, to, details = '', products = []) {
  await put('moves', {
    id: uid('MOV'),
    action,
    palletId,
    from: from || '',
    to: to || '',
    details,
    products,
    at: now(),
  });
  state.moves = await all('moves');
}

function putMany(store, items) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'),
      objectStore = tx.objectStore(store);
    items.forEach((item) => objectStore.put(item));
    tx.oncomplete = () => resolve(items);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar el inventario.'));
  });
}
