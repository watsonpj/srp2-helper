/* ============================================================
   SRP2 Session Ledger — app logic
   All state lives in memory (no localStorage), everything runs
   client-side. Re-upload your CSV each session; export when done.
   ============================================================ */

// ---------- State ----------
const DEFAULT_HEADERS = ['Name','Current location','Previous location','Status','Current HP','Max HP',
  'Attack Bonus','Defence Bonus','Speed Bonus','Equipped weapon','Equipped armour','Equipped trinket',
  'Inventory slot 1','Inventory slot 2','Inventory slot 3','Inventory slot 4','Inventory slot 5','Inventory slot 6',
  'Likes','Bookmark','Cycle','Entity Type','Base Name'];

// Entity Type: 'Player' (default for anything with no value, i.e. every sheet from
// before this existed) or 'Enemy'/'NPC'. Base Name is the plain bestiary species
// name ("Wolf") kept alongside the unique display Name ("Wolf (2)") specifically so
// a spawned instance survives an export → re-import round trip as the same monster
// with its own ability list, instead of silently becoming an ordinary player row.
const ENEMY_ENTITY_TYPES = ['enemy', 'npc'];

const UNDEAD_BESTIARY_NAMES = ['zombie', 'vampire', 'lich'];
// Maps an action's raw Effect suffix (Status<X>) to the actual status name used everywhere else.
const EFFECT_STATUS_MAP = { Burn: 'Burned' };

