/* ============================================================
   SRP2 Session Ledger — app logic
   All state lives in memory (no localStorage), everything runs
   client-side. Re-upload your CSV each session; export when done.
   ============================================================ */

// ---------- State ----------
const state = {
  headers: [],        // original column order from uploaded character sheet, for export
  characters: [],      // array of row objects (mutable)
  actions: DEFAULT_ACTIONS,
  attackerIdx: null,
  targetIdx: null,
  selectedActionId: null,
  activeType: 'All',
  rosterFilter: '',
  turn: 0,
  log: [],             // {id, html, cls}
};

// ---------- CSV parsing (handles quoted fields, commas, CRLF) ----------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // normalize line endings
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip, \n follows */ }
      else { field += c; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // drop trailing empty rows
  while (rows.length && rows[rows.length - 1].every(f => f === '')) rows.pop();
  return rows;
}

function rowsToObjects(rows) {
  const headers = rows[0];
  const objs = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ''; });
    return o;
  });
  return { headers, objs };
}

function toCSV(headers, objs) {
  const esc = (v) => {
    v = (v === undefined || v === null) ? '' : String(v);
    if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  };
  const lines = [headers.map(esc).join(',')];
  objs.forEach(o => lines.push(headers.map(h => esc(o[h])).join(',')));
  return lines.join('\r\n');
}

// ---------- Number helpers ----------
function num(v, fallback = 0) {
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// ---------- File uploads ----------
document.getElementById('sheet-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(reader.result);
      const { headers, objs } = rowsToObjects(rows);
      state.headers = headers;
      state.characters = objs;
      state.attackerIdx = null;
      state.targetIdx = null;
      document.getElementById('export-btn').disabled = false;
      renderRoster();
      renderDetail();
    } catch (err) {
      alert('Could not read that CSV: ' + err.message);
    }
  };
  reader.readAsText(file);
});

document.getElementById('actions-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(reader.result);
      const { objs } = rowsToObjects(rows);
      state.actions = objs.map(o => ({
        id: num(o.ID, 0),
        name: o.Name || '',
        description: o.Description || '',
        type: o.Type || 'Miscellaneous',
        rollMin: o['Roll Min'] || '',
        rollMax: o['Roll Max'] || '',
        rollNumber: o['Roll number'] || '',
        transform: o.Transform || '',
        effect: o.Effect || '',
        trigger: o.Trigger || '',
        notes: o.Notes || '',
      }));
      state.selectedActionId = null;
      renderTypeTabs();
      renderActionList();
      renderActionDetail();
    } catch (err) {
      alert('Could not read that actions CSV: ' + err.message);
    }
  };
  reader.readAsText(file);
});

document.getElementById('export-btn').addEventListener('click', () => {
  const csv = toCSV(state.headers, state.characters);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'character-sheets-updated.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById('roster-search').addEventListener('input', (e) => {
  state.rosterFilter = e.target.value.toLowerCase();
  renderRoster();
});

document.getElementById('clear-log-btn').addEventListener('click', () => {
  state.log = [];
  renderLedger();
});

