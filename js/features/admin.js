/* Pantalla Administrar (estructura, usuarios y permisos). */
async function createRackStructure(start, count, positions) {
  if (!canWrite(true)) return;
  if (
    !Number.isInteger(start) ||
    start < 1 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100 ||
    !Number.isInteger(positions) ||
    positions < 1 ||
    positions > 20
  ) {
    toast('Revisa los valores de rack, cantidad y posiciones.');
    return;
  }
  const newRacks = [],
    newLocations = [];
  let made = 0;
  for (let n = start; n < start + count; n++) {
    const rackCode = 'R' + String(n).padStart(2, '0');
    if (!state.racks.some((r) => r.code === rackCode)) {
      newRacks.push({ id: rackCode, code: rackCode, levels: 5, createdAt: now() });
      made++;
    }
    for (let level = 1; level <= 5; level++) {
      for (let pos = 1; pos <= positions; pos++) {
        const code = `${rackCode}-N${String(level).padStart(2, '0')}-P${String(pos).padStart(2, '0')}`;
        if (!state.locations.some((l) => l.code === code))
          newLocations.push({ id: code, code, rackId: rackCode, level, position: pos, capacity: 1, createdAt: now() });
      }
    }
  }
  try {
    if (!AUTH_DISABLED) {
      if (newRacks.length) {
        const { error } = await supabaseClient.from('racks').upsert(newRacks);
        if (error) throw error;
      }
      if (newLocations.length) {
        const { error } = await supabaseClient.from('locations').upsert(newLocations);
        if (error) throw error;
      }
    }
    for (const rack of newRacks) await put('racks', rack);
    for (const location of newLocations) await put('locations', location);
    await loadState();
    toast(`Estructura creada. ${made} rack(s) nuevo(s).`);
  } catch (e) {
    toast('No se pudo crear la estructura: ' + e.message);
  }
}

async function renderUserRoles() {
  if (currentProfile?.role !== 'admin') return;
  const target = $('userRoleList');
  if (AUTH_DISABLED) {
    target.innerHTML =
      '<div class="empty">La administración de cuentas estará disponible al reactivar la conexión con Supabase.</div>';
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('user_id,email,role,permissions')
      .order('email');
    if (error) throw error;
    target.innerHTML =
      (data || [])
        .map((profile) => {
          const isSelf = profile.user_id === currentUser.id,
            permissions = { ...DEFAULT_OPERATOR_PERMISSIONS, ...(profile.permissions || {}) };
          return `<article class="user-role-card" data-profile-id="${escapeHtml(profile.user_id)}" data-profile-role="${escapeHtml(profile.role)}"><div class="user-role-head"><strong>${escapeHtml(profile.email)}${isSelf ? ' (tú)' : ''}</strong><label>Rol<select data-user-role="${escapeHtml(profile.user_id)}" data-write ${isSelf ? 'disabled' : ''}><option value="operator" ${profile.role === 'operator' ? 'selected' : ''}>Operador</option><option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>Administrador</option></select></label></div><div class="user-permission-grid">${MODULES.map(([module, label]) => `<label><input type="checkbox" data-module-permission="${module}" data-user-id="${escapeHtml(profile.user_id)}" ${permissions[module] ? 'checked' : ''} ${profile.role === 'admin' ? 'disabled' : ''}>${label}</label>`).join('')}</div><button class="mini" data-save-user-permissions="${escapeHtml(profile.user_id)}" data-write ${profile.role === 'admin' ? 'disabled' : ''}>Guardar permisos</button></article>`;
        })
        .join('') || '<div class="empty">No hay cuentas registradas.</div>';
  } catch (error) {
    target.innerHTML = `<div class="empty">No se pudieron cargar los usuarios: ${escapeHtml(error.message)}</div>`;
  }
}

