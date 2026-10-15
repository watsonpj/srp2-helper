window.SRP2_BUILDS = window.SRP2_BUILDS || {}; window.SRP2_BUILDS['cycle-messages.js'] = '2026-10-14d'; // srp2-build-stamp
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

// Same reasoning as app.js: if data.js didn't load, fail loudly and visibly
// instead of silently — every button on this page depends on it.
// Same reasoning as app.js: if data.js didn't load, fail loudly and visibly instead of silently. This checks every global the page needs,
// not just the first, because an OLD cached data.js can have some of them and not others, and the page would otherwise stop part-way.
const REQUIRED_DATA = ['DEFAULT_ACTIONS', 'DEFAULT_ITEMS', 'DEFAULT_BESTIARY', 'DEFAULT_REGIONS', 'DEFAULT_POI', 'DEFAULT_MESSAGES', 'DEFAULT_LOCATIONS'];
const missingData = REQUIRED_DATA.filter(name => new Function('return typeof ' + name)() === 'undefined');
if (missingData.length) {
  document.body.innerHTML = `
    <div style="max-width:640px;margin:60px auto;padding:24px 28px;font-family:monospace;
                color:#e7e5df;background:#1c1f28;border:1px solid #c1554a;border-radius:8px;">
      <h2 style="color:#c1554a;margin-top:0;">data.js is missing or out of date</h2>
      <p>This page needs <code>data.js</code> in the same folder as <code>cycle-messages.html</code>, and it is missing:
      <code>${missingData.join(', ')}</code>.</p>
      <p>Most likely the browser is showing an OLD saved copy of <code>data.js</code>. Press <b>Ctrl+F5</b> to reload without the cache.
      If that does not help, check that the current <code>data.js</code> was uploaded next to this page.</p>
    </div>`;
  throw new Error('data.js is missing: ' + missingData.join(', '));
}

const state = {
  headers: [],
  characters: [],
  actions: DEFAULT_ACTIONS,
  items: DEFAULT_ITEMS,
  bestiary: DEFAULT_BESTIARY,
  regions: DEFAULT_REGIONS,
  poi: DEFAULT_POI,
  statuses: (typeof DEFAULT_STATUSES !== 'undefined' ? DEFAULT_STATUSES : []),
  winConditions: (typeof DEFAULT_WIN_CONDITIONS !== 'undefined' ? DEFAULT_WIN_CONDITIONS : []),   // optional: an older data.js simply has none
  messages: JSON.parse(JSON.stringify(DEFAULT_MESSAGES)),   // { locCode: [text, ...] }
  locations: JSON.parse(JSON.stringify(DEFAULT_LOCATIONS)), // { locCode: [{tileLabel,tileType,tileImage,decorationBorderImage,decorationTileImage}, ...] }
};

// ---------- CSV parsing (same robust parser as the combat helper) ----------
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // a UTF-8 byte-order mark would turn the first header into "\ufeffName"
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
// The sheet needs at least these; everything else the page reads is optional and simply left blank if absent.
const REQUIRED_SHEET_COLUMNS = ['Name', 'Current location'];
const sheetInput = document.getElementById('sheet-upload');
const sheetStatus = document.getElementById('sheet-status');
function setSheetStatus(text, isError) {
  sheetStatus.textContent = text;
  sheetStatus.classList.toggle('error', !!isError);
}
function rejectSheet(message) {
  state.characters = [];
  state.headers = [];
  renderOutputEmpty();   // back to "No character sheet loaded", with Generate disabled
  setSheetStatus('Could not use that file: ' + message, true);
  alert('Could not read that CSV: ' + message);   // (the status line above says the same, in case the browser blocks alerts)
}
function loadSheetFile(file) {
  setSheetStatus('Reading ' + file.name + '...', false);
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(reader.result);
      if (rows.length < 2) throw new Error('it has no character rows (only a header, or nothing at all)');
      const { headers, objs } = rowsToObjects(rows);
      const missing = REQUIRED_SHEET_COLUMNS.filter(c => !headers.includes(c));
      if (missing.length) throw new Error('these columns are missing: ' + missing.join(', ') + '. The columns it has: ' + headers.join(', '));
      state.headers = headers;
      state.characters = objs;
      renderOutputEmpty();   // decides Ready / no players, and the button, from what was actually loaded
      const enemies = objs.filter(isEnemyRow).length;
      const hasWinColumn = headers.some(h => h.trim().toLowerCase() === 'win condition');
      setSheetStatus('Loaded ' + objs.length + ' rows (' + (objs.length - enemies) + ' players, ' + enemies + ' enemies) from ' + file.name +
                     (hasWinColumn ? '' : '. There is no "Win condition" column yet, so win conditions are left out of the messages'), false);
    } catch (err) {
      rejectSheet(err.message);
    }
  };
  reader.onerror = () => rejectSheet('the browser could not read the file');
  reader.readAsText(file);
}
sheetInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loadSheetFile(file);
  // Clear the box. Browsers only fire "change" when the chosen file differs from the one already in the box, and each cycle's sheet
  // usually has the same file name as the last, so without this the second upload of the day can do nothing at all.
  e.target.value = '';
});
// If the browser kept a file in the box across a reload (some do), use it, since no change will ever fire for it.
function loadRememberedSheet() {
  if (sheetInput.files && sheetInput.files[0]) {
    const file = sheetInput.files[0];
    sheetInput.value = '';
    loadSheetFile(file);
  }
}
loadRememberedSheet();