// ---------- Roster rendering ----------
function renderRoster() {
  const list = document.getElementById('roster-list');
  document.getElementById('roster-count').textContent = state.characters.length ? state.characters.length + ' loaded' : '';
  if (!state.characters.length) {
    list.innerHTML = '<div class="empty-state"><span class="big">No sheet loaded</span>Upload a character sheet CSV to begin.</div>';
    return;
  }
  const filter = state.rosterFilter;
  list.innerHTML = '';
  state.characters.forEach((c, idx) => {
    const name = (c['Name'] || '(unnamed)');
    const loc = c['Current location'] || '';
    if (filter && !(name.toLowerCase().includes(filter) || loc.toLowerCase().includes(filter))) return;
    const row = document.createElement('div');
    row.className = 'roster-row' + (idx === state.attackerIdx || idx === state.targetIdx ? ' is-selected' : '');
    const status = (c['Status'] || 'OK').trim();
    const statusClass = status.toUpperCase() === 'OK' ? 'ok' : 'other';
    row.innerHTML = `
      <div class="rtags">
        <span class="rtag ${idx === state.attackerIdx ? 'on-atk' : ''}" data-role="atk" title="Set as attacker">ATK</span>
        <span class="rtag ${idx === state.targetIdx ? 'on-tgt' : ''}" data-role="tgt" title="Set as target">TGT</span>
      </div>
      <div>
        <div class="rname">${escapeHtml(name)}</div>
        <div class="rmeta">${escapeHtml(loc)} · <span class="status-pill ${statusClass}">${escapeHtml(status)}</span></div>
      </div>
      <div class="rhp">${escapeHtml(c['Current HP'] ?? '')}/${escapeHtml(c['Max HP'] ?? '')}</div>
    `;
    row.querySelector('[data-role="atk"]').addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.attackerIdx = (state.attackerIdx === idx) ? null : idx;
      renderRoster(); renderActionDetail();
    });
    row.querySelector('[data-role="tgt"]').addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.targetIdx = (state.targetIdx === idx) ? null : idx;
      renderRoster(); renderActionDetail();
    });
    row.addEventListener('click', () => {
      state.detailIdx = idx;
      renderDetail();
    });
    list.appendChild(row);
  });
}

// ---------- Character detail rendering ----------
function renderDetail() {
  const body = document.getElementById('detail-body');
  const idx = state.detailIdx;
  if (idx === undefined || idx === null || !state.characters[idx]) {
    body.innerHTML = '<div class="empty-state"><span class="big">Nothing selected</span>Choose a character from the roster to view and edit their sheet.</div>';
    return;
  }
  const c = state.characters[idx];
  const hpPct = clamp((num(c['Current HP']) / Math.max(1, num(c['Max HP']))) * 100, 0, 100);

  const editableStat = (key, label) => `
    <div class="stat-box">
      <span class="k">${label}</span>
      <input type="number" data-key="${key}" value="${escapeAttr(c[key] ?? 0)}">
    </div>`;

  const equipField = (key, label) => `
    <div class="field-row">
      <span class="k">${label}</span>
      <input type="text" data-key="${key}" value="${escapeAttr(c[key] ?? '')}">
    </div>`;

  body.innerHTML = `
    <div class="char-head">
      <div>
        <h3 contenteditable="false">${escapeHtml(c['Name'] || '(unnamed)')}</h3>
        <div class="loc">${escapeHtml(c['Current location'] || '—')} ${c['Previous location'] ? '· from ' + escapeHtml(c['Previous location']) : ''}</div>
      </div>
    </div>

    <div class="hp-block">
      <div class="hp-row">
        <span class="label">HP</span>
        <span class="value"><input type="number" id="hp-current" data-key="Current HP" value="${escapeAttr(c['Current HP'] ?? 0)}" style="width:3.2em;background:transparent;border:none;color:inherit;font:inherit;text-align:right;"> / <input type="number" id="hp-max" data-key="Max HP" value="${escapeAttr(c['Max HP'] ?? 0)}" style="width:3.2em;background:transparent;border:none;color:inherit;font:inherit;"></span>
      </div>
      <div class="hp-bar-track"><div class="hp-bar-fill" id="hp-bar-fill" style="width:${hpPct}%;"></div></div>
    </div>

    <div class="section-label">Bonuses</div>
    <div class="stat-grid">
      ${editableStat('Attack Bonus', 'Attack')}
      ${editableStat('Defence Bonus', 'Defence')}
      ${editableStat('Speed Bonus', 'Speed')}
    </div>

    <div class="section-label">Status</div>
    <div class="field-row">
      <span class="k">Status</span>
      <input type="text" data-key="Status" value="${escapeAttr(c['Status'] ?? '')}">
    </div>
    <div class="field-row">
      <span class="k">Location</span>
      <input type="text" data-key="Current location" value="${escapeAttr(c['Current location'] ?? '')}">
    </div>

    <div class="section-label">Equipment</div>
    <div class="equip-grid">
      ${equipField('Equipped weapon', 'Weapon')}
      ${equipField('Equipped armour', 'Armour')}
    </div>
    ${equipField('Equipped trinket', 'Trinket')}

    <div class="section-label">Inventory</div>
    <div class="equip-grid">
      ${equipField('Inventory slot 1','Slot 1')}
      ${equipField('Inventory slot 2','Slot 2')}
      ${equipField('Inventory slot 3','Slot 3')}
      ${equipField('Inventory slot 4','Slot 4')}
      ${equipField('Inventory slot 5','Slot 5')}
      ${equipField('Inventory slot 6','Slot 6')}
    </div>
  `;

  body.querySelectorAll('input[data-key]').forEach(inp => {
    inp.addEventListener('change', () => {
      const key = inp.dataset.key;
      c[key] = inp.value;
      if (key === 'Current HP' || key === 'Max HP') {
        const pct = clamp((num(c['Current HP']) / Math.max(1, num(c['Max HP']))) * 100, 0, 100);
        const fill = document.getElementById('hp-bar-fill');
        if (fill) fill.style.width = pct + '%';
      }
      renderRoster();
    });
  });
}

