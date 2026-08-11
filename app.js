/* ============================================================
   SRP2 Session Ledger — app logic
   All state lives in memory (no localStorage), everything runs
   client-side. Re-upload your CSV each session; export when done.
   ============================================================ */

// ---------- State ----------
const DEFAULT_HEADERS = ['Name','Current location','Previous location','Status','Current HP','Max HP',
  'Attack Bonus','Defence Bonus','Speed Bonus','Equipped weapon','Equipped armour','Equipped trinket',
  'Inventory slot 1','Inventory slot 2','Inventory slot 3','Inventory slot 4','Inventory slot 5','Inventory slot 6',
  'Likes','Bookmark','Cycle'];

const UNDEAD_BESTIARY_NAMES = ['zombie', 'vampire', 'lich'];
// Maps an action's raw Effect suffix (Status<X>) to the actual status name used everywhere else.
const EFFECT_STATUS_MAP = { Burn: 'Burned' };

const state = {
  headers: [],        // original column order from uploaded character sheet, for export
  characters: [],      // array of row objects (mutable)
  actions: DEFAULT_ACTIONS,
  items: DEFAULT_ITEMS,
  bestiary: DEFAULT_BESTIARY,
  attackerIdx: null,
  targetIdx: null,
  selectedActionId: null,
  activeType: 'All',
  rosterFilter: '',
  bestiaryFilter: '',
  turn: 0,
  log: [],             // {id, html, cls}
  logIdCounter: 0,
  mobCounter: 0,
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

// ---------- Items: lookup + effect parsing ----------
// Every mechanical item effect we automate is read straight out of the item's
// free-text "Effect" column with a handful of fixed patterns. Anything an item
// does that doesn't match one of these patterns (regen-per-cycle trinkets, proc
// chances, stat-bonus items) is intentionally left alone — this tool has no
// concept of a "cycle" tick, and stat bonuses are assumed to already be baked
// into the Attack/Defence/Speed Bonus fields on the character sheet.
function findItem(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (!n || n === 'none' || n === '-') return null;
  return state.items.find(it => (it.name || '').trim().toLowerCase() === n) || null;
}

function parseItemEffects(effectText) {
  const out = { immunities: new Set(), immuneAll: false, forcedStatus: null, retaliateStatus: null, retaliateDamage: 0, doubleVsUndead: false };
  const text = effectText || '';
  if (/grants immunity to all status effects/i.test(text)) out.immuneAll = true;
  const immMatch = text.match(/grants immunity to the (\w+) status/i);
  if (immMatch) out.immunities.add(immMatch[1]);
  const forceMatch = text.match(/forces (\w+) on the wearer/i);
  if (forceMatch) out.forcedStatus = forceMatch[1];
  const retStatusMatch = text.match(/attackers receive (\w+)/i);
  if (retStatusMatch) out.retaliateStatus = retStatusMatch[1];
  const retDmgMatch = text.match(/attackers take (\d+) damage/i);
  if (retDmgMatch) out.retaliateDamage = num(retDmgMatch[1], 0);
  if (/doubles damage against the undead/i.test(text)) out.doubleVsUndead = true;
  return out;
}

// Combines the effects of a character's equipped armour + trinket (weapon isn't
// consulted here — weapon damage/transform already comes straight from the
// selected action's own columns).
function getEquippedEffects(character) {
  const combined = { immunities: new Set(), immuneAll: false, forcedStatus: null, retaliateStatus: null, retaliateDamage: 0, doubleVsUndead: false };
  if (!character) return combined;
  [character['Equipped armour'], character['Equipped trinket']].forEach(name => {
    const item = findItem(name);
    if (!item) return;
    const eff = parseItemEffects(item.effect);
    if (eff.immuneAll) combined.immuneAll = true;
    eff.immunities.forEach(s => combined.immunities.add(s));
    if (eff.forcedStatus) combined.forcedStatus = eff.forcedStatus;
    if (eff.retaliateStatus) combined.retaliateStatus = eff.retaliateStatus;
    if (eff.retaliateDamage) combined.retaliateDamage += eff.retaliateDamage;
    if (eff.doubleVsUndead) combined.doubleVsUndead = true;
  });
  return combined;
}

function isImmuneTo(character, statusName) {
  const eff = getEquippedEffects(character);
  return eff.immuneAll || eff.immunities.has(statusName);
}

// Statuses that armour has permanently forced onto the wearer resist being
// cleared by Cure specifically (per SRP2 rules) — everything else can still
// be overwritten normally by a fresh status roll.
const CURE_RESISTANT_FORCED_STATUSES = ['blind', 'zombie'];

function getForcedStatus(character) {
  return getEquippedEffects(character).forcedStatus || null;
}

// Applies (or re-applies) any status an equipped item forces on its wearer.
// Called after CSV upload and whenever equipment changes.
function syncForcedStatus(character) {
  if (!character) return;
  const forced = getForcedStatus(character);
  if (forced) character['Status'] = forced;
}

function hasStatus(character, statusName) {
  if (!character) return false;
  return (character['Status'] || '').trim().toLowerCase() === statusName.toLowerCase();
}

function isUndead(character) {
  if (!character) return false;
  if (character.__undead) return true;
  return hasStatus(character, 'Zombie') || hasStatus(character, 'Vampire');
}

// ---------- Bestiary ----------
function findBestiaryEntry(id) {
  return state.bestiary.find(b => b.id === id) || null;
}

function spawnMob(entry) {
  state.mobCounter += 1;
  const displayName = state.characters.some(c => c['Name'] === entry.name)
    ? `${entry.name} (${state.mobCounter})`
    : entry.name;
  const headers = state.headers.length ? state.headers : DEFAULT_HEADERS.slice();
  if (!state.headers.length) state.headers = headers;
  const c = {};
  headers.forEach(h => { c[h] = ''; });
  const hp = String(num(entry.hp, 1));
  Object.assign(c, {
    'Name': displayName,
    'Current location': '',
    'Status': 'OK',
    'Current HP': hp,
    'Max HP': hp,
    'Attack Bonus': String(num(entry.attackBonus, 0)),
    'Defence Bonus': String(num(entry.defenceBonus, 0)),
    'Speed Bonus': String(num(entry.speedBonus, 0)),
    'Equipped weapon': 'None',
    'Equipped armour': 'None',
    'Equipped trinket': 'None',
  });
  c.__mob = true;
  c.__bestiaryId = entry.id;
  c.__abilities = [entry.ability1, entry.ability2].filter(a => a && a.trim() && a.trim() !== '-');
  c.__undead = UNDEAD_BESTIARY_NAMES.includes((entry.name || '').trim().toLowerCase());
  state.characters.push(c);
  document.getElementById('export-btn').disabled = false;
  renderRoster();
}

function renderBestiaryList() {
  const list = document.getElementById('bestiary-list');
  const filter = state.bestiaryFilter.toLowerCase();
  const filtered = state.bestiary.filter(b => !filter || b.name.toLowerCase().includes(filter));
  list.innerHTML = '';
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">No matches.</div>';
    return;
  }
  filtered.forEach(b => {
    const row = document.createElement('div');
    row.className = 'bestiary-row';
    const abilities = [b.ability1, b.ability2].filter(a => a && a.trim() && a.trim() !== '-').join(', ') || 'None';
    row.innerHTML = `
      <div>
        <div class="bname">${escapeHtml(b.name)}</div>
        <div class="bmeta">HP ${escapeHtml(b.hp)} · ATK ${escapeHtml(b.attackBonus)} · DEF ${escapeHtml(b.defenceBonus)} · SPD ${escapeHtml(b.speedBonus)}</div>
        <div class="babilities">${escapeHtml(abilities)}</div>
      </div>
      <button class="spawn-btn" type="button" title="Add to roster">+</button>
    `;
    row.querySelector('.spawn-btn').addEventListener('click', () => spawnMob(b));
    list.appendChild(row);
  });
}

