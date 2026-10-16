/* Catálogo de productos (código -> descripción) y reporte Excel de inventario. */
let productCatalog = [];
let catalogIndex = null;

function catalogRows() {
  if (productCatalog.length) return productCatalog;
  return CATALOG_SEED.map(([code, description, unit], i) => ({ sort_order: i + 1, code, description, unit }));
}

function catalogKeys(code) {
  return String(code || '')
    .split('/')
    .map((part) => part.trim().toLocaleUpperCase())
    .filter(Boolean);
}

function catalogLookup(code) {
  if (!catalogIndex) {
    catalogIndex = new Map();
    for (const row of catalogRows())
      for (const key of catalogKeys(row.code)) {
        const prev = catalogIndex.get(key);
        if (!prev || (!prev.description && row.description)) catalogIndex.set(key, row);
      }
  }
  return catalogIndex.get(String(code || '').trim().toLocaleUpperCase()) || null;
}

function productDescription(item) {
  return catalogLookup(item.productCode)?.description || item.description || '';
}

async function refreshCatalog() {
  if (supabaseClient && !AUTH_DISABLED) {
    try {
      const { data } = await supabaseClient.from('product_catalog').select('*').order('sort_order');
      productCatalog = data || [];
    } catch (error) {
      productCatalog = [];
    }
  }
  catalogIndex = null;
  renderCatalogOptions();
}

/* El cat�logo manda: al guardar un pallet se actualizan las descripciones cambiadas y se agregan los c�digos nuevos. */
async function saveCatalogFromProducts(products) {
  if (!supabaseClient || AUTH_DISABLED || currentProfile?.role !== 'admin') return;
  try {
    if (!productCatalog.length) {
      const seed = CATALOG_SEED.map(([code, description, unit], i) => ({ sort_order: i + 1, code, description, unit }));
      const { error } = await supabaseClient.from('product_catalog').insert(seed);
      if (error) throw error;
      await refreshCatalog();
    }
    const adds = [],
      queued = new Set();
    for (const item of products) {
      const code = String(item.productCode || '').trim(),
        description = String(item.description || '').trim(),
        found = catalogLookup(code);
      if (!code || !description || queued.has(code.toLocaleUpperCase())) continue;
      if (!found) {
        queued.add(code.toLocaleUpperCase());
        adds.push({ sort_order: productCatalog.length + adds.length + 1, code, description, unit: 'box' });
      } else if (found.id && found.description !== description) {
        const { error } = await supabaseClient
          .from('product_catalog')
          .update({ description, updated_at: new Date().toISOString() })
          .eq('id', found.id);
        if (error) throw error;
      }
    }
    if (adds.length) {
      const { error } = await supabaseClient.from('product_catalog').insert(adds);
      if (error) throw error;
    }
    await refreshCatalog();
  } catch (error) {
    toast('Pallet guardado, pero no se pudo actualizar el cat�logo: ' + error.message);
  }
}

function renderCatalogOptions() {
  const list = $('catalogCodes');
  if (!list) return;
  const seen = new Set();
  list.innerHTML = catalogRows()
    .filter((row) => row.code && !seen.has(row.code) && seen.add(row.code))
    .map((row) => `<option value="${escapeHtml(row.code)}">${escapeHtml(row.description)}</option>`)
    .join('');
  const info = $('catalogInfo');
  if (info)
    info.textContent = productCatalog.length
      ? `${productCatalog.length} productos en el catálogo.`
      : 'El catálogo de la nube está vacío; se usa el catálogo inicial incluido en la app.';
}

function autofillProductDescription(input) {
  const row = input.closest('.product-row'),
    description = row?.querySelector('.product-description'),
    found = catalogLookup(input.value);
  if (found?.description && description && !description.value.trim()) description.value = found.description;
}

async function loadInitialCatalog() {
  if (!canWrite(true)) return;
  if (!confirm('Se reemplazará el catálogo de productos por el catálogo inicial del Excel. ¿Continuar?')) return;
  const { error: delError } = await supabaseClient.from('product_catalog').delete().gte('id', 0);
  if (delError) throw delError;
  const rows = CATALOG_SEED.map(([code, description, unit], i) => ({ sort_order: i + 1, code, description, unit }));
  const { error } = await supabaseClient.from('product_catalog').insert(rows);
  if (error) throw error;
  await refreshCatalog();
  toast(`Catálogo cargado: ${rows.length} productos.`);
}

