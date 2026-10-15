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

function openQr(code, title, qrValue = code, extraHtml = '') {
  currentQr = { code, title };
  $('qrTitle').textContent = title;
  $('qrContent').innerHTML =
    `<div id="qrImage"></div><strong>${escapeHtml(code)}</strong><p class="muted small">${escapeHtml(title)}</p>${extraHtml}`;
  // Más contenido = más módulos: se agranda el QR para que siga siendo legible.
  const bytes = new TextEncoder().encode(qrValue).length,
    size = bytes > 700 ? 320 : bytes > 350 ? 260 : 190;
  qrRender($('qrContent').querySelector('#qrImage'), qrValue, size);
  $('qrDialog').showModal();
}

function openPalletQr(p) {
  const products = palletProducts(p),
    payload = {
      type: 'pallet',
      code: p.code,
      locationCode: locLabel(p.locationId),
      products: products.map((item) => ({
        productCode: String(item.productCode || ''),
        quantity: Number(item.quantity || 0),
      })),
    },
    rows = products
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.productCode)}</td><td>${escapeHtml(productDescription(item))}</td><td>${Number(item.quantity || 0)}</td></tr>`,
      )
      .join(''),
    detail = `<p class="small"><b>Ubicación:</b> ${escapeHtml(locLabel(p.locationId))} · <b>Total:</b> ${palletQuantity(p)} ${palletQuantityLabel(p)}</p>${
      rows
        ? `<table class="rotation-table qr-products"><thead><tr><th>Código</th><th>Detalle</th><th>Cant.</th></tr></thead><tbody>${rows}</tbody></table>`
        : ''
    }`;
  openQr(p.code, 'Etiqueta del pallet', `ALMACEN_PALLET:${JSON.stringify(payload)}`, detail);
}
