/* Pantalla Inventario: cuadrícula editable de existencias (solo administrador). */
const inventoryPending = new Map();
const STOCK_ACTIONS = ['Entrada de stock', 'Salida de stock', 'Ajuste de stock', 'Actualización de stock'];

function inventoryKey(pallet, item) {
  return `${pallet.id}|${String(item.productCode || '').trim().toLocaleUpperCase()}`;
}

function inventoryRows() {
  const rows = [];
  for (const pallet of state.pallets) {
    if (pallet.status !== 'active') continue;
    for (const item of palletProducts(pallet))
      rows.push({ pallet, item, key: inventoryKey(pallet, item), loc: locLabel(pallet.locationId) });
  }
  const collator = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
  return rows.sort((a, b) => collator(a.loc, b.loc) || collator(a.item.productCode, b.item.productCode));
}

function visibleInventoryRows() {
  const query = ($('inventorySearch')?.value || '').trim().toLocaleLowerCase();
  return inventoryRows().filter(
    (row) =>
      !query ||
      [row.item.productCode, row.item.description, row.pallet.code, row.loc].some((value) =>
        String(value || '')
          .toLocaleLowerCase()
          .includes(query),
      ),
  );
}

function renderInventory() {
  const target = $('inventoryGrid');
  if (!target) return;
  const rows = visibleInventoryRows();
  if (!rows.length) {
    target.innerHTML = '<div class="empty">No hay existencias que coincidan con el filtro.</div>';
    updateInventorySummary();
    renderStockMoves();
    return;
  }
  target.innerHTML = `<table class="inventory-grid"><thead><tr><th class="c-loc">Ubicaci\u00f3n</th><th class="c-pallet">Pallet</th><th class="c-code">C\u00f3digo</th><th class="c-desc">Descripci\u00f3n</th><th class="num c-stock">Stock</th><th class="num in">+ Entrada</th><th class="num out">\u2212 Salida</th><th class="num">Nuevo stock</th></tr></thead><tbody>${rows
    .map(({ pallet, item, key, loc }) => {
      const current = Number(item.quantity || 0),
        pending = inventoryPending.get(key),
        entry = pending?.in || '',
        exit = pending?.out || '',
        next = current + Number(entry || 0) - Number(exit || 0);
      return `<tr data-key="${escapeHtml(key)}" data-current="${current}" data-pallet="${escapeHtml(pallet.id)}" data-code="${escapeHtml(String(item.productCode || ''))}"><td class="c-loc">${escapeHtml(loc)}</td><td class="c-pallet">${escapeHtml(pallet.code)}</td><td class="c-code"><strong>${escapeHtml(item.productCode)}</strong></td><td class="desc c-desc">${escapeHtml(item.description || '')}</td><td class="num c-stock">${current.toLocaleString()}</td><td class="cell"><input type="number" min="0" step="1" inputmode="numeric" data-f="in" value="${entry}" aria-label="Entrada"></td><td class="cell"><input type="number" min="0" step="1" inputmode="numeric" data-f="out" value="${exit}" aria-label="Salida"></td><td class="cell"><input type="number" min="0" step="1" inputmode="numeric" data-f="new" value="${next}" aria-label="Nuevo stock"></td></tr>`;
    })
    .join('')}</tbody></table>`;
  target.querySelectorAll('tr[data-key]').forEach(markInventoryRow);
  updateInventorySummary();
  renderStockMoves();
}

function inventoryRowValues(tr) {
  const read = (field) => tr.querySelector(`[data-f="${field}"]`);
  const entry = Number(read('in').value || 0),
    exit = Number(read('out').value || 0),
    current = Number(tr.dataset.current),
    next = current + entry - exit;
  const valid =
    Number.isSafeInteger(entry) && Number.isSafeInteger(exit) && entry >= 0 && exit >= 0 && next >= 0;
  return { entry, exit, current, next, valid };
}

function markInventoryRow(tr) {
  const { entry, exit, valid } = inventoryRowValues(tr);
  tr.classList.toggle('dirty', entry > 0 || exit > 0);
  tr.classList.toggle('invalid', !valid);
}