const state = {
  headers: [],        // original column order from uploaded character sheet, for export
  characters: [],      // array of row objects (mutable)
  actions: DEFAULT_ACTIONS,
  items: DEFAULT_ITEMS,
  bestiary: DEFAULT_BESTIARY,
  statuses: DEFAULT_STATUSES,
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

// Stat-bonus deltas an item confers while equipped. Prefers dedicated numeric
// columns (Attack Bonus Delta / Defence Bonus Delta / Speed Bonus Delta / HP Delta)
// if an uploaded Items CSV provides them; otherwise parses the two phrasings
// actually used in the default sheet: armour-style ("+2 Defence Bonus", can be
// negative and/or comma-separated) and trinket-style ("Increases Attack Bonus
// by 1", "Increases all stat bonuses and HP by 1").
function parseStatDeltasFromText(text) {
  const out = { attack: 0, defence: 0, speed: 0, hp: 0 };
  const t = text || '';
  const armourStyle = /([+-]\d+)\s*(Attack|Defence|Speed)\s*Bonus/gi;
  let m;
  while ((m = armourStyle.exec(t))) {
    out[m[2].toLowerCase()] += parseInt(m[1], 10);
  }
  const incDec = /(Increases|Decreases)\s+(Attack Bonus|Defence Bonus|Speed Bonus|HP)\s+by\s+(\d+)/gi;
  while ((m = incDec.exec(t))) {
    const sign = /increases/i.test(m[1]) ? 1 : -1;
    const val = sign * parseInt(m[3], 10);
    const raw = m[2].toLowerCase();
    const key = raw.startsWith('attack') ? 'attack' : raw.startsWith('defence') ? 'defence' : raw.startsWith('speed') ? 'speed' : 'hp';
    out[key] += val;
  }
  const allStat = /increases all stat bonuses and hp by (\d+)/i.exec(t);
  if (allStat) {
    const val = parseInt(allStat[1], 10);
    out.attack += val; out.defence += val; out.speed += val; out.hp += val;
  }
  return out;
}

function getItemStatDeltas(item) {
  if (!item) return { attack: 0, defence: 0, speed: 0, hp: 0 };
  const explicitKeys = ['attackBonusDelta', 'defenceBonusDelta', 'speedBonusDelta', 'hpDelta'];
  const hasExplicit = explicitKeys.some(k => item[k] !== undefined && item[k] !== '' && item[k] !== null);
  if (hasExplicit) {
    return {
      attack: num(item.attackBonusDelta, 0),
      defence: num(item.defenceBonusDelta, 0),
      speed: num(item.speedBonusDelta, 0),
      hp: num(item.hpDelta, 0),
    };
  }
  return parseStatDeltasFromText(item.effect);
}

// Sums stat deltas across a character's equipped weapon/armour/trinket (not
// unequipped inventory — only gear actually worn/wielded confers bonuses).
// These are never written back into the character's own Attack/Defence/Speed
// Bonus fields — those stay exactly as entered, and equipment bonuses are
// added on top only at the moment a roll or display needs the effective
// total. That way equipping/unequipping something is instantly reversible
// and never double-counts against a value someone already tallied by hand.
function getEquipmentStatBonus(character) {
  const total = { attack: 0, defence: 0, speed: 0, hp: 0 };
  if (!character) return total;
  [character['Equipped weapon'], character['Equipped armour'], character['Equipped trinket']].forEach(name => {
    const item = findItem(name);
    if (!item) return;
    const d = getItemStatDeltas(item);
    total.attack += d.attack; total.defence += d.defence; total.speed += d.speed; total.hp += d.hp;
  });
  return total;
}

const STAT_FIELD_TO_KEY = { 'Attack Bonus': 'attack', 'Defence Bonus': 'defence', 'Speed Bonus': 'speed' };

// Status-driven stat modifiers (as opposed to gear-driven ones, above). Only
// Blind's -1 Attack Bonus is implemented here — Frozen's Speed penalty is
// deliberately skipped since Speed only affects turn order, which is handled
// outside this tool.
function getStatusStatBonus(character) {
  const out = { attack: 0, defence: 0, speed: 0 };
  if (hasStatus(character, 'Blind')) out.attack -= 1;
  return out;
}

function effectiveStat(character, fieldName) {
  if (!character) return 0;
  const key = STAT_FIELD_TO_KEY[fieldName];
  const gearBonus = key ? getEquipmentStatBonus(character)[key] : 0;
  const statusBonus = key ? getStatusStatBonus(character)[key] : 0;
  return num(character[fieldName], 0) + gearBonus + statusBonus;
}

function effectiveMaxHP(character) {
  if (!character) return 0;
  return num(character['Max HP'], 0) + getEquipmentStatBonus(character).hp;
}

// Builds the report shown by Inspect: status, attributes (effective totals —
// the same numbers combat math actually uses, gear/status modifiers and all,
// not just whatever's typed into the base fields), and equipped gear. Doesn't
// touch inventory contents — Inspect reveals what's worn/wielded, not carried.
function buildInspectLines(target) {
  if (!target) return [];
  const atk = effectiveStat(target, 'Attack Bonus');
  const def = effectiveStat(target, 'Defence Bonus');
  const spd = effectiveStat(target, 'Speed Bonus');
  return [
    `Status: ${target['Status'] || 'OK'}`,
    `HP: ${target['Current HP'] ?? '?'} / ${effectiveMaxHP(target)}`,
    `Attack ${atk} · Defence ${def} · Speed ${spd}`,
    `Weapon: ${target['Equipped weapon'] || 'None'} · Armour: ${target['Equipped armour'] || 'None'} · Trinket: ${target['Equipped trinket'] || 'None'}`,
  ];
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

// Single place that decides "is/was defeated" wherever HP changes — covers the
// main attack roll, retaliation damage, Charged's self-damage, and the manual
// Poison tick alike, so nobody can drop to 0 HP through a side path and just
// silently sit there with no note and no KO status.
function checkDefeatOrRevive(character) {
  if (!character) return '';
  const hp = num(character['Current HP']);
  const isKO = (character['Status'] || '').trim().toUpperCase() === 'KO';
  if (hp <= 0 && !isKO) {
    character['Status'] = 'KO';
    return `${character['Name']} is defeated!`;
  }
  if (hp > 0 && isKO) {
    character['Status'] = 'OK';
    return `${character['Name']} is back on their feet.`;
  }
  return '';
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

// Makes sure the two entity-tracking columns exist on whatever sheet is
// currently loaded, appending them if an older-format CSV didn't have them —
// and backfilling every already-loaded character with a sensible default the
// moment the columns are added, so nobody ends up with a blank Entity Type.
function ensureEntityColumns() {
  let added = false;
  ['Entity Type', 'Base Name'].forEach(col => {
    if (!state.headers.includes(col)) { state.headers.push(col); added = true; }
  });
  if (added) {
    state.characters.forEach(c => {
      if (!(c['Entity Type'] || '').trim()) c['Entity Type'] = c.__mob ? 'Enemy' : 'Player';
      if (c['Base Name'] === undefined) c['Base Name'] = '';
    });
  }
}

// Rebuilds a character's mob metadata (ability restriction, undead flag, bestiary
// link) from Entity Type + Base Name alone — this is what makes a previously
// exported sheet correctly recognise its spawned enemies as enemies again on
// re-upload, instead of treating them as ordinary players with no ability list.
function reconstructMobMetadata(character) {
  const entityType = (character['Entity Type'] || '').trim().toLowerCase();
  if (!ENEMY_ENTITY_TYPES.includes(entityType)) return;
  const baseName = (character['Base Name'] || '').trim();
  if (!baseName) return;
  const entry = state.bestiary.find(b => b.name.trim().toLowerCase() === baseName.toLowerCase());
  if (!entry) return; // Base Name doesn't match any known bestiary entry — leave it tagged Enemy, but nothing to restrict against
  character.__mob = true;
  character.__bestiaryId = entry.id;
  character.__abilities = [entry.ability1, entry.ability2].filter(ab => ab && ab.trim() && ab.trim() !== '-');
  character.__undead = UNDEAD_BESTIARY_NAMES.includes(entry.name.trim().toLowerCase());
}

function spawnMob(entry) {
  state.mobCounter += 1;
  const displayName = state.characters.some(c => c['Name'] === entry.name)
    ? `${entry.name} (${state.mobCounter})`
    : entry.name;
  if (!state.headers.length) state.headers = DEFAULT_HEADERS.slice();
  ensureEntityColumns();
  const c = {};
  state.headers.forEach(h => { c[h] = ''; });
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
    'Entity Type': 'Enemy',
    'Base Name': entry.name,
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

// Picks one of the current mob attacker's abilities at random (uniformly —
// the bestiary only ever has up to two, so this is a straight coinflip
// whenever there are two). This is purely informational: it doesn't select
// the action for you, just tells you which one to use.
document.getElementById('randomize-ability-btn').addEventListener('click', () => {
  const attacker = state.characters[state.attackerIdx];
  if (!attacker || !attacker.__mob || attacker.__abilities.length < 2) return;
  const pick = attacker.__abilities[Math.floor(Math.random() * attacker.__abilities.length)];
  document.getElementById('ability-randomizer-result').textContent = `→ ${pick}`;
});

document.getElementById('bestiary-search').addEventListener('input', (e) => {
  state.bestiaryFilter = e.target.value;
  renderBestiaryList();
});

// ---------- Item-gated actions ----------
const INVENTORY_SLOT_KEYS = ['Inventory slot 1', 'Inventory slot 2', 'Inventory slot 3', 'Inventory slot 4', 'Inventory slot 5', 'Inventory slot 6'];
const EQUIP_SLOT_KEYS = ['Equipped weapon', 'Equipped armour', 'Equipped trinket'];

// Recomputed whenever the items list (default or uploaded) changes: the set of
// every action name that SOME item grants, anywhere in the whole items table.
// Any action not in this set is either a universal narrative action (Talk,
// Rest, Shop...) or a bestiary-only attack (Bite, Howl...) — see isActionAvailableToPlayer.
function rebuildItemGrantedActionNames() {
  const s = new Set();
  state.items.forEach(it => {
    const act = (it.action || '').trim().toLowerCase();
    if (act && act !== '-') s.add(act);
  });
  state._itemGrantedActionNames = s;
}

// The action names a specific character currently has access to via whatever
// they've got equipped or carrying in their inventory.
function getGrantedActionNames(character) {
  const names = new Set();
  if (!character) return names;
  [...EQUIP_SLOT_KEYS, ...INVENTORY_SLOT_KEYS].forEach(slot => {
    const item = findItem(character[slot]);
    if (item && item.action && item.action.trim() && item.action.trim() !== '-') {
      names.add(item.action.trim().toLowerCase());
    }
  });
  return names;
}

// Innate (Miscellaneous, no item source) => everyone can do it.
// Item-linked => only if the character currently has that item equipped/carried.
// Neither (a Damage/Heal/StatusClear action with no item source) => bestiary-only, never shown to players.
// A handful of actions have a bespoke, named mechanic per their Notes column
// that goes beyond generic item-gating (Mark Location / Return work as a pair
// via the character sheet's own Bookmark field). These are the only two
// action names with special-cased availability rules.
// The sample sheet uses "-1" as the sentinel for "no bookmark set" rather than
// an empty string, so both the gating check and the Return mechanic need to
// treat that value as unset too, not just blank.
function hasBookmark(character) {
  const val = (character && character['Bookmark'] || '').trim();
  return !!val && val !== '-1';
}

// Zombie status overrides everything else: "can only move or attack, cannot
// perform any special actions" — so every non-Damage* action is blocked
// outright regardless of equipment, including Return, Cure, and Rest. (If you
// want Reload/Prepare Spell exempted from this — since a Zombie mid-reload is
// a reasonable ask — that's a one-line change, just say so.)
// A couple of action names are always available regardless of their Type
// column, because the "no item link + not Miscellaneous = bestiary-only"
// heuristic below assumes only Miscellaneous actions are ever innate — which
// broke the moment Rest became a proper HealRange roll instead of a no-roll
// Miscellaneous action. Anything added here bypasses both the item-link and
// type checks (but still respects the Zombie restriction above it).
const ALWAYS_INNATE_ACTION_NAMES = ['rest'];

function isActionAvailableToPlayer(action, character) {
  if (hasStatus(character, 'Zombie') && !action.type.startsWith('Damage')) {
    return false;
  }
  const nameLower = action.name.trim().toLowerCase();
  if (nameLower === 'return') {
    return hasBookmark(character);
  }
  if (ALWAYS_INNATE_ACTION_NAMES.includes(nameLower)) {
    return true;
  }
  if (state._itemGrantedActionNames.has(nameLower)) {
    return getGrantedActionNames(character).has(nameLower);
  }
  return action.type === 'Miscellaneous';
}

function findSourceItemForAction(actionName) {
  const nameLower = (actionName || '').trim().toLowerCase();
  return state.items.find(it => (it.action || '').trim().toLowerCase() === nameLower) || null;
}

// Consumables are used up (cleared from whichever inventory slot holds them);
// equip-slot items whose Effect/description says "Breaks after use" (e.g. the
// Strange Crucible) are unequipped after their action fires. Neither of these
// is a coinflip — it's a guaranteed consequence of taking the action at all.
function consumeOrBreakSourceItem(action, attacker) {
  if (!attacker) return null;
  const item = findSourceItemForAction(action.name);
  if (!item) return null;

  if (item.type === 'Consumable') {
    for (const slot of INVENTORY_SLOT_KEYS) {
      if ((attacker[slot] || '').trim().toLowerCase() === item.name.trim().toLowerCase()) {
        attacker[slot] = '';
        return `${attacker['Name']} uses up their ${item.name}.`;
      }
    }
    return `${attacker['Name']} used ${action.name}, but no ${item.name} was found in their inventory to remove — check their sheet.`;
  }

  if (/breaks after use/i.test(item.effect || '')) {
    for (const slot of EQUIP_SLOT_KEYS) {
      if ((attacker[slot] || '').trim().toLowerCase() === item.name.trim().toLowerCase()) {
        attacker[slot] = 'None';
        return `${item.name} breaks after use and is removed from ${attacker['Name']}.`;
      }
    }
  }
  return null;
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
      ensureEntityColumns(); // adds Entity Type/Base Name + defaults everyone to Player if this is an older-format sheet
      state.characters.forEach(c => {
        if (!(c['Entity Type'] || '').trim()) c['Entity Type'] = 'Player';
        reconstructMobMetadata(c); // restores ability-gating for enemies from a previously exported sheet
      });
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
        // Optional forward-compatible columns — used instead of parsing Effect text when present.
        attackBonusDelta: o['Attack Bonus Delta'],
        defenceBonusDelta: o['Defence Bonus Delta'],
        speedBonusDelta: o['Speed Bonus Delta'],
        hpDelta: o['HP Delta'],
      }));
      rebuildItemGrantedActionNames();
      // Item effects (immunities, forced statuses, stat bonuses, action access) may now read differently — refresh everything.
      state.characters.forEach(syncForcedStatus);
      renderRoster();
      renderDetail();
      renderActionList();
      renderActionDetail();
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
      state.characters.forEach(reconstructMobMetadata); // refresh ability lists for already-loaded enemies against the new bestiary
      renderBestiaryList();
      renderRoster();
      renderActionList();
      renderActionDetail();
    } catch (err) {
      alert('Could not read that bestiary CSV: ' + err.message);
    }
  };
  reader.readAsText(file);
});

