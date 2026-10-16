/* Reglas y cálculos del inventario (ubicaciones, pallets, productos). */
function locLabel(id) {
  return state.locations.find((x) => x.id === id)?.code || (id ? `(${id})` : 'Sin ubicación');
}

// Un pallet sin unidades no ocupa la posición.
function isOccupyingPallet(p) {
  return p.status === 'active' && palletQuantity(p) > 0;
}

function activePalletsAt(locId) {
  return state.pallets.filter((p) => p.locationId === locId && isOccupyingPallet(p));
}

function palletProducts(p) {
  return Array.isArray(p?.products) ? p.products : [];
}

const ROTATION_ACTIONS = ['Alta de pallet', 'Movimiento', 'Actualización de stock', 'Entrada de stock', 'Salida de stock', 'Ajuste de stock'];

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'sin fecha';
}

function movementCountFor(palletCode) {
  return state.moves.filter((move) => move.palletId === palletCode && move.action === 'Movimiento').length;
}

// Rotación por producto: usa el detalle guardado en cada movimiento; si es un
// registro antiguo sin detalle, recurre al contenido actual del pallet.
function productRotation(sinceMs = 0) {
  const palletsByCode = new Map(state.pallets.map((pallet) => [pallet.code, pallet]));
  const stats = new Map();
  for (const move of state.moves) {
    if (!ROTATION_ACTIONS.includes(move.action)) continue;
    const at = new Date(move.at).getTime();
    if (sinceMs && !(at >= sinceMs)) continue;
    const items =
      Array.isArray(move.products) && move.products.length
        ? move.products
        : palletProducts(palletsByCode.get(move.palletId));
    for (const item of items) {
      const code = String(item.productCode || '').trim();
      if (!code) continue;
      const key = code.toLocaleUpperCase();
      const row = stats.get(key) || {
        code,
        description: productDescription(item),
        altas: 0,
        movimientos: 0,
        ajustes: 0,
        units: 0,
        last: 0,
      };
      if (move.action === 'Alta de pallet') row.altas++;
      else if (move.action === 'Movimiento') row.movimientos++;
      else row.ajustes++;
      row.units += Number(item.quantity || 0);
      row.last = Math.max(row.last, at || 0);
      if (!row.description) row.description = productDescription(item);
      stats.set(key, row);
    }
  }
  return [...stats.values()].sort(
    (a, b) => b.movimientos + b.ajustes - (a.movimientos + a.ajustes) || b.altas - a.altas || b.last - a.last,
  );
}

function palletQuantity(p) {
  const products = palletProducts(p);
  return products.length ? products.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : Number(p.boxes || 0);
}

function palletQuantityLabel(p) {
  return palletProducts(p).length ? 'unidades' : 'cajas';
}

function findActiveProductMatches(productCode, excludePalletId = '') {
  const key = String(productCode || '')
    .trim()
    .toLocaleUpperCase();
  return state.pallets
    .filter((pallet) => pallet.status === 'active' && pallet.id !== excludePalletId)
    .flatMap((pallet) =>
      palletProducts(pallet)
        .filter(
          (item) =>
            String(item.productCode || '')
              .trim()
              .toLocaleUpperCase() === key,
        )
        .map((item) => ({ pallet, item })),
    );
}

function locationRackCode(location) {
  return location.rackId || location.code.split('-')[0];
}