function makeSimpleUploadHandler(inputId, mapRow, assign) {
  document.getElementById(inputId).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';   // so the same file can be chosen again
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
  namePlural: o['NamePlural'] || '', descriptionPlural: o['DescriptionPlural'] || '',
}), (rows) => { state.bestiary = rows; });

makeSimpleUploadHandler('regions-upload', o => ({
  id: num(o.ID, 0), name: o.Name || '', description: o.Description || '',
}), (rows) => { state.regions = rows; });

// Win conditions: ID, Name, Description. Rows with no name (the WIP file has blank placeholder rows) and any unnamed extra columns are ignored.
makeSimpleUploadHandler('wincond-upload', o => ({
  id: num(o.ID, 0), name: (o.Name || '').trim(), description: (o.Description || '').trim(),
}), (rows) => { state.winConditions = rows.filter(r => r.name); });

makeSimpleUploadHandler('poi-upload', o => ({
  id: num(o.ID, 0), name: o.Name || '', description: o.Description || '', action: o.Action || '',
  actionDescription: o['Action description'] || '', notes: o.Notes || '', location: o.Location || '',
}), (rows) => { state.poi = rows; });

// Messages: wide grid (location codes as columns) → tidy { locCode: [text, ...] }, replacing everything.
document.getElementById('messages-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';   // so the same file can be chosen again
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
  e.target.value = '';   // (the files are already copied out above) so the same folder can be chosen again
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
  // The exported data.js says which release it belongs to, using the build id this page itself was loaded with, so that the pages'
  // self-check (see the build check block in the HTML) does not flag a data.js you exported from the current page.
  const buildMeta = document.querySelector('meta[name="srp2-build"]');
  lines.push(`window.SRP2_BUILDS = window.SRP2_BUILDS || {}; window.SRP2_BUILDS['data.js'] = '${buildMeta ? buildMeta.content : ''}';`);
  lines.push('// Shared static reference data for SRP2 tools (combat helper + cycle messages).');
  lines.push('// Regenerated via the "Export updated data.js" button in Cycle Messages.');
  lines.push('');
  lines.push(`const DEFAULT_ACTIONS = ${JSON.stringify(state.actions)};`);
  lines.push(`const DEFAULT_ITEMS = ${JSON.stringify(state.items)};`);
  lines.push(`const DEFAULT_BESTIARY = ${JSON.stringify(state.bestiary)};`);
  lines.push(`const DEFAULT_STATUSES = ${JSON.stringify(typeof DEFAULT_STATUSES !== 'undefined' ? DEFAULT_STATUSES : [])};`);
  lines.push(`const DEFAULT_REGIONS = ${JSON.stringify(state.regions)};`);
  lines.push(`const DEFAULT_POI = ${JSON.stringify(state.poi)};`);
  lines.push(`const DEFAULT_WIN_CONDITIONS = ${JSON.stringify(state.winConditions)};`);
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
  return num(c['Current HP']) <= 0;
}