document.getElementById('statuses-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(reader.result);
      const { objs } = rowsToObjects(rows);
      state.statuses = objs.filter(o => o.Name).map(o => ({
        id: num(o.ID, 0),
        name: o.Name || '',
        description: o.Description || '',
      }));
      renderDetail(); // Status field is a dropdown built from this list
    } catch (err) {
      alert('Could not read that statuses CSV: ' + err.message);
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
  const maxHp = effectiveMaxHP(c);
  const hpPct = clamp((num(c['Current HP']) / Math.max(1, maxHp)) * 100, 0, 100);
  const gearBonus = getEquipmentStatBonus(c);
  const statusBonus = getStatusStatBonus(c);
  const bestiaryEntry = c.__mob ? state.bestiary.find(b => b.id === c.__bestiaryId) : null;

  const editableStat = (key, label, gearKey) => {
    const base = num(c[key], 0);
    const gear = gearBonus[gearKey];
    const status = statusBonus[gearKey];
    const total = base + gear + status;
    const parts = [];
    if (gear) parts.push(`${gear > 0 ? '+' : ''}${gear} gear`);
    if (status) parts.push(`${status > 0 ? '+' : ''}${status} Blind`);
    return `
    <div class="stat-box">
      <span class="k">${label}</span>
      <input type="number" data-key="${key}" value="${escapeAttr(base)}">
      ${parts.length ? `<span class="stat-gear">${parts.join(', ')} → ${total}</span>` : ''}
    </div>`;
  };

  // Builds a <select> of items filtered to the given type(s) (or all items, for
  // inventory slots). Whatever's already in the cell is preserved as a selected
  // option even if it doesn't match a known item, so we never silently clobber
  // existing sheet data that predates the item list or doesn't match it exactly.
  const itemSelect = (key, label, types) => {
    const current = (c[key] ?? '').trim();
    const pool = types ? state.items.filter(it => types.includes(it.type)) : state.items;
    const sorted = [...pool].sort((x, y) => x.name.localeCompare(y.name));
    const isKnown = !current || current.toLowerCase() === 'none' || sorted.some(it => it.name.trim().toLowerCase() === current.toLowerCase());
    let options = `<option value="None" ${!current || current.toLowerCase() === 'none' ? 'selected' : ''}>None</option>`;
    if (!isKnown) options += `<option value="${escapeAttr(current)}" selected>${escapeHtml(current)} (unrecognized)</option>`;
    let lastType = null;
    sorted.forEach(it => {
      if (types && types.length > 1 && it.type !== lastType) { lastType = it.type; }
      const sel = it.name.trim().toLowerCase() === current.toLowerCase() ? 'selected' : '';
      options += `<option value="${escapeAttr(it.name)}" ${sel}>${escapeHtml(it.name)}</option>`;
    });
    return `
    <div class="field-row">
      <span class="k">${label}</span>
      <select data-key="${key}">${options}</select>
    </div>`;
  };

  // Same "preserve anything unrecognized" pattern as itemSelect — a sheet
  // could already have a status that predates the Statuses list, or a typo,
  // and this makes sure switching to a dropdown never silently discards it.
  const statusSelect = () => {
    const current = (c['Status'] ?? '').trim();
    const isKnown = state.statuses.some(s => s.name.trim().toLowerCase() === current.toLowerCase());
    let options = '';
    if (!isKnown && current) options += `<option value="${escapeAttr(current)}" selected>${escapeHtml(current)} (unrecognized)</option>`;
    state.statuses.forEach(s => {
      const sel = s.name.trim().toLowerCase() === current.toLowerCase() ? 'selected' : '';
      options += `<option value="${escapeAttr(s.name)}" ${sel} title="${escapeAttr(s.description || '')}">${escapeHtml(s.name)}</option>`;
    });
    return `
    <div class="field-row">
      <span class="k">Status</span>
      <select data-key="Status">${options}</select>
    </div>`;
  };

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
        <span class="value"><input type="number" id="hp-current" data-key="Current HP" value="${escapeAttr(c['Current HP'] ?? 0)}" style="width:3.2em;background:transparent;border:none;color:inherit;font:inherit;text-align:right;"> / <input type="number" id="hp-max" data-key="Max HP" value="${escapeAttr(c['Max HP'] ?? 0)}" style="width:3.2em;background:transparent;border:none;color:inherit;font:inherit;">${gearBonus.hp ? ` <span class="stat-gear" style="display:inline;">(${gearBonus.hp > 0 ? '+' : ''}${gearBonus.hp} gear → ${maxHp})</span>` : ''}</span>
      </div>
      <div class="hp-bar-track"><div class="hp-bar-fill" id="hp-bar-fill" style="width:${hpPct}%;"></div></div>
    </div>

    <div class="section-label">Bonuses</div>
    <div class="stat-grid">
      ${editableStat('Attack Bonus', 'Attack', 'attack')}
      ${editableStat('Defence Bonus', 'Defence', 'defence')}
      ${editableStat('Speed Bonus', 'Speed', 'speed')}
    </div>

    <div class="section-label">Status</div>
    ${statusSelect()}
    ${hasStatus(c, 'Poison') ? `
    <div class="field-row">
      <span class="k"></span>
      <button class="btn small" id="poison-tick-btn" type="button" style="justify-self:start;">Apply Poison tick (−1 HP)</button>
    </div>` : ''}
    <div class="field-row">
      <span class="k">Location</span>
      <input type="text" data-key="Current location" value="${escapeAttr(c['Current location'] ?? '')}">
    </div>

    <div class="section-label">Equipment</div>
    <div class="equip-grid">
      ${itemSelect('Equipped weapon', 'Weapon', ['Weapon'])}
      ${itemSelect('Equipped armour', 'Armour', ['Armour'])}
    </div>
    ${itemSelect('Equipped trinket', 'Trinket', ['Trinket'])}

    <div class="section-label">Inventory</div>
    <div class="equip-grid">
      ${itemSelect('Inventory slot 1','Slot 1', null)}
      ${itemSelect('Inventory slot 2','Slot 2', null)}
      ${itemSelect('Inventory slot 3','Slot 3', null)}
      ${itemSelect('Inventory slot 4','Slot 4', null)}
      ${itemSelect('Inventory slot 5','Slot 5', null)}
      ${itemSelect('Inventory slot 6','Slot 6', null)}
    </div>

    ${bestiaryEntry ? `
    <div class="section-label">Bestiary</div>
    <div class="field-row">
      <span class="k">Drops</span>
      <span style="font-size:12px;color:var(--text-muted);">${escapeHtml(bestiaryEntry.drop1 || '—')} (70%) · ${escapeHtml(bestiaryEntry.drop2 || '—')} (30%)</span>
    </div>
    <div class="field-row">
      <span class="k"></span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn small" id="roll-drop-btn" type="button">Roll drop</button>
        <span class="randomizer-result" id="drop-roll-result"></span>
      </div>
    </div>` : ''}
  `;

  body.querySelectorAll('input[data-key], select[data-key]').forEach(el => {
    el.addEventListener('change', () => {
      const key = el.dataset.key;
      c[key] = el.value;
      if (key === 'Equipped armour') {
        syncForcedStatus(c); // e.g. equipping Cursed/Sealed/Molten Armour immediately applies its forced status
      }
      renderDetail();
      renderRoster();
      renderActionList();
      renderActionDetail();
    });
  });

  // Poison has no automatic "end of turn" in this tool (there's no cycle timer to
  // hook into), so this is a manual once-per-tick button for the GM to click —
  // it logs to the ledger like everything else so it stays in the BBCode record.
  const poisonBtn = document.getElementById('poison-tick-btn');
  if (poisonBtn) {
    poisonBtn.addEventListener('click', () => {
      state.turn += 1;
      const newHP = Math.max(0, num(c['Current HP']) - 1);
      c['Current HP'] = String(newHP);
      const resultLine = '−1 HP';
      const note = checkDefeatOrRevive(c);
      addLogEntry({
        cls: 'dmg',
        atk: c['Name'],
        action: 'Poison tick',
        tgt: null,
        rollLine: '',
        resultLine,
        note,
      });
      renderDetail();
      renderRoster();
    });
  }

  // Drop roll: Drop 1 at 70%, Drop 2 at 30% — purely informational, shown
  // inline rather than logged, since a drop isn't a combat action.
  const dropBtn = document.getElementById('roll-drop-btn');
  if (dropBtn) {
    dropBtn.addEventListener('click', () => {
      const has1 = !!(bestiaryEntry.drop1 && bestiaryEntry.drop1.trim() && bestiaryEntry.drop1.trim() !== '-');
      const has2 = !!(bestiaryEntry.drop2 && bestiaryEntry.drop2.trim() && bestiaryEntry.drop2.trim() !== '-');
      const resultEl = document.getElementById('drop-roll-result');
      let pick;
      if (has1 && has2) pick = Math.random() < 0.7 ? bestiaryEntry.drop1 : bestiaryEntry.drop2;
      else if (has1) pick = bestiaryEntry.drop1;
      else if (has2) pick = bestiaryEntry.drop2;
      else pick = null;
      resultEl.textContent = pick ? `→ ${pick}` : 'No drops on file.';
    });
  }
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
  document.getElementById('ability-randomizer').style.display = 'none'; // re-shown below only for a mob with 2+ abilities

  const renderRows = (actions) => {
    list.innerHTML = '';
    actions.forEach(a => {
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
  };

  if (attacker && attacker.__mob) {
    const abilityNames = attacker.__abilities.map(n => n.toLowerCase());
    const filtered = state.actions.filter(a => abilityNames.includes(a.name.toLowerCase()));
    document.getElementById('actions-count').textContent = `${attacker['Name']}'s abilities`;
    if (state.selectedActionId !== null && !filtered.some(a => a.id === state.selectedActionId)) state.selectedActionId = null;

    const randomizer = document.getElementById('ability-randomizer');
    if (attacker.__abilities.length >= 2) {
      randomizer.style.display = 'flex';
      document.getElementById('ability-randomizer-result').textContent = '';
    } else {
      randomizer.style.display = 'none';
    }

    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">This monster has no usable abilities on file.</div>';
      return;
    }
    renderRows(filtered);
    return;
  }

  // Player attacker: gate by type tab AND by what they currently have equipped/carried.
  const byType = state.actions.filter(a => state.activeType === 'All' || a.type === state.activeType);
  const filtered = attacker ? byType.filter(a => isActionAvailableToPlayer(a, attacker)) : byType;
  document.getElementById('actions-count').textContent = attacker
    ? `${filtered.length} available to ${attacker['Name']}`
    : state.actions.length + ' actions';
  if (state.selectedActionId !== null && !filtered.some(a => a.id === state.selectedActionId)) state.selectedActionId = null;
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">Nothing available in this category — check their equipment and inventory.</div>';
    return;
  }
  renderRows(filtered);
}

