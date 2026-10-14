/* Pantalla Datos / Sync: exportar e importar. */
function exportInventoryCsv() {
  const rows = [
    ['Pallet', 'Ubicación', 'Marca', 'Mercancía', 'Cajas', 'Productos (código:cantidad)', 'Estado', 'Actualizado'],
    ...state.pallets.map((p) => [
      p.code,
      locLabel(p.locationId),
      p.brand,
      p.description,
      p.boxes,
      palletProducts(p)
        .map((item) => `${item.productCode}:${item.quantity}`)
        .join(' | '),
      p.status,
      p.updatedAt,
    ]),
  ];
  const csv = rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
  download('inventario-almacen.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
}

async function exportBackup() {
  const data = {
    version: 2,
    exportedAt: now(),
    racks: await all('racks'),
    locations: await all('locations'),
    pallets: await all('pallets'),
    moves: await all('moves'),
  };
  download(
    'almacen-qr-backup-' + new Date().toISOString().slice(0, 10) + '.json',
    JSON.stringify(data, null, 2),
    'application/json',
  );
}

async function importBackup(file) {
  if (!canWrite(true)) return;
  const data = JSON.parse(await file.text());
  if (!data || !Array.isArray(data.locations) || !Array.isArray(data.pallets) || !Array.isArray(data.racks || []))
    throw new Error('El archivo no tiene un formato de respaldo válido.');
  if (
    !confirm(
      'Se combinarán los datos del respaldo con el almacén en la nube. Los registros existentes que no estén en el archivo no se borrarán. ¿Continuar?',
    )
  )
    return;
  try {
    for (const store of ['racks', 'locations', 'pallets']) {
      const rows = data[store] || [];
      if (!rows.length) continue;
      const { error } = await supabaseClient.from(store).upsert(rows);
      if (error) throw error;
    }
    await syncFromCloud();
    renderAll();
    toast('Respaldo combinado con el inventario en la nube.');
  } catch (error) {
    throw new Error('No se pudo importar el respaldo: ' + error.message);
  }
}
