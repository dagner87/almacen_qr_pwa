/* Pantalla Ubicaciones. */
function renderLocations() {
  const q = $('locationSearch').value.trim(),
    level = $('levelFilter').value,
    rack = currentProfile?.role === 'operator' ? '' : $('rackFilter').value,
    status = $('statusFilter').value;
  const operatorView = currentProfile?.role === 'operator';
  $('addRackBtn').hidden = operatorView;
  const rackSelect = $('rackFilter');
  rackSelect.hidden = operatorView;
  rackSelect.style.display = operatorView ? 'none' : '';
  const racks = [...new Set(state.locations.map(locationParts).map((p) => p.rack))].sort((a, b) => a - b);
  if (rackSelect.options.length !== racks.length + 1)
    rackSelect.innerHTML =
      '<option value="">Todos los racks</option>' +
      racks.map((r) => `<option value="${r}"${String(r) === rack ? ' selected' : ''}>Rack ${String(r).padStart(2, '0')}</option>`).join('');
  const occupied = new Set(state.pallets.filter(isOccupyingPallet).map((p) => p.locationId));
  const freeCount = state.locations.filter((l) => !occupied.has(l.id)).length;
  const matcher = locationMatcher(q);
  const all = state.locations
    .filter((l) => {
      const parts = locationParts(l);
      return (
        matcher(l, parts) &&
        (!level || String(parts.level) === level) &&
        (!rack || String(parts.rack) === rack) &&
        (!status || (status === 'free') === !occupied.has(l.id))
      );
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const LIMIT = 150,
    list = all.slice(0, LIMIT);
  $('locationSummary').textContent =
    `${freeCount} disponibles · ${state.locations.length - freeCount} ocupadas · ${state.locations.length} en total · Mostrando ${list.length} de ${all.length}` +
    (all.length > LIMIT ? ' (usa los filtros para acotar)' : '');
  $('locationList').innerHTML = list.length
    ? list
        .map((l) => {
          const ps = activePalletsAt(l.id),
            quantity = ps.reduce((n, p) => n + palletQuantity(p), 0);
          return `<article class="item"><div class="item-main"><div class="item-title">${escapeHtml(l.code)}</div><div class="item-sub">${ps.length} pallet(s) · ${quantity} unidade(s)/caja(s) · ${l.capacity ? 'Capacidad: ' + l.capacity : 'Capacidad no definida'}</div><span class="pill ${ps.length ? 'warn' : ''}">${ps.length ? 'Ocupada' : 'Disponible'}</span></div><div class="item-actions"><button class="mini" data-qr-loc="${l.id}">QR etiqueta</button><button class="mini" data-open-loc="${l.id}">Ver pallets</button><button class="mini" data-add-pallet-loc="${l.id}">Agregar pallet</button></div></article>`;
        })
        .join('')
    : `<div class="empty">${state.locations.length ? 'Ninguna ubicación coincide con los filtros.' : 'No hay ubicaciones. Pulsa “Crear racks” para generar la estructura.'}</div>`;
}

// Rack, nivel y posición salen del código (R01-N02-P03) y, si no encaja, de los campos guardados.
function locationParts(l) {
  const m = /^R(\d+)-N(\d+)-P(\d+)$/i.exec(String(l.code || ''));
  return m
    ? { rack: Number(m[1]), level: Number(m[2]), pos: Number(m[3]) }
    : { rack: Number(String(l.rackId || '').replace(/\D/g, '')) || 0, level: Number(l.level) || 0, pos: Number(l.position) || 0 };
}

// "r1" = rack 1, "r1 n2" = rack 1 nivel 2, "R01-N02-P03" exacto; cualquier otro texto busca dentro del código.
function locationMatcher(q) {
  const text = q.toLowerCase();
  if (!text) return () => true;
  const tokens = [...text.matchAll(/([rnp])\s*0*(\d+)/g)];
  const clean = text.replace(/[rnp]\s*0*\d+/g, '').replace(/[\s\-_,.]/g, '');
  if (tokens.length && !clean) {
    const want = { r: null, n: null, p: null };
    for (const [, key, num] of tokens) want[key] = Number(num);
    return (l, parts) =>
      (want.r === null || parts.rack === want.r) && (want.n === null || parts.level === want.n) && (want.p === null || parts.pos === want.p);
  }
  return (l) => l.code.toLowerCase().includes(text);
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