// ---------- Actions rendering ----------
function renderTypeTabs() {
  const types = ['All', ...Array.from(new Set(state.actions.map(a => a.type)))];
  const wrap = document.getElementById('type-tabs');
  wrap.innerHTML = '';
  types.forEach(t => {
    const tab = document.createElement('span');
    tab.className = 'type-tab' + (state.activeType === t ? ' active' : '');
    tab.textContent = t;
    tab.addEventListener('click', () => { state.activeType = t; renderActionList(); });
    wrap.appendChild(tab);
  });
}

function renderActionList() {
  renderTypeTabs();
  const list = document.getElementById('action-list');
  document.getElementById('actions-count').textContent = state.actions.length + ' actions';
  const filtered = state.actions.filter(a => state.activeType === 'All' || a.type === state.activeType);
  list.innerHTML = '';
  filtered.forEach(a => {
    const row = document.createElement('div');
    row.className = 'action-row' + (a.id === state.selectedActionId ? ' is-selected' : '');
    row.innerHTML = `<span class="aname">${escapeHtml(a.name)}</span><span class="atype mono">${escapeHtml(a.type)}</span>`;
    row.addEventListener('click', () => {
      state.selectedActionId = a.id;
      renderActionList();
      renderActionDetail();
    });
    list.appendChild(row);
  });
}

function formulaText(a) {
  const n = a.rollNumber === 'entityNum' ? '(per target)' : (num(a.rollNumber, 0));
  if (a.type === 'Miscellaneous' || a.type === 'StatusClear') return 'No dice roll for this action.';
  if (n === 0 && num(a.rollMin) === 0 && num(a.rollMax) === 0) return 'No dice roll — effect only.';
  return `Roll ${n}× [${a.rollMin} to ${a.rollMax}]${a.type.startsWith('Damage') ? ', then + Attack Bonus − Defence Bonus' : ''}`;
}

