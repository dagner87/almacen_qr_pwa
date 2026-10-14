/* Almacén QR: primera versión. Datos locales en IndexedDB; sincronización opcional con Supabase. */
const DB_NAME='almacenQRDB', DB_VERSION=1;
const AUTH_DISABLED = !(window.ALMACEN_SUPABASE_CONFIG && window.ALMACEN_SUPABASE_CONFIG.url && window.ALMACEN_SUPABASE_CONFIG.anonKey); // Modo local mientras no haya configuración válida de Supabase.
let db, supabaseClient=null, scanEngine=null, scanRunning=false, pendingLocationId='', currentQr={code:'',title:''},currentUser=null,currentProfile=null,realtimeChannel=null,realtimeReady=false,realtimeFirstSubscription=true,passwordRecoveryUser=null;
const sharedStores=['racks','locations','pallets','moves'];
const MODULES=[['dashboard','Inicio'],['search','Buscar producto'],['locations','Ubicaciones'],['pallets','Pallets'],['scan','Escanear'],['moves','Movimientos']];
const DEFAULT_OPERATOR_PERMISSIONS={dashboard:false,search:true,locations:false,pallets:false,scan:false,moves:false};
const $=id=>document.getElementById(id);
const state={racks:[],locations:[],pallets:[],moves:[],settings:{}};
function uid(prefix){return prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()}
function now(){return new Date().toISOString()}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const d=req.result;['racks','locations','pallets','moves','settings'].forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:s==='settings'?'key':'id'})})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function all(store){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function put(store,obj){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(obj);tx.oncomplete=()=>resolve(obj);tx.onerror=()=>reject(tx.error)})}
function del(store,id){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function loadState(){for(const s of ['racks','locations','pallets','moves','settings'])state[s]=await all(s);state.settings=Object.fromEntries(state.settings.map(x=>[x.key,x.value]));renderAll()}
async function logMove(action,palletId,from,to,details=''){await put('moves',{id:uid('MOV'),action,palletId,from:from||'',to:to||'',details,at:now()});state.moves=await all('moves')}
function locLabel(id){return state.locations.find(x=>x.id===id)?.code||'Sin ubicación'}
function activePalletsAt(locId){return state.pallets.filter(p=>p.locationId===locId&&p.status==='active')}
function palletProducts(p){return Array.isArray(p?.products)?p.products:[]}
function palletQuantity(p){const products=palletProducts(p);return products.length?products.reduce((sum,item)=>sum+Number(item.quantity||0),0):Number(p.boxes||0)}
function palletQuantityLabel(p){return palletProducts(p).length?'unidades':'cajas'}
function productRowsMarkup(products=[]){return products.map(item=>`<div class="product-row"><label>Código<input class="product-code" type="text" inputmode="numeric" maxlength="100" value="${escapeHtml(item.productCode||'')}" placeholder="Ej. 19575" autocomplete="off"></label><label>Descripción<input class="product-description" type="text" maxlength="200" value="${escapeHtml(item.description||'')}" placeholder="Descripción del producto"></label><label>Cantidad<input class="product-quantity" type="number" min="1" step="1" value="${escapeHtml(item.quantity??'')}" placeholder="0"></label><button type="button" class="mini remove-product" aria-label="Quitar producto">Quitar</button></div>`).join('')}
function addProductRow(product={}){$('palletProductRows').insertAdjacentHTML('beforeend',productRowsMarkup([product]))}
function findActiveProductMatches(productCode,excludePalletId=''){const key=String(productCode||'').trim().toLocaleUpperCase();return state.pallets.filter(pallet=>pallet.status==='active'&&pallet.id!==excludePalletId).flatMap(pallet=>palletProducts(pallet).filter(item=>String(item.productCode||'').trim().toLocaleUpperCase()===key).map(item=>({pallet,item})))}
function readPalletProducts(){const products=[],seen=new Map(),rows=[...$('palletProductRows').querySelectorAll('.product-row')];for(const [index,row] of rows.entries()){const productCode=row.querySelector('.product-code').value.trim(),description=row.querySelector('.product-description').value.trim(),quantityText=row.querySelector('.product-quantity').value.trim();if(!productCode&&!description&&!quantityText)continue;if(!productCode||!quantityText||productCode.length>100||description.length>200||!/^[0-9]+$/.test(quantityText)||!Number.isSafeInteger(Number(quantityText))||Number(quantityText)<1)return{products,error:`Completa el c\u00f3digo y una cantidad entera mayor que cero en la fila ${index+1}.`};const key=productCode.toLocaleUpperCase();if(seen.has(key)){const firstIndex=seen.get(key);return{products,error:`El c\u00f3digo ${productCode} ya est\u00e1 en este pallet (filas ${firstIndex+1} y ${index+1}). Ajusta la cantidad de la primera fila y quita la fila repetida.`,duplicate:{firstIndex,duplicateIndex:index}}}seen.set(key,index);products.push({productCode,description,quantity:Number(quantityText)})}return{products,error:''}}
function putMany(store,items){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),objectStore=tx.objectStore(store);items.forEach(item=>objectStore.put(item));tx.oncomplete=()=>resolve(items);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('No se pudo guardar el inventario.'))})}function renderProductLookup(){const input=$('productLookupInput'),target=$('productLookupResults');if(!input||!target)return;const query=input.value.trim().toLocaleLowerCase();if(!query){target.innerHTML='<p class="muted small">Escribe un c\u00f3digo o una descripci\u00f3n para ver la ubicaci\u00f3n y las cantidades disponibles.</p>';return}const matches=[];for(const pallet of state.pallets){if(pallet.status!=='active')continue;for(const item of palletProducts(pallet)){const productCode=String(item.productCode||'').toLocaleLowerCase(),description=String(item.description||'').toLocaleLowerCase();if(productCode.includes(query)||description.includes(query))matches.push({pallet,item})}}if(!matches.length){target.innerHTML='<div class="empty">No hay existencias activas para ese c\u00f3digo o descripci\u00f3n.</div>';return}const total=matches.reduce((sum,row)=>sum+Number(row.item.quantity||0),0);target.innerHTML=`<p class="lookup-total">${total.toLocaleString()} unidad(es) en ${matches.length} pallet(s)</p><div class="table-scroll"><table class="inventory-table"><thead><tr><th>C\u00f3digo</th><th>Descripci\u00f3n</th><th>Cantidad</th><th>Pallet</th><th>Ubicaci\u00f3n</th></tr></thead><tbody>${matches.map(({pallet,item})=>`<tr><td>${escapeHtml(item.productCode)}</td><td>${escapeHtml(item.description||'')}</td><td>${Number(item.quantity).toLocaleString()}</td><td>${escapeHtml(pallet.code)}</td><td class="location-highlight">${escapeHtml(locLabel(pallet.locationId))}</td></tr>`).join('')}</tbody></table></div>`}function renderAll(){renderDashboard();renderLocations();renderPallets();fillLocationOptions();renderRecent();renderMoves()}
function renderDashboard(){$('statRacks').textContent=state.racks.length;$('statLocations').textContent=state.locations.length;$('statPallets').textContent=state.pallets.filter(p=>p.status==='active').length;$('statBoxes').textContent=state.pallets.filter(p=>p.status==='active').reduce((n,p)=>n+palletQuantity(p),0).toLocaleString();$('syncBadge').textContent=supabaseClient?'Sincronizado':'Local';renderDashboardPanels()}
function renderDashboardPanels(){
 const active=state.pallets.filter(p=>p.status==='active'),usedIds=new Set(active.map(p=>p.locationId).filter(Boolean)),total=state.locations.length,used=state.locations.filter(l=>usedIds.has(l.id)).length,free=Math.max(total-used,0),pct=total?Math.round(used/total*100):0;
 const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
 const hour=new Date().getHours(),greet=hour<12?'Buenos días':hour<19?'Buenas tardes':'Buenas noches';
 set('dashGreeting',currentProfile?.email?`${greet}, ${currentProfile.email.split('@')[0]}`:'Resumen del almacén');
 set('dashDate',new Date().toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long'}));
 set('statFree',`${free.toLocaleString()} libres`);set('occPct',pct+'%');set('occUsed',used.toLocaleString());set('occFree',free.toLocaleString());
 const ring=$('occRing');if(ring)ring.style.setProperty('--pct',pct);
 const racks=[...new Set([...state.racks.map(r=>r.code),...state.locations.map(locationRackCode)])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 const bars=$('rackBars');if(bars)bars.innerHTML=racks.length?racks.slice(0,12).map(rack=>{const locs=state.locations.filter(l=>locationRackCode(l)===rack),u=locs.filter(l=>usedIds.has(l.id)).length,p=locs.length?Math.round(u/locs.length*100):0;return `<div class="rack-bar"><span>${escapeHtml(rack)}</span><div class="bar"><i style="width:${p}%"></i></div><b>${u}/${locs.length}</b></div>`}).join(''):'<p class="muted small">Aún no hay racks creados.</p>';
 const totals=new Map();for(const pallet of active)for(const item of palletProducts(pallet)){const key=item.productCode||item.description||'—',row=totals.get(key)||{code:item.productCode||'',description:item.description||'',qty:0};row.qty+=Number(item.quantity||0);totals.set(key,row)}
 const top=[...totals.values()].sort((a,b)=>b.qty-a.qty).slice(0,5),max=top[0]?.qty||1,tp=$('topProducts');
 if(tp)tp.innerHTML=top.length?top.map(r=>`<div class="top-row"><div><b>${escapeHtml(r.code)}</b><small>${escapeHtml(r.description)}</small></div><div class="bar"><i style="width:${Math.round(r.qty/max*100)}%"></i></div><b>${r.qty.toLocaleString()}</b></div>`).join(''):'<p class="muted small">Aún no hay productos registrados.</p>'
}
function renderLocations(){const q=$('locationSearch').value.toLowerCase(),level=$('levelFilter').value;const list=state.locations.filter(l=>(!q||l.code.toLowerCase().includes(q))&&(!level||String(l.level)===level)).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));$('locationList').innerHTML=list.length?list.map(l=>{const ps=activePalletsAt(l.id),quantity=ps.reduce((n,p)=>n+palletQuantity(p),0);return `<article class="item"><div class="item-main"><div class="item-title">${escapeHtml(l.code)}</div><div class="item-sub">${ps.length} pallet(s) · ${quantity} unidade(s)/caja(s) · ${l.capacity?'Capacidad: '+l.capacity:'Capacidad no definida'}</div><span class="pill ${ps.length?'warn':''}">${ps.length?'Ocupada':'Disponible'}</span></div><div class="item-actions"><button class="mini" data-qr-loc="${l.id}">QR etiqueta</button><button class="mini" data-open-loc="${l.id}">Ver pallets</button></div></article>`}).join(''):'<div class="empty">No hay ubicaciones. Pulsa “Crear racks” para generar la estructura.</div>'}
function locationRackCode(location){return location.rackId||location.code.split('-')[0]}
function openBarcodeDialog(){if(!state.locations.length){toast('Crea la estructura de racks antes de imprimir etiquetas.');return}const racks=[...new Set(state.locations.map(locationRackCode))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));$('barcodeRackFilter').innerHTML='<option value="">Todos los racks</option>'+racks.map(r=>`<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');renderBarcodes();$('barcodeDialog').showModal()}
function renderBarcodes(){const rack=$('barcodeRackFilter').value,list=state.locations.filter(l=>!rack||locationRackCode(l)===rack).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})),area=$('barcodePrintArea'),printButton=$('printBarcodes');if(typeof JsBarcode==='undefined'){area.innerHTML='<div class="empty">No se cargó el generador de códigos de barras. Conéctate a Internet y vuelve a intentarlo.</div>';printButton.disabled=true;return}area.innerHTML=list.length?list.map(l=>`<article class="barcode-label"><svg data-barcode="${escapeHtml(l.code)}"></svg><strong>${escapeHtml(l.code)}</strong></article>`).join(''):'<div class="empty">No hay ubicaciones en este rack.</div>';area.querySelectorAll('[data-barcode]').forEach(svg=>JsBarcode(svg,svg.dataset.barcode,{format:'CODE128',displayValue:false,width:1.4,height:52,margin:0,lineColor:'#111',background:'#fff'}));printButton.disabled=!list.length}
function printBarcodes(){if(!state.locations.length){toast('Crea la estructura de racks antes de imprimir etiquetas.');return}if(typeof JsBarcode==='undefined'){toast('No se cargó el generador de códigos de barras.');return}window.print()}
function renderPallets(){const q=$('palletSearch').value.toLowerCase(),f=$('palletStatusFilter').value;const list=state.pallets.filter(p=>(!q||[p.code,p.description,p.brand,p.notes,...palletProducts(p).flatMap(item=>[item.productCode,item.description])].join(' ').toLowerCase().includes(q))&&(!f||p.status===f)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));$('palletList').innerHTML=list.length?list.map(p=>{const products=palletProducts(p),detail=products.length?`${products.length} productos · ${palletQuantity(p)} unidades · ${escapeHtml(locLabel(p.locationId))}`:`${escapeHtml(p.brand||'Sin marca')} · ${Number(p.boxes||0)} cajas · ${escapeHtml(locLabel(p.locationId))}`;return `<article class="item"><div class="item-main"><div class="item-title">${escapeHtml(p.code)} · ${escapeHtml(p.description)}</div><div class="item-sub">${detail}</div>${products.length?`<div class="product-summary">${products.map(item=>`<span>${escapeHtml(item.productCode)} × ${Number(item.quantity)}</span>`).join('')}</div>`:''}<span class="pill ${p.status==='active'?'':'warn'}">${p.status==='active'?'Activo':p.status==='empty'?'Vacío':'Baja'}</span></div><div class="item-actions"><button class="mini" data-edit-pallet="${p.id}" data-write>Editar</button><button class="mini" data-qr-pallet="${p.id}">QR</button><button class="mini" data-move-pallet="${p.id}" data-write>Mover</button><button class="mini" data-delete-pallet="${p.id}" data-role="admin" data-write hidden>Eliminar</button></div></article>`}).join(''):'<div class="empty">No hay pallets registrados.</div>';updateConnectivity()}
function renderRecent(){const list=[...state.moves].sort((a,b)=>(b.at||'').localeCompare(a.at||'')).slice(0,8);$('recent').className='list'+(list.length?'':' empty');$('recent').innerHTML=list.length?list.map(m=>`<div class="item"><div class="item-main"><div class="item-title">${escapeHtml(m.action)} · ${escapeHtml(m.palletId||'')}</div><div class="item-sub">${escapeHtml(m.from?locLabel(m.from):'')} ${m.to?'→ '+escapeHtml(locLabel(m.to)):''} ${escapeHtml(m.details||'')}</div><small>${escapeHtml(m.actor_email||m.actorEmail||'Registro histórico sin usuario')} · ${new Date(m.at).toLocaleString()}</small></div></div>`).join(''):'Todavía no hay movimientos.'}
function renderMoves(){const target=$('moveHistory');if(!target)return;const list=[...state.moves].sort((a,b)=>(b.at||'').localeCompare(a.at||''));target.className='list'+(list.length?'':' empty');target.innerHTML=list.length?list.map(move=>`<article class="item"><div class="item-main"><div class="item-title">${escapeHtml(move.action||'Movimiento')} · ${escapeHtml(move.palletId||'')}</div><div class="item-sub">${escapeHtml(move.from?locLabel(move.from):'')} ${move.to?'→ '+escapeHtml(locLabel(move.to)):''} ${escapeHtml(move.details||'')}</div><small>${escapeHtml(move.actor_email||move.actorEmail||'Registro histórico sin usuario')} · ${new Date(move.at).toLocaleString()}</small></div></article>`).join(''):'No hay movimientos registrados.'}function fillLocationOptions(selected=''){const sel=$('palletLocation');if(!sel)return;sel.innerHTML='<option value="">Selecciona ubicación…</option>'+state.locations.map(l=>`<option value="${l.id}" ${l.id===selected?'selected':''}>${escapeHtml(l.code)}</option>`).join('')}
function canAccessModule(module){if(AUTH_DISABLED||currentProfile?.role==='admin')return true;return currentProfile?.permissions?.[module]===true}
function defaultPermissionsFor(role){return role==='admin'?Object.fromEntries(MODULES.map(([key])=>[key,true])):{...DEFAULT_OPERATOR_PERMISSIONS}}
function showView(view){if(view!=='scan'&&pendingLocationId)pendingLocationId='';if(['admin','settings'].includes(view)&&currentProfile?.role!=='admin'){view='dashboard';toast('Esta sección requiere permisos de administrador.')}if(!['admin','settings'].includes(view)&&!canAccessModule(view)){view=MODULES.map(([key])=>key).find(canAccessModule)||'dashboard';toast('No tienes permiso para abrir ese módulo.')}document.querySelectorAll('.view').forEach(item=>item.classList.toggle('active',item.id===view));document.querySelectorAll('.tab').forEach(item=>item.classList.toggle('active',item.dataset.view===view));if(view==='scan')$('manualCode').focus();if(view==='admin')renderAdminTools()}function qrRender(container,code){container.innerHTML='';if(typeof QRCode==='undefined'){container.textContent='No se cargó el generador QR. Conéctate a Internet y vuelve a intentarlo.';return}new QRCode(container,{text:code,width:190,height:190,colorDark:'#102a22',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M})}
function openQr(code,title,qrValue=code){currentQr={code,title};$('qrTitle').textContent=title;$('qrContent').innerHTML=`<div id="qrImage"></div><strong>${escapeHtml(code)}</strong><p class="muted small">${escapeHtml(title)}</p>`;qrRender($('qrContent').querySelector('#qrImage'),qrValue);$('qrDialog').showModal()}
function openPalletQr(p){const payload={type:'pallet',code:p.code,locationCode:locLabel(p.locationId),products:palletProducts(p).map(item=>({productCode:String(item.productCode||''),description:String(item.description||''),quantity:Number(item.quantity||0)}))};openQr(p.code,'Etiqueta del pallet',`ALMACEN_PALLET:${JSON.stringify(payload)}`)}function showPalletDialog(p=null){$('palletForm').reset();$('palletId').value=p?.id||'';$('palletDialogTitle').textContent=p?'Editar pallet':'Nuevo pallet';$('palletNotes').value=p?.notes||'';fillLocationOptions(p?.locationId||'');const products=palletProducts(p);$('palletProductRows').innerHTML=productRowsMarkup(products.length?products:[{}]);$('palletQrPreview').innerHTML=p?`<button type="button" class="mini" id="previewExistingQr">Mostrar QR: ${escapeHtml(p.code)}</button>`:'';$('palletDialog').showModal();if(p)setTimeout(()=>{const b=$('previewExistingQr');if(b)b.onclick=()=>openPalletQr(p)},0)}
async function createRackStructure(start,count,positions){if(!canWrite(true))return;if(!Number.isInteger(start)||start<1||!Number.isInteger(count)||count<1||count>100||!Number.isInteger(positions)||positions<1||positions>20){toast('Revisa los valores de rack, cantidad y posiciones.');return}const newRacks=[],newLocations=[];let made=0;for(let n=start;n<start+count;n++){const rackCode='R'+String(n).padStart(2,'0');if(!state.racks.some(r=>r.code===rackCode)){newRacks.push({id:rackCode,code:rackCode,levels:5,createdAt:now()});made++}for(let level=1;level<=5;level++){for(let pos=1;pos<=positions;pos++){const code=`${rackCode}-N${String(level).padStart(2,'0')}-P${String(pos).padStart(2,'0')}`;if(!state.locations.some(l=>l.code===code))newLocations.push({id:code,code,rackId:rackCode,level,position:pos,capacity:1,createdAt:now()})}}}try{if(!AUTH_DISABLED){if(newRacks.length){const {error}=await supabaseClient.from('racks').upsert(newRacks);if(error)throw error}if(newLocations.length){const {error}=await supabaseClient.from('locations').upsert(newLocations);if(error)throw error}}for(const rack of newRacks)await put('racks',rack);for(const location of newLocations)await put('locations',location);await loadState();toast(`Estructura creada. ${made} rack(s) nuevo(s).`)}catch(e){toast('No se pudo crear la estructura: '+e.message)}}
async function addRackPositions(rackCode,level,count){if(!canWrite(true))return;const rack=state.racks.find(r=>r.code===rackCode);if(!rack||!Number.isInteger(level)||level<1||level>5||!Number.isInteger(count)||count<1||count>20){toast('Selecciona un rack, nivel y cantidad válidos.');return}const existing=state.locations.filter(l=>(l.rackId||locationRackCode(l))===rackCode&&Number(l.level)===level),start=Math.max(0,...existing.map(l=>Number(l.position)||0))+1;if(start+count-1>20){toast('Cada nivel admite hasta 20 posiciones.');return}const locations=[];for(let position=start;position<start+count;position++){const code=`${rackCode}-N${String(level).padStart(2,'0')}-P${String(position).padStart(2,'0')}`;locations.push({id:code,code,rackId:rackCode,level,position,capacity:1,createdAt:now()})}try{const {error}=await supabaseClient.from('locations').upsert(locations);if(error)throw error;for(const location of locations)await put('locations',location);await loadState();toast(`${locations.length} posición(es) agregada(s).`)}catch(e){toast('No se pudieron agregar posiciones: '+e.message)}}
function renderAdminTools(){if(currentProfile?.role!=='admin')return;const rackOptions=[...new Set([...state.racks.map(r=>r.code),...state.locations.map(locationRackCode)])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));$('positionRack').innerHTML=rackOptions.map(code=>`<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`).join('');const groups=rackOptions.map(rack=>{const locations=state.locations.filter(location=>locationRackCode(location)===rack),levels=[...new Set([...Array(5)].map((_,index)=>index+1).concat(locations.map(location=>Number(location.level))))].sort((a,b)=>a-b);return `<section class="admin-rack"><div class="admin-rack-head"><strong>${escapeHtml(rack)}</strong><button class="mini danger" data-delete-rack="${escapeHtml(rack)}" data-write>Eliminar rack</button></div>${levels.map(level=>{const positions=locations.filter(location=>Number(location.level)===level).sort((a,b)=>a.position-b.position);return `<div class="admin-level"><div class="admin-level-head"><strong>Nivel ${level}</strong><button class="mini danger" data-delete-level="${escapeHtml(rack)}" data-level="${level}" data-write>Eliminar nivel</button></div><div class="admin-positions">${positions.map(location=>`<span class="admin-position">${escapeHtml(location.code)} <button class="mini danger" data-delete-position="${escapeHtml(location.id)}" aria-label="Eliminar ${escapeHtml(location.code)}" data-write>×</button></span>`).join('')||'<span class="muted small">Sin posiciones.</span>'}</div></div>`}).join('')}</section>`});$('adminStructureList').innerHTML=groups.join('')||'<div class="empty">No hay racks creados.</div>';renderUserRoles();updateConnectivity()}
async function renderUserRoles(){
 if(currentProfile?.role!=='admin')return;
 const target=$('userRoleList');
 if(AUTH_DISABLED){target.innerHTML='<div class="empty">La administración de cuentas estará disponible al reactivar la conexión con Supabase.</div>';return}
 try{
  const {data,error}=await supabaseClient.from('profiles').select('user_id,email,role,permissions').order('email');if(error)throw error;
  target.innerHTML=(data||[]).map(profile=>{const isSelf=profile.user_id===currentUser.id,permissions={...DEFAULT_OPERATOR_PERMISSIONS,...(profile.permissions||{})};return `<article class="user-role-card" data-profile-id="${escapeHtml(profile.user_id)}" data-profile-role="${escapeHtml(profile.role)}"><div class="user-role-head"><strong>${escapeHtml(profile.email)}${isSelf?' (tú)':''}</strong><label>Rol<select data-user-role="${escapeHtml(profile.user_id)}" data-write ${isSelf?'disabled':''}><option value="operator" ${profile.role==='operator'?'selected':''}>Operador</option><option value="admin" ${profile.role==='admin'?'selected':''}>Administrador</option></select></label></div><div class="user-permission-grid">${MODULES.map(([module,label])=>`<label><input type="checkbox" data-module-permission="${module}" data-user-id="${escapeHtml(profile.user_id)}" ${permissions[module]?'checked':''} ${profile.role==='admin'?'disabled':''}>${label}</label>`).join('')}</div><button class="mini" data-save-user-permissions="${escapeHtml(profile.user_id)}" data-write ${profile.role==='admin'?'disabled':''}>Guardar permisos</button></article>`}).join('')||'<div class="empty">No hay cuentas registradas.</div>';
 }catch(error){target.innerHTML=`<div class="empty">No se pudieron cargar los usuarios: ${escapeHtml(error.message)}</div>`}
}
async function setUserRole(userId,role){
 if(!canWrite(true))return;
 if(!['admin','operator'].includes(role)||userId===currentUser.id){toast('No puedes cambiar tu propio rol.');await renderUserRoles();return}
 try{const {error}=await supabaseClient.from('profiles').update({role,permissions:defaultPermissionsFor(role)}).eq('user_id',userId);if(error)throw error;toast('Rol actualizado con los permisos predeterminados.');await renderUserRoles()}
 catch(error){toast('No se pudo actualizar el rol: '+error.message);await renderUserRoles()}
}
async function saveUserPermissions(userId){
 if(!canWrite(true))return;
 const row=[...document.querySelectorAll('.user-role-card')].find(item=>item.dataset.profileId===userId);if(!row||row.dataset.profileRole==='admin')return;
 const permissions=Object.fromEntries([...row.querySelectorAll('[data-module-permission]')].map(input=>[input.dataset.modulePermission,input.checked]));
 try{const {error}=await supabaseClient.from('profiles').update({permissions}).eq('user_id',userId);if(error)throw error;toast('Permisos guardados.');await renderUserRoles()}
 catch(error){toast('No se pudieron guardar los permisos: '+error.message)}
}async function savePallet(event){
 event.preventDefault();if(!canWrite())return;
 const id=$('palletId').value,old=state.pallets.find(item=>item.id===id),locationId=$('palletLocation').value;
 if(!locationId){toast('Selecciona una ubicación.');return}
 if(!state.locations.some(location=>location.id===locationId)){toast('La ubicación ya no existe. Actualiza el inventario e inténtalo nuevamente.');return}
 const result=readPalletProducts();if(result.error){toast(result.error);if(result.duplicate){const firstRow=[...$('palletProductRows').querySelectorAll('.product-row')][result.duplicate.firstIndex],quantityInput=firstRow?.querySelector('.product-quantity');if(quantityInput){quantityInput.focus();quantityInput.select()}}return}
 const products=result.products,mergePlans=new Map(),mergeSummary=[];
 for(const product of products){
  const matches=findActiveProductMatches(product.productCode,old?.id);if(!matches.length)continue;
  const groups=new Map();for(const match of matches){let group=groups.get(match.pallet.id);if(!group){group={pallet:match.pallet,items:[],quantity:0};groups.set(match.pallet.id,group)}group.items.push(match.item);group.quantity+=Number(match.item.quantity||0)}
  const locations=[...groups.values()].map(group=>`${group.pallet.code}: ${group.quantity.toLocaleString()} en ${locLabel(group.pallet.locationId)}`).join('\n');
  const unify=confirm(`El c\u00f3digo ${product.productCode} ya existe en otros pallets:\n${locations}\n\nAceptar: trasladar esas cantidades al pallet actual y quitarlas de los pallets indicados.\nCancelar: mantener las existencias en sus ubicaciones separadas.`);
  if(!unify)continue;
  const transferQuantity=[...groups.values()].reduce((sum,group)=>sum+group.quantity,0),combinedQuantity=product.quantity+transferQuantity;if(!Number.isSafeInteger(combinedQuantity)){toast(`La cantidad unificada del c\u00f3digo ${product.productCode} excede el l\u00edmite permitido.`);return}
  product.quantity=combinedQuantity;if(!product.description)product.description=matches.find(match=>match.item.description)?.item.description||'';mergeSummary.push({productCode:product.productCode,quantity:transferQuantity});
  for(const group of groups.values()){const plan=mergePlans.get(group.pallet.id)||{pallet:group.pallet,codes:new Map()};plan.codes.set(product.productCode.trim().toLocaleUpperCase(),group.quantity);mergePlans.set(group.pallet.id,plan)}
 }
 const quantity=products.reduce((sum,item)=>sum+item.quantity,0);if(!Number.isSafeInteger(quantity)){toast('La suma de cantidades es demasiado grande.');return}
 const maxPalletNum=state.pallets.reduce((max,item)=>Math.max(max,Number((item.code||'').match(/(\d+)$/)?.[1]||0)),0),code=old?.code||('PLT-'+String(maxPalletNum+1).padStart(6,'0')),boxes=products.length?quantity:Number(old?.boxes||0);
 const pallet={id:old?.id||uid('PAL'),code,locationId,description:products.length?'Pallet mixto':old?.description||'Pallet vacío',brand:old?.brand||'',products,boxes,notes:$('palletNotes').value.trim(),status:boxes===0?'empty':'active',createdAt:old?.createdAt||now(),updatedAt:now()};
 const sourceUpdates=[...mergePlans.values()].map(plan=>{const remainingProducts=palletProducts(plan.pallet).filter(item=>!plan.codes.has(String(item.productCode||'').trim().toLocaleUpperCase())),remainingQuantity=remainingProducts.reduce((sum,item)=>sum+Number(item.quantity||0),0);return{...plan.pallet,products:remainingProducts,boxes:remainingQuantity,status:remainingQuantity>0?'active':'empty',description:remainingQuantity>0?plan.pallet.description:'Pallet vacío',updatedAt:now()}});
 try{
  let savedRows=[pallet,...sourceUpdates];if(!AUTH_DISABLED){const {data,error}=await supabaseClient.from('pallets').upsert(savedRows).select();if(error)throw error;savedRows=data||savedRows}
  await putMany('pallets',savedRows);const savedPallet=savedRows.find(item=>item.id===pallet.id)||pallet;
  if(AUTH_DISABLED){const action=!old?'Alta de pallet':old.locationId!==locationId?'Movimiento':'Actualización de stock';await logMove(action,pallet.code,old?.locationId||'',locationId,`${quantity} unidades · ${products.length} productos`);for(const plan of mergePlans.values()){const details=[...plan.codes.entries()].map(([productCode,moved])=>`${productCode}: ${moved} unidades`).join(', ');await logMove('Consolidación de producto',plan.pallet.code,plan.pallet.locationId,locationId,details)}}
  await loadState();$('palletDialog').close();toast(mergeSummary.length?`Pallet guardado. Se unificaron ${mergeSummary.map(item=>`${item.productCode} (+${item.quantity})`).join(', ')}.`:AUTH_DISABLED?'Pallet guardado en este dispositivo.':'Pallet guardado.');if(!old)openPalletQr(savedPallet)
 }catch(error){toast('No se pudo guardar el pallet: '+error.message)}
}async function savePalletLocation(pallet,destination){
 if(!canWrite())return null;
 if(pallet.locationId===destination.id){toast(`El pallet ${pallet.code} ya está en ${destination.code}.`);return pallet}
 const updated={...pallet,locationId:destination.id,updatedAt:now()};
 try{let saved=updated;if(!AUTH_DISABLED){const {data,error}=await supabaseClient.from('pallets').update(updated).eq('id',pallet.id).select().single();if(error)throw error;saved=data}await put('pallets',saved);if(AUTH_DISABLED)await logMove('Movimiento',pallet.code,pallet.locationId,destination.id,`${palletQuantity(pallet)} ${palletQuantityLabel(pallet)}`);await loadState();toast(AUTH_DISABLED?'Ubicación actualizada en este dispositivo.':'Ubicación actualizada.');return saved}
 catch(error){toast('No se pudo mover el pallet: '+error.message);return null}
}
async function movePallet(id){
 if(!canWrite())return;const pallet=state.pallets.find(item=>item.id===id);if(!pallet)return;
 const options=state.locations.map(location=>`${location.code} (${activePalletsAt(location.id).length} pallet(s))`).join('\n'),code=prompt('Escribe el código de destino exacto:\n'+options,locLabel(pallet.locationId));if(!code)return;
 const destination=state.locations.find(location=>location.code.toLowerCase()===code.trim().toLowerCase());if(!destination){toast('No se encontró ese código de ubicación.');return}
 await savePalletLocation(pallet,destination)
}async function deletePallet(id){if(!canWrite(true))return;const pallet=state.pallets.find(item=>item.id===id);if(!pallet||!confirm(AUTH_DISABLED?`¿Eliminar el pallet ${pallet.code}? Esta acción no se puede deshacer.`:`¿Eliminar el pallet ${pallet.code}? Esta acción quedará registrada en el historial.`))return;try{if(!AUTH_DISABLED){const {data,error}=await supabaseClient.from('pallets').delete().eq('id',id).select('id');if(error)throw error;if(!data?.length)throw new Error('Supabase no eliminó el registro. Verifica que tu usuario tenga rol de administrador.')}if(AUTH_DISABLED)await logMove('Baja de pallet',pallet.code,pallet.locationId,'','Eliminado desde la administración');await del('pallets',id);await loadState();toast('Pallet eliminado.')}catch(error){toast('No se pudo eliminar el pallet: '+error.message)}}
function selectedStructure(){
 const racks=[...document.querySelectorAll('[data-select-rack]:checked')].map(input=>input.dataset.selectRack);
 const levels=[...document.querySelectorAll('[data-select-level]:checked')].map(input=>({rackCode:input.dataset.selectLevel,level:Number(input.dataset.level)}));
 const positions=[...document.querySelectorAll('[data-select-position]:checked')].map(input=>input.dataset.selectPosition);
 return{racks,levels,positions}
}
function updateStructureSelectionCount(){
 const selection=selectedStructure(),count=selection.racks.length+selection.levels.length+selection.positions.length,summary=$('structureSelectionCount'),button=$('deleteSelectedStructure');
 if(summary)summary.textContent=count?`${count} elemento(s) seleccionado(s)`:'Sin elementos seleccionados';
 if(button)button.disabled=count===0||(!AUTH_DISABLED&&(!realtimeReady||currentProfile?.role!=='admin'))
}
async function deleteSelectedStructure(){
 if(!canWrite(true))return;
 const selection=selectedStructure(),rackCodes=new Set(selection.racks),levelKeys=new Set(selection.levels.map(item=>`${item.rackCode}|${item.level}`)),locationIds=new Set(selection.positions),deletedLevelKeys=new Set();
 for(const location of state.locations){const rackCode=locationRackCode(location),level=Number(location.level);if(rackCodes.has(rackCode)||levelKeys.has(`${rackCode}|${level}`))locationIds.add(location.id)}
 const locations=state.locations.filter(location=>locationIds.has(location.id)),pallets=state.pallets.filter(pallet=>locationIds.has(pallet.locationId)),racks=state.racks.filter(rack=>rackCodes.has(rack.code));
 for(const item of selection.levels)if(!rackCodes.has(item.rackCode))deletedLevelKeys.add(`${item.rackCode}|${item.level}`);
 if(!selection.racks.length&&!selection.levels.length&&!locations.length){toast('Selecciona al menos un rack, nivel o posición.');return}
 if(!confirm(`Se eliminarán ${racks.length} rack(s), ${locations.length} posición(es) y ${pallets.length} pallet(s) asociados. El historial de movimientos se conservará. ¿Continuar?`))return;
 try{
  if(!AUTH_DISABLED){
   if(pallets.length){const {data,error}=await supabaseClient.from('pallets').delete().in('id',pallets.map(pallet=>pallet.id)).select('id');if(error)throw error;if(data?.length!==pallets.length)throw new Error('Supabase no eliminó todos los pallets. Verifica los permisos de administrador.')}
   if(locations.length){const {error}=await supabaseClient.from('locations').delete().in('id',locations.map(location=>location.id));if(error)throw error}
   for(const rack of racks){const {error}=await supabaseClient.from('racks').delete().eq('id',rack.id);if(error)throw error}
   for(const key of deletedLevelKeys){const [rackCode,rawLevel]=key.split('|'),rack=state.racks.find(item=>item.code===rackCode);if(!rack)continue;const disabledLevels=[...new Set([...(rack.disabledLevels||[]).map(Number),Number(rawLevel)])];const {error}=await supabaseClient.from('racks').update({disabledLevels}).eq('id',rack.id);if(error)throw error}
  }
  for(const pallet of pallets){if(AUTH_DISABLED)await logMove('Baja de pallet',pallet.code,pallet.locationId,'','Eliminado junto con su ubicación');await del('pallets',pallet.id)}
  for(const location of locations)await del('locations',location.id);
  for(const rack of racks)await del('racks',rack.id);
  for(const key of deletedLevelKeys){const [rackCode,rawLevel]=key.split('|'),rack=state.racks.find(item=>item.code===rackCode);if(!rack)continue;const disabledLevels=[...new Set([...(rack.disabledLevels||[]).map(Number),Number(rawLevel)])];await put('racks',{...rack,disabledLevels})}
  await loadState();toast('Eliminación en cascada completada.')
 }catch(error){toast('No se pudo completar la eliminación: '+error.message)}
}
async function deleteStructure(kind,rackCode,level,locationId){
 let input;
 if(kind==='rack')input=[...document.querySelectorAll('[data-select-rack]')].find(item=>item.dataset.selectRack===rackCode);
 else if(kind==='level')input=[...document.querySelectorAll('[data-select-level]')].find(item=>item.dataset.selectLevel===rackCode&&Number(item.dataset.level)===Number(level));
 else input=[...document.querySelectorAll('[data-select-position]')].find(item=>item.dataset.selectPosition===locationId);
 if(input)input.checked=true;
 await deleteSelectedStructure()
}async function restoreRackLevel(rackCode,level){if(!canWrite(true))return;const rack=state.racks.find(item=>item.code===rackCode);if(!rack)return;const disabledLevels=(rack.disabledLevels||[]).map(Number).filter(value=>value!==Number(level));try{const {error}=await supabaseClient.from('racks').update({disabledLevels}).eq('id',rack.id);if(error)throw error;await put('racks',{...rack,disabledLevels});await loadState();toast(`Nivel ${level} habilitado; agrega sus posiciones para usarlo.`)}catch(error){toast('No se pudo habilitar el nivel: '+error.message)}}
async function handleCode(code){
 code=(code||'').trim();if(!code)return;let scannedPallet=null;
 if(code.startsWith('ALMACEN_PALLET:')){try{scannedPallet=JSON.parse(code.slice('ALMACEN_PALLET:'.length));if(scannedPallet?.type!=='pallet'||!scannedPallet.code)throw new Error('invalid payload');code=scannedPallet.code}catch(error){toast('No se pudo leer la información del QR.');return}}
 const location=state.locations.find(item=>item.code.toLowerCase()===code.toLowerCase());
 if(location){
  const pallets=activePalletsAt(location.id),quantity=pallets.reduce((sum,pallet)=>sum+palletQuantity(pallet),0);
  $('scanResult').innerHTML=`<div class="panel"><h3>${escapeHtml(location.code)}</h3><p>${pallets.length} pallet(s) · ${quantity} unidad(es)/caja(s)</p><div class="list">${pallets.map(pallet=>{const products=palletProducts(pallet),summary=products.length?products.map(item=>`${escapeHtml(item.productCode)} × ${Number(item.quantity)}`).join(' · '):`${escapeHtml(pallet.brand||'Sin marca')} · ${Number(pallet.boxes||0)} cajas`;return `<div class="item"><div class="item-main"><b>${escapeHtml(pallet.code)} · ${escapeHtml(pallet.description)}</b><div class="item-sub">${summary}</div></div><button class="mini" data-edit-pallet="${pallet.id}">Editar</button></div>`}).join('')||'<div class="empty">Esta posición está vacía.</div>'}</div><div class="button-row"><button class="primary" id="associatePalletHere">Asociar pallet aquí</button><button class="secondary" id="newAtLocation">＋ Registrar pallet aquí</button><button class="secondary" id="labelLocation">Mostrar QR ubicación</button></div></div>`;
  $('associatePalletHere').onclick=async()=>{pendingLocationId=location.id;$('scanResult').innerHTML=`<div class="panel notice"><b>Ubicación seleccionada: ${escapeHtml(location.code)}</b><p>Ahora escanea el QR o código de barras del pallet. Se pedirá confirmación antes de moverlo.</p><button class="secondary" id="cancelAssociation">Cancelar asociación</button></div>`;$('cancelAssociation').onclick=async()=>{pendingLocationId='';await stopScan();$('scanResult').innerHTML='';toast('Asociación cancelada.')};await startScan()};
  $('newAtLocation').onclick=()=>{showPalletDialog();fillLocationOptions(location.id);$('palletLocation').value=location.id};$('labelLocation').onclick=()=>openQr(location.code,'Etiqueta de ubicación');
 }else{
  let pallet=scannedPallet||state.pallets.find(item=>item.code.toLowerCase()===code.toLowerCase());
  if(pallet&&pendingLocationId){const destination=state.locations.find(item=>item.id===pendingLocationId);if(!destination){pendingLocationId='';toast('La ubicación seleccionada ya no existe.')}else if(confirm(`¿Mover el pallet ${pallet.code} de ${locLabel(pallet.locationId)} a ${destination.code}?`)){const saved=await savePalletLocation(pallet,destination);if(saved){pallet=saved;pendingLocationId=''}}}
  if(pallet){const products=palletProducts(pallet),rows=products.length?products.map(item=>`<tr><td>${escapeHtml(item.productCode)}</td><td>${escapeHtml(item.description||'')}</td><td>${Number(item.quantity).toLocaleString()}</td></tr>`).join(''):`<tr><td colspan="3">${escapeHtml(pallet.brand||'Sin detalle de productos')} · ${Number(pallet.boxes||0).toLocaleString()} cajas</td></tr>`,associationNotice=pendingLocationId?`<div class="notice">Pendiente: asociar el siguiente pallet a ${escapeHtml(locLabel(pendingLocationId))}. Escanea el pallet cuando estés listo.</div>`:'';
   $('scanResult').innerHTML=`<div class="panel pallet-scan-card"><p class="eyebrow">PALLET ENCONTRADO</p><h3>${escapeHtml(pallet.code)}</h3><dl class="pallet-scan-details"><div><dt>Ubicación</dt><dd>${escapeHtml(pallet.locationCode||locLabel(pallet.locationId))}</dd></div><div><dt>Estado</dt><dd>${escapeHtml(pallet.status==='active'?'Activo':pallet.status==='empty'?'Vacío':'Baja')}</dd></div><div><dt>Total de unidades</dt><dd>${palletQuantity(pallet).toLocaleString()}</dd></div>${pallet.brand?`<div><dt>Marca</dt><dd>${escapeHtml(pallet.brand)}</dd></div>`:''}</dl><div class="table-scroll"><table class="inventory-table"><thead><tr><th>Código</th><th>Descripción</th><th>Cantidad</th></tr></thead><tbody>${rows}</tbody></table></div>${pallet.notes?`<p><b>Notas:</b> ${escapeHtml(pallet.notes)}</p>`:''}${associationNotice}<div class="button-row"><button class="primary" id="scanEdit">Editar pallet</button><button class="secondary" id="scanMove">Mover pallet</button><button class="secondary" id="scanPrint">Imprimir QR</button>${pendingLocationId?'<button class="secondary" id="cancelAssociation">Cancelar asociación</button>':''}</div></div>`;
   $('scanEdit').onclick=()=>showPalletDialog(pallet);$('scanMove').onclick=()=>movePallet(pallet.id);$('scanPrint').onclick=()=>openPalletQr(pallet);const cancel=$('cancelAssociation');if(cancel)cancel.onclick=async()=>{pendingLocationId='';await stopScan();toast('Asociación cancelada.');$('scanResult').innerHTML=''}
  }else{$('scanResult').innerHTML=`<div class="panel warning"><b>Código no encontrado.</b><p>${pendingLocationId?`No se encontró ese pallet. La ubicación ${escapeHtml(locLabel(pendingLocationId))} sigue seleccionada.`:'Comprueba el QR o registra la ubicación/pallet antes de escanearlo.'}</p>${pendingLocationId?'<button class="secondary" id="cancelAssociation">Cancelar asociación</button>':''}</div>`;const cancel=$('cancelAssociation');if(cancel)cancel.onclick=async()=>{pendingLocationId='';await stopScan();$('scanResult').innerHTML='';toast('Asociación cancelada.')}}
 }
}async function startScan(){if(!window.Html5Qrcode){toast('El lector no se cargó. Comprueba la conexión y recarga.');return}try{if(!scanEngine)scanEngine=new Html5Qrcode('reader',{formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE,Html5QrcodeSupportedFormats.CODE_128]});await scanEngine.start({facingMode:'environment'},{fps:10,qrbox:{width:230,height:230}},async text=>{await stopScan();$('manualCode').value=text;await handleCode(text)},()=>{});scanRunning=true;toast('Cámara activada. Apunta al código.')}catch(e){toast('No se pudo abrir la cámara: '+e.message)}}
async function stopScan(){if(scanEngine&&scanRunning){try{await scanEngine.stop();scanEngine.clear()}catch(e){}scanRunning=false}}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
async function exportBackup(){const data={version:1,exportedAt:now(),racks:state.racks,locations:state.locations,pallets:state.pallets,moves:state.moves,settings:await all('settings')};download('almacen-qr-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(data,null,2),'application/json')}
function exportInventoryCsv(){const rows=[['Pallet','Ubicación','Marca','Mercancía','Cajas','Productos (código:cantidad)','Estado','Actualizado'],...state.pallets.map(p=>[p.code,locLabel(p.locationId),p.brand,p.description,p.boxes,palletProducts(p).map(item=>`${item.productCode}:${item.quantity}`).join(' | '),p.status,p.updatedAt])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');download('inventario-almacen.csv','\ufeff'+csv,'text/csv;charset=utf-8')}
async function importBackup(file){const data=JSON.parse(await file.text());if(!data||!Array.isArray(data.locations)||!Array.isArray(data.pallets))throw new Error('El archivo no tiene un formato de respaldo válido.');if(!confirm('Esto reemplazará los datos locales actuales. ¿Continuar?'))return;for(const s of ['racks','locations','pallets','moves','settings']){const tx=db.transaction(s,'readwrite');tx.objectStore(s).clear();await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});for(const row of (data[s]||[]))await put(s,row)}await loadState();toast('Respaldo importado.');}
function syncMessage(msg){$('syncMessage').textContent=msg}
function authMessage(msg){$('authMessage').textContent=msg}
function canWrite(adminOnly=false){if(AUTH_DISABLED)return true;if(!currentUser||!currentProfile){toast('Inicia sesión para realizar cambios.');return false}if(adminOnly&&currentProfile.role!=='admin'){toast('Esta acción requiere permisos de administrador.');return false}if(!adminOnly&&!canAccessModule('pallets')){toast('No tienes permiso para modificar pallets.');return false}if(!navigator.onLine||!realtimeReady){toast('Sin conexión en tiempo real: el sistema está en modo de solo consulta.');return false}return true}
function updateConnectivity(){const ready=Boolean(currentUser&&currentProfile&&navigator.onLine&&realtimeReady);$('syncBadge').textContent=ready?'En tiempo real':'Solo consulta';$('signOutBtn').hidden=!currentUser;$('signedInAs').textContent=currentProfile?`${currentProfile.email} · ${currentProfile.role==='admin'?'Administrador':'Operador'}`:'';document.querySelectorAll('[data-role="admin"]').forEach(el=>{el.hidden=currentProfile?.role!=='admin'});document.querySelectorAll('[data-write]').forEach(el=>{el.disabled=!ready||el.dataset.role==='admin'&&currentProfile?.role!=='admin'});if(currentProfile?.role==='admin'&&$('admin').classList.contains('active')&&!$('admin').hidden)renderAdminTools();if(currentProfile?.role!=='admin'&&$('admin').classList.contains('active'))showView('dashboard')}
function showPasswordUpdate(user){passwordRecoveryUser=user||null;$('authGate').hidden=false;$('appContent').hidden=true;$('loginForm').hidden=true;$('forgotPasswordForm').hidden=true;$('updatePasswordForm').hidden=false;authMessage('Enlace verificado. Escribe y confirma tu nueva contraseña.')}
function showLogin(message){passwordRecoveryUser=null;$('loginForm').hidden=false;$('forgotPasswordForm').hidden=true;$('updatePasswordForm').hidden=true;$('newPassword').value='';$('confirmPassword').value='';authMessage(message)}
function lockApplication(message='Inicia sesión para acceder al inventario.'){currentUser=null;currentProfile=null;realtimeReady=false;if(realtimeChannel&&supabaseClient)supabaseClient.removeChannel(realtimeChannel);realtimeChannel=null;$('appContent').hidden=true;$('authGate').hidden=false;$('loginPassword').value='';showLogin(message);updateConnectivity()}
async function configureSupabase(){const config=window.ALMACEN_SUPABASE_CONFIG||{},hasUrl=Boolean(config.url),hasKey=Boolean(config.anonKey);if(hasUrl!==hasKey)throw new Error('Configura juntas SUPABASE_URL y SUPABASE_ANON_KEY en Netlify.');const url=(config.url||state.settings.supabaseUrl||'').trim(),key=(config.anonKey||state.settings.supabaseKey||'').trim();if(!url||!key)throw new Error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY en las variables de entorno de Netlify.');if(!window.supabase)throw new Error('No se cargó la librería Supabase. Comprueba la conexión.');if(realtimeChannel&&supabaseClient)await supabaseClient.removeChannel(realtimeChannel);supabaseClient=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true}});supabaseClient.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')lockApplication();if(event==='PASSWORD_RECOVERY')showPasswordUpdate(session?.user)})}
async function loadProfile(user){const {data,error}=await supabaseClient.from('profiles').select('user_id,email,role,permissions').eq('user_id',user.id).maybeSingle();if(error)throw error;if(!data)throw new Error('No se encontró tu perfil. Ejecuta supabase.sql y confirma que la cuenta exista en Authentication.');if(!['admin','operator'].includes(data.role))throw new Error('Tu cuenta no tiene un rol válido. Solicita ayuda al administrador.');return data}
async function applyRemoteChange(store,payload){if(store==='profiles'){const row=payload.new||payload.old;if(row?.user_id===currentUser?.id){try{currentProfile=await loadProfile(currentUser)}catch(e){lockApplication('Tu rol ya no está habilitado: '+e.message);return}}updateConnectivity();return}const row=payload.new||payload.old;if(!row)return;const id=store==='settings'?row.key:row.id;if(payload.eventType==='DELETE')await del(store,id);else await put(store,row);state[store]=await all(store);if(store==='settings')state.settings=Object.fromEntries(state.settings.map(item=>[item.key,item.value]));renderAll();updateConnectivity()}
async function reconcileRealtime(){try{await syncFromCloud();renderAll()}catch(e){syncMessage('No se pudo actualizar la vista en tiempo real: '+e.message)}}
async function startRealtime(){if(realtimeChannel)await supabaseClient.removeChannel(realtimeChannel);realtimeReady=false;realtimeFirstSubscription=true;const channel=supabaseClient.channel('almacen-qr-live').on('postgres_changes',{event:'*',schema:'public',table:'racks'},payload=>applyRemoteChange('racks',payload)).on('postgres_changes',{event:'*',schema:'public',table:'locations'},payload=>applyRemoteChange('locations',payload)).on('postgres_changes',{event:'*',schema:'public',table:'pallets'},payload=>applyRemoteChange('pallets',payload)).on('postgres_changes',{event:'*',schema:'public',table:'moves'},payload=>applyRemoteChange('moves',payload)).on('postgres_changes',{event:'*',schema:'public',table:'profiles'},payload=>applyRemoteChange('profiles',payload));realtimeChannel=channel;return new Promise(resolve=>{let settled=false;channel.subscribe(status=>{if(status==='SUBSCRIBED'){realtimeReady=true;updateConnectivity();if(settled){reconcileRealtime();return}settled=true;resolve(true);realtimeFirstSubscription=false}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){realtimeReady=false;updateConnectivity();if(!settled){settled=true;resolve(false)}}})})}
async function activateSession(user){currentUser=user;try{currentProfile=await loadProfile(user);$('authGate').hidden=true;$('appContent').hidden=false;const livePromise=startRealtime();await syncFromCloud();if(currentProfile.role==='admin')await syncToCloud();const live=await Promise.race([livePromise,new Promise(resolve=>setTimeout(()=>resolve(false),6000))]);updateConnectivity();if(live){await renderAdminTools();authMessage('Sesión iniciada. Los cambios se sincronizan en tiempo real.')}else{await renderAdminTools();syncMessage('Sin conexión Realtime; el inventario queda en solo consulta.')} }catch(e){lockApplication('No se pudo iniciar sesión: '+e.message)}}
async function signIn(e){e.preventDefault();if(!supabaseClient){try{await configureSupabase()}catch(err){authMessage('No se pudo conectar con Supabase: '+err.message);return}}authMessage('Validando acceso…');const {data,error}=await supabaseClient.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});if(error){authMessage('No se pudo iniciar sesión: '+error.message);return}await activateSession(data.user)}
async function sendPasswordRecovery(event){event.preventDefault();if(!supabaseClient){authMessage('No se pudo conectar con Supabase. Revisa la configuración del sitio.');return}const email=$('loginEmail').value.trim();if(!email){authMessage('Escribe primero el correo de tu cuenta.');$('loginEmail').focus();return}authMessage('Enviando enlace de recuperación…');const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});if(error){authMessage('No se pudo enviar el enlace: '+error.message);return}authMessage('Si el correo pertenece a una cuenta, recibirás un enlace para restablecer la contraseña.')}
async function updatePassword(event){event.preventDefault();if(!supabaseClient||!passwordRecoveryUser){authMessage('El enlace de recuperación no es válido o ya venció. Solicita uno nuevo.');return}const password=$('newPassword').value;if(password!==$('confirmPassword').value){authMessage('Las contraseñas no coinciden.');return}authMessage('Actualizando contraseña…');const {data,error}=await supabaseClient.auth.updateUser({password});if(error){authMessage('No se pudo actualizar la contraseña: '+error.message);return}passwordRecoveryUser=null;$('newPassword').value='';$('confirmPassword').value='';authMessage('Contraseña actualizada. Iniciando sesión…');await activateSession(data.user)}
async function signOut(){if(supabaseClient){const {error}=await supabaseClient.auth.signOut();if(error){authMessage('No se pudo cerrar sesión: '+error.message);return}}lockApplication('Sesión cerrada.')}
async function syncFromCloud(){if(!supabaseClient||!currentProfile)return;for(const store of sharedStores){const {data,error}=await supabaseClient.from(store).select('*');if(error)throw error;const remoteRows=data||[],localRows=await all(store),remoteIds=new Set(remoteRows.map(row=>row.id));if(currentProfile.role==='operator'){const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});for(const row of remoteRows)await put(store,row);continue}for(const row of remoteRows){const local=localRows.find(item=>item.id===row.id),cloudAt=new Date(row.updatedAt||row.at||row.createdAt||0).getTime(),localAt=new Date(local?.updatedAt||local?.at||local?.createdAt||0).getTime();if(!local||cloudAt>=localAt)await put(store,row)}for(const local of localRows){if(!remoteIds.has(local.id)&&store!=='moves')continue;if(!remoteIds.has(local.id)&&store==='moves')await del(store,local.id)}}await loadState()}
async function syncToCloud(){if(!supabaseClient||!currentProfile)return;if(!canWrite(currentProfile.role==='admin'))throw new Error('Solo el administrador puede sincronizar cambios estructurales.');if(currentProfile.role==='admin'){for(const store of ['racks','locations','pallets']){const localRows=await all(store);if(!localRows.length)continue;const {data,error}=await supabaseClient.from(store).select('id,updatedAt,createdAt');if(error)throw error;const cloudById=new Map((data||[]).map(row=>[row.id,row]));const changed=localRows.filter(row=>{const cloud=cloudById.get(row.id);if(!cloud)return true;const localAt=new Date(row.updatedAt||row.createdAt||0).getTime(),cloudAt=new Date(cloud.updatedAt||cloud.createdAt||0).getTime();return localAt>cloudAt});if(changed.length){const {error:writeError}=await supabaseClient.from(store).upsert(changed);if(writeError)throw writeError}}}syncMessage('Sincronización completada: '+new Date().toLocaleTimeString());updateConnectivity()}
async function init(){db=await openDb();await loadState();const settings=Object.fromEntries((await all('settings')).map(x=>[x.key,x.value]));$('supabaseUrl').value=settings.supabaseUrl||'';$('supabaseKey').value=settings.supabaseKey||'';if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.goto)));$('addRackBtn').onclick=()=>$('rackDialog').showModal();$('createRacks').onclick=async e=>{e.preventDefault();const start=Number($('rackStart').value),count=Number($('rackCount').value),pos=Number($('positionsPerLevel').value);if(count<1||count>100||pos<1||pos>20){toast('Revisa los valores.');return}$('rackDialog').close();await createRackStructure(start,count,pos);if(supabaseClient)syncToCloud().catch(e=>syncMessage(e.message))};$('addPalletBtn').onclick=()=>showPalletDialog();$('palletForm').onsubmit=savePallet;$('locationSearch').oninput=renderLocations;$('levelFilter').onchange=renderLocations;$('palletSearch').oninput=renderPallets;$('palletStatusFilter').onchange=renderPallets;$('productLookupInput').oninput=renderProductLookup;$('productLookupForm').onsubmit=event=>{event.preventDefault();renderProductLookup()};$('palletSearchForm').onsubmit=event=>{event.preventDefault();renderPallets()};$('startScan').onclick=startScan;$('stopScan').onclick=stopScan;$('manualScanForm').onsubmit=async e=>{e.preventDefault();await handleCode($('manualCode').value)};$('connectSync').onclick=connectSync;$('disconnectSync').onclick=()=>{supabaseClient=null;$('syncBadge').textContent='Local';syncMessage('Modo local activado. Los datos locales no se han borrado.')};$('exportData').onclick=exportBackup;$('exportCsv').onclick=exportInventoryCsv;$('importFile').onchange=async e=>{try{if(e.target.files[0])await importBackup(e.target.files[0])}catch(err){toast('Error al importar: '+err.message)}e.target.value=''};$('printQr').onclick=()=>window.print();$('printPalletQr').onclick=()=>{const p=state.pallets.find(x=>x.id===$('palletId').value);if(p)openPalletQr(p);else{const preview=$('palletQrPreview');preview.innerHTML='<p class="small muted">Guarda primero el pallet para generar su identificador definitivo y QR.</p>'}};document.body.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t)return;if(t.dataset.close){$(t.dataset.close).close();return}if(t.dataset.qrLoc){const l=state.locations.find(x=>x.id===t.dataset.qrLoc);if(l)openQr(l.code,'Etiqueta de ubicación')}if(t.dataset.qrPallet){const p=state.pallets.find(x=>x.id===t.dataset.qrPallet);if(p)openPalletQr(p)}if(t.dataset.editPallet){const p=state.pallets.find(x=>x.id===t.dataset.editPallet);if(p)showPalletDialog(p)}if(t.dataset.movePallet)await movePallet(t.dataset.movePallet);if(t.dataset.openLoc){const l=state.locations.find(x=>x.id===t.dataset.openLoc);if(l){showView('scan');$('manualCode').value=l.code;await handleCode(l.code)}}});$('rackForm').onsubmit=e=>e.preventDefault();syncMessage('Modo local listo. Para sincronizar entre dispositivos configura Supabase.');}
$('printBarcodesBtn').onclick=openBarcodeDialog;
$('barcodeRackFilter').onchange=renderBarcodes;
$('printBarcodes').onclick=printBarcodes;
$('addPalletProduct').onclick=()=>addProductRow();
$('palletProductRows').addEventListener('change',event=>{const input=event.target;if(!input.matches('.product-code'))return;const code=input.value.trim();if(!code)return;const row=input.closest('.product-row'),rows=[...$('palletProductRows').querySelectorAll('.product-row')],key=code.toLocaleUpperCase(),duplicate=rows.find(item=>item!==row&&item.querySelector('.product-code').value.trim().toLocaleUpperCase()===key);if(duplicate){const duplicateRow=rows.indexOf(duplicate)+1;toast(`El c\u00f3digo ${code} ya est\u00e1 en este pallet, en la fila ${duplicateRow}. Edita la cantidad existente y elimina la fila repetida.`);return}const matches=findActiveProductMatches(code,$('palletId').value);if(matches.length){const groups=new Map();for(const match of matches){const group=groups.get(match.pallet.id)||{pallet:match.pallet,quantity:0};group.quantity+=Number(match.item.quantity||0);groups.set(match.pallet.id,group)}const places=[...groups.values()].map(group=>`${group.pallet.code}: ${group.quantity.toLocaleString()} en ${locLabel(group.pallet.locationId)}`).join(' · ');toast(`El c\u00f3digo ${code} ya existe: ${places}. Al guardar elige unificar o mantener separado.`)}});
$('palletProductRows').addEventListener('click',event=>{const button=event.target.closest('.remove-product');if(button)button.closest('.product-row').remove()});
function renderAdminTools(refreshUsers=true){
 if(currentProfile?.role!=='admin')return;
 const rackMap=new Map(state.racks.map(rack=>[rack.code,rack]));
 state.locations.forEach(location=>{const code=locationRackCode(location);if(!rackMap.has(code))rackMap.set(code,{id:code,code,levels:5})});
 const racks=[...rackMap.values()].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
 const selectedRack=racks.find(rack=>rack.code===$('positionRack').value)||racks[0];
 $('positionRack').innerHTML=racks.map(rack=>`<option value="${escapeHtml(rack.code)}" ${rack.code===selectedRack?.code?'selected':''}>${escapeHtml(rack.code)}</option>`).join('');
 $('positionLevel').innerHTML=[1,2,3,4,5].map(level=>`<option value="${level}">Nivel ${level}${(selectedRack?.disabledLevels||[]).map(Number).includes(level)?' (eliminado; al agregar posiciones se restaura)':''}</option>`).join('');
 $('adminStructureList').innerHTML=racks.map(rack=>{
  const locations=state.locations.filter(location=>locationRackCode(location)===rack.code),disabled=new Set((rack.disabledLevels||[]).map(Number));
  return `<section class="admin-rack"><div class="admin-rack-head"><label class="admin-select"><input type="checkbox" data-select-rack="${escapeHtml(rack.code)}"><strong>${escapeHtml(rack.code)}</strong></label></div>${[1,2,3,4,5].map(level=>{const positions=locations.filter(location=>Number(location.level)===level).sort((a,b)=>a.position-b.position),inactive=disabled.has(level);return `<div class="admin-level ${inactive?'inactive':''}"><div class="admin-level-head"><label class="admin-select"><input type="checkbox" data-select-level="${escapeHtml(rack.code)}" data-level="${level}"><strong>Nivel ${level}${inactive?' · eliminado':''}</strong></label>${inactive?`<button class="mini" data-restore-level="${escapeHtml(rack.code)}" data-level="${level}" data-write>Restaurar</button>`:''}</div><div class="admin-positions">${positions.map(location=>`<label class="admin-select"><input type="checkbox" data-select-position="${escapeHtml(location.id)}">${escapeHtml(location.code)}</label>`).join('')||'<span class="muted small">Sin posiciones.</span>'}</div></div>`}).join('')}</section>`
 }).join('')||'<div class="empty">No hay racks creados.</div>';
 updateStructureSelectionCount();
 if(refreshUsers&&!AUTH_DISABLED)renderUserRoles();
 else if(AUTH_DISABLED)$('userRoleList').innerHTML='<div class="empty">La administración de cuentas está deshabilitada en el modo local.</div>';
 updateConnectivity();
}
async function addRackPositions(rackCode,level,count){
 if(!canWrite(true))return;
 const rack=state.racks.find(item=>item.code===rackCode);
 if(!rack||!Number.isInteger(level)||level<1||level>5||!Number.isInteger(count)||count<1||count>20){toast('Selecciona un rack, nivel y cantidad válidos.');return}
 const existing=state.locations.filter(item=>locationRackCode(item)===rackCode&&Number(item.level)===level),start=Math.max(0,...existing.map(item=>Number(item.position)||0))+1;
 if(start+count-1>20){toast('Cada nivel admite hasta 20 posiciones.');return}
 const locations=Array.from({length:count},(_,index)=>{const position=start+index,code=`${rackCode}-N${String(level).padStart(2,'0')}-P${String(position).padStart(2,'0')}`;return{id:code,code,rackId:rackCode,level,position,capacity:1,createdAt:now()}});
 try{
  const disabledLevels=(rack.disabledLevels||[]).map(Number).filter(value=>value!==level);
  if(!AUTH_DISABLED){
   if(disabledLevels.length!==(rack.disabledLevels||[]).length){const {error}=await supabaseClient.from('racks').update({disabledLevels}).eq('id',rack.id);if(error)throw error}
   const {error}=await supabaseClient.from('locations').upsert(locations);if(error)throw error
  }
  if(disabledLevels.length!==(rack.disabledLevels||[]).length)await put('racks',{...rack,disabledLevels});
  for(const location of locations)await put('locations',location);
  await loadState();toast(`${locations.length} posición(es) agregada(s).`)
 }catch(error){toast('No se pudieron agregar posiciones: '+error.message)}
}async function deleteStructure(kind,rackCode,level,locationId){
 let input;
 if(kind==='rack')input=[...document.querySelectorAll('[data-select-rack]')].find(item=>item.dataset.selectRack===rackCode);
 else if(kind==='level')input=[...document.querySelectorAll('[data-select-level]')].find(item=>item.dataset.selectLevel===rackCode&&Number(item.dataset.level)===Number(level));
 else input=[...document.querySelectorAll('[data-select-position]')].find(item=>item.dataset.selectPosition===locationId);
 if(input)input.checked=true;
 await deleteSelectedStructure()
}async function restoreRackLevel(rackCode,level){
 if(!canWrite(true))return;
 const rack=state.racks.find(item=>item.code===rackCode);if(!rack)return;
 const disabledLevels=(rack.disabledLevels||[]).map(Number).filter(value=>value!==Number(level));
 try{if(!AUTH_DISABLED){const {error}=await supabaseClient.from('racks').update({disabledLevels}).eq('id',rack.id);if(error)throw error}await put('racks',{...rack,disabledLevels});await loadState();toast(`Nivel ${level} restaurado. Agrega sus posiciones para usarlo.`)}catch(error){toast('No se pudo restaurar el nivel: '+error.message)}
}
function updateConnectivity(){
 const ready=AUTH_DISABLED||Boolean(currentUser&&currentProfile&&navigator.onLine&&realtimeReady);
 $('syncBadge').textContent=AUTH_DISABLED?'Modo local':ready?'En tiempo real':'Solo consulta';
 $('signOutBtn').hidden=AUTH_DISABLED||!currentUser;
 $('signedInAs').textContent=AUTH_DISABLED?'':currentProfile?`${currentProfile.email} · ${currentProfile.role==='admin'?'Administrador':'Operador'}`:'';
 document.querySelectorAll('[data-role="admin"]').forEach(element=>{element.hidden=currentProfile?.role!=='admin'});
 document.querySelectorAll('[data-module]').forEach(element=>{element.hidden=!canAccessModule(element.dataset.module)});
 if($('dashboardMoves'))$('dashboardMoves').hidden=!canAccessModule('moves');
 const activeView=document.querySelector('.view.active')?.id;if(activeView&&!['admin','settings'].includes(activeView)&&!canAccessModule(activeView)){const firstAllowed=MODULES.map(([key])=>key).find(canAccessModule);if(firstAllowed)showView(firstAllowed)}
 document.querySelectorAll('[data-write]').forEach(element=>{element.disabled=!ready||(element.dataset.role==='admin'&&currentProfile?.role!=='admin')});
 if(currentProfile?.role!=='admin'&&$('admin').classList.contains('active'))showView('dashboard')
}function renderAll(){
 renderDashboard();renderLocations();renderPallets();fillLocationOptions();renderRecent();renderMoves();renderProductLookup();
 if(currentProfile?.role==='admin'&&$('admin').classList.contains('active'))renderAdminTools(false)
}
async function applyRemoteChange(store,payload){
 if(store==='profiles'){
  const row=payload.new||payload.old;
  const ownProfileChanged=row?.user_id===currentUser?.id;
  if(ownProfileChanged){try{currentProfile=await loadProfile(currentUser)}catch(error){lockApplication('Tu rol ya no está habilitado: '+error.message);return}}
  updateConnectivity();
  if(ownProfileChanged){try{await syncFromCloud();renderAll()}catch(error){syncMessage('No se pudo actualizar el acceso: '+error.message)}}
  if(currentProfile?.role==='admin'&&$('admin').classList.contains('active'))renderUserRoles();
  return
 }
 const row=payload.new||payload.old;if(!row)return;
 const id=store==='settings'?row.key:row.id;
 if(payload.eventType==='DELETE')await del(store,id);else await put(store,row);
 state[store]=await all(store);
 if(store==='settings')state.settings=Object.fromEntries(state.settings.map(item=>[item.key,item.value]));
 renderAll();updateConnectivity()
}
async function syncFromCloud(){
 if(!supabaseClient||!currentProfile)return;
 const remoteByStore={};
 for(const store of sharedStores){const {data,error}=await supabaseClient.from(store).select('*');if(error)throw error;remoteByStore[store]=data||[]}
 const remoteHasInventory=['racks','locations','pallets'].some(store=>remoteByStore[store].length>0);
 for(const store of sharedStores){
  const remoteRows=remoteByStore[store],localRows=await all(store);
  if(currentProfile.role==='operator'||remoteHasInventory){
   const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();
   await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
   for(const row of remoteRows)await put(store,row);
   continue
  }
  for(const row of remoteRows){
   const local=localRows.find(item=>item.id===row.id);
   const cloudAt=new Date(row.updatedAt||row.at||row.createdAt||0).getTime();
   const localAt=new Date(local?.updatedAt||local?.at||local?.createdAt||0).getTime();
   if(!local||cloudAt>=localAt)await put(store,row)
  }
 }
 await loadState()
}
async function exportBackup(){
 const data={version:2,exportedAt:now(),racks:await all('racks'),locations:await all('locations'),pallets:await all('pallets'),moves:await all('moves')};
 download('almacen-qr-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(data,null,2),'application/json')
}
async function importBackup(file){
 if(!canWrite(true))return;
 const data=JSON.parse(await file.text());
 if(!data||!Array.isArray(data.locations)||!Array.isArray(data.pallets)||!Array.isArray(data.racks||[]))throw new Error('El archivo no tiene un formato de respaldo válido.');
 if(!confirm('Se combinarán los datos del respaldo con el almacén en la nube. Los registros existentes que no estén en el archivo no se borrarán. ¿Continuar?'))return;
 try{
  for(const store of ['racks','locations','pallets']){
   const rows=data[store]||[];
   if(!rows.length)continue;
   const {error}=await supabaseClient.from(store).upsert(rows);
   if(error)throw error
  }
  await syncFromCloud();renderAll();toast('Respaldo combinado con el inventario en la nube.')
 }catch(error){throw new Error('No se pudo importar el respaldo: '+error.message)}
}
async function activateSession(user){
 currentUser=user;
 try{
  currentProfile=await loadProfile(user);$('authGate').hidden=true;$('appContent').hidden=false;
  const livePromise=startRealtime();
  await syncFromCloud();
  const live=await Promise.race([livePromise,new Promise(resolve=>setTimeout(()=>resolve(false),6000))]);
  if(live&&currentProfile.role==='admin')await syncToCloud();
  updateConnectivity();renderAll();
  if(currentProfile.role==='admin')renderAdminTools();
  if(live)authMessage('Sesión iniciada. Los cambios se sincronizan en tiempo real.');
  else syncMessage('Sin conexión Realtime; el inventario queda en solo consulta.');
 }catch(error){lockApplication('No se pudo iniciar sesión: '+error.message)}
}
async function init(){
 db=await openDb();await loadState();
 if(AUTH_DISABLED){currentUser={id:'local-user',email:'Modo local'};currentProfile={user_id:'local-user',email:'Modo local',role:'admin'};realtimeReady=true;$('authGate').hidden=true;$('appContent').hidden=false;syncMessage('Modo local temporal. Los cambios se guardan en este dispositivo.');renderAll();updateConnectivity()}
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
 document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
 document.querySelectorAll('[data-goto]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.goto)));
 $('addRackBtn').onclick=()=>$('rackDialog').showModal();$('adminAddRackBtn').onclick=()=>$('rackDialog').showModal();
 $('createRacks').onclick=async event=>{event.preventDefault();if(!canWrite(true))return;const start=Number($('rackStart').value),count=Number($('rackCount').value),positions=Number($('positionsPerLevel').value);$('rackDialog').close();await createRackStructure(start,count,positions)};
 $('addPalletBtn').onclick=()=>showPalletDialog();$('palletForm').onsubmit=savePallet;
 $('addPositionsForm').onsubmit=async event=>{event.preventDefault();await addRackPositions($('positionRack').value,Number($('positionLevel').value),Number($('positionsToAdd').value))};
 $('positionRack').onchange=renderAdminTools;
 $('loginForm').onsubmit=signIn;$('forgotPasswordForm').onsubmit=sendPasswordRecovery;$('updatePasswordForm').onsubmit=updatePassword;$('forgotPasswordBtn').onclick=()=>{if(!$('loginEmail').value.trim()){$('loginEmail').focus();authMessage('Escribe primero el correo de tu cuenta.');return}$('loginForm').hidden=true;$('forgotPasswordForm').hidden=false;authMessage('Confirma el correo de la cuenta y solicita el enlace.')};$('backToLoginBtn').onclick=()=>showLogin('Inicia sesión para acceder al almacén.');$('signOutBtn').onclick=signOut;
 $('refreshSync').onclick=async()=>{if(!canWrite())return;try{await syncFromCloud();if(currentProfile.role==='admin')await syncToCloud();syncMessage('Sincronización completada: '+new Date().toLocaleTimeString())}catch(error){syncMessage('No se pudo sincronizar: '+error.message)}};
 $('locationSearch').oninput=renderLocations;$('levelFilter').onchange=renderLocations;$('palletSearch').oninput=renderPallets;$('palletStatusFilter').onchange=renderPallets;$('productLookupInput').oninput=renderProductLookup;$('productLookupForm').onsubmit=event=>{event.preventDefault();renderProductLookup()};$('palletSearchForm').onsubmit=event=>{event.preventDefault();renderPallets()};
 $('startScan').onclick=startScan;$('stopScan').onclick=stopScan;$('manualScanForm').onsubmit=async event=>{event.preventDefault();await handleCode($('manualCode').value)};
 $('exportData').onclick=()=>currentProfile?.role==='admin'?exportBackup():toast('Solo un administrador puede exportar respaldos.');$('exportCsv').onclick=exportInventoryCsv;
 $('importFile').onchange=async event=>{try{if(event.target.files[0]){if(!canWrite(true))return;await importBackup(event.target.files[0])}}catch(error){toast('Error al importar: '+error.message)}event.target.value=''};
 $('printQr').onclick=()=>window.print();$('printPalletQr').onclick=()=>{if(!canWrite())return;const pallet=state.pallets.find(item=>item.id===$('palletId').value);if(pallet)openPalletQr(pallet);else $('palletQrPreview').innerHTML='<p class="small muted">Guarda primero el pallet para generar su identificador definitivo y QR.</p>'};
 document.body.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.close){$(button.dataset.close).close();return}
  if(button.dataset.qrLoc){const location=state.locations.find(item=>item.id===button.dataset.qrLoc);if(location)openQr(location.code,'Etiqueta de ubicación')}
  if(button.dataset.qrPallet){const pallet=state.pallets.find(item=>item.id===button.dataset.qrPallet);if(pallet)openPalletQr(pallet)}
  if(button.dataset.editPallet){const pallet=state.pallets.find(item=>item.id===button.dataset.editPallet);if(pallet)showPalletDialog(pallet)}
  if(button.dataset.movePallet)await movePallet(button.dataset.movePallet);
  if(button.dataset.deletePallet)await deletePallet(button.dataset.deletePallet);
  if(button.dataset.deletePosition)await deleteStructure('position','',0,button.dataset.deletePosition);
  if(button.dataset.deleteLevel)await deleteStructure('level',button.dataset.deleteLevel,Number(button.dataset.level));
  if(button.dataset.deleteRack)await deleteStructure('rack',button.dataset.deleteRack,0);
  if(button.dataset.restoreLevel)await restoreRackLevel(button.dataset.restoreLevel,Number(button.dataset.level));
  if(button.dataset.saveUserPermissions)await saveUserPermissions(button.dataset.saveUserPermissions);
  if(button.dataset.openLoc){const location=state.locations.find(item=>item.id===button.dataset.openLoc);if(location){showView('scan');$('manualCode').value=location.code;await handleCode(location.code)}}
 });
 $('deleteSelectedStructure').onclick=deleteSelectedStructure;
 document.body.addEventListener('change',async event=>{
  const checkbox=event.target;
  if(checkbox.matches('[data-select-rack]'))checkbox.closest('.admin-rack').querySelectorAll('[data-select-level],[data-select-position]').forEach(child=>{child.checked=checkbox.checked});
  if(checkbox.matches('[data-select-level]'))checkbox.closest('.admin-level').querySelectorAll('[data-select-position]').forEach(child=>{child.checked=checkbox.checked});
  if(checkbox.matches('[data-select-rack],[data-select-level],[data-select-position]'))updateStructureSelectionCount();
  const select=event.target.closest('[data-user-role]');if(select)await setUserRole(select.dataset.userRole,select.value)
 });
 $('rackForm').onsubmit=event=>event.preventDefault();
 window.addEventListener('offline',()=>{realtimeReady=false;updateConnectivity();syncMessage('Sin conexión. El inventario sincronizado está disponible en solo consulta.')});
 window.addEventListener('online',async()=>{if(!currentUser||!supabaseClient)return;try{await startRealtime();if(realtimeReady){await syncFromCloud();renderAll();syncMessage('Conexión restablecida. Inventario actualizado.')}}catch(error){syncMessage('No se pudo restablecer la sincronización: '+error.message)}});
 if(!AUTH_DISABLED){try{await configureSupabase();const {data,error}=await supabaseClient.auth.getSession();if(error)throw error;if(location.hash.includes('type=recovery')&&data.session?.user)showPasswordUpdate(data.session.user);else if(data.session?.user)await activateSession(data.session.user);else lockApplication('Inicia sesión para acceder al inventario.')}catch(error){lockApplication('No se pudo conectar con Supabase: '+error.message)}}
 updateConnectivity()
}
init().catch(error=>{console.error(error);toast('Error inicializando la aplicación: '+error.message)});

