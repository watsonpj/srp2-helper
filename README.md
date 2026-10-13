# SRP2 Session Ledger

A single-page tool for running Smogoff RPG 2 combat: upload your character sheet CSV, pick an attacker and target, pick an action, and it rolls the dice, applies the damage/heal formula, and keeps a running combat log. Everything runs in the browser — nothing is uploaded to a server, and there's no cost to host it.

## Files

- `index.html` — the whole app (structure + styling + the current SRP2 action list, item list, and bestiary baked in, so it works with zero uploads).
- `app.js` — all the logic (CSV parsing, dice rolling, damage formula, statuses, bestiary, editing, export).

Both files need to sit in the same folder — `index.html` loads `app.js`.

## Hosting it on GitHub Pages (free)

1. Create a new GitHub repository (or use an existing one), e.g. `srp2-ledger`.
2. Add `index.html` and `app.js` to the root of the repo (or to a `/docs` folder — just be consistent with step 4).
3. Commit and push.
4. In the repo, go to **Settings → Pages**. Under "Build and deployment", set **Source** to "Deploy from a branch", pick the branch (usually `main`) and the folder (`/root` or `/docs`, matching step 2), then save.
5. GitHub will give you a URL like `https://yourusername.github.io/srp2-ledger/` — that's your live tool. It updates automatically whenever you push changes.

No build step, no dependencies to install, no payment. It's just static files.

## Using it

1. **Upload character sheet CSV** — your Google Form responses export. It must have the same columns as the sheet you gave me (Name, Current location, Status, Current HP, Max HP, Attack Bonus, Defence Bonus, etc.) — the app reads whatever headers are there and preserves them on export, so extra/renamed columns won't break it as long as the core stat names stay the same.
2. Click a row's **ATK** tag to set them as the attacker, and another row's **TGT** tag to set the target. Click a name to open the full stat sheet on the right (viewing and editing are independent of who's set as attacker/target).
3. Pick an action from the list (filter by type using the tabs). The formula and any special notes (required weapon, status-effect chance, etc.) show underneath.
4. Click **Roll & apply**. It rolls the dice per the action's rules, applies the damage/heal formula, updates the target's HP in the table, and adds an entry to the Combat Ledger at the bottom.
5. When you're done for the session, click **Export updated CSV** to download a CSV with everyone's updated stats, in the same column layout as the one you uploaded.

You can also click **Upload custom actions CSV** to swap in a different action list (same columns as `SRP2 - Actions.csv`) if you tweak the ruleset later — otherwise it uses the list you gave me, baked into the page.

## Copying entries to post on your forum

Every entry in the Combat Ledger has a **Copy for forum** button. Clicking it:

- Copies a BBCode version of that entry to your clipboard, ready to paste straight into a XenForo post.
- Opens a small preview box under the entry showing exactly what was copied, in case you want to tweak it before pasting (click the × to close it).

The BBCode bolds the names and action, shrinks and mutes the dice-roll breakdown, and bolds + colours the result line (green for heals, red for damage). For example, a heal entry copies as:

```
[b]phoopes[/b] uses [b]Heal[/b] on [b]miyazaki (from dark souls)[/b]
[size=1][color=#8b8f9c]1× [2–4] → [4] = 4[/color][/size]
[b][color=#2e7d4f]+4 HP[/color][/b]
```

If your forum's theme doesn't get along with the colour codes, just edit or strip them out of the pasted text — the preview box makes that easy since it's plain, selectable text.

## Spawning monsters (Bestiary)

Click **+ Spawn monster** above the roster to search the built-in bestiary and add an instance to the roster with a `MOB` tag. Spawning the same creature twice auto-numbers them ("Wolf", "Wolf (2)") so they don't collide. Mobs can be removed from the roster with the **×** on their row (players from your uploaded sheet can't be removed this way — only re-uploading changes them).

When a mob is set as the **attacker**, the Action panel automatically narrows to just that creature's own two preset abilities (from the bestiary's Ability 1 / Ability 2 columns) — the type tabs are hidden since they're not relevant. Set a player as attacker again and the full action list comes back.

Mobs use the same HP/Attack/Defence/Speed Bonus fields as players and are fully compatible with everything else in the tool (statuses, retaliation, undead doubling, etc.) — Zombie, Vampire, and Lich specifically are always treated as undead regardless of their Status field, same as a player who's contracted Zombie or Vampire.

You can also upload a custom Bestiary CSV (same columns as `SRP2 - Bestiary.csv`) to override the built-in list.

## Statuses, immunities, and item effects

This update wires up the status-effect system end to end, reading immunities and passive item effects straight from the Items CSV (also baked in by default — upload a custom one via **Upload custom items CSV** to override it). Here's the order of operations for a damage-dealing action, since several of these interact:

1. **Roll the dice.** If the target already has the **Burned** status, every individual die gets +1 — not just the total. So a multi-hit action like Flurry Attack (2 dice) gets +1 on each of its two dice against a Burned target, not +1 once.
2. **Add Attack Bonus, apply Defence Bonus** as before (respecting IgnoreArmour/PunishArmour).
3. **Ferryman's Lantern:** if the attacker has it equipped and the target counts as undead, the total is doubled. "Undead" means the target's Status is Zombie or Vampire, or it's a Zombie/Vampire/Lich from the bestiary.
4. Damage is applied to the target's HP.
5. **Retaliation:** if the target's equipped armour has a passive retaliation effect (Thorned Breastplate's 1 damage, Molten Armour's Burned), it's applied back onto the attacker now — guaranteed, not a coinflip, since it's a gear effect rather than an ability roll.
6. **The ability's own status effect** (the action's `Effect` column, e.g. Ignite → StatusBurn) is rolled against the target: a coinflip, unless the target is immune (see below), in which case it just fails outright with a note. Howl's `BuffAB2`-style effects are guaranteed instead of a coinflip, since they're self-buffs, not something inflicted on a resisting target.
7. **Weapon Transform** (Chain Lash ↔ Sickle Slash, etc.) still applies last, as before.

**Immunities** come from whatever's in the target's `Equipped armour` and `Equipped trinket` fields, matched against the Items CSV — e.g. Hellebore ("Grants immunity to the Burned status") or Perfected Suit ("Grants immunity to all status effects"). An immune target's status coinflip always fails with a note explaining why, rather than silently rolling.

**Cure** (the StatusClear ability, 100% chance, not a coinflip) sets Status to OK — except if the target's equipped armour permanently forces Blind or Zombie onto them (Sealed Armour, Cursed Armour). In that case Cure fails outright with a note, since the forced status is a property of wearing the armour, not something that was inflicted and can be lifted. Forced statuses (including Molten Armour's forced Burned) are applied automatically the moment that armour is equipped — either by uploading a sheet where someone's already wearing it, or by editing their Equipped armour field live in the tool.

**What's intentionally not automated:** a few items do things this session-based tool has no real model for — anything tied to a "cycle" tick (Living Armour's regen, Crackling Orb's per-cycle Charged), and passive proc-chance effects that trigger on any attack regardless of the ability used (Venom Gland). Stat-bonus items (Primal Talisman, Thick Carapace, etc.) also aren't auto-applied to the Attack/Defence/Speed Bonus fields — those fields are assumed to already reflect whatever the character has equipped, same as before this update. If you want any of these wired up too, they're straightforward additions once we agree on how they should behave without a cycle/turn structure.

## Correction: the scroll-to-newest fix was actually backwards

You were right to push on this — my first attempt (`scrollTop = 0`) was wrong, and my own test didn't catch it because it only checked DOM order, not what was actually on screen. Checked it properly this time by reading actual bounding boxes to see which entry is visible, not just a scrollTop number, across 16 consecutive rolls plus a deliberate scroll-to-oldest-then-roll-again check — every case now correctly shows the newest roll.

The real story: in this `column-reverse` layout, `scrollTop = 0` shows the **oldest** entry, and the newest is at the most *negative* scrollTop (`-(scrollHeight - clientHeight)`), which is what's actually wired in now. That also explains why it looked like nothing had changed — the ledger was resetting to a valid, real scroll position, just the wrong end of the log.

## New: Cycle Messages — a second page

There's now a second page, `cycle-messages.html`, linked from the combat helper's header ("Cycle Messages →") and vice versa ("← Combat Helper"). It generates the pre-cycle status message each player would receive — the BBCode block from your `generateMessages.py` script — for every player at once, in one click.

### What it builds, per player

Cycle number, arrived/still-here phrasing, region description, POI description, who else (players and enemies) is at their location, messages left at that tile, available actions, and a full inventory listing — same structure as the original script, adapted to read from the same character sheet the combat tool uses (Entity Type/Base Name and all) instead of a separate Enemies.csv.

**Corpses are fully derived now, per your call** — anyone (player or enemy) with Status `KO` at a location shows up as a body there automatically. No separate list to maintain, and it can't drift out of sync with actual combat results. One bug this caught immediately: a KO'd player's own message was listing *themselves* as a bystander corpse — fixed, a player never appears in their own body count.

**One open question this surfaced, worth deciding:** right now, a KO'd player still gets the exact same full cycle message as everyone else — sees the room, hears messages, gets an actions list. Is that intended (maybe they can still perceive while down?), or should defeated players get something different — a short "you're unconscious" message, or no message at all? Didn't want to guess on this one.

### Location data — reading your actual Aseprite files, not a simplified copy

The "Upload locations folder" button reads the exact same per-location tile-grid CSVs (`TileLabel, TileType, TileImage, DecorationBorderImage, DecorationTileImage`) that `createCycleImagesCompact.lua` already reads — confirmed by cross-checking the column indices between both scripts. Region comes from the first tile's `TileType` (matching the original script exactly); POI comes from whatever's on the tile labelled `D4`, matched against your POI list by decoration image name. This is a genuine folder picker (`webkitdirectory`) — one click, select the same `locations` folder Aseprite uses, done. It doesn't remember a path or auto-reload from disk; like every other upload in these tools, it reads the files into the page once, at the moment you pick them.

