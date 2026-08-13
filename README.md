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
