/* Arranque de la aplicación. Se carga al final. */
$('printBarcodesBtn').onclick = openBarcodeDialog;
$('barcodeRackFilter').onchange = renderBarcodes;
$('printBarcodes').onclick = printBarcodes;
$('addPalletProduct').onclick = () => addProductRow();
$('palletLocationSearch').oninput = () => fillLocationOptions();
$('palletProductRows').addEventListener('change', (event) => {
  const input = event.target;
  if (!input.matches('.product-code')) return;
  const code = input.value.trim();
  if (!code) return;
  const row = input.closest('.product-row'),
    rows = [...$('palletProductRows').querySelectorAll('.product-row')],
    key = code.toLocaleUpperCase(),
    duplicate = rows.find(
      (item) => item !== row && item.querySelector('.product-code').value.trim().toLocaleUpperCase() === key,
    );
  if (duplicate) {
    const duplicateRow = rows.indexOf(duplicate) + 1;
    toast(
      `El c\u00f3digo ${code} ya est\u00e1 en este pallet, en la fila ${duplicateRow}. Edita la cantidad existente y elimina la fila repetida.`,
    );
    return;
  }
  const matches = findActiveProductMatches(code, $('palletId').value);
  if (matches.length) {
    const groups = new Map();
    for (const match of matches) {
      const group = groups.get(match.pallet.id) || { pallet: match.pallet, quantity: 0 };
      group.quantity += Number(match.item.quantity || 0);
      groups.set(match.pallet.id, group);
    }
    const places = [...groups.values()]
      .map(
        (group) => `${group.pallet.code}: ${group.quantity.toLocaleString()} en ${locLabel(group.pallet.locationId)}`,
      )
      .join(' · ');
    toast(`El c\u00f3digo ${code} ya existe: ${places}. Al guardar elige unificar o mantener separado.`);
  }
});
$('palletProductRows').addEventListener('click', (event) => {
  const button = event.target.closest('.remove-product');
  if (button) button.closest('.product-row').remove();
});