async function setUserRole(userId, role) {
  if (!canWrite(true)) return;
  if (!['admin', 'operator'].includes(role) || userId === currentUser.id) {
    toast('No puedes cambiar tu propio rol.');
    await renderUserRoles();
    return;
  }
  try {
    const { error } = await supabaseClient
      .from('profiles')
      .update({ role, permissions: defaultPermissionsFor(role) })
      .eq('user_id', userId);
    if (error) throw error;
    toast('Rol actualizado con los permisos predeterminados.');
    await renderUserRoles();
  } catch (error) {
    toast('No se pudo actualizar el rol: ' + error.message);
    await renderUserRoles();
  }
}

async function saveUserPermissions(userId) {
  if (!canWrite(true)) return;
  const row = [...document.querySelectorAll('.user-role-card')].find((item) => item.dataset.profileId === userId);
  if (!row || row.dataset.profileRole === 'admin') return;
  const permissions = Object.fromEntries(
    [...row.querySelectorAll('[data-module-permission]')].map((input) => [
      input.dataset.modulePermission,
      input.checked,
    ]),
  );
  try {
    const { error } = await supabaseClient.from('profiles').update({ permissions }).eq('user_id', userId);
    if (error) throw error;
    toast('Permisos guardados.');
    await renderUserRoles();
  } catch (error) {
    toast('No se pudieron guardar los permisos: ' + error.message);
  }
}

function selectedStructure() {
  const racks = [...document.querySelectorAll('[data-select-rack]:checked')].map((input) => input.dataset.selectRack);
  const levels = [...document.querySelectorAll('[data-select-level]:checked')].map((input) => ({
    rackCode: input.dataset.selectLevel,
    level: Number(input.dataset.level),
  }));
  const positions = [...document.querySelectorAll('[data-select-position]:checked')].map(
    (input) => input.dataset.selectPosition,
  );
  return { racks, levels, positions };
}

function updateStructureSelectionCount() {
  const selection = selectedStructure(),
    count = selection.racks.length + selection.levels.length + selection.positions.length,
    summary = $('structureSelectionCount'),
    button = $('deleteSelectedStructure');
  if (summary) summary.textContent = count ? `${count} elemento(s) seleccionado(s)` : 'Sin elementos seleccionados';
  if (button) button.disabled = count === 0 || (!AUTH_DISABLED && (!realtimeReady || currentProfile?.role !== 'admin'));
}