### Persistence: `data.js` as the single baked-in baseline

This is the bigger structural change: **Actions, Items, Bestiary, Statuses, Regions, POI, Messages, and the location tile grids all now live in one shared file, `data.js`**, loaded by both pages (`<script src="data.js">`, same as `app.js` already was — not a local file reference, just a second file hosted alongside `index.html` on GitHub Pages, exactly like `app.js` has been from the start). The **character sheet is deliberately excluded** — it's live game state that changes every cycle through actual play, not reference data, so it stays a manual upload/export each session exactly like it always has.

The **"Export updated data.js"** button (on the Cycle Messages page) serializes everything currently loaded — whatever's baked in plus anything you've uploaded or added this session — into a fresh `data.js` file. Replace that one file in your GitHub repo, and it becomes the new default for both pages, on every device, from then on. Verified this round-trips correctly: exported it, checked the file parses as valid JavaScript, and confirmed a manually-added test message survived the export intact.

There's also a **small in-page editor for Messages** specifically (add one via a location code + text box, remove one with a click) — the dataset most likely to need quick between-cycle tweaks — so small changes don't need a Google Sheets round-trip before exporting. Regions, POI, Actions, Items, Bestiary, and Statuses are still upload-only for now (bulk CSV replace); happy to add similar quick-editors for any of those if they turn out to need frequent small tweaks too.

### What still needs your input

- The KO'd-player message question above.
- Whether you want small in-page editors for anything beyond Messages.
- The location folder only has two test grids in it right now (I made them up to test the pipeline) — upload your real one and hit Export whenever you're ready to make it permanent.

## Update: Parasite now scales with hit count

Following up on the elegance question — Burned stays exactly as it was (see the analysis further down; the "-1 Defence Bonus" reframing looked cleaner but actually breaks IgnoreArmour/PunishArmour weapons), but Parasite changed: it's now modeled as **+1 Attack Bonus** rather than a flat +1 added once per attack. Attack Bonus already applies per hit (from the earlier per-hit-math update), so this means Parasite now genuinely adds +1 to *every* hit on a multi-hit weapon — a 2-hit Flurry Attack gets +2 total instead of +1. Charged is untouched and stays a flat one-time +1 regardless of hit count, since that's a different mechanic (a stored charge discharging once), not something anyone asked to change.

This choice is safe specifically because Attack Bonus is used identically in all three damage formulas (normal, IgnoreArmour, PunishArmour) — unlike Defence Bonus, which behaves differently across those three (skipped entirely under IgnoreArmour, added instead of subtracted under PunishArmour). Tested Parasite against a Piercing Blow-style ability and a Crush-style one specifically to confirm it adds correctly in both rather than misbehaving the way a DB-based reframing would have.

### Why Burned didn't change (the actual math)

The suggestion was reframing Burned as "-1 Defence Bonus" instead of "+1 damage per die," which looks like a nice simplification — and for ordinary attacks, it's provably identical (verified by direct calculation, not just eyeballing it). But it breaks down for the handful of weapons that don't use the standard formula:

- **IgnoreArmour** weapons (Piercing Blow, Spear, Precise Strikes) skip Defence Bonus entirely — so "-1 DB" would have **zero effect** on them, while the current "+1 per die" still correctly boosts their damage against a Burned target.
- **PunishArmour** weapons (Crush, Hammer) *add* Defence Bonus as damage instead of subtracting it — so "-1 DB" would **backfire**, reducing damage instead of increasing it, the exact opposite of what Burned is supposed to do.

Since the current implementation is already correct in all three cases and the reframing would silently break two of them, it's staying as-is. Good instinct to question it, though — this is exactly the kind of thing that's easy to get wrong by reasoning about the "obvious" simplification instead of actually running the numbers against every ability that touches Defence Bonus differently.

## Update: Status is now a dropdown

The Status field in the character panel is a `<select>` now, populated from your Statuses CSV (baked in by default — OK, Burned, Frozen, Charged, Poison, Parasite, Vampire, Zombie, Blind — with an "Upload custom statuses CSV" button if you want to change that list). Hovering an option shows its description as a tooltip, straight from the CSV's Description column.

Same safety net as the equipment dropdowns: if a character's current Status doesn't match anything in the list (an old value, a typo, something from before this existed), it's kept as an "(unrecognized)" option rather than silently overwritten — nothing on an existing sheet gets clobbered by switching to a dropdown. Everything that reads or writes the Status field programmatically (KO on defeat, Charged's discharge, Poison ticks, forced statuses from armour, and so on) is untouched — this only changes how a person edits it by hand.

## Update: Inspect

Inspect (granted by the Appraiser's Monocle) now actually reveals something — status, HP, effective Attack/Defence/Speed (the same real numbers combat math uses, gear and status modifiers baked in, not just whatever's typed into the base fields), and equipped weapon/armour/trinket. Shown as its own clean multi-line block in the ledger and copies the same way into BBCode, one line per attribute:

```
[i]Status: Burned[/i]
[i]HP: 6 / 10[/i]
[i]Attack 3 · Defence 1 · Speed 0[/i]
[i]Weapon: Staff · Armour: Berserker Armour · Trinket: None[/i]
```

Deliberately limited to equipped gear, not inventory contents — Inspect reveals what's worn/wielded, not what's being carried. And since Inspect genuinely needs a target to mean anything (unlike most Miscellaneous actions, which don't), the Roll button is disabled without one instead of quietly doing nothing useful.

## Update: cleaner no-roll entries, ledger always jumps to the newest roll

The "No roll — narrative action." filler is gone — from the visual ledger and the BBCode copy alike. If an action has nothing else to report (Talk, Shop, etc.), that line is simply absent now rather than showing empty-handed text. Anything that *does* have a real result (Status effects cleared, Cure failed, a transform, etc.) is untouched.

The combat ledger now always scrolls back to the newest entry the moment a new roll happens, even if you'd scrolled down into older history to check something. (See the correction note above — my first attempt at this got the scroll direction backwards; it's fixed now and verified properly.)

### Split view refinements

Following up on the first pass: HP is now two side-by-side boxes (Current / Max) instead of cramming both into one inline row — that's actually what caused the awkward stacking you saw, since two number inputs plus a "/" don't reliably fit on one line at half-width. Location (current + previous) is back under each name. Status checkboxes are now a 2-column grid instead of one long list, cutting the vertical space roughly in half. And Inventory is no longer collapsed — all 6 slots show directly, since a click-to-reveal toggle wasn't actually saving anything meaningful.

## Update: Quake hits everyone; Bestiary Attack Bonus trimmed

Baked in your updated Actions and Bestiary sheets:

- **Quake** is now an area attack (`DamageRangeAll`) with 3 hits (was 5, single target). Like the other area attacks (Meteor Shower, Antimatter), the tool resolves one target at a time: the driver selects each target and clicks once per target, and each click rolls Quake's 3 hits on the selected target.
- **Attack Bonus trimmed on six monsters:** Boggaren, Assassin, Harpy Witch, King Crab and Scorparion 2 to 1, and the Lich 1 to 0. This follows the damage-model analysis (multi-hit abilities multiply Attack Bonus on every hit).

Checked in the tool: a spawned Boggaren's Quake averages 6.0 / 3.0 / 1.0 against Defence Bonus 0 / 1 / 2, exactly what the model predicts. Every Bestiary ability, item action, Transform and drop still resolves, and all five regression suites pass (177 checks).

## Update: Howl is a Miscellaneous self-buff

Howl is now Miscellaneous with no roll cells, so it can't damage anyone. The sheet change alone would have broken it silently: the Miscellaneous path applied *status* effects but not buffs, so Howl did nothing at all (Attack Bonus unchanged, and the ledger just printed the raw text "Effect: BuffAB1"). The tool now applies buffs on that path too:

- **Who gets it:** whoever is selected as ATK, whether or not a target is selected. It only needs an ATK. Selecting the creature as its own target works too, but isn't required.
- **How it's logged:** with no target ("Dire Wolf uses Howl", result "Dire Wolf gains +1 Attack Bonus."), so a leftover target selection can't make it read as though someone else were affected. Tested with another character selected as a stale target: their HP, Attack Bonus and statuses are untouched, and the forum copy has no "on <name>".
- **Unchanged:** still permanent, stacking and uncapped (Dire Wolf 1 to 6, Groblin 0 to 5 and Harpy Witch 2 to 7 after five Howls); it survives export and re-import; a Charged creature that Howls keeps its charge.

Tested through the real UI with a spawned Dire Wolf: its action list shows Crush and Howl, the button reads "Log action" and is enabled with only an ATK set, and with no ATK it's disabled with "Set an ATK in the roster first."

## Update: Howl is a permanent, stacking buff; zero-dice actions no longer deal damage

Howl now reads "permanently raises the user's Attack Bonus by 1" (Effect `BuffAB1`). That's how the tool already treats buffs (written into the stored Attack Bonus, stacking, uncapped), so the change itself needed no code. Tested on real spawned creatures: five Howls give +5 for each of the three creatures that have it, **Dire Wolf (1 to 6), Groblin (0 to 5) and Harpy Witch (2 to 7)**, so the snowball isn't Dire Wolf only. It feeds straight into their attacks: Dire Wolf's Crush with a forced die of 1 deals 2 at Attack Bonus 1 and 7 at Attack Bonus 6. It lives in the sheet, so it survives export and re-import (a Dire Wolf exported at 9 came back at 9, still recognised as a mob with Howl). A freshly spawned creature starts again at the Bestiary's base value.