document.getElementById('toggle-bestiary-btn').addEventListener('click', () => {
  const picker = document.getElementById('bestiary-picker');
  picker.classList.toggle('open');
  if (picker.classList.contains('open')) renderBestiaryList();
});

document.getElementById('bestiary-search').addEventListener('input', (e) => {
  state.bestiaryFilter = e.target.value;
  renderBestiaryList();
});

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
      state.characters.forEach(syncForcedStatus); // e.g. anyone already listed wearing Cursed/Sealed/Molten Armour
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

document.getElementById('items-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(reader.result);
      const { objs } = rowsToObjects(rows);
      state.items = objs.filter(o => o.Name).map(o => ({
        id: num(o.ID, 0),
        name: o.Name || '',
        type: o.Type || '',
        effect: o.Effect || '',
        description: o.Description || '',
        action: o.Action || '',
        transform: o.Transform || '',
        value: o.Value || '',
        stackSize: o['Stack size'] || '',
        notes: o.Notes || '',
      }));
      // Item effects (immunities, forced statuses, etc.) may now read differently — refresh anyone visibly affected.
      state.characters.forEach(syncForcedStatus);
      renderRoster();
      renderDetail();
    } catch (err) {
      alert('Could not read that items CSV: ' + err.message);
    }
  };
  reader.readAsText(file);
});

