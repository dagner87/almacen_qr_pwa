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

function openQr(code, title, qrValue = code, extraHtml = '', printPagesHtml = '') {
  currentQr = { code, title };
  $('qrTitle').textContent = title;
  const qrContent = $('qrContent'),
    qrMarkup = `<div id="qrImage" class="qr-generating">Generando QR…</div><strong>${escapeHtml(code)}</strong><p class="muted small">${escapeHtml(title)}</p>${extraHtml}`;
  qrContent.classList.toggle('qr-has-return-sheet', Boolean(printPagesHtml));
  qrContent.innerHTML = printPagesHtml
    ? `<section class="qr-main-print-page">${qrMarkup}</section>${printPagesHtml}`
    : qrMarkup;
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
    rows = products
      .map(
        (item) =>
          isReturn
            ? `<tr><td>${escapeHtml(item.productCode)}</td><td>${escapeHtml(item.returnStore || '')}</td></tr>`
            : `<tr><td>${escapeHtml(item.productCode)}</td><td>${escapeHtml(productDescription(item))}</td><td>${Number(item.quantity || 0)}</td></tr>`,
      )
      .join(''),
    detail = `<p class="small qr-screen-only"><b>Ubicación:</b> ${escapeHtml(locLabel(p.locationId))} · <b>Total:</b> ${palletQuantity(p)} ${palletQuantityLabel(p)}</p><p class="qr-print-total">${isReturn ? `${products.length} cajas de retorno` : `${palletQuantity(p)} ${palletQuantityLabel(p)}`}</p>${
      rows && !isReturn
        ? `<table class="rotation-table qr-products qr-screen-only"><thead><tr><th>Código</th><th>Detalle</th><th>Cant.</th></tr></thead><tbody>${rows}</tbody></table>`
        : ''
    }`,
    returnCodeSheet = isReturn
      ? `<section class="qr-return-code-sheet"><header class="qr-return-code-head"><p class="eyebrow">DEVOLUCIONES</p><h2>Lista de códigos</h2><p><b>Pallet:</b> ${escapeHtml(p.code)} · <b>Tienda:</b> ${escapeHtml(returnStoreLabel)} · <b>Cajas:</b> ${products.length}</p></header><div class="qr-return-code-grid">${products
          .map((item, index) => `<article class="qr-return-code-item"><span>${index + 1}</span><code>${escapeHtml(item.productCode || '')}</code><small>${escapeHtml(item.returnStore || 'Tienda sin indicar')}</small></article>`)
          .join('')}</div></section>`
      : '';
  openQr(p.code, 'Etiqueta del pallet', `ALMACEN_PALLET:${JSON.stringify(payload)}`, detail, returnCodeSheet);
}