**A bug the snowball would have made serious.** An action that rolls no dice (Howl, Toxic Spore) was being calculated as if the die came up 0, so the attacker's Attack Bonus turned into free damage. At Attack Bonus 6, Howl hit its target for 6 (the ledger printed "No dice — flat effect" right next to "−6 HP"). It was already happening in small form (a Dire Wolf at Attack Bonus 1 dealt 1 with every Howl) and would have grown with each use. Fixed: zero dice means zero damage, and the attack-roll modifiers (Charged's bonus, Parasite's per-hit bonus) don't apply to it either, so a Charged creature that Howls keeps its charge. Toxic Spore still poisons at the usual coinflip. Controls on ordinary attacks (Slash, Charged, Parasite, Burned, IgnoreArmour, Crush, the Cursed Magick misfire) are unchanged.

**Also:** Kusarigama, Sickle's text is corrected to 3-5. For the first time, every weapon's item text and action data agree.

*(Howl has since become a Miscellaneous action, see the update above. The zero-dice fix still applies to Toxic Spore.)*

## Update: Max HP now shows the real max; Bottled Lightning and weapon texts settled

> **Superseded.** The "base + gear" display and the edit conversion described in this section were replaced by the applied-modifiers model (see "Update: gear and Blind are now part of the bonus numbers" near the end of this file). Max HP is now stored as the real number, and the "can read 11/10" note below no longer applies.

**Fairy Ring (and any gear that raises max HP) now shows the true max everywhere.** The bar and all the maths (heals, Sacrifice, Revive) already used base + gear, but the numbers didn't: the roster row said 7/10, the split-view Max box said 10 with no explanation, and the full sheet showed 10 with only a small note. Now all three show 11, and the split card and full sheet add a note ("10 base +1 gear") so you can see where it comes from.

Those Max boxes are editable, so typing into one converts back to the stored base underneath (type 15 with a +1 ring on and 14 is stored). Without that, each edit would count the gear twice. Removing the gear shows the base again, with nothing lost. Tested: edits in both views, a +5 trinket (Charm of Piety), ring plus armour stacking (+2), Heal and Sacrifice clamping to the displayed max, and Bright Fruit stacking on top. ATK/DEF/SPD keep their existing "→ total" style.

**Not changed:** unequipping HP gear while Current HP is above the new max leaves Current alone (it can read 11/10) until someone edits it.

**Also baked in:**
- **Use Bottled Lightning** is now Miscellaneous with no roll, so it no longer heals. Tested on the real data: HP unchanged, Charged applied 30/30, bottle used up, immunity still wins, and it now needs a target.
- **Blazing Torch** text is 1-3 and **Kusarigama, Chain** text is 2-3, matching their abilities.
- **Kusarigama, Sickle:** text corrected to 3-5 (see the update above), matching Sickle Slash.
- **Lightning Strike's delay** is left alone on purpose. A Transform (two staff states, like the crossbow and spellbook) is how it would be modelled.

### Design note: what clearing temporary buffs (Howl) would take
*No longer needed: Howl is now a permanent buff by design (see the update above). Kept in case a temporary buff is ever added.*

No existing status needs recategorising. The only buff in the data is Howl (`BuffAB2`), and the issue is that it writes straight into the stored Attack Bonus, so there's nothing separate to clear. It would take:
1. **A separate place for the buff:** one new character-sheet column (e.g. `Attack Buff`). The tool can add and backfill it by itself, as it does for the Status columns, so older sheets keep working. Effective attack becomes base + gear + status + buff.
2. **Howl writing there** instead of into the base.
3. **A way to clear it:** a "clear buffs" button, since the tool has no cycle clock to expire it.

Decisions needed: should a repeat Howl stack (+2, +4) or just refresh to +2, and should clearing be one end-of-cycle button for everyone or per character? The alternative is to model it as a status (a positive Blind), which reuses the checkbox and column, but a status is on/off so it can't stack, Cure would wipe it, and the +2 would be hard-coded rather than read from the sheet.

## Audit: do the action and item descriptions match what the tool does?

Freeze was missing its Effect, so it never applied Frozen. That's baked in now (verified: 29/60 trials, the same coinflip as every other status ability, and the Great Stylidium uses it). Prompted by that, every action description was checked against its Effect, Roll and Type columns and against what the code does, and every item's text was checked against the action it grants.

**Clean:**
- Every distinct Effect value is one the code understands, and every status it names is a tracked one. A typo like `StatusFreeze` would have failed silently, so this was worth confirming.
- All 14 actions that apply a status actually land it. The nine weapon/monster abilities are ~50% coinflips (26-36 of 60 each) and the five "Confers" consumables are 60/60.
- No other description or note names a status without delivering it. The only keyword hits were the five "Cures user of X" items, which are correct.
- Every status mentioned in a Bestiary note is delivered by one of that creature's abilities (Rattlesnake, Great Stylidium, Royal Stylidium, Acidic Ooze, Zombie, Vampire).
- Armour wording (Ignores / Adds Defence Bonus), multi-hit counts, and all the other weapon damage ranges match.

**Open, needs a decision from you** *(all four have since been settled or parked, see the updates above)*:
1. **Use Bottled Lightning heals 5 HP** (tested: 3 HP to 8) though its text says it only confers Charged. It looks like a leftover from the Curry/Tar/Gelato pattern. Mirroring the Writhing Symbiote row fixes it: set Type to `Miscellaneous` and blank Roll Min, Roll Max and Roll number. Tested in memory: no heal, Charged applied, bottle used up.
2. **Three weapon texts disagree with their actions.** The tool uses the Actions numbers, so tell me which side is right: Blazing Torch says 1-2 but Ignite rolls 1-3; Kusarigama, Chain says 1-2 but Chain Lash rolls 2-3; Kusarigama, Sickle says 2-4 but Sickle Slash rolls 3-5.
3. **Howl is permanent and stacks.** Its description says +2 Attack Bonus "for a cycle," but the tool adds it to the stored stat and nothing ever expires it (tested: 0, then 2, 4, 6 over three uses). There's no cycle clock to expire it, so for now the human has to subtract it back.
4. **Lightning Strike's "one-turn delay"** isn't modelled; it resolves the moment it's rolled, so the delay is the human's to enforce.

## Update: Harvest Herb produces an item (the Pocket Tree stays intact)

Your updated sheet sets Harvest Herb's Transform to `Aromatic Herb`, and you flagged that this Transform isn't a normal one. It isn't, and the tool already treats the two kinds differently, decided by what the Transform *names*:

- **Names a weapon** (Reload, Prepare Spell, Shoot Bolt): the attacker's equipped weapon is swapped.
- **Names anything else** (Harvest Herb, Eat Bright Fruit): "produce", so the new item is added to the first free inventory slot and the equipped weapon is never touched.

Whether the *source* item is used up is a separate decision, made from the source's own type (Consumable, or "Breaks after use"). That's why Bright Fruit disappears while producing its seed, but the Pocket Tree, a plain trinket, is never consumed. Tested with the Pocket Tree both equipped and carried in the inventory: the herb lands in the first free slot, the tree stays where it was, and the equipped weapon is unchanged. Four uses give four herbs, and with a full inventory nothing is lost or overwritten (the ledger says the inventory is full). The tool puts no limit on how often it can be used, so any per-cycle cap is the human's call.

Three things fixed while here:
- **A Transform naming something that isn't in the Items sheet no longer touches anything.** Previously it fell through to the weapon swap and silently overwrote the attacker's real weapon with the bad name (reproduced with a one-letter typo before the fix). It now changes nothing and the ledger names the Transform cell to check. Nothing in today's data triggers this, since every Transform resolves, but a later item rename could have.
- **"receives a Aromatic Herb" now reads "an Aromatic Herb".**
- **Actions with a Transform now require an ATK**, since they act on the attacker's weapon or inventory.

## Update: five actions that spent the item but skipped the effect

Found by testing what each action actually does against what its description promises. All five logged cleanly, which is why they looked fine. Fixed:

- **Revive** (Strange Crucible): the holder now returns at full HP. Previously it broke the Crucible and left them at 0.
- **Use Writhing Symbiote:** now applies Parasite. Previously it used up the item and only printed "Effect: StatusParasite".
- **Eat Bright Fruit:** now raises max HP by 1 (current HP is untouched). Previously it handed over the Fruit Seed and nothing else.
- **Sacrifice** (Ring of Sacrifice): the target goes to full health and the sacrificer to 0. It works on a defeated target, so it doubles as a revive. The Ring is not consumed; the cost is the life.
- **Harvest Herb:** works now, see the update above.

**"Confers the X status" is now guaranteed.** Read off the item's own text, the same way "Cures user of X status" already works. It covers five consumables: Spicy Curry (Burned), Nip of Tar (Poison), Silky Gelato (Frozen), Bottled Lightning (Charged) and Writhing Symbiote (Parasite); each verified 30 out of 30. Immunity still wins (a Hellebore wearer eating Spicy Curry stays unburned). Weapon abilities that merely *apply* a status, like Ignite, are still a coinflip (control test: 60-140 out of 200).

**Guards that run before anything is spent.** An action that couldn't do anything now leaves the item and everyone's HP alone and says why, rather than eating a Crucible or a life for nothing: Revive on someone who isn't defeated; Sacrifice onto yourself, onto a target already at full health, onto a Parasite or Vampire (whose healing would be negated), or by someone with no life left. The human can always override by editing HP by hand.

**Button and label fixes that came along.** Actions needing only an attacker (Eat Bright Fruit, Revive) no longer demand a target, and the warning now says which is missing ("Set a TGT…") instead of always "ATK and TGT". A Transform that drops an item into the inventory is labelled "Adds to inventory: Fruit Seed" rather than the misleading "Weapon becomes:".

**Harvest Herb's Transform cell:** done, see the update above.

**Also baked in:** the new Actions sheet (83 actions; Quill Test and Key Test removed).

### Decisions on record
- Defeated players stay selectable as attacker or target; the human running the tool makes that call.
- Zombie blocking Reload and Prepare Spell is intended.
- Narrative actions (Talk, Post, Shop, the link actions, the Place actions, Impersonate, Soar, Teleport, Monster Bait, Echo, Change Message, Plant) log a line and need a human to carry them out.
- Area attacks (Meteor Shower, Antimatter) stay single-target; the driver picks each target and clicks once per target, so each target gets its own independent roll.
- Location grids aren't ready yet, so none are baked in.