async function deleteSelectedStructure() {
  if (!canWrite(true)) return;
  const selection = selectedStructure(),
    rackCodes = new Set(selection.racks),
    levelKeys = new Set(selection.levels.map((item) => `${item.rackCode}|${item.level}`)),
    locationIds = new Set(selection.positions),
    deletedLevelKeys = new Set();
  for (const location of state.locations) {
    const rackCode = locationRackCode(location),
      level = Number(location.level);
    if (rackCodes.has(rackCode) || levelKeys.has(`${rackCode}|${level}`)) locationIds.add(location.id);
  }
  const locations = state.locations.filter((location) => locationIds.has(location.id)),
    pallets = state.pallets.filter((pallet) => locationIds.has(pallet.locationId)),
    racks = state.racks.filter((rack) => rackCodes.has(rack.code));
  for (const item of selection.levels)
    if (!rackCodes.has(item.rackCode)) deletedLevelKeys.add(`${item.rackCode}|${item.level}`);
  if (!selection.racks.length && !selection.levels.length && !locations.length) {
    toast('Selecciona al menos un rack, nivel o posición.');
    return;
  }
  if (
    !confirm(
      `Se eliminarán ${racks.length} rack(s), ${locations.length} posición(es) y ${pallets.length} pallet(s) asociados. El historial de movimientos se conservará. ¿Continuar?`,
    )
  )
    return;
  try {
    if (!AUTH_DISABLED) {
      if (pallets.length) {
        const { data, error } = await supabaseClient
          .from('pallets')
          .delete()
          .in(
            'id',
            pallets.map((pallet) => pallet.id),
          )
          .select('id');
        if (error) throw error;
        if (data?.length !== pallets.length)
          throw new Error('Supabase no eliminó todos los pallets. Verifica los permisos de administrador.');
      }
      if (locations.length) {
        const { error } = await supabaseClient
          .from('locations')
          .delete()
          .in(
            'id',
            locations.map((location) => location.id),
          );
        if (error) throw error;
      }
      for (const rack of racks) {
        const { error } = await supabaseClient.from('racks').delete().eq('id', rack.id);
        if (error) throw error;
      }
      for (const key of deletedLevelKeys) {
        const [rackCode, rawLevel] = key.split('|'),
          rack = state.racks.find((item) => item.code === rackCode);
        if (!rack) continue;
        const disabledLevels = [...new Set([...(rack.disabledLevels || []).map(Number), Number(rawLevel)])];
        const { error } = await supabaseClient.from('racks').update({ disabledLevels }).eq('id', rack.id);
        if (error) throw error;
      }
    }
    for (const pallet of pallets) {
      if (AUTH_DISABLED)
        await logMove('Baja de pallet', pallet.code, pallet.locationId, '', 'Eliminado junto con su ubicación');
      await del('pallets', pallet.id);
    }
    for (const location of locations) await del('locations', location.id);
    for (const rack of racks) await del('racks', rack.id);
    for (const key of deletedLevelKeys) {
      const [rackCode, rawLevel] = key.split('|'),
        rack = state.racks.find((item) => item.code === rackCode);
      if (!rack) continue;
      const disabledLevels = [...new Set([...(rack.disabledLevels || []).map(Number), Number(rawLevel)])];
      await put('racks', { ...rack, disabledLevels });
    }
    await loadState();
    toast('Eliminación en cascada completada.');
  } catch (error) {
    toast('No se pudo completar la eliminación: ' + error.message);
  }
}