async function init() {
  db = await openDb();
  await loadState();
  if (AUTH_DISABLED) {
    currentUser = { id: 'local-user', email: 'Modo local' };
    currentProfile = { user_id: 'local-user', email: 'Modo local', role: 'admin' };
    realtimeReady = true;
    $('authGate').hidden = true;
    $('appContent').hidden = false;
    syncMessage('Modo local temporal. Los cambios se guardan en este dispositivo.');
    renderAll();
    updateConnectivity();
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  document
    .querySelectorAll('[data-view]')
    .forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  document
    .querySelectorAll('[data-goto]')
    .forEach((button) => button.addEventListener('click', () => showView(button.dataset.goto)));
  $('addRackBtn').onclick = () => $('rackDialog').showModal();
  $('adminAddRackBtn').onclick = () => $('rackDialog').showModal();
  $('createRacks').onclick = async (event) => {
    event.preventDefault();
    if (!canWrite(true)) return;
    const start = Number($('rackStart').value),
      count = Number($('rackCount').value),
      positions = Number($('positionsPerLevel').value);
    $('rackDialog').close();
    await createRackStructure(start, count, positions);
  };
  $('addPalletBtn').onclick = () => showPalletDialog();
  $('palletForm').onsubmit = savePallet;
  $('addPositionsForm').onsubmit = async (event) => {
    event.preventDefault();
    await addRackPositions(
      $('positionRack').value,
      Number($('positionLevel').value),
      Number($('positionsToAdd').value),
    );
  };
  $('positionRack').onchange = renderAdminTools;
  $('loginForm').onsubmit = signIn;
  $('forgotPasswordForm').onsubmit = sendPasswordRecovery;
  $('updatePasswordForm').onsubmit = updatePassword;
  $('forgotPasswordBtn').onclick = () => {
    if (!$('loginEmail').value.trim()) {
      $('loginEmail').focus();
      authMessage('Escribe primero el correo de tu cuenta.');
      return;
    }
    $('loginForm').hidden = true;
    $('forgotPasswordForm').hidden = false;
    authMessage('Confirma el correo de la cuenta y solicita el enlace.');
  };
  $('backToLoginBtn').onclick = () => showLogin('Inicia sesión para acceder al almacén.');
  $('signOutBtn').onclick = signOut;
  $('refreshSync').onclick = async () => {
    if (!canWrite()) return;
    try {
      await syncFromCloud();
      if (currentProfile.role === 'admin') await syncToCloud();
      syncMessage('Sincronización completada: ' + new Date().toLocaleTimeString());
    } catch (error) {
      syncMessage('No se pudo sincronizar: ' + error.message);
    }
  };
  $('locationSearch').oninput = renderLocations;
  $('levelFilter').onchange = renderLocations;
  $('palletSearch').oninput = renderPallets;
  $('palletStatusFilter').onchange = renderPallets;
  $('productLookupInput').oninput = renderProductLookup;
  $('productLookupForm').onsubmit = (event) => {
    event.preventDefault();
    renderProductLookup();
  };
  $('palletSearchForm').onsubmit = (event) => {
    event.preventDefault();
    renderPallets();
  };
  $('startScan').onclick = startScan;
  $('stopScan').onclick = stopScan;
  $('manualScanForm').onsubmit = async (event) => {
    event.preventDefault();
    await handleCode($('manualCode').value);
  };
  $('exportData').onclick = () =>
    currentProfile?.role === 'admin' ? exportBackup() : toast('Solo un administrador puede exportar respaldos.');
  $('exportCsv').onclick = exportInventoryCsv;
  $('importFile').onchange = async (event) => {
    try {
      if (event.target.files[0]) {
        if (!canWrite(true)) return;
        await importBackup(event.target.files[0]);
      }
    } catch (error) {
      toast('Error al importar: ' + error.message);
    }
    event.target.value = '';
  };
  $('printQr').onclick = () => window.print();
  $('printPalletQr').onclick = () => {
    if (!canWrite()) return;
    const pallet = state.pallets.find((item) => item.id === $('palletId').value);
    if (pallet) openPalletQr(pallet);
    else
      $('palletQrPreview').innerHTML =
        '<p class="small muted">Guarda primero el pallet para generar su identificador definitivo y QR.</p>';
  };
  document.body.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.close) {
      $(button.dataset.close).close();
      return;
    }
    if (button.dataset.qrLoc) {
      const location = state.locations.find((item) => item.id === button.dataset.qrLoc);
      if (location) openQr(location.code, 'Etiqueta de ubicación');
    }
    if (button.dataset.qrPallet) {
      const pallet = state.pallets.find((item) => item.id === button.dataset.qrPallet);
      if (pallet) openPalletQr(pallet);
    }
    if (button.dataset.editPallet) {
      const pallet = state.pallets.find((item) => item.id === button.dataset.editPallet);
      if (pallet) showPalletDialog(pallet);
    }
    if (button.dataset.movePallet) await movePallet(button.dataset.movePallet);
    if (button.dataset.deletePallet) await deletePallet(button.dataset.deletePallet);
    if (button.dataset.deletePosition) await deleteStructure('position', '', 0, button.dataset.deletePosition);
    if (button.dataset.deleteLevel)
      await deleteStructure('level', button.dataset.deleteLevel, Number(button.dataset.level));
    if (button.dataset.deleteRack) await deleteStructure('rack', button.dataset.deleteRack, 0);
    if (button.dataset.restoreLevel) await restoreRackLevel(button.dataset.restoreLevel, Number(button.dataset.level));
    if (button.dataset.saveUserPermissions) await saveUserPermissions(button.dataset.saveUserPermissions);
    if (button.dataset.openLoc) {
      const location = state.locations.find((item) => item.id === button.dataset.openLoc);
      if (location) {
        showView('scan');
        $('manualCode').value = location.code;
        await handleCode(location.code);
      }
    }
  });
  $('deleteSelectedStructure').onclick = deleteSelectedStructure;
  document.body.addEventListener('change', async (event) => {
    const checkbox = event.target;
    if (checkbox.matches('[data-select-rack]'))
      checkbox
        .closest('.admin-rack')
        .querySelectorAll('[data-select-level],[data-select-position]')
        .forEach((child) => {
          child.checked = checkbox.checked;
        });
    if (checkbox.matches('[data-select-level]'))
      checkbox
        .closest('.admin-level')
        .querySelectorAll('[data-select-position]')
        .forEach((child) => {
          child.checked = checkbox.checked;
        });
    if (checkbox.matches('[data-select-rack],[data-select-level],[data-select-position]'))
      updateStructureSelectionCount();
    const select = event.target.closest('[data-user-role]');
    if (select) await setUserRole(select.dataset.userRole, select.value);
  });
  $('rackForm').onsubmit = (event) => event.preventDefault();
  window.addEventListener('offline', () => {
    realtimeReady = false;
    updateConnectivity();
    syncMessage('Sin conexión. El inventario sincronizado está disponible en solo consulta.');
  });
  window.addEventListener('online', async () => {
    if (!currentUser || !supabaseClient) return;
    try {
      await startRealtime();
      if (realtimeReady) {
        await syncFromCloud();
        renderAll();
        syncMessage('Conexión restablecida. Inventario actualizado.');
      }
    } catch (error) {
      syncMessage('No se pudo restablecer la sincronización: ' + error.message);
    }
  });
  if (!AUTH_DISABLED) {
    try {
      await configureSupabase();
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (location.hash.includes('type=recovery') && data.session?.user) showPasswordUpdate(data.session.user);
      else if (data.session?.user) await activateSession(data.session.user);
      else lockApplication('Inicia sesión para acceder al inventario.');
    } catch (error) {
      lockApplication('No se pudo conectar con Supabase: ' + error.message);
    }
  }
  updateConnectivity();
}

init().catch((error) => {
  console.error(error);
  toast('Error inicializando la aplicación: ' + error.message);
});
