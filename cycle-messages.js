/* ============================================================
   SRP2 Cycle Messages — generates the pre-cycle status message
   each player would receive, in BBCode, ready to paste.

   Reads the same reference data as the combat helper (Actions,
   Items, Bestiary) plus three more: Regions, POI, and location
   tile grids (the same "locations" folder the Aseprite image
   generator already reads). Everything except the character
   sheet — which is live game state, re-uploaded each cycle like
   in the combat tool — can be "baked in" via the Export button,
   so it becomes part of the page itself rather than something
   you re-upload every session.
   ============================================================ */

const state = {
  headers: [],
  characters: [],
  actions: DEFAULT_ACTIONS,
  items: DEFAULT_ITEMS,
  bestiary: DEFAULT_BESTIARY,
  regions: DEFAULT_REGIONS,
  poi: DEFAULT_POI,
  messages: JSON.parse(JSON.stringify(DEFAULT_MESSAGES)),   // { locCode: [text, ...] }
  locations: JSON.parse(JSON.stringify(DEFAULT_LOCATIONS)), // { locCode: [{tileLabel,tileType,tileImage,decorationBorderImage,decorationTileImage}, ...] }
};

// ---------- CSV parsing (same robust parser as the combat helper) ----------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
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
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function num(v, fallback = 0) {
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function findItem(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (!n || n === 'none' || n === '-') return null;
  return state.items.find(it => (it.name || '').trim().toLowerCase() === n) || null;
}

// ---------- Region / POI resolution from a location's tile grid ----------
// Mirrors generateMessages.py exactly: region comes from the first row's
// TileType, POI comes from whatever's on the tile labelled D4 (if anything).
function getRegionForLocation(locCode) {
  const grid = state.locations[locCode];
  if (!grid || !grid.length) return null;
  const tileType = (grid[0].tileType || '').trim();
  if (!tileType) return null;
  return state.regions.find(r => r.name.trim().toLowerCase() === tileType.toLowerCase()) || null;
}

function getPOIForLocation(locCode) {
  const grid = state.locations[locCode];
  if (!grid) return null;
  const d4 = grid.find(t => (t.tileLabel || '').trim().toUpperCase() === 'D4');
  if (!d4 || !d4.decorationTileImage) return null;
  const imgName = d4.decorationTileImage.replace(/\.png$/i, '').trim();
  if (!imgName) return null;
  return state.poi.find(p => p.name.trim().toLowerCase() === imgName.toLowerCase()) || null;
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
      document.getElementById('generate-btn').disabled = false;
      renderOutputEmpty();
    } catch (err) {
      alert('Could not read that CSV: ' + err.message);
    }
  };
  reader.readAsText(file);
});

