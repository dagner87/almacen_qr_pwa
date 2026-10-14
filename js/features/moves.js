/* Pantalla Movimientos. */
function renderMoves() {
  const target = $('moveHistory');
  if (!target) return;
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
