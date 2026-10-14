/* Reglas y cálculos del inventario (ubicaciones, pallets, productos). */
function locLabel(id) {
  return state.locations.find((x) => x.id === id)?.code || 'Sin ubicación';
}

function activePalletsAt(locId) {
  return state.pallets.filter((p) => p.locationId === locId && p.status === 'active');
}

function palletProducts(p) {
  return Array.isArray(p?.products) ? p.products : [];
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
