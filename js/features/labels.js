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
  renderBarcodes();
  $('barcodeDialog').showModal();
}

function renderBarcodes() {
  const rack = $('barcodeRackFilter').value,
    list = state.locations
      .filter((l) => !rack || locationRackCode(l) === rack)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    area = $('barcodePrintArea'),
    printButton = $('printBarcodes');
  if (typeof JsBarcode === 'undefined') {
    area.innerHTML =
      '<div class="empty">No se cargó el generador de códigos de barras. Conéctate a Internet y vuelve a intentarlo.</div>';
    printButton.disabled = true;
    return;
  }
  area.innerHTML = list.length
    ? list
        .map(
          (l) =>
            `<article class="barcode-label"><svg data-barcode="${escapeHtml(l.code)}"></svg><strong>${escapeHtml(l.code)}</strong></article>`,
        )
        .join('')
    : '<div class="empty">No hay ubicaciones en este rack.</div>';
  area
    .querySelectorAll('[data-barcode]')
    .forEach((svg) =>
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
  window.print();
}

function qrRender(container, code) {
  container.innerHTML = '';
  if (typeof QRCode === 'undefined') {
    container.textContent = 'No se cargó el generador QR. Conéctate a Internet y vuelve a intentarlo.';
    return;
  }
  new QRCode(container, {
    text: code,
    width: 190,
    height: 190,
    colorDark: '#102a22',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function openQr(code, title, qrValue = code) {
  currentQr = { code, title };
  $('qrTitle').textContent = title;
  $('qrContent').innerHTML =
    `<div id="qrImage"></div><strong>${escapeHtml(code)}</strong><p class="muted small">${escapeHtml(title)}</p>`;
  qrRender($('qrContent').querySelector('#qrImage'), qrValue);
  $('qrDialog').showModal();
}

function openPalletQr(p) {
  const payload = {
    type: 'pallet',
    code: p.code,
    locationCode: locLabel(p.locationId),
    products: palletProducts(p).map((item) => ({
      productCode: String(item.productCode || ''),
      description: String(item.description || ''),
      quantity: Number(item.quantity || 0),
    })),
  };
  openQr(p.code, 'Etiqueta del pallet', `ALMACEN_PALLET:${JSON.stringify(payload)}`);
}