function renderAdminTools(refreshUsers = true) {
  if (currentProfile?.role !== 'admin') return;
  const rackMap = new Map(state.racks.map((rack) => [rack.code, rack]));
  state.locations.forEach((location) => {
    const code = locationRackCode(location);
    if (!rackMap.has(code)) rackMap.set(code, { id: code, code, levels: 5 });
  });
  const racks = [...rackMap.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const selectedRack = racks.find((rack) => rack.code === $('positionRack').value) || racks[0];
  $('positionRack').innerHTML = racks
    .map(
      (rack) =>
        `<option value="${escapeHtml(rack.code)}" ${rack.code === selectedRack?.code ? 'selected' : ''}>${escapeHtml(rack.code)}</option>`,
    )
    .join('');
  $('positionLevel').innerHTML = [1, 2, 3, 4, 5]
    .map(
      (level) =>
        `<option value="${level}">Nivel ${level}${(selectedRack?.disabledLevels || []).map(Number).includes(level) ? ' (eliminado; al agregar posiciones se restaura)' : ''}</option>`,
    )
    .join('');
  $('adminStructureList').innerHTML =
    racks
      .map((rack) => {
        const locations = state.locations.filter((location) => locationRackCode(location) === rack.code),
          disabled = new Set((rack.disabledLevels || []).map(Number));
        return `<section class="admin-rack"><div class="admin-rack-head"><label class="admin-select"><input type="checkbox" data-select-rack="${escapeHtml(rack.code)}"><strong>${escapeHtml(rack.code)}</strong></label></div>${[
          1, 2, 3, 4, 5,
        ]
          .map((level) => {
            const positions = locations
                .filter((location) => Number(location.level) === level)
                .sort((a, b) => a.position - b.position),
              inactive = disabled.has(level);
            return `<div class="admin-level ${inactive ? 'inactive' : ''}"><div class="admin-level-head"><label class="admin-select"><input type="checkbox" data-select-level="${escapeHtml(rack.code)}" data-level="${level}"><strong>Nivel ${level}${inactive ? ' · eliminado' : ''}</strong></label>${inactive ? `<button class="mini" data-restore-level="${escapeHtml(rack.code)}" data-level="${level}" data-write>Restaurar</button>` : ''}</div><div class="admin-positions">${positions.map((location) => `<label class="admin-select"><input type="checkbox" data-select-position="${escapeHtml(location.id)}">${escapeHtml(location.code)}</label>`).join('') || '<span class="muted small">Sin posiciones.</span>'}</div></div>`;
          })
          .join('')}</section>`;
      })
      .join('') || '<div class="empty">No hay racks creados.</div>';
  updateStructureSelectionCount();
  if (refreshUsers && !AUTH_DISABLED) renderUserRoles();
  else if (AUTH_DISABLED)
    $('userRoleList').innerHTML =
      '<div class="empty">La administración de cuentas está deshabilitada en el modo local.</div>';
  updateConnectivity();
}

async function addRackPositions(rackCode, level, count) {
  if (!canWrite(true)) return;
  const rack = state.racks.find((item) => item.code === rackCode);
  if (
    !rack ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 5 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 20
  ) {
    toast('Selecciona un rack, nivel y cantidad válidos.');
    return;
  }
  const existing = state.locations.filter(
      (item) => locationRackCode(item) === rackCode && Number(item.level) === level,
    ),
    start = Math.max(0, ...existing.map((item) => Number(item.position) || 0)) + 1;
  if (start + count - 1 > 20) {
    toast('Cada nivel admite hasta 20 posiciones.');
    return;
  }
  const locations = Array.from({ length: count }, (_, index) => {
    const position = start + index,
      code = `${rackCode}-N${String(level).padStart(2, '0')}-P${String(position).padStart(2, '0')}`;
    return { id: code, code, rackId: rackCode, level, position, capacity: 1, createdAt: now() };
  });
  try {
    const disabledLevels = (rack.disabledLevels || []).map(Number).filter((value) => value !== level);
    if (!AUTH_DISABLED) {
      if (disabledLevels.length !== (rack.disabledLevels || []).length) {
        const { error } = await supabaseClient.from('racks').update({ disabledLevels }).eq('id', rack.id);
        if (error) throw error;
      }
      const { error } = await supabaseClient.from('locations').upsert(locations);
      if (error) throw error;
    }
    if (disabledLevels.length !== (rack.disabledLevels || []).length) await put('racks', { ...rack, disabledLevels });
    for (const location of locations) await put('locations', location);
    await loadState();
    toast(`${locations.length} posición(es) agregada(s).`);
  } catch (error) {
    toast('No se pudieron agregar posiciones: ' + error.message);
  }
}

async function deleteStructure(kind, rackCode, level, locationId) {
  let input;
  if (kind === 'rack')
    input = [...document.querySelectorAll('[data-select-rack]')].find((item) => item.dataset.selectRack === rackCode);
  else if (kind === 'level')
    input = [...document.querySelectorAll('[data-select-level]')].find(
      (item) => item.dataset.selectLevel === rackCode && Number(item.dataset.level) === Number(level),
    );
  else
    input = [...document.querySelectorAll('[data-select-position]')].find(
      (item) => item.dataset.selectPosition === locationId,
    );
  if (input) input.checked = true;
  await deleteSelectedStructure();
}

async function restoreRackLevel(rackCode, level) {
  if (!canWrite(true)) return;
  const rack = state.racks.find((item) => item.code === rackCode);
  if (!rack) return;
  const disabledLevels = (rack.disabledLevels || []).map(Number).filter((value) => value !== Number(level));
  try {
    if (!AUTH_DISABLED) {
      const { error } = await supabaseClient.from('racks').update({ disabledLevels }).eq('id', rack.id);
      if (error) throw error;
    }
    await put('racks', { ...rack, disabledLevels });
    await loadState();
    toast(`Nivel ${level} restaurado. Agrega sus posiciones para usarlo.`);
  } catch (error) {
    toast('No se pudo restaurar el nivel: ' + error.message);
  }
}