function getGrantedAction(itemName) {
  const item = findItem(itemName);
  if (!item || !item.action || item.action.trim() === '-') return null;
  const actionName = item.action.trim();
  const actionRow = state.actions.find(a => a.name.trim().toLowerCase() === actionName.toLowerCase());
  return { name: actionName, description: actionRow ? actionRow.description : '', roll: formatRoll(actionRow), row: actionRow || null, item: item };
}

// ---------- Dice rolls ----------
// The roll an action makes, written "(number * (min-max))": "(2 * (2-4))" is two rolls, each between 2 and 4. The three numbers come from the
// Actions sheet's Roll number, Roll Min and Roll Max columns. Where the usual form would read badly, or mislead:
//   - a fixed amount (min equals max) shows the number once: Zap is "(1 * 2)", not "(1 * (2-2))";
//   - a negative minimum reads "(1 * (-2 to 2))", since "-2-2" is unreadable;
//   - "entityNum" (Meteor Shower) means one roll for each entity it hits, and reads "(1 per entity * (1-5))";
//   - no roll at all (all zeros: "effect only", like Toxic Spore) or values that are not numbers print nothing, rather than something wrong.
function formatRoll(action) {
  if (!action) return '';
  const text = v => String(v == null ? '' : v).trim();
  const rawCount = text(action.rollNumber), rawMin = text(action.rollMin), rawMax = text(action.rollMax);
  if (!rawCount && !rawMin && !rawMax) return '';
  const perEntity = rawCount.toLowerCase() === 'entitynum';
  const count = perEntity ? 1 : Number(rawCount), lo = Number(rawMin), hi = Number(rawMax);
  if ((!perEntity && (rawCount === '' || !Number.isFinite(count))) || rawMin === '' || rawMax === '' || !Number.isFinite(lo) || !Number.isFinite(hi)) return '';
  if (!perEntity && count === 0 && lo === 0 && hi === 0) return '';
  const range = lo === hi ? String(lo) : (lo < 0 ? `(${lo} to ${hi})` : `(${lo}-${hi})`);
  return `(${perEntity ? '1 per entity' : count} * ${range})`;
}

// The Actions sheet row for an action name. Where several share a name (the two "Talk"s) the one whose Notes mention an NPC is preferred,
// because the only way to reach such an action by name alone is a point of interest, which is where an NPC is.
function findActionRow(name) {
  const same = state.actions.filter(a => a.name.trim().toLowerCase() === String(name).trim().toLowerCase());
  return same.find(a => /\bnpc\b/i.test(a.notes || '')) || same[0] || null;
}

// ---------- Equipment ----------
// Weapons, armour and trinkets only give their actions while they are EQUIPPED. Everything else (consumables, the miscellaneous items such
// as the Stone Crown) is not tied to a slot, so it gives its action straight from the inventory.
function isEquipmentItem(item) { return !!item && ['weapon', 'armour', 'trinket'].includes(String(item.type || '').trim().toLowerCase()); }

// ---------- The map, and moving ----------
// The world map is columns A-H by rows 1-8 and does not wrap, so a player on an edge or corner has fewer than four ways to go. Direction names
// follow the picture script: a letter going up (A to B) is SE, down (B to A) is NW; a number going up (1 to 2) is SW, down (2 to 1) is NE.
// Returns null for a location that is not on the map, rather than guessing.
const MAP_LETTERS = 'ABCDEFGH', MAP_ROWS = 8;
function getMoveDirections(location) {
  const m = /^([A-H])([1-8])$/i.exec(String(location == null ? '' : location).trim());
  if (!m) return null;
  const letter = MAP_LETTERS.indexOf(m[1].toUpperCase()) + 1, number = Number(m[2]);
  const directions = [];
  if (letter > 1) directions.push('NW');
  if (number > 1) directions.push('NE');
  if (number < MAP_ROWS) directions.push('SW');
  if (letter < MAP_LETTERS.length) directions.push('SE');
  return directions;
}
const MOVE_DESCRIPTION = 'Travel to a new location.';
const FLEE_DESCRIPTION = 'Travel to a new location at the end of the turn.';