## Update: armour-ignoring fixes and the Harpy Ranger

Following the last round's flags, your sheets now match their own descriptions:

- **Shoot Bolt and Precise Strikes (the Catspaw's Estoc's action) now have `IgnoreArmour`.** Tested against a target with 99 Defence Bonus: Shoot Bolt with a forced roll of 3 deals 3 (armour ignored note in the ledger); Precise Strikes with rolls of 2 and 3 deals 5, each hit line reading `+0 ATK (armour ignored)`. As a control, an ordinary Slash against the same target still deals 0, so the effect didn't leak onto other attacks. Worth knowing: Precise Strikes' description already said it bypassed armour, but its Effect cell hadn't caught up, so until this update the tool was *not* ignoring armour for it. Any fight resolved with an Estoc before now had Defence Bonus applied.
- **Harpy Ranger's second ability is now Focus Shot** (was the non-existent "Aimed Shot"). A spawned Harpy Ranger offers both Swoop and Focus Shot, Focus Shot rolls normally, and since it now has two abilities the Randomize ability helper appears for it (30 clicks produced both results). Every ability in the Bestiary now resolves to a real action.

## Update: refreshed Items / Actions / Bestiary baked in

Statuses came through identical, so nothing changed there. What did change:

- **Five weapons/items renamed:** Torch → Blazing Torch, Estoc → Catspaw's Estoc, Hammer → Great Hammer, Spear → Soldier's Spear, Soggy Map → Stained Map. Cross-checked every Action link, Transform target, and Bestiary drop across all four sheets: nothing dangles, and the renamed weapons still grant Ignite / Precise Strikes / Crush / Piercing Blow as before (tested directly).
- **Piece of Victory ×4 → Mark of Devotion / Dominion / Vigilance / Wisdom.** Same "One of four" flavour, no actions attached.
- **Drops updated:** Thief now drops Padded Tunic / Pickpocket's Glove, Iron Crab drops Great Hammer, Groblord drops Fairy Armour. Confirmed through the real Roll drop button (40 rolls, only the two new Thief drops ever appear).
- **Descriptions only:** Shoot Bolt, Spicy Curry, and Crossbow, Loaded's text.

**Heads-up on renames and live character sheets:** any character whose sheet still lists an old name (say, a Torch in a weapon slot) will show it as "(unrecognized)" in the dropdown. It's preserved, never wiped, but it won't grant its action until the cell is changed to the new name. Cycle Messages will likewise list it as an unknown item in their inventory.

**Shoot Bolt's missing `IgnoreArmour`:** resolved in the update above.

**Harpy Ranger's "Aimed Shot":** resolved in the update above.

## Update: Base Name used for enemy narrative text, not just grouping