function renderActionDetail() {
  const wrap = document.getElementById('action-detail');
  const a = state.actions.find(x => x.id === state.selectedActionId);
  if (!a) {
    wrap.innerHTML = '<div class="empty-state">Select an action to see its formula.</div>';
    return;
  }
  const attacker = state.characters[state.attackerIdx];
  const target = state.characters[state.targetIdx];

  // Transform is a single item name (may itself contain a comma, e.g. "Kusarigama, Sickle")
  // representing what the attacker's weapon becomes after using this action — not a list
  // of acceptable weapons. If the attacker is already holding that exact item, using the
  // action again would be a no-op, so we just flag it rather than blocking anything.
  let warn = '';
  if (a.transform && attacker) {
    const current = (attacker['Equipped weapon'] || '').trim().toLowerCase();
    if (current === a.transform.trim().toLowerCase()) {
      warn = `<div class="warn-line">Attacker's weapon is already "${escapeHtml(a.transform)}" — using this action will leave it unchanged.</div>`;
    }
  }
  const needsAttacker = a.type !== 'Miscellaneous';
  const needsTarget = a.type !== 'Miscellaneous';

  wrap.innerHTML = `
    <h4>${escapeHtml(a.name)}</h4>
    <div class="desc">${escapeHtml(a.description)}</div>
    <div class="formula-chip">${escapeHtml(formulaText(a))}</div>
    <div class="meta-tags">
      <span class="meta-tag">${escapeHtml(a.type)}</span>
      ${a.effect ? `<span class="meta-tag">Effect: ${escapeHtml(a.effect)}</span>` : ''}
      ${a.trigger ? `<span class="meta-tag">Target: ${escapeHtml(a.trigger)}</span>` : ''}
      ${a.transform ? `<span class="meta-tag">Weapon becomes: ${escapeHtml(a.transform)}</span>` : ''}
    </div>
    ${warn}
    ${a.notes ? `<div class="desc" style="opacity:.75;"><em>${escapeHtml(a.notes)}</em></div>` : ''}
    <div class="roll-cta">
      <button class="primary" id="roll-btn" ${(needsAttacker && !attacker) || (needsTarget && !target) ? 'disabled' : ''}>
        ${a.type === 'Miscellaneous' ? 'Log action' : 'Roll & apply'}
      </button>
    </div>
    ${(needsAttacker && !attacker) || (needsTarget && !target) ? '<div class="warn-line" style="margin-top:8px;">Set an ATK and TGT in the roster first.</div>' : ''}
  `;

  const rollBtn = document.getElementById('roll-btn');
  if (rollBtn) rollBtn.addEventListener('click', () => performAction(a));
}

