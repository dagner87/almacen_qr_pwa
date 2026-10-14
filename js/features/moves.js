/* Pantalla Movimientos. */
function renderRotation() {
  const target = $('rotationList');
  if (!target) return;
  const days = Number($('rotationRange').value || 0),
    since = days ? Date.now() - days * 86400000 : 0,
    rows = productRotation(since).slice(0, 15);
  target.innerHTML = rows.length
    ? `<table class="rotation-table"><thead><tr><th>#</th><th>Producto</th><th>Mov.</th><th>Ajustes</th><th>Altas</th><th>Último</th></tr></thead><tbody>${rows
        .map(
          (row, index) =>
            `<tr><td>${index + 1}</td><td><strong>${escapeHtml(row.code)}</strong><br><small>${escapeHtml(row.description)}</small></td><td>${row.movimientos}</td><td>${row.ajustes}</td><td>${row.altas}</td><td>${escapeHtml(formatDateTime(row.last))}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<div class="empty">Aún no hay movimientos en este periodo.</div>';
}

function renderMoves() {
  const target = $('moveHistory');
  if (!target) return;
  renderRotation();
  const list = [...state.moves].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  target.className = 'list' + (list.length ? '' : ' empty');
  target.innerHTML = list.length
    ? list
        .map(
          (move) =>
            `<article class="item"><div class="item-main"><div class="item-title">${escapeHtml(move.action || 'Movimiento')} · ${escapeHtml(move.palletId || '')}</div><div class="item-sub">${escapeHtml(move.from ? locLabel(move.from) : '')} ${move.to ? '→ ' + escapeHtml(locLabel(move.to)) : ''} ${escapeHtml(move.details || '')}</div><small>${escapeHtml(move.actor_email || move.actorEmail || 'Registro histórico sin usuario')} · ${new Date(move.at).toLocaleString()}</small></div></article>`,
        )
        .join('')
    : 'No hay movimientos registrados.';
}