document.getElementById('bestiary-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(reader.result);
      const { objs } = rowsToObjects(rows);
      state.bestiary = objs.filter(o => o.Name).map(o => ({
        id: num(o.ID, 0),
        name: o.Name || '',
        description: o.Description || '',
        notes: o.Notes || '',
        region1: o['Region 1'] || '',
        region2: o['Region 2'] || '',
        hp: o.HP || '',
        attackBonus: o['Attack Bonus'] || '',
        defenceBonus: o['Defence Bonus'] || '',
        speedBonus: o['Speed Bonus'] || '',
        ability1: o['Ability 1'] || '',
        ability2: o['Ability 2'] || '',
        drop1: o['Drop 1'] || '',
        drop2: o['Drop 2'] || '',
        value: o.Value || '',
      }));
      renderBestiaryList();
    } catch (err) {
      alert('Could not read that bestiary CSV: ' + err.message);
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
        <div class="rname">${escapeHtml(name)}${c.__mob ? '<span class="mob-tag">MOB</span>' : ''}</div>
        <div class="rmeta">${escapeHtml(loc)} · <span class="status-pill ${statusClass}">${escapeHtml(status)}</span> · ${escapeHtml(c['Equipped weapon'] || 'None')}</div>
      </div>
      <div class="rhp">${escapeHtml(c['Current HP'] ?? '')}/${escapeHtml(c['Max HP'] ?? '')}</div>
      ${c.__mob ? '<button class="remove-mob-btn" type="button" title="Remove from roster">×</button>' : '<span></span>'}
    `;
    row.querySelector('[data-role="atk"]').addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.attackerIdx = (state.attackerIdx === idx) ? null : idx;
      state.selectedActionId = null;
      renderRoster(); renderActionList(); renderActionDetail();
    });
    row.querySelector('[data-role="tgt"]').addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.targetIdx = (state.targetIdx === idx) ? null : idx;
      renderRoster(); renderActionDetail();
    });
    const removeBtn = row.querySelector('.remove-mob-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.characters.splice(idx, 1);
        const shift = (i) => (i === null || i === undefined) ? i : (i === idx ? null : (i > idx ? i - 1 : i));
        state.attackerIdx = shift(state.attackerIdx);
        state.targetIdx = shift(state.targetIdx);
        state.detailIdx = shift(state.detailIdx);
        renderRoster(); renderDetail(); renderActionList(); renderActionDetail();
      });
    }
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
      if (key === 'Equipped armour') {
        syncForcedStatus(c); // e.g. equipping Cursed/Sealed/Molten Armour immediately applies its forced status
        renderDetail();
      }
      renderRoster();
      renderActionDetail();
    });
  });
}

// ---------- Actions rendering ----------
function attackerIsMob() {
  const attacker = state.characters[state.attackerIdx];
  return !!(attacker && attacker.__mob);
}

function renderTypeTabs() {
  const wrap = document.getElementById('type-tabs');
  if (attackerIsMob()) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const types = ['All', ...Array.from(new Set(state.actions.map(a => a.type)))];
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
  const attacker = state.characters[state.attackerIdx];

  if (attacker && attacker.__mob) {
    const abilityNames = attacker.__abilities.map(n => n.toLowerCase());
    const filtered = state.actions.filter(a => abilityNames.includes(a.name.toLowerCase()));
    document.getElementById('actions-count').textContent = `${attacker['Name']}'s abilities`;
    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">This monster has no usable abilities on file.</div>';
      return;
    }
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
    return;
  }

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
    ${a.transform && attacker ? `<div class="warn-line" style="color:var(--text-muted);border-color:var(--border-soft);background:transparent;">Attacker's weapon right now: <strong>${escapeHtml(attacker['Equipped weapon'] || 'None')}</strong></div>` : ''}
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
// This is applied unconditionally, purely as an outcome of using the action — there is
// no "required weapon" check anywhere; you're choosing the action yourself.
function applyTransform(a, attacker) {
  if (!a.transform || !attacker) return null;
  const prev = attacker['Equipped weapon'] || 'None';
  attacker['Equipped weapon'] = a.transform;
  if (prev.trim().toLowerCase() === a.transform.trim().toLowerCase()) {
    return `${attacker['Name']}'s weapon stays "${a.transform}".`;
  }
  return `${attacker['Name']}'s weapon changes from "${prev}" to "${a.transform}".`;
}