// ---------- Dice + resolution ----------
function rollDie(min, max) {
  // inclusive range, supports negative min
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// If the action has a Transform value, the attacker's equipped weapon becomes that
// exact item (e.g. Chain Lash -> "Kusarigama, Sickle", Sickle Slash -> "Kusarigama, Chain").
// Transform is a single item name, even when it contains a comma — never split it.
function applyTransform(a, attacker) {
  if (!a.transform || !attacker) return null;
  const prev = attacker['Equipped weapon'] || 'None';
  if (prev.trim().toLowerCase() === a.transform.trim().toLowerCase()) return null; // already there
  attacker['Equipped weapon'] = a.transform;
  return `${attacker['Name']}'s weapon changes from "${prev}" to "${a.transform}".`;
}

function performAction(a) {
  state.turn += 1;
  const attacker = state.characters[state.attackerIdx];
  const target = state.characters[state.targetIdx];
  const min = num(a.rollMin, 0);
  const max = num(a.rollMax, 0);
  let count = a.rollNumber === 'entityNum' ? 1 : num(a.rollNumber, 0); // single target only, so entityNum -> 1

  if (a.type === 'Miscellaneous' || a.type === 'StatusClear') {
    const transformNote = applyTransform(a, attacker);
    addLogEntry({
      cls: 'info',
      title: `${attacker ? attacker['Name'] : '—'} uses ${a.name}${target ? ' on ' + target['Name'] : ''}`,
      rollLine: '',
      resultLine: a.type === 'StatusClear' ? 'Status effects cleared.' : 'No roll — narrative action.',
      note: [a.effect ? `Effect: ${a.effect}` : '', transformNote].filter(Boolean).join(' — '),
    });
    if (transformNote) { renderRoster(); renderDetail(); renderActionDetail(); }
    return;
  }

  // roll dice
  const rolls = [];
  for (let i = 0; i < Math.max(count, 0); i++) rolls.push(rollDie(min, max));
  const rollSum = rolls.reduce((s, v) => s + v, 0);

  const atkBonus = num(attacker ? attacker['Attack Bonus'] : 0);
  const defBonus = num(target ? target['Defence Bonus'] : 0);

  let ignoreArmour = /ignorearmour/i.test(a.effect || '');
  let punishArmour = /punisharmour/i.test(a.effect || '');

  let isHeal = a.type === 'HealRange';
  let total;
  let armourNote = '';
  if (isHeal) {
    total = Math.max(0, rollSum); // heals don't apply attack/defence bonuses
  } else {
    if (ignoreArmour) {
      total = rollSum + atkBonus;
      armourNote = 'Armour ignored.';
    } else if (punishArmour) {
      total = rollSum + atkBonus + defBonus;
      armourNote = "Target's Defence Bonus added to damage instead of reducing it.";
    } else {
      total = rollSum + atkBonus - defBonus;
    }
    total = Math.max(0, total);
  }

  let resultLine, cls, note = armourNote;
  if (isHeal) {
    cls = 'heal';
    if (target) {
      const newHP = clamp(num(target['Current HP']) + total, 0, num(target['Max HP'], total));
      target['Current HP'] = String(newHP);
    }
    resultLine = `+${total} HP`;
  } else {
    cls = 'dmg';
    if (target) {
      const newHP = Math.max(0, num(target['Current HP']) - total);
      target['Current HP'] = String(newHP);
      if (newHP === 0 && (target['Status'] || '').toUpperCase() === 'OK') {
        target['Status'] = 'KO';
        note += (note ? ' ' : '') + `${target['Name']} dropped to 0 HP — status set to KO.`;
      }
    }
    resultLine = `−${total} HP`;
  }

  const effectNote = (a.effect && !ignoreArmour && !punishArmour) ? `Effect: ${a.effect} (apply manually if it triggers)` : '';
  const transformNote = applyTransform(a, attacker);

  addLogEntry({
    cls,
    title: `${attacker ? attacker['Name'] : '—'} uses ${a.name} on ${target ? target['Name'] : '—'}`,
    rollLine: count > 0 ? `${count}× [${min}–${max}] → [${rolls.join(', ')}] = ${rollSum}   ${isHeal ? '' : `(+${atkBonus} ATK ${punishArmour ? '+' : '−'}${defBonus} DEF)`}` : 'No dice — flat effect.',
    resultLine,
    note: [note, effectNote, transformNote].filter(Boolean).join(' — '),
  });

  renderRoster();
  renderDetail();
  renderActionDetail();
}

function addLogEntry(entry) {
  state.log.push({ ...entry, turn: state.turn, ts: new Date() });
  renderLedger();
}

function renderLedger() {
  const body = document.getElementById('ledger-body');
  if (!state.log.length) {
    body.innerHTML = '<div class="empty-state">Rolls you make will appear here, most recent first.</div>';
    return;
  }
  body.innerHTML = '';
  // column-reverse container + natural order => append in order, newest ends up on top visually
  state.log.forEach(e => {
    const div = document.createElement('div');
    div.className = 'ledger-entry ' + e.cls;
    div.innerHTML = `
      <div class="ledger-top">
        <span class="ledger-title">${escapeHtml(e.title)}</span>
        <span class="ledger-turn">#${e.turn} · ${e.ts.toLocaleTimeString()}</span>
      </div>
      ${e.rollLine ? `<div class="ledger-roll">${escapeHtml(e.rollLine)}</div>` : ''}
      <div class="ledger-result ${e.cls}">${escapeHtml(e.resultLine)}</div>
      ${e.note ? `<div class="ledger-note">${escapeHtml(e.note)}</div>` : ''}
    `;
    body.appendChild(div);
  });
}

// ---------- Utility ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ---------- Init ----------
renderTypeTabs();
renderActionList();
renderActionDetail();
renderRoster();
renderDetail();
renderLedger();
