/* Pantalla Escanear. */
async function handleCode(code) {
  code = (code || '').trim();
  if (!code) return;
  let scannedPallet = null;
  if (code.startsWith('ALMACEN_PALLET:')) {
    try {
      scannedPallet = JSON.parse(code.slice('ALMACEN_PALLET:'.length));
      if (scannedPallet?.type !== 'pallet' || !scannedPallet.code) throw new Error('invalid payload');
      code = scannedPallet.code;
    } catch (error) {
      toast('No se pudo leer la información del QR.');
      return;
    }
  }
  const location = state.locations.find((item) => item.code.toLowerCase() === code.toLowerCase());
  if (location) {
    const pallets = activePalletsAt(location.id),
      quantity = pallets.reduce((sum, pallet) => sum + palletQuantity(pallet), 0);
    $('scanResult').innerHTML =
      `<div class="panel"><h3>${escapeHtml(location.code)}</h3><p>${pallets.length} pallet(s) · ${quantity} unidad(es)/caja(s)</p><div class="list">${
        pallets
          .map((pallet) => {
            const products = palletProducts(pallet),
              summary = products.length
                ? products.map((item) => `${escapeHtml(item.productCode)} × ${Number(item.quantity)}`).join(' · ')
                : `${escapeHtml(pallet.brand || 'Sin marca')} · ${Number(pallet.boxes || 0)} cajas`;
            return `<div class="item"><div class="item-main"><b>${escapeHtml(pallet.code)} · ${escapeHtml(pallet.description)}</b><div class="item-sub">${summary}</div></div><button class="mini" data-edit-pallet="${pallet.id}">Editar</button></div>`;
          })
          .join('') || '<div class="empty">Esta posición está vacía.</div>'
      }</div><div class="button-row"><button class="primary" id="associatePalletHere">Asociar pallet aquí</button><button class="secondary" id="newAtLocation">＋ Registrar pallet aquí</button><button class="secondary" id="labelLocation">Mostrar QR ubicación</button></div></div>`;
    $('associatePalletHere').onclick = async () => {
      pendingLocationId = location.id;
      $('scanResult').innerHTML =
        `<div class="panel notice"><b>Ubicación seleccionada: ${escapeHtml(location.code)}</b><p>Ahora escanea el QR o código de barras del pallet. Se pedirá confirmación antes de moverlo.</p><button class="secondary" id="cancelAssociation">Cancelar asociación</button></div>`;
      $('cancelAssociation').onclick = async () => {
        pendingLocationId = '';
        await stopScan();
        $('scanResult').innerHTML = '';
        toast('Asociación cancelada.');
      };
      await startScan();
    };
    $('newAtLocation').onclick = () => showPalletDialog(null, location.id);
    $('labelLocation').onclick = () => openQr(location.code, 'Etiqueta de ubicación');
  } else {
    let pallet = state.pallets.find((item) => item.code.toLowerCase() === code.toLowerCase()) || scannedPallet;
    if (pallet && pendingLocationId) {
      const destination = state.locations.find((item) => item.id === pendingLocationId);
      if (!destination) {
        pendingLocationId = '';
        toast('La ubicación seleccionada ya no existe.');
      } else if (confirm(`¿Mover el pallet ${pallet.code} de ${locLabel(pallet.locationId)} a ${destination.code}?`)) {
        const saved = await savePalletLocation(pallet, destination);
        if (saved) {
          pallet = saved;
          pendingLocationId = '';
        }
      }
    }
    if (pallet) {
      const products = palletProducts(pallet),
        rows = products.length
          ? products
              .map(
                (item) =>
                  `<tr><td>${escapeHtml(item.productCode)}</td><td>${escapeHtml(item.description || '')}</td><td>${Number(item.quantity).toLocaleString()}</td></tr>`,
              )
              .join('')
          : `<tr><td colspan="3">${escapeHtml(pallet.brand || 'Sin detalle de productos')} · ${Number(pallet.boxes || 0).toLocaleString()} cajas</td></tr>`,
        associationNotice = pendingLocationId
          ? `<div class="notice">Pendiente: asociar el siguiente pallet a ${escapeHtml(locLabel(pendingLocationId))}. Escanea el pallet cuando estés listo.</div>`
          : '';
      $('scanResult').innerHTML =
        `<div class="panel pallet-scan-card"><p class="eyebrow">PALLET ENCONTRADO</p><h3>${escapeHtml(pallet.code)}</h3><dl class="pallet-scan-details"><div><dt>Ubicación</dt><dd>${escapeHtml(pallet.locationCode || locLabel(pallet.locationId))}</dd></div><div><dt>Estado</dt><dd>${escapeHtml(pallet.status === 'active' ? 'Activo' : pallet.status === 'empty' ? 'Vacío' : 'Baja')}</dd></div><div><dt>Total de unidades</dt><dd>${palletQuantity(pallet).toLocaleString()}</dd></div>${pallet.brand ? `<div><dt>Marca</dt><dd>${escapeHtml(pallet.brand)}</dd></div>` : ''}</dl><div class="table-scroll"><table class="inventory-table"><thead><tr><th>Código</th><th>Descripción</th><th>Cantidad</th></tr></thead><tbody>${rows}</tbody></table></div>${pallet.notes ? `<p><b>Notas:</b> ${escapeHtml(pallet.notes)}</p>` : ''}${associationNotice}<div class="button-row"><button class="primary" id="scanEdit">Editar pallet</button><button class="secondary" id="scanMove">Mover pallet</button><button class="secondary" id="scanPrint">Imprimir QR</button>${pendingLocationId ? '<button class="secondary" id="cancelAssociation">Cancelar asociación</button>' : ''}</div></div>`;
      $('scanEdit').onclick = () => showPalletDialog(pallet);
      $('scanMove').onclick = () => movePallet(pallet.id);
      $('scanPrint').onclick = () => openPalletQr(pallet);
      const cancel = $('cancelAssociation');
      if (cancel)
        cancel.onclick = async () => {
          pendingLocationId = '';
          await stopScan();
          toast('Asociación cancelada.');
          $('scanResult').innerHTML = '';
        };
    } else {
      $('scanResult').innerHTML =
        `<div class="panel warning"><b>Código no encontrado.</b><p>${pendingLocationId ? `No se encontró ese pallet. La ubicación ${escapeHtml(locLabel(pendingLocationId))} sigue seleccionada.` : 'Comprueba el QR o registra la ubicación/pallet antes de escanearlo.'}</p>${pendingLocationId ? '<button class="secondary" id="cancelAssociation">Cancelar asociación</button>' : ''}</div>`;
      const cancel = $('cancelAssociation');
      if (cancel)
        cancel.onclick = async () => {
          pendingLocationId = '';
          await stopScan();
          $('scanResult').innerHTML = '';
          toast('Asociación cancelada.');
        };
    }
  }
}

async function startScan() {
  if (!window.Html5Qrcode) {
    toast('El lector no se cargó. Comprueba la conexión y recarga.');
    return;
  }
  try {
    if (!scanEngine)
      scanEngine = new Html5Qrcode('reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128],
      });
    await scanEngine.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 230, height: 230 } },
      async (text) => {
        await stopScan();
        $('manualCode').value = text;
        await handleCode(text);
      },
      () => {},
    );
    scanRunning = true;
    toast('Cámara activada. Apunta al código.');
  } catch (e) {
    toast('No se pudo abrir la cámara: ' + e.message);
  }
}

async function stopScan() {
  if (scanEngine && scanRunning) {
    try {
      await scanEngine.stop();
      scanEngine.clear();
    } catch (e) {}
    scanRunning = false;
  }
}