// Rolls the target's own status-effect chance for this action's Effect column
// (a coinflip, unless it's an outright buff), respecting immunity. Returns a
// short note describing what happened, or '' if there was nothing to roll.
function rollAbilityEffect(a, attacker, target) {
  const effect = a.effect || '';
  const buffMatch = /^BuffAB(-?\d+)$/.exec(effect);
  if (buffMatch) {
    if (!attacker) return '';
    const delta = num(buffMatch[1], 0);
    attacker['Attack Bonus'] = String(num(attacker['Attack Bonus'], 0) + delta);
    return `${attacker['Name']} gains ${delta >= 0 ? '+' : ''}${delta} Attack Bonus.`;
  }
  const statusMatch = /^Status(.+)$/.exec(effect);
  if (!statusMatch || !target) return '';
  const raw = statusMatch[1];
  const statusName = EFFECT_STATUS_MAP[raw] || raw;
  if (isImmuneTo(target, statusName)) {
    return `${target['Name']} is immune to ${statusName} — no effect.`;
  }
  if (Math.random() < 0.5) {
    target['Status'] = statusName;
    return `${target['Name']} is now ${statusName}!`;
  }
  return `${statusName} attempt failed.`;
}

// Applies a defending item's passive retaliation (e.g. Thorned Breastplate,
// Molten Armour) back onto the attacker, whenever the defender is hit by a
// damaging action. This is guaranteed, not a coinflip — it's a gear effect,
// not an ability roll.
function applyRetaliation(target, attacker) {
  const notes = [];
  if (!target || !attacker) return notes;
  const eff = getEquippedEffects(target);
  if (eff.retaliateDamage > 0) {
    const newHP = Math.max(0, num(attacker['Current HP']) - eff.retaliateDamage);
    attacker['Current HP'] = String(newHP);
    notes.push(`${attacker['Name']} takes ${eff.retaliateDamage} retaliation damage from ${target['Name']}'s armour.`);
  }
  if (eff.retaliateStatus) {
    if (isImmuneTo(attacker, eff.retaliateStatus)) {
      notes.push(`${attacker['Name']} is immune to the retaliation status.`);
    } else {
      attacker['Status'] = eff.retaliateStatus;
      notes.push(`${attacker['Name']} receives ${eff.retaliateStatus} from ${target['Name']}'s armour.`);
    }
  }
  return notes;
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
    let resultLine = a.type === 'StatusClear' ? 'Status effects cleared.' : 'No roll — narrative action.';
    let cureNote = '';
    if (a.type === 'StatusClear' && /^StatusOK$/i.test(a.effect || '') && target) {
      const forced = (getForcedStatus(target) || '').toLowerCase();
      if (CURE_RESISTANT_FORCED_STATUSES.includes(forced)) {
        resultLine = 'Cure failed.';
        cureNote = `${target['Name']}'s ${forced[0].toUpperCase() + forced.slice(1)} status is forced by their armour — Cure can't remove it while it's equipped.`;
      } else {
        target['Status'] = 'OK';
      }
    }
    addLogEntry({
      cls: 'info',
      atk: attacker ? attacker['Name'] : '—',
      action: a.name,
      tgt: target ? target['Name'] : null,
      rollLine: '',
      resultLine,
      note: [cureNote, a.effect && !/^StatusOK$/i.test(a.effect) ? `Effect: ${a.effect}` : '', transformNote].filter(Boolean).join(' — '),
    });
    renderRoster(); renderDetail(); renderActionDetail();
    return;
  }

  const isHeal = a.type === 'HealRange';
  const isDamageType = !isHeal;
  const targetBurned = isDamageType && hasStatus(target, 'Burned');

  // roll dice — a Burned target takes +1 on every individual die, not just once on the total
  const rolls = [];
  for (let i = 0; i < Math.max(count, 0); i++) {
    let die = rollDie(min, max);
    if (targetBurned) die += 1;
    rolls.push(die);
  }
  const rollSum = rolls.reduce((s, v) => s + v, 0);

  const atkBonus = num(attacker ? attacker['Attack Bonus'] : 0);
  const defBonus = num(target ? target['Defence Bonus'] : 0);

  let ignoreArmour = /ignorearmour/i.test(a.effect || '');
  let punishArmour = /punisharmour/i.test(a.effect || '');

  let total;
  let armourNote = '';
  let undeadNote = '';
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

    const atkEffects = getEquippedEffects(attacker);
    if (atkEffects.doubleVsUndead && isUndead(target)) {
      total *= 2;
      undeadNote = `${target['Name']} is undead — Ferryman's Lantern doubles the damage.`;
    }
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
  note = [note, undeadNote].filter(Boolean).join(' ');

  // Passive retaliation from the target's own armour (Thorned Breastplate, Molten Armour, etc.)
  const retaliationNotes = isDamageType ? applyRetaliation(target, attacker) : [];

  // The ability's own status-effect chance (coinflip, unless it's a guaranteed buff)
  const effectNote = rollAbilityEffect(a, attacker, target);

  const transformNote = applyTransform(a, attacker);

  addLogEntry({
    cls,
    atk: attacker ? attacker['Name'] : '—',
    action: a.name,
    tgt: target ? target['Name'] : '—',
    rollLine: count > 0 ? `${count}× [${min}–${max}]${targetBurned ? ' +1 Burned' : ''} → [${rolls.join(', ')}] = ${rollSum}   ${isHeal ? '' : `(+${atkBonus} ATK ${punishArmour ? '+' : '−'}${defBonus} DEF)`}` : 'No dice — flat effect.',
    resultLine,
    note: [note, ...retaliationNotes, effectNote, transformNote].filter(Boolean).join(' — '),
  });

  renderRoster();
  renderDetail();
  renderActionDetail();
}