// ---------- When an action is worth offering: its Trigger ----------
// The Actions sheet's Trigger column says what an action is aimed at (the combat helper shows it as "Target:"), so it also says when the
// action is worth offering. A list such as "Enemy, Player" is met by any of its kinds; blank means always.
//   Enemy     a living enemy at the location          Player    another living player (never the viewer, never a defeated one)
//   Death     the viewer is defeated (Revive)          POI       a point of interest at the location (the Place actions)
//   Merchant  a point of interest that offers Shop     Soil      a point of interest whose name says soil (Loamy Soil: Plant)
// A kind this code does not know is treated as met, so an action is never hidden for a reason that cannot be checked.
// Points of interest come from the location grids (the "locations" folder upload), so without them POI, Merchant and Soil are never met.
const TRIGGER_KINDS = ['enemy', 'player', 'death', 'poi', 'merchant', 'soil'];
function getTriggerKinds(row) { return String(row && row.trigger != null ? row.trigger : '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean); }
function actionTriggerMet(row, player, poi) {
  const kinds = getTriggerKinds(row);
  if (!kinds.length) return true;
  if (kinds.some(k => !TRIGGER_KINDS.includes(k))) return true;
  const others = state.characters.filter(c => c !== player && c['Current location'] === player['Current location'] && !isKO(c));
  const met = {
    enemy: others.some(isEnemyRow),
    player: others.some(c => !isEnemyRow(c)),
    death: isKO(player),
    poi: !!poi,
    merchant: !!poi && String(poi.action || '').trim().toLowerCase() === 'shop',
    soil: !!poi && /\bsoil\b/i.test(String(poi.name || '')),
  };
  return kinds.some(k => met[k]);
}
// True for an action that can only be offered where there is a point of interest, which cannot be known until location grids are loaded.
function triggerNeedsPlace(row) { return getTriggerKinds(row).some(k => k === 'poi' || k === 'merchant' || k === 'soil'); }

// A character has a bookmark when the Bookmark field holds something other than blank or "-1" (the sheet's "none set" sentinel). This is
// the same rule the combat helper uses for Return, so the two tools agree.
function getBookmark(c) {
  const key = Object.keys(c).find(k => k.trim().toLowerCase() === 'bookmark');
  const v = String(key ? c[key] : '').trim();
  return (v && v !== '-1') ? v : '';
}

// ---------- Choosing a target ----------
// An action takes a target when its description speaks of one. The Actions sheet is written that way: every attack, Heal, Cure, Sacrifice,
// Echo, Inspect, Pickpocket and Impersonate say "target"; Rest, Talk, Shop, Revive, the consumables and the area attacks (which hit
// everyone) do not. The wording is therefore the switch: a new action only gets the prompt if its description says "target".
function actionNeedsTarget(description) { return /\btargets?\b/i.test(description || ''); }

// An attack is any action of a Damage type. You are not a target of your own attack, with one exception: an action whose damage roll can go
// below zero can heal as well as hurt (Cursed Magick), so aiming it at yourself is a real choice. Heals, status clears and the miscellaneous
// actions that take a target (Inspect, Echo...) may be aimed at yourself.
function isAttackRow(row) { return !!row && /^damage/i.test(String(row.type || '').trim()); }
function canHealRow(row) {
  const raw = String(row && row.rollMin != null ? row.rollMin : '').trim();
  return raw !== '' && Number.isFinite(Number(raw)) && Number(raw) < 0;
}

// Everyone who can be picked for an action: every player and enemy at the player's location who is still standing, players first and then
// enemies, each in sheet order (the player is left out of their own attacks; see above). It uses the sheet Name, which is unique
// ("Wolf", "Wolf (2)"), so a reply names exactly one entity. `row` is the action's Actions-sheet row, if it has one.
function getTargetNames(player, row) {
  const here = state.characters.filter(c => c['Current location'] === player['Current location'] && !isKO(c));
  const pool = (!isAttackRow(row) || canHealRow(row)) ? here : here.filter(c => c !== player);
  return pool.filter(c => !isEnemyRow(c)).concat(pool.filter(isEnemyRow)).map(c => c['Name']);
}

// The wording to show for a point of interest's action. A point of interest may carry its own; if it does not, the Actions sheet's wording
// for that action name is used. Where the Actions sheet has several actions with one name (there are two "Talk"s, one for players and one
// for NPCs), the one whose Notes mention an NPC is preferred, because a point of interest is where an NPC is.
function describePoiAction(name, ownDescription) {
  if (ownDescription && ownDescription.trim()) return ownDescription.trim();
  const row = findActionRow(name);
  return row ? row.description : '';
}

// ---------- Status conditions and win conditions ----------
function isTrueCell(v) { return ['true', '1', 'yes', 'y'].includes(String(v == null ? '' : v).trim().toLowerCase()); }

// The statuses a character has right now, in the Statuses sheet's order. The character sheet has one TRUE/FALSE column per status
// ("Status Blind"); an older sheet had a single "Status" column, which is still understood. "OK" means none.
function getActiveStatuses(c) {
  const known = state.statuses.filter(s => s.name && s.name.trim().toLowerCase() !== 'ok');
  const keys = Object.keys(c);
  const active = known.filter(s => {
    const key = keys.find(k => k.trim().toLowerCase() === 'status ' + s.name.trim().toLowerCase());
    return key && isTrueCell(c[key]);
  });
  const hasStatusColumns = keys.some(k => /^status\s+\S/i.test(k.trim()));
  if (!hasStatusColumns && c['Status']) {
    const one = known.find(s => s.name.trim().toLowerCase() === String(c['Status']).trim().toLowerCase());
    if (one) active.push(one);
  }
  return active;
}

// The player's win condition, cited by name in the sheet's "Win condition" column. Anything wrong goes into `notes` (shown on the
// player's card, never in the message text) and no win condition is printed, rather than printing a guess.
function lookupWinCondition(player, notes) {
  const key = Object.keys(player).find(k => k.trim().toLowerCase() === 'win condition');
  if (!key) return null;   // the sheet has no such column yet; the status line under the upload says so once
  const raw = String(player[key] || '').trim();
  if (!raw) { notes.push('No win condition is set for this player, so none is printed.'); return null; }
  const found = state.winConditions.find(w => w.name.trim().toLowerCase() === raw.toLowerCase());
  if (!found) { notes.push('Win condition "' + raw + '" is not in the Win Conditions list, so none is printed.'); return null; }
  return found;
}

function buildCycleMessage(player, notes) {
  notes = notes || [];
  const loc = player['Current location'];
  const prevLoc = player['Previous location'];
  const cycle = player['Cycle'] || '?';

  // The order of a message: the cycle, empty centre tags (the picture is added by hand), where you are (and whether you have moved), the
  // region, the point of interest, your status conditions, the enemies, the other players, the bodies, the messages, the actions, the
  // inventory, and the win condition.
  let msg = `It is [B]Cycle ${cycle}[/B].\n\n`;
  msg += '[CENTER][/CENTER]\n\n';
  msg += loc === prevLoc ? `This is [B]${loc}[/B].\n\n` : `You have arrived at [B]${loc}[/B].\n\n`;

  const region = getRegionForLocation(loc);
  if (region) msg += `${region.description}\n\n`;

  // The NPC / point of interest at this location (one at most: it is read from the location grid's centre tile)
  const poi = getPOIForLocation(loc);
  if (poi && poi.description) msg += `${poi.description}\n\n`;

  // Status conditions, if any
  const statuses = getActiveStatuses(player);
  if (statuses.length) {
    msg += 'Your status conditions:\n';
    statuses.forEach(s => { msg += `  - [B]${s.name}[/B]` + (s.description ? `: ${s.description}` : '') + '\n'; });
    msg += '\n';
  }

  // Enemies present — grouped by Base Name, so multiple instances of the same
  // creature (two Thieves, say) get one combined line using the Bestiary's
  // plural columns, instead of repeating an identical line per instance.
  const enemiesHere = state.characters.filter(c => !isKO(c) && isEnemyRow(c) && c['Current location'] === loc);
  if (enemiesHere.length) {
    const groups = {};
    enemiesHere.forEach(e => {
      const baseName = (e['Base Name'] || e['Name'] || '').trim();
      (groups[baseName] = groups[baseName] || []).push(e);
    });
    Object.keys(groups).forEach(baseName => {
      const instances = groups[baseName];
      const entry = state.bestiary.find(b => b.name.trim().toLowerCase() === baseName.toLowerCase());
      if (instances.length === 1) {
        const desc = entry ? entry.description : '';
        msg += `There is a [B]${baseName}[/B] here. ${desc}\n`;
      } else {
        // Graceful fallback if a bestiary entry hasn't been given plural text yet:
        // falls back to the base/singular name and description rather than blanking out.
        const namePlural = entry && entry.namePlural ? entry.namePlural : baseName;
        const descPlural = entry && entry.descriptionPlural ? entry.descriptionPlural : (entry ? entry.description : '');
        msg += `There are [B]${instances.length} ${namePlural}[/B] here. ${descPlural}\n`;
      }
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
    corpsesHere.forEach(c => {
      // Same Base Name preference as the "enemies present" listing above — a
      // defeated enemy's corpse shouldn't show its internal disambiguation
      // suffix either. Players don't have a Base Name, so they're unaffected.
      const label = isEnemyRow(c) ? (c['Base Name'] || c['Name']) : c['Name'];
      msg += `  - ${label}\n`;
    });
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

  // Actions, in this order: what the player has EQUIPPED, what the setting gives them (a point of interest), what their inventory gives them
  // (only items that are not equipment: a weapon or trinket in the bag gives nothing until it is equipped), then the standard actions.
  // Whether any of them is offered is decided by the action's Trigger (see above): an attack needs an enemy or another player there, so
  // it is offered against allies when no enemies are present, and never when the player is alone.
  msg += '[B]Actions[/B]\n';
  const seen = new Set();
  const leftOutNoGrids = [];   // actions that need a point of interest and could not be checked because no location grids are loaded
  const addAction = (name, description, roll, row, prompt) => {
    if (!name || seen.has(name)) return;
    if (!actionTriggerMet(row, player, poi)) {   // its Trigger is not met here (an attack with no one to attack, Pickpocket with no other player...)
      if (triggerNeedsPlace(row) && !Object.keys(state.locations).length) leftOutNoGrids.push(name);
      return;
    }
    const targets = getTargetNames(player, row);
    if (isAttackRow(row) && !targets.length) return;   // an attack with nobody to hit is not offered (alone, you cannot attack yourself)
    seen.add(name);
    msg += `[${name}]` + (description ? ` - ${description}` : '') + (roll ? ` ${roll}` : '') + '\n';
    // An action that needs a choice is followed by it, in italics on the next line: a direction for Move and Flee, or a target, naming
    // everyone who can be picked, for an action whose description speaks of one
    if (prompt) msg += `[I]${prompt}[/I]\n`;
    else if (targets.length && actionNeedsTarget(description)) msg += `[I]Select a target: ${targets.join(', ')}[/I]\n`;
  };
  const weaponAction = getGrantedAction(player['Equipped weapon']);
  if (weaponAction) addAction(weaponAction.name, weaponAction.description, weaponAction.roll, weaponAction.row);
  ['Equipped armour', 'Equipped trinket'].forEach(slot => {
    const worn = getGrantedAction(player[slot]);
    if (worn) addAction(worn.name, worn.description, worn.roll, worn.row);
  });
  if (poi && poi.action && poi.action.trim()) { const poiRow = findActionRow(poi.action); addAction(poi.action.trim(), describePoiAction(poi.action, poi.actionDescription), formatRoll(poiRow), poiRow); }
  for (let i = 1; i <= 6; i++) {
    const invAction = getGrantedAction(player[`Inventory slot ${i}`]);
    if (invAction && !isEquipmentItem(invAction.item)) addAction(invAction.name, invAction.description, invAction.roll, invAction.row);
  }
  if (leftOutNoGrids.length) notes.push([...new Set(leftOutNoGrids)].join(', ') + ' ' + (new Set(leftOutNoGrids).size > 1 ? 'need' : 'needs') + ' a point of interest at this location, but no location grids are loaded, so ' + (new Set(leftOutNoGrids).size > 1 ? 'they are' : 'it is') + ' left out.');
  // The standard actions. With nothing to fight everyone has Manage Inventory, Rest, Post and Move; with enemies here there is only Flee,
  // which happens at the end of the turn. Directions are only those that exist from where the player stands. A defeated player has none.
  if (!isKO(player)) {
    if (!enemiesHere.length) {
      ['Manage Inventory', 'Rest', 'Post'].forEach(standard => { const row = findActionRow(standard); addAction(standard, row ? row.description : '', formatRoll(row), row); });
    }
    const bookmark = getBookmark(player);
    if (bookmark) {   // a marked location to go back to, so Return is available (peace or combat)
      const returnRow = findActionRow('Return'); addAction('Return', returnRow ? returnRow.description : '', formatRoll(returnRow), returnRow);
      if (!getMoveDirections(bookmark)) notes.push('Bookmark "' + bookmark + '" is not on the A1-H8 map. Return is still offered, as the combat helper would.');
    }
    const directions = getMoveDirections(loc);
    if (directions) addAction(enemiesHere.length ? 'Flee' : 'Move', enemiesHere.length ? FLEE_DESCRIPTION : MOVE_DESCRIPTION, '', null, 'Select a direction: ' + directions.join(', '));
    else notes.push('Location "' + loc + '" is not on the A1-H8 map, so no Move or Flee directions are given.');
  }

  // Inventory, with the action each item gives
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
        const granted = getGrantedAction(item.name);
        if (granted) msg += `    [SIZE=3]Gives the action [${granted.name}]` + (isEquipmentItem(item) ? ' when equipped' : '') + (granted.description ? ` - ${granted.description}` : '') + (granted.roll ? ` ${granted.roll}` : '') + `[/SIZE]\n`;
      } else {
        msg += `\n  - Unknown item (${name})\n`;
      }
    });
  } else {
    msg += '\n  None\n';
  }
  msg += '[/spoiler]';

  // The player's win condition, last
  const win = lookupWinCondition(player, notes);
  if (win) msg += `\n\n[B]Your win condition: ${win.name}[/B]\n${win.description}`;

  return msg;
}

// The ONE place that decides what the output panel says AND whether Generate is available, so the two can never disagree
// ("Ready" with a greyed-out button was possible before: the page said Ready on load, before any sheet existed).
function renderOutputEmpty() {
  const btn = document.getElementById('generate-btn');
  const body = document.getElementById('output-body');
  const players = state.characters.filter(c => !isEnemyRow(c)).length;
  if (!state.characters.length) {
    btn.disabled = true;
    body.innerHTML = '<div class="empty-state"><span class="big">No character sheet loaded</span>Upload a character sheet CSV (top right) to begin.' +
                     '<br>A sheet uploaded on the Combat Helper page is not carried over to this page: each page keeps its own copy.</div>';
  } else if (!players) {
    btn.disabled = true;
    body.innerHTML = '<div class="empty-state"><span class="big">No player rows on this sheet</span>Every row is an enemy, so there is nothing to generate.</div>';
  } else {
    btn.disabled = false;
    body.innerHTML = '<div class="empty-state"><span class="big">Ready</span>Click "Generate all cycle messages" to build one message per player.</div>';
  }
}

document.getElementById('generate-btn').addEventListener('click', () => {
  const players = state.characters.filter(c => !isEnemyRow(c));
  const body = document.getElementById('output-body');
  if (!players.length) {
    body.innerHTML = '<div class="empty-state">No player rows found on this sheet.</div>';
    return;
  }
  body.innerHTML = '';
  if (!Object.keys(state.locations).length) {   // once per run, and not part of any message: without grids there is no region line and no point of interest
    const notice = document.createElement('div');
    notice.className = 'card-warning'; notice.id = 'no-grids-notice';
    notice.textContent = 'No location grids are loaded, so these messages have no region description and no point of interest. Upload the locations folder to include them.';
    body.appendChild(notice);
  }
  players.forEach(player => {
    const notes = [];
    const text = buildCycleMessage(player, notes);
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
    if (notes.length) {   // things to fix in the sheet; deliberately NOT part of the text that gets copied
      const warn = document.createElement('div');
      warn.className = 'card-warning';
      warn.textContent = notes.join(' ');
      const bodyEl = card.querySelector('.player-card-body');
      bodyEl.insertBefore(warn, bodyEl.firstChild);
    }
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
