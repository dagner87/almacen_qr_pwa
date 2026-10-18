/* Códigos QR y de barras (etiquetas). */
function openBarcodeDialog() {
  if (!state.locations.length) {
    toast('Crea la estructura de racks antes de imprimir etiquetas.');
    return;
  }
  const racks = [...new Set(state.locations.map(locationRackCode))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  $('barcodeRackFilter').innerHTML =
    '<option value="">Todos los racks</option>' +
    racks.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  $('barcodeSearch').value = '';
  renderBarcodes();
  $('barcodeDialog').showModal();
}

function barcodeList() {
  const rack = $('barcodeRackFilter').value,
    matcher = locationMatcher($('barcodeSearch').value.trim());
  return state.locations
    .filter((l) => (!rack || locationRackCode(l) === rack) && matcher(l, locationParts(l)))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

function paintBarcodes(area, list) {
  area.innerHTML = list
    .map(
      (l) =>
        `<article class="barcode-label"><svg data-barcode="${escapeHtml(l.code)}"></svg><strong>${escapeHtml(l.code)}</strong></article>`,
    )
    .join('');
  area.querySelectorAll('[data-barcode]').forEach((svg) =>
    JsBarcode(svg, svg.dataset.barcode, {
      format: 'CODE128',
      displayValue: false,
      width: 1.4,
      height: 52,
      margin: 0,
      lineColor: '#111',
      background: '#fff',
    }),
  );
}

const BARCODE_PREVIEW_LIMIT = 120;

function renderBarcodes() {
  const list = barcodeList(),
    area = $('barcodePrintArea'),
    printButton = $('printBarcodes');
  if (typeof JsBarcode === 'undefined') {
    area.innerHTML =
      '<div class="empty">No se cargó el generador de códigos de barras. Conéctate a Internet y vuelve a intentarlo.</div>';
    printButton.disabled = true;
    return;
  }
  if (list.length) paintBarcodes(area, list.slice(0, BARCODE_PREVIEW_LIMIT));
  else area.innerHTML = '<div class="empty">Ninguna ubicación coincide con la búsqueda.</div>';
  $('barcodeCount').textContent = list.length
    ? `${list.length} etiqueta(s)${list.length > BARCODE_PREVIEW_LIMIT ? ` · vista previa de las primeras ${BARCODE_PREVIEW_LIMIT}; se imprimen todas` : ''}`
    : '';
  printButton.disabled = !list.length;
}

function printBarcodes() {
  if (!state.locations.length) {
    toast('Crea la estructura de racks antes de imprimir etiquetas.');
    return;
  }
  if (typeof JsBarcode === 'undefined') {
    toast('No se cargó el generador de códigos de barras.');
    return;
  }
  const list = barcodeList();
  if (!list.length) {
    toast('No hay etiquetas para imprimir.');
    return;
  }
  // Se imprime una hoja propia fuera del diálogo: los diálogos modales se recortan al imprimir.
  let sheet = $('barcodeSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'barcodeSheet';
    sheet.className = 'barcode-grid';
    document.body.appendChild(sheet);
  }
  paintBarcodes(sheet, list);
  document.body.classList.add('printing-barcodes');
  const done = () => {
    document.body.classList.remove('printing-barcodes');
    sheet.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

function qrRender(container, code, size = 190) {
  container.innerHTML = '';
  if (typeof QRCode === 'undefined') {
    container.textContent = 'No se cargó el generador QR. Conéctate a Internet y vuelve a intentarlo.';
    return;
  }
  new QRCode(container, {
    text: code,
    width: size,
    height: size,
    colorDark: '#102a22',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.L,
  });
}

function openQr(code, title, qrValue = code, extraHtml = '', printPagesHtml = '', codeListHtml = '') {
  currentQr = { code, title };
  $('qrTitle').textContent = title;
  const qrContent = $('qrContent'),
    qrMarkup = `<div id="qrImage" class="qr-generating">Generando QR…</div><strong>${escapeHtml(code)}</strong><p class="muted small">${escapeHtml(title)}</p>${extraHtml}`;
  qrContent.classList.toggle('qr-has-code-sheet', Boolean(printPagesHtml));
  qrContent.innerHTML = printPagesHtml
    ? `<section class="qr-main-print-page">${qrMarkup}</section>${codeListHtml ? `<section id="qrCodeListPanel" class="qr-code-list-panel" hidden>${codeListHtml}</section>` : ''}${printPagesHtml}`
    : `${qrMarkup}${codeListHtml ? `<section id="qrCodeListPanel" class="qr-code-list-panel" hidden>${codeListHtml}</section>` : ''}`;
  const listButton = $('showQrCodeList');
  listButton.hidden = !codeListHtml;
  listButton.setAttribute('aria-expanded', 'false');
  listButton.textContent = 'Mostrar lista de códigos';
  listButton.onclick = () => {
    const panel = $('qrCodeListPanel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    listButton.setAttribute('aria-expanded', String(!panel.hidden));
    listButton.textContent = panel.hidden ? 'Mostrar lista de códigos' : 'Ocultar lista de códigos';
  };
  $('printQr').textContent = printPagesHtml ? 'Imprimir QR + lista (2 páginas)' : 'Imprimir etiqueta';
  const bytes = new TextEncoder().encode(qrValue).length,
    size = bytes > 700 ? 320 : bytes > 350 ? 260 : 190;
  $('qrDialog').showModal();
  requestAnimationFrame(() => {
    const container = $('qrContent').querySelector('#qrImage');
    if (!container) return;
    try {
      qrRender(container, qrValue, size);
      container.classList.remove('qr-generating');
    } catch (error) {
      container.textContent = 'No se pudo generar el QR. Vuelve a intentarlo.';
      toast('No se pudo generar el código QR.');
    }
  });
}

function openPalletQr(p) {
  const products = palletProducts(p),
    isReturn = products.length > 0 && products.every((item) => item.externalCode),
    returnStores = [...new Set(products.map((item) => String(item.returnStore || '').trim()).filter(Boolean))],
    returnStoreLabel = returnStores.length === 1 ? returnStores[0] : returnStores.length ? 'Varias tiendas' : 'Tienda sin indicar',
    payload = {
      type: 'pallet',
      code: p.code,
      locationCode: locLabel(p.locationId),
      ...(isReturn ? { returnCodes: products.map((item) => String(item.productCode || '')) } : {}),
    },
    detail = `<p class="small qr-screen-only"><b>Ubicación:</b> ${escapeHtml(locLabel(p.locationId))} · <b>Total:</b> ${palletQuantity(p)} ${palletQuantityLabel(p)}</p><p class="qr-print-total">${isReturn ? `${products.length} cajas de retorno` : `${palletQuantity(p)} ${palletQuantityLabel(p)}`}</p>`,
    codeGrid = products.length
      ? `<div class="qr-code-grid${products.length > 1 ? ' two-columns' : ''}">${products
          .map((item, index) => `<article class="qr-code-item"><span>${index + 1}</span><code>${escapeHtml(item.productCode || '')}</code><small>${escapeHtml(item.externalCode ? item.returnStore || 'Tienda sin indicar' : productDescription(item) || 'Producto')}</small><b>${item.externalCode ? '1 caja' : `Cantidad: ${Number(item.quantity || 0).toLocaleString()}`}</b></article>`)
          .join('')}</div>`
      : '',
    codeListSummary = isReturn
      ? `<p><b>Pallet:</b> ${escapeHtml(p.code)} · <b>Tienda:</b> ${escapeHtml(returnStoreLabel)} · <b>Cajas:</b> ${products.length}</p>`
      : `<p><b>Pallet:</b> ${escapeHtml(p.code)} · <b>Códigos:</b> ${products.length} · <b>Unidades:</b> ${palletQuantity(p).toLocaleString()}</p>`,
    codeListHtml = products.length ? `<h3>Lista de códigos</h3>${codeListSummary}${codeGrid}` : '',
    printCodeSheet = products.length
      ? `<section class="qr-code-sheet"><header class="qr-code-sheet-head"><p class="eyebrow">${isReturn ? 'DEVOLUCIONES' : 'INVENTARIO'}</p><h2>Lista de códigos</h2>${codeListSummary}</header>${codeGrid}</section>`
      : '';
  openQr(p.code, 'Etiqueta del pallet', `ALMACEN_PALLET:${JSON.stringify(payload)}`, detail, printCodeSheet, codeListHtml);
}
