/* Pantalla Ubicaciones. */
function renderLocations() {
  const q = $('locationSearch').value.toLowerCase(),
    level = $('levelFilter').value;
  const list = state.locations
    .filter((l) => (!q || l.code.toLowerCase().includes(q)) && (!level || String(l.level) === level))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  $('locationList').innerHTML = list.length
    ? list
        .map((l) => {
          const ps = activePalletsAt(l.id),
            quantity = ps.reduce((n, p) => n + palletQuantity(p), 0);
          return `<article class="item"><div class="item-main"><div class="item-title">${escapeHtml(l.code)}</div><div class="item-sub">${ps.length} pallet(s) · ${quantity} unidade(s)/caja(s) · ${l.capacity ? 'Capacidad: ' + l.capacity : 'Capacidad no definida'}</div><span class="pill ${ps.length ? 'warn' : ''}">${ps.length ? 'Ocupada' : 'Disponible'}</span></div><div class="item-actions"><button class="mini" data-qr-loc="${l.id}">QR etiqueta</button><button class="mini" data-open-loc="${l.id}">Ver pallets</button></div></article>`;
        })
        .join('')
    : '<div class="empty">No hay ubicaciones. Pulsa “Crear racks” para generar la estructura.</div>';
}

function sortedLocations() {
  return [...state.locations].sort((a, b) =>
    String(a.code).localeCompare(String(b.code), undefined, { numeric: true }),
  );
}

// Un solo campo con autocompletado: el texto se resuelve a una ubicación y su id queda en #palletLocation.
function fillLocationOptions(selected = '') {
  const hidden = $('palletLocation'),
    input = $('palletLocationInput'),
    list = $('palletLocationList');
  if (!hidden || !input || !list) return;
  const currentId = selected || hidden.value,
    current = state.locations.find((l) => l.id === currentId);
  list.innerHTML = sortedLocations()
    .map((l) => `<option value="${escapeHtml(l.code)}"></option>`)
    .join('');
  hidden.value = current ? current.id : '';
  input.value = current ? current.code : selected ? '' : input.value;
  resolveLocationInput();
}

function resolveLocationInput(complete = false) {
  const input = $('palletLocationInput'),
    term = input.value.trim().toLocaleLowerCase(),
    all = sortedLocations();
  let match = term ? all.find((l) => String(l.code).toLocaleLowerCase() === term) : null;
  if (!match && complete && term) {
    const candidates = all.filter((l) => String(l.code).toLocaleLowerCase().includes(term));
    if (candidates.length === 1) match = candidates[0];
  }
  $('palletLocation').value = match ? match.id : '';
  if (match && complete) input.value = match.code;
  input.setCustomValidity(!term || match ? '' : 'Elige una ubicación existente de la lista.');
  return match;
}