function makeSimpleUploadHandler(inputId, mapRow, assign) {
  document.getElementById(inputId).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCSV(reader.result);
        const { objs } = rowsToObjects(rows);
        assign(objs.filter(o => o.Name || o.ID).map(mapRow));
      } catch (err) {
        alert('Could not read that CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

makeSimpleUploadHandler('actions-upload', o => ({
  id: num(o.ID, 0), name: o.Name || '', description: o.Description || '', type: o.Type || '',
  rollMin: o['Roll Min'], rollMax: o['Roll Max'], rollNumber: o['Roll number'],
  transform: o.Transform || '', effect: o.Effect || '', trigger: o.Trigger || '', notes: o.Notes || '',
}), (rows) => { state.actions = rows; });

makeSimpleUploadHandler('items-upload', o => ({
  id: num(o.ID, 0), name: o.Name || '', type: o.Type || '', effect: o.Effect || '',
  description: o.Description || '', action: o.Action || '', transform: o.Transform || '',
  value: o.Value || '', stackSize: o['Stack size'] || '', notes: o.Notes || '',
}), (rows) => { state.items = rows; });

makeSimpleUploadHandler('bestiary-upload', o => ({
  id: num(o.ID, 0), name: o.Name || '', description: o.Description || '', notes: o.Notes || '',
  region1: o['Region 1'] || '', region2: o['Region 2'] || '', hp: o.HP || '',
  attackBonus: o['Attack Bonus'] || '', defenceBonus: o['Defence Bonus'] || '', speedBonus: o['Speed Bonus'] || '',
  ability1: o['Ability 1'] || '', ability2: o['Ability 2'] || '', drop1: o['Drop 1'] || '', drop2: o['Drop 2'] || '', value: o.Value || '',
}), (rows) => { state.bestiary = rows; });

makeSimpleUploadHandler('regions-upload', o => ({
  id: num(o.ID, 0), name: o.Name || '', description: o.Description || '',
}), (rows) => { state.regions = rows; });

makeSimpleUploadHandler('poi-upload', o => ({
  id: num(o.ID, 0), name: o.Name || '', description: o.Description || '', action: o.Action || '',
  actionDescription: o['Action description'] || '', notes: o.Notes || '', location: o.Location || '',
}), (rows) => { state.poi = rows; });

// Messages: wide grid (location codes as columns) → tidy { locCode: [text, ...] }, replacing everything.
document.getElementById('messages-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(reader.result);
      const headers = rows[0];
      const result = {};
      rows.slice(1).forEach(row => {
        row.forEach((cell, i) => {
          if (i < headers.length && cell.trim()) {
            const loc = headers[i];
            (result[loc] = result[loc] || []).push(cell.trim());
          }
        });
      });
      state.messages = result;
      renderMessageList();
    } catch (err) {
      alert('Could not read that CSV: ' + err.message);
    }
  };
  reader.readAsText(file);
});

// Locations folder: one CSV per location code (filename minus extension),
// same TileLabel/TileType/TileImage/DecorationBorderImage/DecorationTileImage
// columns the Aseprite script already reads. Parsed by position, not header
// name, since we can't be sure of exact header wording.
document.getElementById('locations-upload').addEventListener('change', (e) => {
  const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.csv'));
  if (!files.length) return;
  let remaining = files.length;
  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCSV(reader.result);
        const locCode = file.name.replace(/\.csv$/i, '');
        const dataRows = rows.slice(1); // skip header row
        state.locations[locCode] = dataRows.map(r => ({
          tileLabel: r[0] || '',
          tileType: r[1] || '',
          tileImage: r[2] || '',
          decorationBorderImage: r[3] || '',
          decorationTileImage: r[4] || '',
        }));
        loaded++;
      } catch (err) {
        console.error('Could not parse', file.name, err);
      }
      remaining--;
      if (remaining === 0) {
        document.getElementById('locations-status').textContent = `${loaded} location grid(s) loaded.`;
      }
    };
    reader.readAsText(file);
  });
});

// ---------- Message editor (quick add/remove without a spreadsheet round-trip) ----------
document.getElementById('add-msg-btn').addEventListener('click', () => {
  const loc = document.getElementById('new-msg-loc').value.trim();
  const text = document.getElementById('new-msg-text').value.trim();
  if (!loc || !text) return;
  (state.messages[loc] = state.messages[loc] || []).push(text);
  document.getElementById('new-msg-loc').value = '';
  document.getElementById('new-msg-text').value = '';
  renderMessageList();
});