function bindCatalog() {
  renderCatalogOptions();
  const rows = $('palletProductRows');
  rows.addEventListener('change', (event) => event.target.matches('.product-code') && autofillProductDescription(event.target));
  rows.addEventListener('input', (event) => {
    if (event.target.matches('.product-code') && catalogLookup(event.target.value)) autofillProductDescription(event.target);
  });
  const button = $('loadCatalog');
  if (button)
    button.onclick = () => loadInitialCatalog().catch((error) => toast('No se pudo cargar el catálogo: ' + error.message));
}

/* ---- Exportar Excel con el formato del inventario de Massimo Dutti ---- */
function xmlEscape(value) {
  return String(value).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder(),
    parts = [],
    central = [];
  let offset = 0;
  const u16 = (n) => [n & 255, (n >>> 8) & 255],
    u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const [name, text] of files) {
    const nameBytes = enc.encode(name),
      data = enc.encode(text),
      crc = crc32(data),
      head = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)];
    parts.push(new Uint8Array(head), nameBytes, data);
    central.push(
      new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]),
      nameBytes,
    );
    offset += head.length + nameBytes.length + data.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0);
  parts.push(...central, new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]));
  return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function inventoryReportRows() {
  const totals = stockTotals(),
    used = new Set(),
    rows = [];
  const quantity = (code) => {
    let qty = 0;
    for (const key of catalogKeys(code))
      if (!used.has(key)) {
        used.add(key);
        qty += totals.get(key)?.qty || 0;
      }
    return qty;
  };
  for (const row of catalogRows()) rows.push({ code: row.code, description: row.description, unit: row.unit, qty: quantity(row.code) });
  for (const [code, total] of totals)
    if (!used.has(code)) rows.push({ code: total.code, description: total.description, unit: 'box', qty: total.qty });
  return rows;
}

function exportInventoryExcel() {
  const cell = (ref, value, style) => {
      if (value === '' || value == null) return `<c r="${ref}" s="${style}"/>`;
      if (typeof value === 'number') return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    },
    codeValue = (code) => (/^\d{1,15}$/.test(code) ? Number(code) : code),
    data = inventoryReportRows();
  let xml = `<row r="1" ht="15">${cell('A1', ' Supplies', 1)}${cell('B1', '', 1)}${cell('C1', '', 1)}${cell('D1', '', 1)}</row><row r="2">${cell('A2', '', 1)}${cell('B2', '', 1)}${cell('C2', '', 1)}${cell('D2', '', 1)}</row>`;
  xml += `<row r="3" ht="15.75">${['Reference #', 'Description', 'Box', 'Units'].map((t, i) => cell('ABCD'[i] + 3, t, 2)).join('')}</row>`;
  data.forEach((row, i) => {
    const r = i + 4,
      isBox = row.unit !== 'units';
    xml += `<row r="${r}">${cell('A' + r, codeValue(row.code), 3)}${cell('B' + r, row.description, 3)}${cell('C' + r, isBox ? row.qty : '', 4)}${cell('D' + r, isBox ? '' : row.qty, 5)}</row>`;
  });
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" zoomScale="80" zoomScaleNormal="80"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="B4" sqref="B4"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="20.45" customWidth="1"/><col min="2" max="2" width="99" customWidth="1"/><col min="3" max="3" width="41.8" customWidth="1"/><col min="4" max="4" width="14" customWidth="1"/></cols><sheetData>${xml}</sheetData><mergeCells count="1"><mergeCell ref="A1:D2"/></mergeCells></worksheet>`;
  const border = '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>',
    styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="20"/><name val="Lucida Handwriting"/><family val="4"/></font><font><b/><sz val="12"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs></styleSheet>`,
    ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"',
    rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    blob = zipStore([
      ['[Content_Types].xml', `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ['_rels/.rels', `${head}<Relationships ${ns}><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets><sheet name="SUPPLIES" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `${head}<Relationships ${ns}><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', styles],
      ['xl/worksheets/sheet1.xml', sheet],
    ]),
    d = new Date(),
    stamp = [d.getMonth() + 1, d.getDate(), d.getFullYear() % 100].map((n) => String(n).padStart(2, '0')).join('-'),
    url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = `Massimo Dutti General Services Inventory  ${stamp}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