function addLogEntry(entry) {
  const atk = entry.atk || '—';
  const action = entry.action || '';
  const tgt = entry.tgt;
  const title = `${atk} uses ${action}${tgt ? ' on ' + tgt : ''}`;
  const bbTitle = `[b]${atk}[/b] uses [b]${action}[/b]${tgt ? ' on [b]' + tgt + '[/b]' : ''}`;
  state.logIdCounter = (state.logIdCounter || 0) + 1;
  state.log.push({ ...entry, title, bbTitle, id: state.logIdCounter, turn: state.turn, ts: new Date() });
  renderLedger();
}

// Builds a BBCode block (for XenForo-style forums) from a ledger entry:
// bold names/action on the title line, the dice breakdown shrunk and muted,
// the result bolded and colour-coded (green for heals, red for damage),
// and any note in italics.
function toBBCode(e) {
  const lines = [e.bbTitle];
  if (e.rollLine) {
    lines.push(`[size=1][color=#8b8f9c]${e.rollLine}[/color][/size]`);
  }
  if (e.resultLine) {
    const color = e.cls === 'heal' ? '#2e7d4f' : (e.cls === 'dmg' ? '#b0362b' : null);
    lines.push(color ? `[b][color=${color}]${e.resultLine}[/color][/b]` : `[b]${e.resultLine}[/b]`);
  }
  if (e.note) lines.push(`[i]${e.note}[/i]`);
  return lines.join('\n');
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  fallbackCopy(text);
  return Promise.resolve();
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* no-op */ }
  document.body.removeChild(ta);
}

function renderLedger() {
  const body = document.getElementById('ledger-body');
  if (!state.log.length) {
    body.innerHTML = '<div class="empty-state">Rolls you make will appear here, most recent first. Click any entry\'s "Copy for forum" button to grab a BBCode version for XenForo.</div>';
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
      <div class="ledger-actions">
        <button class="copy-btn" type="button" data-id="${e.id}">Copy for forum</button>
      </div>
      <pre class="bbcode-preview"><button class="preview-close" type="button" title="Hide">×</button></pre>
    `;
    body.appendChild(div);
  });
}

document.getElementById('ledger-body').addEventListener('click', (ev) => {
  const closeBtn = ev.target.closest('.preview-close');
  if (closeBtn) {
    closeBtn.closest('.bbcode-preview').classList.remove('show');
    return;
  }
  const btn = ev.target.closest('.copy-btn');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const entry = state.log.find(x => x.id === id);
  if (!entry) return;
  const text = toBBCode(entry);
  copyText(text);
  const entryEl = btn.closest('.ledger-entry');
  const preview = entryEl.querySelector('.bbcode-preview');
  preview.textContent = text;
  const closeEl = document.createElement('button');
  closeEl.className = 'preview-close';
  closeEl.type = 'button';
  closeEl.title = 'Hide';
  closeEl.textContent = '×';
  preview.appendChild(closeEl);
  preview.classList.add('show');
  const original = btn.textContent;
  btn.textContent = 'Copied!';
  btn.classList.add('copied');
  clearTimeout(btn._resetTimer);
  btn._resetTimer = setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
  }, 1400);
});

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