function renderMessageList() {
  const list = document.getElementById('msg-list');
  const entries = [];
  Object.keys(state.messages).sort().forEach(loc => {
    state.messages[loc].forEach((text, idx) => entries.push({ loc, text, idx }));
  });
  if (!entries.length) {
    list.innerHTML = '<div class="empty-state" style="padding:14px;">No messages yet.</div>';
    return;
  }
  list.innerHTML = '';
  entries.forEach(({ loc, text, idx }) => {
    const row = document.createElement('div');
    row.className = 'msg-row';
    row.innerHTML = `
      <span class="loc-tag">${escapeHtml(loc)}</span>
      <span class="txt" title="${escapeHtml(text)}">${escapeHtml(text)}</span>
      <button type="button" title="Remove">×</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      state.messages[loc].splice(idx, 1);
      if (!state.messages[loc].length) delete state.messages[loc];
      renderMessageList();
    });
    list.appendChild(row);
  });
}

// ---------- Export updated data.js ----------
document.getElementById('export-data-btn').addEventListener('click', () => {
  const lines = [];
  lines.push('// Shared static reference data for SRP2 tools (combat helper + cycle messages).');
  lines.push('// Regenerated via the "Export updated data.js" button in Cycle Messages.');
  lines.push('');
  lines.push(`const DEFAULT_ACTIONS = ${JSON.stringify(state.actions)};`);
  lines.push(`const DEFAULT_ITEMS = ${JSON.stringify(state.items)};`);
  lines.push(`const DEFAULT_BESTIARY = ${JSON.stringify(state.bestiary)};`);
  lines.push(`const DEFAULT_STATUSES = ${JSON.stringify(typeof DEFAULT_STATUSES !== 'undefined' ? DEFAULT_STATUSES : [])};`);
  lines.push(`const DEFAULT_REGIONS = ${JSON.stringify(state.regions)};`);
  lines.push(`const DEFAULT_POI = ${JSON.stringify(state.poi)};`);
  lines.push('');
  lines.push('// Messages: { locationCode: [messageText, ...] }.');
  lines.push(`const DEFAULT_MESSAGES = ${JSON.stringify(state.messages)};`);
  lines.push('');
  lines.push('// Location tile grids: { locationCode: [{tileLabel, tileType, tileImage, decorationBorderImage, decorationTileImage}, ...] }');
  lines.push(`const DEFAULT_LOCATIONS = ${JSON.stringify(state.locations)};`);
  const blob = new Blob([lines.join('\n')], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data.js';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---------- Cycle message generation ----------
function isEnemyRow(c) {
  return (c['Entity Type'] || 'Player').trim().toLowerCase() === 'enemy';
}
function isKO(c) {
  return (c['Status'] || '').trim().toUpperCase() === 'KO';
}

function getGrantedAction(itemName) {
  const item = findItem(itemName);
  if (!item || !item.action || item.action.trim() === '-') return null;
  const actionName = item.action.trim();
  const actionRow = state.actions.find(a => a.name.trim().toLowerCase() === actionName.toLowerCase());
  return { name: actionName, description: actionRow ? actionRow.description : '' };
}

function buildCycleMessage(player) {
  const loc = player['Current location'];
  const prevLoc = player['Previous location'];
  const cycle = player['Cycle'] || '?';

  let msg = `It is [B]Cycle ${cycle}[/B].\n\n`;
  msg += loc === prevLoc ? `You are at [B]${loc}[/B].\n\n` : `You have arrived at [B]${loc}[/B].\n\n`;

  const region = getRegionForLocation(loc);
  if (region) msg += `${region.description}\n\n`;

  const poi = getPOIForLocation(loc);
  if (poi && poi.description) msg += `${poi.description}\n\n`;

  // Enemies present
  const enemiesHere = state.characters.filter(c => !isKO(c) && isEnemyRow(c) && c['Current location'] === loc);
  if (enemiesHere.length) {
    enemiesHere.forEach(e => {
      const baseName = (e['Base Name'] || e['Name'] || '').trim();
      const entry = state.bestiary.find(b => b.name.trim().toLowerCase() === baseName.toLowerCase());
      const desc = entry ? entry.description : '';
      msg += `There is a [B]${e['Name']}[/B] here. ${desc}\n`;
    });
    msg += '\n';
  }

  // Other players present
  const othersHere = state.characters.filter(c => c !== player && !isEnemyRow(c) && c['Current location'] === loc && !isKO(c));
  if (othersHere.length) {
    msg += 'There are other people here:\n';
    othersHere.forEach(o => { msg += `  - ${o['Name']}\n`; });
    msg += '\n';
  }

  // Corpses — derived live from Status=KO at this location (players and enemies alike),
  // never a separately maintained list, so it can't drift out of sync with combat results.
  const corpsesHere = state.characters.filter(c => c !== player && c['Current location'] === loc && isKO(c));
  if (corpsesHere.length) {
    msg += 'You see some bodies here:\n';
    corpsesHere.forEach(c => { msg += `  - ${c['Name']}\n`; });
    msg += '\n';
  }

  // Messages left at this tile
  const tileMessages = state.messages[loc] || [];
  if (tileMessages.length) {
    msg += 'There are messages here:\n\n';
    msg += '[TABLE width="100%"]\n';
    tileMessages.forEach(m => {
      msg += '[TR]\n';
      msg += `[TD][CENTER][FONT=book antiqua]${m}[/FONT][/CENTER][/TD]\n`;
      msg += '[/TR]\n';
    });
    msg += '[/TABLE]\n\n';
  }

  // Actions: weapon-granted action only shown if there's actually something to fight;
  // inventory-granted actions always shown. Matches generateMessages.py's own logic.
  msg += '[B]Actions[/B]\n';
  const seen = new Set();
  if (enemiesHere.length) {
    const weaponAction = getGrantedAction(player['Equipped weapon']);
    if (weaponAction && !seen.has(weaponAction.name)) {
      seen.add(weaponAction.name);
      msg += `[${weaponAction.name}]` + (weaponAction.description ? ` - ${weaponAction.description}` : '') + '\n';
    }
  }
  for (let i = 1; i <= 6; i++) {
    const invAction = getGrantedAction(player[`Inventory slot ${i}`]);
    if (invAction && !seen.has(invAction.name)) {
      seen.add(invAction.name);
      msg += `[${invAction.name}]` + (invAction.description ? ` - ${invAction.description}` : '') + '\n';
    }
  }

  // Inventory
  msg += '\n[spoiler=Inventory]';
  const invItems = [];
  for (let i = 1; i <= 6; i++) {
    const raw = player[`Inventory slot ${i}`];
    if (raw && raw.trim() && raw.trim().toLowerCase() !== 'none') invItems.push(raw.trim());
  }
  if (invItems.length) {
    invItems.forEach(name => {
      const item = findItem(name);
      if (item) {
        msg += `\n    [B]${item.name}[/B] [SIZE=3](${item.type})[/SIZE]\n`;
        msg += `    [SIZE=3]${item.effect}[/SIZE]\n`;
        msg += `    [SIZE=3][I]${item.description}[/I][/SIZE]\n`;
      } else {
        msg += `\n  - Unknown item (${name})\n`;
      }
    });
  } else {
    msg += '\n  None\n';
  }
  msg += '[/spoiler]';

  return msg;
}

function renderOutputEmpty() {
  document.getElementById('output-body').innerHTML =
    '<div class="empty-state"><span class="big">Ready</span>Click "Generate all cycle messages" to build one message per player.</div>';
}

document.getElementById('generate-btn').addEventListener('click', () => {
  const players = state.characters.filter(c => !isEnemyRow(c));
  const body = document.getElementById('output-body');
  if (!players.length) {
    body.innerHTML = '<div class="empty-state">No player rows found on this sheet.</div>';
    return;
  }
  body.innerHTML = '';
  players.forEach(player => {
    const text = buildCycleMessage(player);
    const card = document.createElement('div');
    card.className = 'player-card';
    card.innerHTML = `
      <div class="player-card-head">
        <h3>${escapeHtml(player['Name'] || '(unnamed)')}</h3>
        <span class="meta">${escapeHtml(player['Current location'] || '')} · Cycle ${escapeHtml(player['Cycle'] || '?')}</span>
      </div>
      <div class="player-card-body">
        <pre class="msg-preview"></pre>
        <div style="margin-top:8px;display:flex;justify-content:flex-end;">
          <button class="copy-btn small" type="button">Copy</button>
        </div>
      </div>
    `;
    card.querySelector('.msg-preview').textContent = text;
    card.querySelector('.copy-btn').addEventListener('click', (ev) => {
      const btn = ev.currentTarget;
      copyText(text);
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1400);
    });
    body.appendChild(card);
  });
});

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  fallbackCopy(text);
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

// ---------- Init ----------
renderMessageList();
renderOutputEmpty();