function formulaText(a) {
  const n = a.rollNumber === 'entityNum' ? '(per target)' : (num(a.rollNumber, 0));
  if (a.type === 'Miscellaneous' || a.type === 'StatusClear') return 'No dice roll for this action.';
  if (n === 0 && num(a.rollMin) === 0 && num(a.rollMax) === 0) return 'No dice roll — effect only.';
  return `Roll ${n} × [${a.rollMin} to ${a.rollMax}]${a.type.startsWith('Damage') ? ', then + Attack Bonus − Defence Bonus' : ''}`;
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
  const needsTarget = a.type !== 'Miscellaneous' || a.name.trim().toLowerCase() === 'inspect';

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
// If the action has a Transform value, figure out what kind of transform it
// actually is by checking what that item is:
//  - a Weapon (Chain Lash -> "Kusarigama, Sickle", Reload -> "Crossbow", etc.)
//    -> the attacker's equipped weapon becomes that item, as before.
//  - anything else (Eat Bright Fruit -> "Fruit Seed") -> that's not a weapon
//    swap at all, it's the action granting a new item, which goes into the
//    first empty inventory slot instead.
// Transform is always a single item name, even when it contains a comma —
// never split it.
function applyTransform(a, attacker) {
  if (!a.transform || !attacker) return null;
  const transformItem = findItem(a.transform);

  if (transformItem && transformItem.type !== 'Weapon') {
    for (const slot of INVENTORY_SLOT_KEYS) {
      const val = (attacker[slot] || '').trim();
      if (!val || val.toLowerCase() === 'none') {
        attacker[slot] = transformItem.name;
        return `${attacker['Name']} receives a ${transformItem.name}.`;
      }
    }
    return `${attacker['Name']} would receive a ${transformItem.name}, but their inventory is full.`;
  }

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
// Vampire and Zombie both spread through any attack their carrier makes, not
// just their signature bite — a separate 50% roll per status, independent of
// whatever the ability's own Effect column does.
function rollContagion(attacker, target) {
  if (!attacker || !target) return '';
  const notes = [];
  ['Vampire', 'Zombie'].forEach(statusName => {
    if (!hasStatus(attacker, statusName)) return;
    if (isImmuneTo(target, statusName)) {
      notes.push(`${target['Name']} is immune to ${statusName} — it doesn't spread.`);
    } else if (Math.random() < 0.5) {
      target['Status'] = statusName;
      notes.push(`${target['Name']} is now afflicted with ${statusName}, spread from ${attacker['Name']}!`);
    }
  });
  return notes.join(' — ');
}

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
    return `${target['Name']} is now afflicted with ${statusName}!`;
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
  let attackerDefeated = false;
  if (eff.retaliateDamage > 0) {
    const newHP = Math.max(0, num(attacker['Current HP']) - eff.retaliateDamage);
    attacker['Current HP'] = String(newHP);
    notes.push(`${attacker['Name']} takes ${eff.retaliateDamage} retaliation damage from ${target['Name']}'s armour.`);
    const defeatNote = checkDefeatOrRevive(attacker);
    if (defeatNote) { notes.push(defeatNote); attackerDefeated = hasStatus(attacker, 'KO'); }
  }
  if (eff.retaliateStatus && !attackerDefeated) {
    if (isImmuneTo(attacker, eff.retaliateStatus)) {
      notes.push(`${attacker['Name']} is immune to the retaliation status.`);
    } else {
      attacker['Status'] = eff.retaliateStatus;
      notes.push(`${attacker['Name']} receives ${eff.retaliateStatus} from ${target['Name']}'s armour.`);
    }
  }
  return notes;
}

function performAction(a, opts = {}) {
  state.turn += 1;
  const attacker = state.characters[state.attackerIdx];
  const target = state.characters[state.targetIdx];
  const min = num(a.rollMin, 0);
  const max = num(a.rollMax, 0);
  let count = a.rollNumber === 'entityNum' ? 1 : num(a.rollNumber, 0); // single target only, so entityNum -> 1

  if (a.type === 'Miscellaneous' || a.type === 'StatusClear') {
    const transformNote = opts.skipTransform ? null : applyTransform(a, attacker);
    const itemNote = consumeOrBreakSourceItem(a, attacker);
    let resultLine = a.type === 'StatusClear' ? 'Status effects cleared.' : '';
    let cureNote = '';
    let bookmarkNote = '';
    let miscCls = 'info';
    let infoLines = null;
    const nameLower = a.name.trim().toLowerCase();

    if (nameLower === 'inspect') {
      if (target) {
        infoLines = buildInspectLines(target);
      } else {
        resultLine = 'No target selected to inspect.';
      }
    } else if (nameLower === 'mark location' && attacker) {
      attacker['Bookmark'] = attacker['Current location'] || '';
      bookmarkNote = `${attacker['Name']} marks ${attacker['Bookmark'] || 'this location'} — Return is now available.`;
    } else if (nameLower === 'return' && attacker) {
      const dest = attacker['Bookmark'] || '';
      if (hasBookmark(attacker)) {
        attacker['Current location'] = dest;
        attacker['Bookmark'] = '-1'; // matches the sheet's own "unset" sentinel
        resultLine = `Returned to ${dest}.`;
        bookmarkNote = `${attacker['Name']}'s bookmark is cleared.`;
      } else {
        resultLine = 'No marked location to return to.';
      }
    } else if (nameLower === 'unstable magick' && attacker) {
      const pool = state.actions.filter(x => x.id >= 18 && x.id <= 54);
      const chosen = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      bookmarkNote = chosen
        ? `${attacker['Name']} channels a random spell: ${chosen.name}!`
        : `${attacker['Name']}'s spell fizzles — no eligible spell found.`;
      if (chosen) {
        // Resolved as its own separate ledger entry right after this one, with its own
        // dice/effects/everything — but its Transform (if it has one) is suppressed, so
        // a coincidentally-picked melee ability can't hijack the Spellbook's own
        // Unstable/Tapped weapon-state cycle out from under it.
        setTimeout(() => performAction(chosen, { skipTransform: true }), 0);
      }
    }

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
      cls: miscCls,
      atk: attacker ? attacker['Name'] : '—',
      action: a.name,
      tgt: target ? target['Name'] : null,
      rollLine: '',
      resultLine,
      transform: transformNote,
      infoLines,
      note: [cureNote, bookmarkNote, a.effect && !/^StatusOK$/i.test(a.effect) ? `Effect: ${a.effect}` : '', itemNote].filter(Boolean).join(' — '),
    });
    renderRoster(); renderDetail(); renderActionList(); renderActionDetail();
    return;
  }

  const isHeal = a.type === 'HealRange';
  const isDamageType = !isHeal;
  const targetBurned = isDamageType && hasStatus(target, 'Burned');

  // Charged: adds +1 to the attack, discharges (clears) after use, and costs
  // the attacker 1 HP themselves — a flat addition to the final total.
  // Parasite: modeled as +1 Attack Bonus rather than a flat damage add, per
  // its own alternate phrasing — since Attack Bonus already applies per hit
  // (not once per attack), this means Parasite scales with hit count on
  // multi-hit weapons (Flurry Attack etc.), unlike Charged.
  let outgoingBonus = 0;
  let parasiteAttackBonus = 0;
  const outgoingNotes = [];
  if (isDamageType && attacker) {
    if (hasStatus(attacker, 'Charged')) {
      outgoingBonus += 1;
      attacker['Current HP'] = String(Math.max(0, num(attacker['Current HP']) - 1));
      outgoingNotes.push(`${attacker['Name']}'s Charged status adds 1 damage, then discharges (costing them 1 HP).`);
      const chargedDefeatNote = checkDefeatOrRevive(attacker);
      if (chargedDefeatNote) {
        outgoingNotes.push(chargedDefeatNote);
      } else {
        attacker['Status'] = 'OK'; // discharges normally, only if that self-damage didn't just KO them
      }
    }
    if (hasStatus(attacker, 'Parasite')) {
      parasiteAttackBonus = 1;
      outgoingNotes.push(`${attacker['Name']}'s Parasite status adds 1 Attack Bonus per hit.`);
    }
  }

  // roll dice — a Burned target takes +1 on every individual die, not just once on the total
  const rolls = [];
  for (let i = 0; i < Math.max(count, 0); i++) {
    let die = rollDie(min, max);
    if (targetBurned) die += 1;
    rolls.push(die);
  }
  const rollSum = rolls.reduce((s, v) => s + v, 0);

  // Cursed Magick only, per its own description ("prone to failure") — a negative
  // roll means the spell misfires into a heal instead of damage. This is checked
  // against the raw die, before Attack/Defence Bonus, and is intentionally kept
  // as an isolated early exit so it can't affect how any other action's damage
  // or healing is calculated.
  if (a.name.trim().toLowerCase() === 'cursed magick' && rolls.length && rolls[0] < 0) {
    const healAmount = Math.abs(rolls[0]);
    let healNote = '';
    let finalHeal = healAmount;
    if (target && (hasStatus(target, 'Parasite') || hasStatus(target, 'Vampire'))) {
      const cause = hasStatus(target, 'Parasite') ? 'Parasite' : 'Vampire';
      healNote = `${target['Name']}'s ${cause} status negates the healing.`;
      finalHeal = 0;
    }
    if (target) {
      const newHP = clamp(num(target['Current HP']) + finalHeal, 0, effectiveMaxHP(target) || finalHeal);
      target['Current HP'] = String(newHP);
      const reviveNote = checkDefeatOrRevive(target);
      if (reviveNote) healNote = [healNote, reviveNote].filter(Boolean).join(' ');
    }
    const misfireTransformNote = opts.skipTransform ? null : applyTransform(a, attacker);
    const misfireItemNote = consumeOrBreakSourceItem(a, attacker);
    addLogEntry({
      cls: 'heal',
      atk: attacker ? attacker['Name'] : '—',
      action: a.name,
      tgt: target ? target['Name'] : '—',
      rollLine: `1 × [${min}–${max}] → [${rolls[0]}]   (misfire — negative roll heals instead of harming)`,
      resultLine: `+${finalHeal} HP`,
      transform: misfireTransformNote,
      note: [healNote, misfireItemNote].filter(Boolean).join(' — '),
    });
    renderRoster(); renderDetail(); renderActionList(); renderActionDetail();
    return;
  }

  const atkBonus = num(attacker ? effectiveStat(attacker, 'Attack Bonus') : 0) + parasiteAttackBonus;
  const defBonus = num(target ? effectiveStat(target, 'Defence Bonus') : 0);

  let ignoreArmour = /ignorearmour/i.test(a.effect || '');
  let punishArmour = /punisharmour/i.test(a.effect || '');

  let total;
  let armourNote = '';
  let undeadNote = '';
  let perHitValues = null; // only populated for multi-hit damage actions, drives the multi-line display
  if (isHeal) {
    total = Math.max(0, rollSum); // heals don't apply attack/defence bonuses
  } else {
    // Attack/Defence Bonus apply per individual roll, not once to the summed
    // total — each hit is floored at 0 on its own before the hits are added
    // together, so a hit that doesn't clear the target's Defence Bonus
    // contributes nothing, rather than being propped up by a harder-hitting
    // hit elsewhere in the same attack.
    const perHit = (die) => {
      let v;
      if (ignoreArmour) v = die + atkBonus;
      else if (punishArmour) v = die + atkBonus + defBonus;
      else v = die + atkBonus - defBonus;
      return Math.max(0, v);
    };
    if (ignoreArmour) armourNote = 'Armour ignored.';
    else if (punishArmour) armourNote = "Target's Defence Bonus added to damage instead of reducing it.";

    if (rolls.length > 1) perHitValues = rolls.map(perHit);
    total = rolls.length > 1 ? perHitValues.reduce((s, v) => s + v, 0) : perHit(rolls[0] ?? 0);

    const atkEffects = getEquippedEffects(attacker);
    if (atkEffects.doubleVsUndead && isUndead(target)) {
      total *= 2;
      undeadNote = `${target['Name']} is undead — Ferryman's Lantern doubles the damage.`;
    }
    total += outgoingBonus;
  }

  let resultLine, cls, note = armourNote;
  if (isHeal) {
    cls = 'heal';
    let healNegatedNote = '';
    if (target && (hasStatus(target, 'Parasite') || hasStatus(target, 'Vampire'))) {
      const cause = hasStatus(target, 'Parasite') ? 'Parasite' : 'Vampire';
      healNegatedNote = `${target['Name']}'s ${cause} status negates the healing.`;
      total = 0;
    }
    if (target) {
      const newHP = clamp(num(target['Current HP']) + total, 0, effectiveMaxHP(target) || total);
      target['Current HP'] = String(newHP);
      const reviveNote = checkDefeatOrRevive(target);
      if (reviveNote) healNegatedNote = [healNegatedNote, reviveNote].filter(Boolean).join(' ');
    }
    // Rest is now a proper HealRange roll (1 HP, guaranteed), but it also clears
    // Poison on whoever's resting — matching "until player rests" from the rules,
    // same behaviour as before, just hooked into the roll path instead of the
    // old no-roll one now that Rest actually rolls dice.
    if (a.name.trim().toLowerCase() === 'rest' && attacker && hasStatus(attacker, 'Poison')) {
      attacker['Status'] = 'OK';
      healNegatedNote = [healNegatedNote, `${attacker['Name']}'s Poison clears after resting.`].filter(Boolean).join(' ');
    }
    resultLine = `+${total} HP`;
    note = healNegatedNote;
  } else {
    cls = 'dmg';
    if (target) {
      const newHP = Math.max(0, num(target['Current HP']) - total);
      target['Current HP'] = String(newHP);
      const defeatNote = checkDefeatOrRevive(target);
      if (defeatNote) note += (note ? ' ' : '') + defeatNote;
    }
    resultLine = `−${total} HP`;
    if (attacker && hasStatus(attacker, 'Vampire')) {
      attacker['Current HP'] = String(clamp(num(attacker['Current HP']) + 1, 0, effectiveMaxHP(attacker) || (num(attacker['Current HP']) + 1)));
      outgoingNotes.push(`${attacker['Name']} heals 1 HP from their Vampire status.`);
    }
  }
  note = [note, undeadNote, ...outgoingNotes].filter(Boolean).join(' ');

  // Passive retaliation from the target's own armour (Thorned Breastplate, Molten Armour, etc.)
  const retaliationNotes = isDamageType ? applyRetaliation(target, attacker) : [];

  // Vampire/Zombie attackers can spread their own status through any attack,
  // independent of whatever the specific ability's own Effect column does.
  const contagionNote = isDamageType ? rollContagion(attacker, target) : '';

  // The ability's own status-effect chance (coinflip, unless it's a guaranteed buff)
  const effectNote = rollAbilityEffect(a, attacker, target);

  const transformNote = applyTransform(a, attacker);
  const itemNote = consumeOrBreakSourceItem(a, attacker);

  // Multi-hit damage actions get one line per hit, each showing that hit's own
  // roll and the modifiers applied to it — single-hit and heal actions keep
  // the existing combined one-liner, since there's nothing per-hit to show.
  let rollLine = '';
  let rollLines = null;
  if (count > 0) {
    if (perHitValues) {
      const modText = ignoreArmour
        ? `+${atkBonus} ATK (armour ignored)`
        : punishArmour
          ? `+${atkBonus} ATK +${defBonus} DEF`
          : `+${atkBonus} ATK −${defBonus} DEF`;
      rollLines = rolls.map((die, i) => `#${i + 1}: ${min}–${max}${targetBurned ? ' +1 Burned' : ''} = ${die}   ${modText} → ${perHitValues[i]}`);
    } else {
      rollLine = `${count} × [${min}–${max}]${targetBurned ? ' +1 Burned' : ''} → [${rolls.join(', ')}] = ${rollSum}   ${isHeal ? '' : `(+${atkBonus} ATK ${punishArmour ? '+' : '−'}${defBonus} DEF)`}`;
    }
  } else {
    rollLine = 'No dice — flat effect.';
  }

  addLogEntry({
    cls,
    atk: attacker ? attacker['Name'] : '—',
    action: a.name,
    tgt: target ? target['Name'] : '—',
    rollLine,
    rollLines,
    resultLine,
    transform: transformNote,
    note: [note, ...retaliationNotes, contagionNote, effectNote, itemNote].filter(Boolean).join(' — '),
  });

  renderRoster();
  renderDetail();
  renderActionList();
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
  // The ledger is column-reverse (newest visually on top, chronological in the DOM),
  // so scrollTop 0 is exactly where the newest entry sits — reset it here so a fresh
  // roll is always immediately visible, even if the GM had scrolled down into older history.
  const ledgerBody = document.getElementById('ledger-body');
  // Column-reverse means scrollTop=0 actually shows the OLDEST entry, not the
  // newest — verified empirically, not assumed. The newest is at the most
  // negative scrollTop, i.e. -(scrollHeight - clientHeight), so that's what
  // needs setting here to actually jump to a fresh roll.
  if (ledgerBody) ledgerBody.scrollTop = -(ledgerBody.scrollHeight - ledgerBody.clientHeight);
}