The "there is a X here" line was still pulling the unique display Name (`Wolf (2)`) for single instances — only the grouped-plural case was using Base Name. Fixed both the singular line and the corpses listing to use Base Name for enemies consistently, so players see "Wolf," never the internal disambiguation suffix. Players are unaffected (they don't have a Base Name, so corpses for them still show their real name). The unique display Name is untouched everywhere else — it's still what the tool uses internally to track which specific instance is which, which matters once ability targeting is built; this only changes what gets shown in the narrative text.

## Update: grouped enemy listings in Cycle Messages

Multiple instances of the same creature at a location now collapse into one line using the Bestiary's new `NamePlural`/`DescriptionPlural` columns, instead of repeating an identical line per instance. Grouping is by Base Name, not display name, so "Thief" and "Thief (5)" correctly count as 2 Thieves rather than showing up as two separate unrelated lines. A single instance still reads exactly as before ("There is a Wolf here..."); two or more reads as "There are 2 Thieves here. They brandish steel at you." — tested against your actual data (Wolf ×1, Thief ×2, Bandit ×1, Assassin ×1 at one location, Wolf ×1 and Scorpit ×1 at another) and confirmed the grouping is correctly scoped per-location, not bleeding across locations that happen to share a creature type. Falls back gracefully to the singular name/description if a bestiary entry hasn't been given plural text yet, rather than showing blank.

## Update: side-by-side ATK/TGT view

When both an attacker and target are selected, the character panel now shows them side by side instead of just whichever was last clicked — the everyday combat case, since you almost always want both sets of stats in view before rolling.

Rather than literally halving the existing full-detail layout (which would've squeezed several already-nested two-column grids — stats, equipment, inventory — into an unworkable width), each side gets a distinct compact card: HP bar, the three stat numbers, the full interactive status checkbox list (not simplified to a passive tag list — genuinely toggleable, single-column so it fits), equipped weapon/armour/trinket as stacked dropdowns, and Inventory collapsed behind a "▾ Inventory" toggle since it's rarely what you need mid-decision. Everything in it is live-editable, same as the full view.

**How it decides what to show**, all handled automatically:
- Both ATK and TGT set → split view.
- Only one set, or neither → the existing full single-character view (or the empty state).
- Click a name → "pins" that one character full-width (useful for editing their full inventory, or checking on a bystander who isn't currently ATK/TGT) — a "⇄ Compare ATK vs TGT" button appears to jump back.
- Re-toggling either ATK or TGT tag automatically un-pins and snaps back to the split view, so you're never stuck looking at someone who's no longer relevant.

Tested all of this directly — the four render states, live editing of HP/stats/status/equipment on both cards independently, the inventory toggle, pinning, and the back-to-split button, plus re-targeting mid-pin correctly restoring the comparison view with the new pair. One real bug surfaced and got fixed along the way: editing a field in the split view could throw a harmless-but-noisy console error from a DOM-replacement race with the browser's own input cleanup — fixed by deferring the re-render one tick, standard practice for this exact situation.

## Update: Pebble Weights excluded from theft

Following up on the exploit you spotted — Pickpocket now skips any slot already holding a Pebble Weight when picking what to steal, so it can no longer recycle its own decoys into an infinite supply. If a target's inventory is either genuinely empty or entirely decoys, it now says "has nothing worth stealing" instead of quietly generating more junk. Tested all three shapes directly: an inventory of only Pebble Weights, a mixed one (confirmed the existing Pebble Weight slot is never touched across five repeated attempts — only the real item ever gets taken), and a fully empty one.

## Fix: cache-busting on script tags

Root cause of the Pickpocket mystery, finally nailed down: your live `app.js` file on GitHub had the correct code the whole time (confirmed by viewing it directly), but your browser was executing a **stale cached copy** independent of that — confirmed by `performAction.toString().includes('pickpocket')` returning `false` even though the file itself, fetched directly, contained it four times over. A hard refresh doesn't reliably beat this for JS files specifically, since some caches (browser or CDN-level, in front of GitHub Pages) key on the bare URL and don't aggressively recheck freshness.

Fixed by adding a version query string to every local script tag — `app.js?v=3`, `data.js?v=3`, `cycle-messages.js?v=3` — on both pages. A query string makes the full URL different from the browser/CDN's point of view, so there's no stale entry to accidentally match; it's forced to fetch fresh. I'll bump that `v=` number on both HTML files whenever a future update needs to guarantee a clean load, and you can do the same if this ever recurs — it's a much more reliable fix than asking for a hard refresh each time.

## Update: Pickpocket implemented

Pickpocket now actually does something: picks a random occupied slot from the target's inventory, replaces it with a Pebble Weight (the closest match on the sheet — nothing's literally named "Stone Weight," but "Has no use" fits the decoy-junk concept exactly), and gives the stolen item to the attacker if they have a free slot. Tested all the edges: a clean steal, a target with nothing to take ("has nothing to steal," no swap happens), and an attacker with a full inventory (the target still loses the item either way — the theft itself always succeeds, it's just carrying it that can fail). Gated the same way as Inspect — needs an actual target, so the Roll button is disabled without one instead of quietly doing nothing.

One assumption worth flagging: the item's description only says the target's item gets *replaced*, not that the attacker keeps it — giving the attacker the stolen item is my read of what "pickpocket" implies, not something stated outright. Easy to change if that's not the intent.

## Update: Cursed Magick fully resynced, gap-filling actions added

Your updated Actions.csv closed out both flagged gaps cleanly:

- **Cursed Magick now matches its item description exactly** — roll range corrected to -2 to 2, and `IgnoreArmour` is now actually set. Tested both halves: a -2 roll still correctly misfires into a +2 heal, and a positive roll now genuinely ignores Defence Bonus (verified against a target with 99 Defence Bonus — took full damage regardless).
- **Bloodlust 1–6, Pickpocket, Impersonate, and the four Place-X actions all have real rows now** and work as ordinary gated actions. Bloodlust's escalating roll ranges are in place and functional as static per-tier rolls — confirmed Bloodlust 1 selects and resolves correctly when Muramasa 1 is equipped.
- **Crossbow/Spellbook transform names now match the renamed items** (Reload → "Crossbow, Loaded", Prepare Spell → "Spellbook, Charged", etc.) — just needed the CSV re-embed, no code changes.
- **Your new sheet already includes `Status Poison`** — loaded directly, no backfill needed (though the auto-backfill logic from last time is still there as a safety net for any future sheet that's missing a column).

Two things worth your attention, not fixed since they need your input:

- **Pickpocket's Notes field looks like a copy-paste of Return's** ("Return user to the location in their 'Bookmark' field...") — clearly not what Pickpocket should do. Worth checking the source sheet.
- **Bloodlust's escalation-on-kill isn't implemented** — the six tiers work as static rolls, but nothing tracks kills or auto-upgrades the weapon between them (the Muramasa items also have blank `Transform` fields, so there's no data path to drive this yet). For now that's a manual re-equip when a killing blow lands; let me know if you want it built as a real tracked mechanic.

## Major update: multiple simultaneous statuses

This was a genuinely large refactor — your new character sheet format (`Status Blind`, `Status Burned`, etc. as independent TRUE/FALSE columns instead of one `Status` text field) touches nearly every status mechanic the tool has. Here's what changed and what to know.

**The character panel's Status section is now a checkbox grid**, one per tracked status, built from your Statuses.csv — so a character can genuinely be Burned *and* Poisoned *and* Frozen at once now, which was never possible under the old single-field model. Multiple active statuses show as a combined pill in the roster row ("Burned, Poison, Zombie") instead of just one.

**A forced status (from armour) shows checked, disabled, and tagged "FORCED"** in that grid — you can't manually toggle it off, since it's a consequence of what's equipped, not an independent flag. Related improvement: unequipping the armour that forced a status now automatically clears that status, which the old system never did (swap out Cursed Armour and you're no longer permanently Zombie — verified with a direct equip/unequip test).

**KO is no longer a stored status at all** — there's no `Status KO` column in your new sheet, and I don't think there should be. Defeat/revival is now purely "did Current HP cross zero," checked fresh at every HP change rather than written into a field. This actually simplifies a few things that used to require careful ordering (Charged's self-damage discharging *and* potentially finishing the attacker off, for instance, now just works — the two concerns are fully independent).

**The multi-status model unlocked something real for curing.** Under the old single-status system, "Ice Crystal cures Burned" and "Gleaming Elixir cures everything" were mechanically identical, since only one status could ever be active. Now they're genuinely different: Ice Crystal (and the other single-target cure items) reads its own item description ("Cures user of Burned status") and clears *only* that flag; Gleaming Elixir and the Cure ability still clear everything. Tested directly: a character both Burned and Poisoned, given Ice Crystal, loses only the Burned flag and keeps Poison. Cure-resistant forced statuses (Blind, Zombie) still can't be cleared by either kind while the forcing armour is equipped.

**Blind's penalty updated to -2 Attack Bonus** (was -1), per your updated Statuses sheet.

**One thing I fixed proactively rather than flagging:** your uploaded sheet is missing a `Status Poison` column entirely (every other status got one). Rather than have Poison silently stop working, the tool now auto-detects any missing status column against whatever Statuses.csv defines, adds it, and backfills everyone to FALSE — the same pattern already used for Entity Type/Base Name on older sheets. So Poison works correctly even without that column present, and it'll be included from your next export onward. Worth adding it to your actual Google Sheet too, so this stops being something the tool has to paper over.

**Also fixed:** the "data.js missing" defensive check I built a couple of updates ago never actually made it into a shipped file — it's genuinely in there now, on both pages.

### Two real data gaps worth your attention (not fixed, since I can't guess at intent)

- **Cursed Relic is out of sync between your two sheets.** The Items CSV now describes it as "-2 to 2 damage, ignores Defence Bonus," but Actions.csv (not re-uploaded this time) still has the old -1 to 5 range with no ignore-armour flag, so Cursed Magick's actual behavior in the tool hasn't changed yet. Worth reconciling next time you update Actions.csv.
- **Several new items grant actions that don't exist in Actions.csv yet** — the Muramasa 1-6 swords' escalating "Bloodlust" damage (which also needs a kill-counter mechanic this tool doesn't model at all), Pickpocket's Glove, Prismatic Mask's Impersonate, and the Stone Arrow/Feather/Flame/Crown "Place X" actions. Same gap-filling pattern as the consumables a while back — equipping/holding these currently grants no usable action until rows are added.

## Update: Cursed Magick misfires, Unstable Magick casts randomly

**Cursed Magick** — a negative roll (the only spell where that's even possible, since its Roll Min is −1) now heals the target for the absolute value instead of dealing 0 damage. This is implemented as a fully isolated early exit, keyed specifically off the action's name — it can't affect how damage or healing is calculated for anything else, and every other action's "negative-after-modifiers rolls floor to 0 damage" behavior is completely unchanged. The misfire heal still respects Parasite/Vampire's "negate all received healing" rule and can still revive a KO'd target, same as any other heal. Attack/Defence Bonus, undead-doubling, and Charged/Parasite's outgoing bonus are all skipped for the misfire specifically — those are damage-side mechanics that don't make sense once the spell's flipped into a heal.

**Unstable Magick** now actually does what its own description says — picks a random ability from IDs 18–54 and casts it, in addition to its existing Unstable ↔ Tapped Spellbook weapon transform. It shows up as two ledger entries: Unstable Magick's own (narrating which spell got picked, plus the weapon swap), immediately followed by that spell's own full resolution — its own dice, its own damage/heal, its own status effects, all exactly as if you'd selected it normally. One deliberate exception: if the randomly-picked spell would itself trigger a weapon transform (Chain Lash, Shoot Bolt, etc.), that's suppressed — otherwise a coincidentally-picked melee ability would hijack the caster's weapon out from under the Spellbook's own state cycle, breaking Prepare Spell's ability to turn it back. Tested through 15 casts, including one that happened to randomly pick Cursed Magick itself, which resolved correctly as its own independent roll (with its own shot at a misfire).

## Update: two small GM utilities

**Randomize ability** — sits right above a mob's ability list in the Action panel, and only appears when the current mob attacker actually has two abilities (a single-ability mob like a plain Wolf never sees it — nothing to randomize). Click it and it just shows `→ Infest` or whichever it picked; it doesn't select the action for you, so you still pick manually afterward. No logging, no BBCode — purely a quick decision-helper, as asked.

**Roll drop** — sits in the Character panel under a new "Bestiary" section that only shows up for spawned enemies with a resolvable bestiary link. Shows both drop names with their odds (Drop 1 at 70%, Drop 2 at 30%) and a button that rolls between them. Handles the edge cases too: a monster with only one drop always returns that one, and one with none says so plainly rather than showing a broken result. Also purely inline — no ledger entry, no BBCode, matching what you asked for.

Neither needed a new panel — both just slot into whichever existing panel you'd already be looking at for that decision (Action panel when it's their turn to act, Character panel when they're down and you're rolling loot).

## Update: Attack/Defence Bonus applied per hit, not once per attack

This is a real math change, not just cosmetic. Previously, a multi-hit action (Flurry Attack, Double Attack, Precise Strikes) summed all its dice first, then applied Attack/Defence Bonus once to that total. Now each hit gets the bonus applied — and floored at 0 — on its own, before the hits are added together. That matters whenever Defence Bonus outweighs Attack Bonus: a weak hit that doesn't clear the target's defence now contributes 0, instead of being propped up by a stronger hit landing in the same attack. Concretely, two hits of 1 and 3 damage against +1 ATK/−2 DEF used to total 3 (`(1+3)+1−2`); now it totals 2 (`max(0,1+1−2) + max(0,3+1−2)` = `0 + 2`).

The combat log reflects this directly: any action with more than one roll now shows one line per hit —

```
#1: 1–3 = 1   +1 ATK −2 DEF → 0
#2: 1–3 = 3   +1 ATK −2 DEF → 2
```

— each showing that hit's own die range, the raw roll, the modifiers, and what it actually contributed, followed by the usual bold total line. Single-hit actions are untouched — there's nothing per-hit to show when there's only one roll, so they keep the existing compact one-line format. This applies the same way in the BBCode copy, with each hit as its own small grey line above the bolded result.

## Update: consistent transform formatting

Transform messages ("X's weapon changes from A to B") were picking up different styling depending on where they happened to land — bold when they were the only thing to report (Reload), italic when they were a side-effect of an attack (Chain Lash, Shoot Bolt). They now always render the same way, everywhere: italic and blue (`#6f93c9`), on their own line, regardless of whether anything else happened on that roll. Same fix in the visual ledger too — transforms get their own consistently-styled line there as well, not just in the BBCode.

## Update: refreshed Actions + Items sheets

Pulled in your latest CSVs as the new baked-in defaults. A few things worth knowing about what changed and what it touched in the code:

- **Reload, Unstable Magick, and Prepare Spell all have real `Transform` values now** ("Crossbow", "Tapped Spellbook", "Unstable Spellbook"). All three work correctly end-to-end — tested the full Unstable Magick ↔ Prepare Spell weapon-state cycle same as the existing Kusarigama/Crossbow ones, no code changes needed since it's the same generic mechanism, just previously-empty data now filled in.
- **Rest became a real `HealRange` roll** (1 HP, guaranteed) instead of a no-roll `Miscellaneous` action. This actually broke something on my end that's now fixed: the rule "an action with no item behind it is only available to everyone if it's Miscellaneous, otherwise it's bestiary-only" assumed *only* Miscellaneous actions could be innate — which silently made Rest disappear from every player's action list the moment its type changed, since it still isn't linked to any item. Rest (and only Rest, for now) is now explicitly whitelisted as always-available regardless of type. Poison-clearing on Rest moved into the same code path as the new heal roll, since the old one it was hooked into doesn't run for Rest anymore.
- **Fruit Seed's granted action now reads "Plant" instead of "Plant Fruit Seed"**, which means it exactly matches the existing "Plant" action for the first time — so Plant is now correctly gated on carrying a Fruit Seed, instead of being available to everyone by accident (the old mismatched name meant it fell through to "innate" by default). Worth knowing this is a behavior change if anyone was relying on Planting without a seed before.

Tested all four of these directly, plus the full existing suite to make sure nothing else moved.

## Update: dice spacing + transform text

The dice notation now reads "1 × [2–2]" with a space before the ×, everywhere it appears (the ledger, the formula preview in the action panel, and the copied BBCode).

Transform messages ("X's weapon changes from A to B", "X receives a Y") are unchanged for attacks with damage — they still show as a secondary note under the damage line, same as Chain Lash always has. What's new is for no-roll actions like Reload: when there's nothing else to report as the result (no dice, no Cure/Return/Rest override), the transform message is now the *headline* result line instead of a generic "No roll — narrative action."

One thing this surfaced: **Reload's `Transform` column is currently blank** in your Actions.csv, so right now using it does nothing at all — there's no value telling it what the weapon becomes. I tested the display mechanism by simulating what it'd look like with `Transform` set to "Crossbow" (i.e. reversing Shoot Bolt's "Crossbow → Unloaded Crossbow"), and confirmed it shows correctly as the main result line once that value exists. You'll want to add "Crossbow" to Reload's Transform cell for it to actually do anything.

## Update: "defeated" messaging

Any time a character's HP hits 0, the ledger now says **"X is defeated!"** and their Status is set to `KO` — and the reverse works too: healing a KO'd character back above 0 HP now says **"X is back on their feet"** and clears the KO status automatically (this didn't happen before; a revived character's Status field would just sit on `KO` until someone manually fixed it).

This is wired into every path that can reduce HP to 0, not just the main attack roll — Thorned Breastplate-style retaliation and Charged's self-damage both correctly show the defeat message now too. That surfaced a real bug while I was in there: Charged's discharge was unconditionally resetting the attacker's Status to `OK` after dealing its self-damage, which meant a Charged attack that happened to finish the attacker off (rare, but possible at 1 HP) would silently un-KO them a moment later. Fixed — defeat now always takes priority over Charged's normal discharge.

## Where the design still has open edges

You asked what's still rough around the edges — here's an honest rundown, roughly in order of how likely I think you are to actually hit them:

- **A KO'd character can still act.** Nothing stops you from selecting someone with Status `KO` as an attacker or target. Might be intentional (last words, a revive ritual mid-fight) or might not be — if you want defeated characters greyed out or blocked from the roster's ATK/TGT toggles, that's a quick addition.
- **Zombie's mob-ability list bypasses the "no special actions" rule.** A player who's Zombified is correctly locked to Damage-type actions only, but a *spawned enemy* that somehow contracted Zombie (via a bite from another enemy, say) still gets its full bestiary ability list, since mobs run through a completely separate "only these named abilities" path that never checks status. No bestiary creature currently has a non-attack ability, so this can't actually bite you today — but it's an inconsistency worth knowing about if you ever add one.
- **Zombie blocks Reload/Prepare Spell along with everything else**, per the literal rule text ("cannot perform any special actions"). Still flagging this because it hasn't come up and been settled — happy to exempt weapon-readying actions specifically if that's not what you want.
- **Single-status model, still.** Nobody can be both Poisoned and Burned at once — the sheet only has one Status column, so whichever was applied most recently wins and the other is just gone. This has been true since the beginning and everything since has been built around it, but it's worth naming explicitly now that there are 8 interacting statuses instead of 2 — if you ever wanted to stack statuses, that's a real schema change (a set instead of a single field), not a small one.
- **Frozen has no effect at all right now.** Its only listed effect is the Speed penalty, which you've said not to bother with — so selecting it does precisely nothing mechanically. That's expected given your instruction, just flagging that it's a status with zero teeth if anyone asks.
- **DamageRangeAll is still single-target.** Meteor Shower and Antimatter only ever hit whoever's selected as the one target, not everyone at a location — this was your call early on and hasn't changed, just noting it's still the case now that there's more going on around it.
- **Unequipping something that was boosting Max HP doesn't clamp Current HP back down.** If gear was propping up someone's effective max HP and you remove it, they can briefly show Current HP above their new (lower) effective max, until the next heal/damage roll clamps it back. Cosmetic, self-correcting, but not instant.
- **Multi-hit abilities with a status Effect would only roll that status once per action, not once per hit** — no current ability actually combines multi-hit with a status effect, so this has never been exercised, but it's a real assumption baked into the code if you add one later.

None of these are things I think need fixing right now — just laying out where the edges are so nothing surprises you later. Let me know if any of these are worth tackling next, especially the KO-can-still-act one, which feels like the most likely to actually matter at the table.

## Update: enemies survive an export → re-import round trip

Previously, a spawned monster only existed as a "mob" in memory for that session — exporting and re-uploading the sheet later lost that entirely, and the tool would treat "Wolf (2)" as an ordinary player with no ability list, since nothing on the sheet recorded what it actually was. Two new columns fix this:

- **Entity Type** — `Player` or `Enemy`. Every character gets this now; anything from an older-format sheet with no such column defaults to `Player` automatically (and gets the column added retroactively the moment you touch anything, so it'll be there next time you export).
- **Base Name** — the plain bestiary species name ("Wolf"), kept separately from the unique display `Name` ("Wolf (2)"). This is exactly the "preserve both" split you asked for, and it's also the foundation for the location-based enemy lookup you mentioned wanting later — since every row already carries both `Current location` and this new `Base Name`, a "what enemies are at location X" view is just a filter over the existing sheet, nothing new to track.

On upload, any row tagged `Enemy` with a `Base Name` that matches a bestiary entry gets its ability restriction, undead flag, and bestiary link rebuilt automatically — so a re-imported "Wolf (2)" behaves exactly like a freshly spawned one: tagged `MOB` in the roster, restricted to Bite in the action panel, removable, etc. Tested the full loop (spawn two wolves → export → fresh reload → re-upload the exported file) and confirmed both come back correctly restricted. If a `Base Name` doesn't match anything in the current bestiary (e.g. you renamed a creature since), it stays tagged `Enemy` but won't get ability-gated — same graceful fallback as any other unrecognized data on the sheet.

## Update: status effect mechanics

The duplicate "Create Link" is gone from the bundled default too (I removed the one that had been added redundantly, keeping the original). The status-affliction message now reads "is now **afflicted with** X!" throughout, as requested.

Here's how each status now behaves, and the order things resolve in when several are in play on the same roll:

| Status | What's implemented |
|---|---|
| **Burned** | +1 to every individual die the target takes (unchanged from before). |
| **Frozen** | Not implemented — per your note, Speed only affects turn order, which this tool doesn't manage. |
| **Charged** | Adds +1 to the attacker's own outgoing damage, costs the attacker 1 HP, and discharges (clears their status) — all on the very attack that uses it. |
| **Poison** | +1 damage per attack isn't how this one works — it's a per-turn tick, and this tool has no automatic turn/cycle clock (same limitation as the cycle-based item effects we flagged earlier). Using **Rest** now clears Poison, matching "until player rests." For the actual damage tick, there's a manual **"Apply Poison tick (−1 HP)"** button that appears under Status whenever someone's Poisoned — click it once per turn/cycle as the GM, and it logs to the ledger like a normal roll so it's still copyable to the forum. |
| **Parasite** | Adds +1 to the attacker's outgoing damage on every attack (persists, unlike Charged). Also negates all healing *received* by a Parasite-infected target, whoever's doing the healing. |
| **Vampire** | The carrier heals 1 HP on every attack they make, guaranteed. They also can't be healed by a Heal-type action while infected (negated, same mechanism as Parasite). And separately, any attack a Vampire-status character makes has its own 50% chance to spread Vampire to whoever they hit — independent of whether the ability they used was Vampire Bite specifically. |
| **Zombie** | Same 50% spread-on-any-attack as Vampire. Also restricts the action list to Damage-type actions only — per "can only move or attack, cannot perform any special actions," a Zombie can't Talk, Rest, Cure, drink potions, or anything else non-combat, regardless of what they're carrying. This is a strict reading — if you want Reload/Prepare Spell exempted (so a Zombie can still ready their weapon), that's a one-line change. |
| **Blind** | -1 Attack Bonus, folded into the same effective-stat system as gear bonuses — shows up as a "gear, Blind → total" note under Attack in the character panel. The narrative "black void" part is outside this tool's scope, same as anywhere else visuals/messaging are handled by the actual game. |

A couple of order-of-operations notes since several of these can stack on one roll: Burned's bonus is baked into the dice before anything else (per-die); Charged/Parasite's +1 is a flat addition to the final total, applied after armour and undead-doubling, so Ferryman's Lantern doesn't also double it. Vampire's self-heal and the Vampire/Zombie contagion roll both happen after damage is already applied to the target, and are independent of the specific ability's own `Effect`-column roll — a Zombie using Zombie Bite gets two independent 50% shots at inflicting Zombie (one from the ability, one from the contagion), not one.

## Item-gated actions, equipment stat bonuses, and dropdowns

**Action list gating.** The action panel for a player now only shows what they can actually do, based on their equipment and inventory — the same idea as the bestiary gating, applied to players:

- **Weapon and trinket abilities** (Slash, Heal, Cure, Sacrifice, etc.) only appear if that weapon/trinket is currently equipped.
- **Narrative/utility actions** with no item behind them (Talk, Rest, Shop, Post, Manage Inventory, Touch Link, Plant) are available to everyone, always.
- Combat moves with no item behind them (Bite, Howl, Venom Sting, etc.) are bestiary-exclusive and never appear for a player, regardless of gear — those are only reachable by spawning the monster itself.

This is a live reverse-lookup against the Items CSV's own `Action` column — I didn't add a `SourceItem` column to Actions.csv, since every item that grants an action already names that action exactly once, and a second column would just be a second place for the two sheets to drift out of sync. If the same action name ever needs to come from two different items, that's the point where a dedicated column would earn its keep — happy to add it if that comes up.

**Consumables are used up.** Whichever inventory slot holds a consumable's source item gets cleared the moment its action is taken. Equip-slot items whose Effect text says "Breaks after use" (currently just the Strange Crucible) get unequipped the same way.

⚠️ **Important gap in the current data:** most consumables — potions, elixirs, scrolls, etc. (Gleaming Elixir, Spicy Curry, Ice Crystal, and 15 others) — don't actually have a matching row in Actions.csv, only an `Action` name pointing to nothing. Since the action panel is built entirely from Actions.csv, these items can't be "used" through the tool at all right now, even though the consumption logic above is ready for them. Only two consumables (Blue Ink → Create Link, Echoing Shell → Echo) and the weapon/trinket abilities actually have both halves in place and work end-to-end today. If you want potions usable too, we'd need to add rows for them to Actions.csv (most would probably be `HealRange` or `StatusClear` types) — I can draft that sheet if you want to go there next.

**Equipment stat bonuses.** Equipping or unequipping a weapon/armour/trinket now visibly changes a character's effective Attack/Defence/Speed Bonus and Max HP — shown as a small "+N gear → total" note under each stat, and actually used in damage/heal math (an equipped Primal Talisman really does add +1 to attack rolls now). Deliberately, this **never overwrites the base number you typed into the sheet** — it's added on top only at the moment of display or a roll. That's the safer design given your existing sheets already have hand-maintained totals in those fields; equip/unequip is instantly reversible and can't double-count or silently corrupt a value someone already tallied by hand. If you'd rather it overwrite the base field directly instead, that's a straightforward change — just say the word.

On your other question — yes, I'd recommend dedicated numeric columns for these eventually (`Attack Bonus Delta`, `Defence Bonus Delta`, `Speed Bonus Delta`, `HP Delta`) since text parsing is inherently a bit fragile against rewording. The tool already prefers those columns if they exist on an uploaded Items CSV, and only falls back to parsing `Effect` text when they don't — so it works with your sheet as-is today, and upgrading later is free.

**Dropdowns.** Every equipment and inventory slot is now a `<select>` populated from the Items CSV (weapon slot shows only Weapons, armour only Armours, trinket only Trinkets, inventory slots show everything). If a slot already contains something that doesn't match a known item name exactly, it's kept as a "(unrecognized)" option rather than silently replaced — so nothing on an existing sheet gets clobbered by this change.

## Update: the missing consumable actions are now wired up

Your updated Actions.csv added the 19 rows that were missing, and everything now works end-to-end for every consumable — Gleaming Elixir, potions, Bright Fruit, Bookmark, and the rest all have a real, selectable action now. A few things worth knowing about how they behave and two things I changed while wiring this in:

**Self-use items.** Things like Eat Spicy Curry or Use Ice Crystal are used *on yourself* — set yourself as both ATK and TGT for these (nothing stops you from doing that; it's how a self-targeted heal/status ends up on the right person).

**A real bug this surfaced, now fixed:** `Eat Bright Fruit`'s `Transform` column points to "Fruit Seed" — but `Transform` was, until now, always treated as a weapon swap (that's all it had ever been used for). Fruit Seed isn't a weapon, so the old code would have incorrectly set the eater's *equipped weapon* to "Fruit Seed." Transform now checks what kind of item it's pointing at: weapons still swap the equipped weapon as before (Chain Lash, Reload, etc.); anything else is treated as "the action grants this item," and it's placed in the first empty inventory slot instead. Tested both paths to confirm they don't cross wires.

**Mark Location / Return, implemented as a pair.** Per your Notes column, these needed to be linked rather than just gated by an item: using Mark Location (with a Bookmark item in inventory) saves the character's current location into the sheet's own `Bookmark` column, and **Return only appears in the action list once that's set** — it's not just always-on like other narrative actions. Using Return moves them back and clears the bookmark. One thing I had to catch: your actual character sheet uses `-1` as the "no bookmark set" placeholder in that column (not a blank cell) — I made sure both the "is Return available" check and the Return action itself treat `-1` as unset, so nobody gets a phantom Return option, and it's confirmed clean against your real data (two characters already have real bookmarks set — they'll correctly see Return available; everyone else with `-1` won't).

**A likely duplicate worth a look:** your sheet now has two rows named "Create Link" — ID 3 (which already existed, and was already correctly linked to Blue Ink before this update) and ID 68 (newly added, seemingly meant to do the same thing). Both work fine mechanically since they're gated identically, but you'll see it appear twice in the action list with slightly different wording. Worth deleting one from the source sheet next time you're in there — I didn't touch your data myself. (The two "Talk" rows, by contrast, are original and intentional — Talk to player vs Talk to NPC.)

**Still not modeled, and probably not worth it:** Cure-type actions (including the new Drink Gleaming Elixir) still can't override an armour-forced Blind/Zombie, same rule as before — that generalized automatically since it's keyed off the effect, not the action's name. A failed cure still consumes the item, on the logic that you did drink it, it just didn't work on a permanent curse — let me know if you'd rather failed cures refund the item.

## How the calculations work (and the assumptions baked in)

- **Damage** (`DamageRange`, `DamageSet`, `DamageRangeAll`): roll the action's dice (`Roll number` × a die from `Roll Min` to `Roll Max`, inclusive — min can be negative, as with Cursed Magick), sum them, then:
  - `total = roll sum + attacker's Attack Bonus − target's Defence Bonus`, floored at 0.
  - If the action's `Effect` contains **IgnoreArmour**, the Defence Bonus subtraction is skipped.
  - If it contains **PunishArmour**, the Defence Bonus is *added* instead of subtracted (per Crush's description).
  - Damage is subtracted from the target's Current HP (floored at 0). If that brings them to exactly 0 and their Status was "OK", the app auto-sets Status to "KO" — you can always edit it back.
- **Healing** (`HealRange`): roll sum only — Attack/Defence Bonus aren't applied to heals (this wasn't specified, so I went with the simplest reading; easy to change if your rules differ). Healing is capped at the target's Max HP.
- **`DamageRangeAll`**: per your call, this is currently treated as a single-target roll (same as `DamageRange`) rather than hitting every entity at the location. If you later want true multi-target support, that's a scoped addition, just say the word.
- **`Miscellaneous` / `StatusClear`**: no dice roll — just logs the action was taken (StatusClear also gets a "status effects cleared" note). You still need an attacker/target selected so it appears correctly in the log.
- **Chance-based effects** (e.g. "has a chance to inflict Burned") aren't auto-applied — the app just surfaces the effect name in the log/action panel as a reminder, and you set the Status field yourself when it lands.
- **Weapon transforms** (`Transform` column): performing an action with a Transform value sets the attacker's `Equipped weapon` to that exact value, unconditionally — this is purely an outcome of using the action, not a requirement check (you're choosing actions yourself, so the tool doesn't gate anything on current weapon). The Transform value is treated as a single item name even when it contains a comma — it's read straight from the quoted CSV field, never split on the comma. The swap shows up in three places immediately: the roster row, the character's Weapon field, and a ledger note (e.g. Chain Lash sets the attacker's weapon to "Kusarigama, Sickle"; Sickle Slash swaps it back to "Kusarigama, Chain").

If any of these formulas don't match your actual ruleset, they're all centralized in the `performAction()` function in `app.js` — easy to hand me the correct rule and I'll adjust.

## Notes on the data model

- One row = one character, matching your sheet.
- Nothing persists between browser sessions on purpose (no localStorage) — re-upload your CSV each time you open the tool, and export before you close the tab if you want to keep the changes. That keeps it simple and avoids any stale-data confusion between sessions.

## Update: gear and Blind are now part of the bonus numbers

**What changed.** The `Attack Bonus`, `Defence Bonus`, `Speed Bonus` and `Max HP` columns now hold each character's *real, current* numbers, with worn gear and Blind already included. Before, the tool kept those columns "as entered" and added gear on top only when it needed a total, so the sheet said Attack Bonus 0 for someone in Berserker Armour (+2). Anything that read the sheet, such as the cycle images, saw 0.

**The ledger.** Four new columns, appended after your existing ones: `Applied Attack Bonus`, `Applied Defence Bonus`, `Applied Speed Bonus`, `Applied Max HP`. Each records how much of that number currently comes from gear or Blind. This is what lets the tool take the right amount back out when gear comes off, and spot a sheet that was edited by hand. The rule is:

    real number  =  what the character has on their own  +  the applied amount

A permanent change (Howl, Bright Fruit, a number you type into the sheet) changes the real number and leaves the ledger alone, so it survives gear coming and going.

**One function does the work.** `syncAppliedModifiers()` compares what worn gear and Blind *should* contribute with what the ledger says is already included, and applies only the difference. Running it twice changes nothing the second time. It runs:

- when a sheet is loaded (this is also the one-time conversion of an older sheet),
- when equipment changes in either editor, when an item breaks, and when a weapon transforms,
- whenever a status is set or cleared (Blind moves Attack Bonus by 2),
- when an Items sheet is uploaded (a rebalanced item reaches everyone wearing it),
- and just before export, so the sheet always leaves the tool up to date.

As a last safety net, `effectiveStat` and `effectiveMaxHP` add any not-yet-applied difference, so a roll is never wrong and never counted twice, even if something somehow skipped the sync.

**Current HP.** Equipping something that adds Max HP raises Current HP by the same amount (never reviving anyone at 0). Removing it caps Current HP at the new maximum. Loading or reconciling a sheet never raises Current HP, so converting a sheet heals nobody.

**Converting an older sheet.** On first load the tool applies whatever your players' gear and Blind should contribute, then writes a log entry naming each character that changed and by how much (for example `wdadwawdawd: Attack +2, Defence +1`). The exported sheet carries the ledger, so loading it again changes nothing.

**Known limit.** If someone had already typed a gear bonus into an old sheet by hand, it will be counted a second time on conversion. The log entry will show the extra amount so you can correct it.

**What you see.** The stat boxes show one number. Hovering a box that includes gear or Blind says how much, for example "Includes +2 from gear / Blind". The Blind checkbox is locked while armour that forces Blind (Sealed Armour) is worn, so the flag and the number cannot be pulled apart.

**Worth knowing.** Because removing +HP gear only caps Current HP, taking a Fairy Ring on and off repeatedly raises Current HP a point each time until it reaches the maximum. If you would rather a loss of Max HP also lower Current HP by the same amount, that is a small change to the rule.

**Testing.** Scenario tests for loading, equipping, swapping, unequipping, Blind, forced statuses, hand-typed numbers, item breaks, weapon transforms, rebalanced Items sheets and hand-edited sheets; a randomized walk that makes hundreds of random changes through the real editors and checks every number against an independent model after every step; and a set of deliberately broken versions of the code to confirm the tests catch each kind of fault.

## Update: cycle messages now show statuses, worn-item and POI actions, and the win condition

**What a message contains, in this order:** the cycle, where you are (and the region line), your status conditions, the other people here, the enemies with their descriptions, the NPC / point of interest, bodies, messages left here, your actions, your inventory, and your win condition.

**New this update**
- **Status conditions.** Every status that is TRUE on the sheet (the `Status Blind`, `Status Zombie`... columns) is listed with its description from the Statuses sheet, in that sheet's order. An older sheet with a single `Status` column is still understood. A player with none gets no section.
- **Worn items give actions.** A worn trinket's or armour's action is listed (a Spirit Bangle gives Cure). It used to ignore worn items other than the weapon. A weapon's attack is still only offered when there is something to fight.
- **The point of interest's own action is listed** while you are at it (the Ball gives Touch).
- **Each inventory item says which action it gives**, as well as the action appearing in the Actions list. An action available twice is listed once.
- **The win condition comes last.** The sheet gets a `Win condition` column (any capitalisation) that names the condition; the message ends with `Your win condition: <name>` and its description. Matching ignores case and stray spaces.
  - A blank cell prints nothing and puts a warning on the player's card. So does a name that is not in the list, and the warning names it. Warnings are never part of the text you copy.
  - If the sheet has no such column yet, no win conditions are printed and the line under the upload button says so.
- **Win Conditions data.** The list is baked into `data.js` as `DEFAULT_WIN_CONDITIONS` (so `data.js` is now `?v=18` on **both** pages) and can be replaced with the new "Upload custom Win Conditions CSV" button. Rows with no name, and the unnamed extra columns of the source file, are ignored. "Export updated data.js" includes it. An older cached `data.js` without it does not stop the page: win conditions are just absent until a list is uploaded.

**Changed order.** Players are now listed before enemies, and the NPC / point of interest after the enemies, to match the agreed order. They used to be the other way round.

**Where NPCs and points of interest come from.** There is no separate NPC data: a location's POI is read from the centre tile (D4) of its location grid, using that tile's decoration image name, so a location has at most one. This only works once the location grids are loaded (the "locations" folder upload), which is why a message made without them has no region or POI line.

**Testing.** Scenario tests for each addition and the section order, a check that the new page says exactly what the old one did for a sheet with nothing new in it, and twelve deliberately broken versions of the code to confirm the tests catch each one.

## Update: knowing which version you are running (and why a new deployment can look unchanged)

**The problem.** A browser keeps a page it has already fetched for a while and, within that time, shows it again without asking the server anything. As far as I know GitHub Pages tells browsers to do this for about ten minutes (check your own site's headers with `curl -I`). The `?v=` numbers on the script tags only protect the *scripts*, and only once the page that contains them is fresh. So right after a deployment you can open the page, get the old copy straight from the browser's cache, and nothing on it can know it is out of date. This was reproduced here: after the new files were deployed, a normal revisit sent no request to the server at all.

**What every release now carries.** One build id (for example `2026-10-13a`) is stamped into every page, `app.js`, `cycle-messages.js`, `data.js` and a new small file, `version.json`. Each page then checks itself:
- A small badge in the bottom-right corner shows the build the page is running, and whether it is up to date.
- If a script file on the page is from a different build than the page asked for, a **Mixed versions** banner names the file and both builds.
- The page asks the server (bypassing every cache) which build is deployed. If that differs from its own, an **update banner** appears with a *Reload to update* button. It never reloads by itself, because reloading clears whatever is loaded into the page (the character sheet, the log). It also re-checks when you come back to the tab.
- If clicking Reload still gives the old page, the banner says the deployment may not have finished, or that the files were published to a different branch.
- If `version.json` is missing from the server, the badge says the update check is unavailable and nothing else happens.
- The `data.js` you export from the Cycle Messages page carries the same stamp, so it does not trigger a Mixed versions banner when you deploy it.

**Telling a stale cache from a deployment that did not happen (about a minute).**
1. Read the badge on the page you are looking at: that is the build you are running.
2. Open `your-site/version.json?x=1` in the browser. That is the build the server is giving out.
3. If they differ, it is the cache: press Ctrl+F5 (or add `?r=1` to the address). If `version.json` itself is the old build, the files have not been published yet: wait a few minutes, then check that GitHub Pages is publishing the branch you pushed to and that the deployment has finished.

You can also run `python check_release.py . --site https://your-site/` from the folder you deployed. It checks that the folder is one consistent release and, bypassing caches, what the live site is serving, and it says which of the two situations you are in.

**Before you upload.** Run `python check_release.py` in the folder. It checks that every page and script carries the same build id, that every script tag asks for it, that `version.json` agrees, and that nothing is missing.

**Upload all of these together:** `index.html`, `cycle-messages.html`, `app.js`, `cycle-messages.js`, `data.js`, `version.json`.

**The one gap.** A page from before this update cannot check itself, because it does not contain the check. After deploying this release, press Ctrl+F5 once on each page (or open it with `?r=1`). From then on, a stale page announces itself.

**Testing.** The caching behaviour was reproduced with a test server that sends GitHub-style caching headers and lets a "deployment" happen while a browser holds the old files, for both pages: a normal revisit shows the old page, the page notices, the button loads the new one, and the page's own state is never discarded. The checks cover mixed, old and missing files, a missing `version.json`, a deployment that has not finished, the exported `data.js`, and `check_release.py` against seven deliberately broken releases and against live sites that are behind or half-uploaded. Eight deliberately broken versions of the self-check were each caught.

## Update: choosing a target, a refresh of the baked data, and wording for points of interest

**The character sheet is not baked in, by design.** It is live game state and changes every cycle, so you upload it on the Cycle Messages page each time. That upload is what supplies each player's win condition (the sheet's `Win condition` column); the list of conditions itself is baked into `data.js`.

**Baked data refreshed** from Actions (sheet 16), Items (sheet 7) and Bestiary (sheet 6), using the combat helper's own upload code, and checked by re-baking the previous sheets and getting today's data back exactly. What actually changed: the descriptions of Echo, Sacrifice, Shoot, Focus Shot and Cursed Magick ("a target" is now "the target"), and Ring of Sacrifice's effect text. Nothing else in `data.js` moved, and what gear does to stats and statuses is identical for all 107 items. The Bestiary's new `Sprite` column (art-planning notes such as "Recolour.") is not read by anything, so it is not baked in.

**Target prompt.** An action that takes a target is followed by a line naming who can be picked:

    [Zap] - Zap the target for a set amount.
    [I]Select a target: wdadwawdawd, mr big gobbler, cockus noseus, Wolf, Wolf (2)[/I]

- **Which actions:** an action takes a target when its description speaks of one ("target" or "targets", including "target's"). That is how the Actions sheet is already written: all attacks, Heal, Cure, Sacrifice, Echo, Inspect, Pickpocket and Impersonate (43 of 83). Rest, Talk, Shop, Revive, the consumables and the area attacks (Meteor Shower, Antimatter, Quake, which hit everyone) have no prompt. **The wording is the switch**: a new action that takes a target only gets the prompt if its description says "target".
- **Who is listed:** every player and enemy at the player's location who is still standing, including the player themself. There is no split between attacking and healing: players choose as they see fit. Players come first, then enemies, each in sheet order. Names are the sheet's `Name`, which is unique ("Wolf", "Wolf (2)"), so a reply names exactly one entity.
- Defeated entities are not listed, and nothing is printed if nobody is left to pick. An action that comes from two places (a worn Blessed Armlet and one in the inventory) is listed once, with one prompt.

**Points of interest.** A POI's action used to be shown with no description whenever the POI sheet left it blank (the Fisherman, Chemist, Rest Stop, and the Talk ones). It now uses the Actions sheet's wording for that action name; a POI's own wording still wins. There are two `Talk` actions in the Actions sheet (one for players, one for NPCs); the one whose Notes mention an NPC is used at a point of interest.

**Testing.** The target prompt is tested by an independent Python implementation of the rules that works out each player's whole Actions block straight from the CSVs and compares it with the page's, across many situations (defeated entities, someone alone elsewhere, two Wolves, attack and heal together, area attacks, every wording of "target", a defeated player alone, each point of interest). Fifteen deliberately broken versions were each caught, one of which first exposed a gap in the tests themselves.

## Update: dice rolls in actions and items

An action that makes a dice roll now shows it after its description, in the form `(number * (min-max))`, taken from the Actions sheet's `Roll number`, `Roll Min` and `Roll Max` columns:

    [Assassinate] - Attack the target twice with killer intent. (2 * (2-4))
    [I]Select a target: ...[/I]

That is two rolls, each between 2 and 4. The roll comes before the target prompt, on the same line as the description.

**Where it appears.** In the Actions list (a weapon's, a worn trinket's or armour's, a point of interest's, and an inventory item's actions), and in the inventory itself: an item that gives an action now shows that action's description and roll, for example `Gives the action [Heal] - Restore HP to the target. (1 * (2-4))`. Only items in the inventory are printed as items; worn gear contributes its actions to the Actions list but is not listed as an item.

**Where the usual form would read badly or mislead**
- A fixed amount (min equals max) shows the number once: Zap is `(1 * 2)`, not `(1 * (2-2))`.
- A negative minimum reads `(1 * (-2 to 2))` (Cursed Magick), since `-2-2` is unreadable.
- `entityNum` (Meteor Shower) means one roll for each entity it hits, and reads `(1 per entity * (1-5))`.
- Nothing is printed for an action with no dice (Cure, Talk, Mark Location...), for an all-zero roll ("effect only", Toxic Spore), or for numbers that cannot be read, rather than printing something wrong.

43 of the 83 actions print a roll. These choices are all in one function, `formatRoll`, near the top of `cycle-messages.js`, if you want any of them changed.

**Testing.** The roll text for all 83 actions, and the whole Actions block and item lines of real messages (your sheet, a spread of weapons, worn and carried items, each point of interest), are compared against an independent Python implementation of the rules, worked out from the CSVs alone. Fifteen deliberately broken versions were each caught; one of them first exposed a gap in the tests (no worn item with a roll), which is now covered.