function onInventoryInput(event) {
  const input = event.target,
    tr = input.closest('tr[data-key]');
  if (!tr || !input.dataset.f) return;
  const entryInput = tr.querySelector('[data-f="in"]'),
    exitInput = tr.querySelector('[data-f="out"]'),
    newInput = tr.querySelector('[data-f="new"]'),
    current = Number(tr.dataset.current);
  if (input.dataset.f === 'new') {
    if (input.value.trim() === '') {
      entryInput.value = '';
      exitInput.value = '';
    } else {
      const diff = Number(input.value) - current;
      entryInput.value = diff > 0 ? diff : '';
      exitInput.value = diff < 0 ? -diff : '';
    }
  } else {
    newInput.value = current + Number(entryInput.value || 0) - Number(exitInput.value || 0);
  }
  const { entry, exit } = inventoryRowValues(tr);
  if (entry || exit)
    inventoryPending.set(tr.dataset.key, { palletId: tr.dataset.pallet, code: tr.dataset.code, in: entry, out: exit });
  else inventoryPending.delete(tr.dataset.key);
  markInventoryRow(tr);
  updateInventorySummary();
}

function onInventoryKeydown(event) {
  const input = event.target;
  if (!input.dataset?.f || !['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
  const inputs = [...$('inventoryGrid').querySelectorAll(`input[data-f="${input.dataset.f}"]`)],
    index = inputs.indexOf(input),
    next = inputs[index + (event.key === 'ArrowUp' ? -1 : 1)];
  event.preventDefault();
  if (next) {
    next.focus();
    next.select();
  }
}

function updateInventorySummary() {
  const summary = $('inventorySummary'),
    saveButton = $('inventorySave'),
    discardButton = $('inventoryDiscard');
  if (!summary) return;
  const changes = [...inventoryPending.values()];
  const totalIn = changes.reduce((sum, change) => sum + change.in, 0),
    totalOut = changes.reduce((sum, change) => sum + change.out, 0),
    invalid = !!$('inventoryGrid').querySelector('tr.invalid');
  summary.textContent = changes.length
    ? `${changes.length} cambio(s) sin guardar \u00b7 Entradas: ${totalIn.toLocaleString()} \u00b7 Salidas: ${totalOut.toLocaleString()}${invalid ? ' \u00b7 Hay valores inv\u00e1lidos' : ''}`
    : `${visibleInventoryRows().length.toLocaleString()} l\u00ednea(s) de producto`;
  saveButton.disabled = !changes.length || invalid;
  discardButton.disabled = !changes.length;
}

function renderStockMoves() {
  const target = $('inventoryMoves');
  if (!target) return;
  const list = state.moves
    .filter((move) => STOCK_ACTIONS.includes(move.action))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    .slice(0, 15);
  target.innerHTML = list.length
    ? `<table class="rotation-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Pallet</th><th>Detalle</th><th>Usuario</th></tr></thead><tbody>${list
        .map(
          (move) =>
            `<tr><td>${escapeHtml(formatDateTime(move.at))}</td><td>${escapeHtml(move.action)}</td><td>${escapeHtml(move.palletId || '')}</td><td>${escapeHtml(move.details || '')}</td><td>${escapeHtml(move.actor_email || move.actorEmail || '')}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<div class="empty">A\u00fan no hay entradas ni salidas registradas.</div>';
}

function describeStockChange(lines) {
  return lines
    .map(({ code, from, to }) => `${code}: ${to - from > 0 ? '+' : ''}${to - from} (${from} \u2192 ${to})`)
    .join(', ');
}

async function saveInventoryChanges() {
  if (!canWrite(true)) return;
  const changes = [...inventoryPending.values()].filter((change) => change.in || change.out);
  if (!changes.length) return;
  const byPallet = new Map();
  for (const change of changes) {
    const list = byPallet.get(change.palletId) || [];
    list.push(change);
    byPallet.set(change.palletId, list);
  }
  const updates = [];
  let zeroed = 0;
  for (const [palletId, list] of byPallet) {
    const pallet = state.pallets.find((item) => item.id === palletId);
    if (!pallet) {
      toast('Un pallet cambi\u00f3 mientras editabas. Revisa el inventario e int\u00e9ntalo de nuevo.');
      return;
    }
    const lines = [];
    const products = [];
    for (const item of palletProducts(pallet)) {
      const code = String(item.productCode || '').trim().toLocaleUpperCase(),
        change = list.find((entry) => entry.code.trim().toLocaleUpperCase() === code);
      if (!change) {
        products.push(item);
        continue;
      }
      const from = Number(item.quantity || 0),
        to = from + change.in - change.out;
      if (!Number.isSafeInteger(to) || to < 0) {
        toast(`El stock de ${item.productCode} en ${pallet.code} no puede quedar negativo.`);
        return;
      }
      lines.push({ code: item.productCode, from, to });
      if (to === 0) zeroed++;
      else products.push({ ...item, quantity: to });
    }
    const total = products.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    updates.push({
      pallet,
      lines,
      row: {
        ...pallet,
        products,
        boxes: total,
        status: total > 0 ? 'active' : 'empty',
        description: total > 0 ? pallet.description : 'Pallet vac\u00edo',
        updatedAt: now(),
      },
    });
  }
  if (zeroed && !confirm(`${zeroed} l\u00ednea(s) quedar\u00e1n en 0 y se quitar\u00e1n de su pallet. \u00bfContinuar?`)) return;
  try {
    let rows = updates.map((update) => update.row);
    if (!AUTH_DISABLED) {
      const { data, error } = await supabaseClient.from('pallets').upsert(rows).select();
      if (error) throw error;
      if ((data?.length || 0) !== rows.length)
        throw new Error('la base de datos no aceptó los cambios. Verifica que tu usuario sea administrador y vuelve a intentarlo.');
      rows = data;
    }
    await putMany('pallets', rows);
    if (AUTH_DISABLED)
      for (const { pallet, lines, row } of updates) {
        const gained = lines.some((line) => line.to > line.from),
          lost = lines.some((line) => line.to < line.from),
          action = gained && lost ? 'Ajuste de stock' : gained ? 'Entrada de stock' : 'Salida de stock';
        await logMove(action, pallet.code, pallet.locationId, pallet.locationId, describeStockChange(lines), row.products);
      }
    inventoryPending.clear();
    await loadState();
    if (!AUTH_DISABLED) syncFromCloud().catch(() => {});
    notifyStockChange();
    toast(AUTH_DISABLED ? 'Inventario guardado en este dispositivo.' : 'Inventario actualizado.');
  } catch (error) {
    toast('No se pudo guardar el inventario: ' + error.message);
  }
}

function exportInventoryCsv() {
  const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [['Ubicacion', 'Pallet', 'Codigo', 'Descripcion', 'Stock'].map(quote).join(',')];
  for (const { pallet, item, loc } of visibleInventoryRows())
    lines.push([loc, pallet.code, item.productCode, item.description || '', Number(item.quantity || 0)].map(quote).join(','));
  const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `inventario-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const INVENTORY_COLUMNS = [
  ['loc', 'Ubicación'],
  ['pallet', 'Pallet'],
  ['code', 'Código'],
  ['desc', 'Descripción'],
  ['stock', 'Stock'],
];

function hiddenInventoryColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem('inventoryHiddenCols'));
    if (Array.isArray(saved)) return saved;
  } catch (error) {
    /* sin preferencia guardada */
  }
  return ['desc'];
}

function applyInventoryColumns() {
  const hidden = hiddenInventoryColumns(),
    wrap = $('inventoryGrid');
  for (const [key] of INVENTORY_COLUMNS) wrap.classList.toggle(`hide-${key}`, hidden.includes(key));
  const menu = $('inventoryColumnsMenu');
  if (menu)
    menu.innerHTML = INVENTORY_COLUMNS.map(
      ([key, label]) =>
        `<label class="check-row"><input type="checkbox" data-col="${key}" ${hidden.includes(key) ? '' : 'checked'}> ${label}</label>`,
    ).join('');
}

function bindInventoryGrid() {
  const grid = $('inventoryGrid');
  applyInventoryColumns();
  $('inventoryColumnsMenu').addEventListener('change', (event) => {
    const key = event.target.dataset.col;
    if (!key) return;
    const hidden = new Set(hiddenInventoryColumns());
    if (event.target.checked) hidden.delete(key);
    else hidden.add(key);
    localStorage.setItem('inventoryHiddenCols', JSON.stringify([...hidden]));
    applyInventoryColumns();
  });
  grid.addEventListener('input', onInventoryInput);
  grid.addEventListener('keydown', onInventoryKeydown);
  grid.addEventListener('focusin', (event) => event.target.select?.());
  $('inventorySearch').oninput = renderInventory;
  $('inventorySave').onclick = saveInventoryChanges;
  $('inventoryDiscard').onclick = () => {
    inventoryPending.clear();
    renderInventory();
  };
  $('inventoryExport').onclick = exportInventoryCsv;
}