// Builds a BBCode block (for XenForo-style forums) from a ledger entry:
// bold names/action on the title line, the dice breakdown shrunk and muted,
// the result bolded and colour-coded (green for heals, red for damage), a
// weapon/item transform always in its own fixed style (regardless of whether
// it was the only thing that happened, like Reload, or a side-effect of an
// attack, like Chain Lash — same style either way), and any other note in italics.
function toBBCode(e) {
  const lines = [e.bbTitle];
  if (e.rollLines) {
    e.rollLines.forEach(l => lines.push(`[size=1][color=#8b8f9c]${l}[/color][/size]`));
  } else if (e.rollLine) {
    lines.push(`[size=1][color=#8b8f9c]${e.rollLine}[/color][/size]`);
  }
  if (e.resultLine) {
    const color = e.cls === 'heal' ? '#2e7d4f' : (e.cls === 'dmg' ? '#b0362b' : null);
    lines.push(color ? `[b][color=${color}]${e.resultLine}[/color][/b]` : `[b]${e.resultLine}[/b]`);
  }
  if (e.infoLines) e.infoLines.forEach(l => lines.push(`[i]${l}[/i]`));
  if (e.transform) lines.push(`[i][color=#6f93c9]${e.transform}[/color][/i]`);
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
      ${e.rollLines ? e.rollLines.map(l => `<div class="ledger-roll">${escapeHtml(l)}</div>`).join('') : (e.rollLine ? `<div class="ledger-roll">${escapeHtml(e.rollLine)}</div>` : '')}
      ${e.resultLine ? `<div class="ledger-result ${e.cls}">${escapeHtml(e.resultLine)}</div>` : ''}
      ${e.infoLines ? `<div class="ledger-info">${e.infoLines.map(l => escapeHtml(l)).join('<br>')}</div>` : ''}
      ${e.transform ? `<div class="ledger-transform">${escapeHtml(e.transform)}</div>` : ''}
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
rebuildItemGrantedActionNames();
renderTypeTabs();
renderActionList();
renderActionDetail();
renderRoster();
renderDetail();
renderLedger();
