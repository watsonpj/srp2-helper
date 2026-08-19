##########################################################################################################################
# Smogoff RPG private message generator

# Takes game status record CSV

# Works through player by player, producing text with format:

    # It is Cycle [cycleNumber].

    # [cycleImage.png]

    # This is [locationLabel] - [locationName].

    # [locationDescription].

    # <if there are enemies, list enemies>

    # <if there are players, list players>

    # <if there are messages, list messages>

    # <show inventory?>

    # Actions
    # <list actions>
    # End cycle
    # <list end cycle options>

##########################################################################################################################

import csv
import os

# File paths
player_csv_path = r"C:\Users\Admin\Pictures\aseprite\lua testing\smogoff rpg 2 test form (Responses) - Character sheets.csv"
location_base_path = r"C:\Users\Admin\Pictures\aseprite\lua testing\locations"
regions_csv_path = r"C:\Users\Admin\Pictures\aseprite\lua testing\smogoff rpg 2 - Regions.csv"
poi_csv_path = r"C:\Users\Admin\Pictures\aseprite\lua testing\smogoff rpg 2 - POI.csv"
messages_csv_path = r"C:\Users\Admin\Pictures\aseprite\lua testing\smogoff rpg 2 - Messages.csv"
corpses_csv_path = r"C:\Users\Admin\Pictures\aseprite\lua testing\smogoff rpg 2 - Corpses.csv"
items_csv_path = r"C:\Users\Admin\Pictures\aseprite\lua testing\smogoff rpg 2 - Items.csv"
actions_csv_path = r"C:\Users\Admin\Pictures\aseprite\lua testing\smogoff rpg 2 - Actions.csv"
bestiary_csv_path = r"C:\Users\Admin\Pictures\aseprite\lua testing\smogoff rpg 2 - Bestiary.csv"
enemies_csv_path = r"C:\Users\Admin\Pictures\aseprite\lua testing\smogoff rpg 2 - Enemies.csv"
output_dir = r"C:\Users\Admin\Pictures\aseprite\lua testing\cycle messages"

# Ensure output directory exists
os.makedirs(output_dir, exist_ok=True)

# Load region descriptions
region_descriptions = {}
with open(regions_csv_path, newline='', encoding='utf-8') as regions_file:
    regions_reader = csv.DictReader(regions_file)
    for row in regions_reader:
        region_descriptions[row["Name"]] = row["Description"]

# Load POI data
poi_data = {}
with open(poi_csv_path, newline='', encoding='utf-8') as poi_file:
    poi_reader = csv.DictReader(poi_file)
    for row in poi_reader:
        poi_data[row["Name"]] = (row["Description"], row["Action"], row["Action description"])

# Load Messages
messages = {}
with open(messages_csv_path, newline='', encoding='utf-8') as msg_file:
    msg_reader = csv.reader(msg_file)
    headers = next(msg_reader)
    for row in msg_reader:
        for i, message in enumerate(row):
            tile_label = headers[i]
            if message.strip():  # Ignore empty cells
                if tile_label not in messages:
                    messages[tile_label] = []
                messages[tile_label].append(message.strip())

# Load corpses
corpses = {}
with open(corpses_csv_path, newline='', encoding='utf-8') as corpse_file:
    corpse_reader = csv.reader(corpse_file)
    headers = next(corpse_reader)
    for row in corpse_reader:
        for i, corpse in enumerate(row):
            tile_label = headers[i]
            if corpse.strip():  # Ignore empty cells
                if tile_label not in corpses:
                    corpses[tile_label] = []
                corpses[tile_label].append(corpse.strip())

# Load items with actions
items = {}
with open(items_csv_path, newline='', encoding='utf-8') as items_file:
    items_reader = csv.DictReader(items_file)
    for row in items_reader:
        item_name = row["Name"].strip().lower()
        items[item_name] = {
            "Name": row["Name"],
            "Type": row["Type"],
            "Effect": row["Effect"],
            "Description": row["Description"],
            "Action": row.get("Action", "")  # Different format to allow for no action to pull (avoids crash)
        }

# Load Actions
actions = {}
with open(actions_csv_path, newline='', encoding='utf-8') as actions_file:
    actions_reader = csv.DictReader(actions_file)
    for row in actions_reader:
        action_name = row["Name"].strip().lower()
        actions[action_name] = row["Description"]  # Store name → description

# Load Bestiary
bestiary = {}
with open(bestiary_csv_path, newline='', encoding='utf-8') as bestiary_file:
    bestiary_reader = csv.DictReader(bestiary_file)
    for row in bestiary_reader:
        bestiary[row["Name"].lower()] = row

# Load Enemies
enemies = {}
with open(enemies_csv_path, newline='', encoding='utf-8') as enemy_file:
    enemy_reader = csv.reader(enemy_file)
    headers = next(enemy_reader)
    for row in enemy_reader:
        for i, enemy in enumerate(row):
            tile_label = headers[i]
            if enemy.strip():
                if tile_label not in enemies:
                    enemies[tile_label] = []
                enemies[tile_label].append(enemy.strip())

# Read player data
with open(player_csv_path, newline='', encoding='utf-8') as csvfile:
    reader = csv.DictReader(csvfile)
    all_players = list(reader)

# Process each player
for row in all_players:
    name = row["Name"]
    current_location = row["Current location"]
    previous_location = row["Previous location"]
    cycle_number = row["Cycle"]

    # Find other players in the same location
    other_players = [p["Name"] for p in all_players if p["Current location"] == current_location and p["Name"] != name]

    # Try to load location CSV
    location_csv_path = os.path.join(location_base_path, f"{current_location}.csv")
    location_data = []
    location_summary = "Unknown location."
    poi_description = ""
    poi_action = ""
    tile_messages = ""

    if os.path.exists(location_csv_path):
        with open(location_csv_path, newline='', encoding='utf-8') as loc_file:
            loc_reader = csv.DictReader(loc_file)
            location_data = list(loc_reader)

        if location_data:
            first_tile_type = location_data[0]["TileType"]
            location_summary = region_descriptions.get(first_tile_type, "A mysterious place.")

            # Look for TileLabel D4 and extract DecorationTileImage
            d4_tile = next((tile for tile in location_data if tile["TileLabel"] == "D4"), None)
            if d4_tile:
                decoration_image = d4_tile["DecorationTileImage"].replace(".png", "")

                # Check if decoration exists in POI data
                if decoration_image in poi_data:
                    poi_description, poi_action_name, poi_action_desc = poi_data[decoration_image]
                    poi_action = f"{poi_action_name} - {poi_action_desc}"

            # Check for messages at the current location
            tile_messages = messages.get(current_location, [])

    # Filename and file path
    filename = f"Cycle {cycle_number} - {name}.txt"
    file_path = os.path.join(output_dir, filename)

##########################################################################################################################

    # Message content
    message = f"It is [B]Cycle {cycle_number}[/B].\n\n"

    # Image
    
    # Location and summary
    if current_location == previous_location:
        message += f"You are at [B]{current_location}[/B].\n\n"
    else:
        message += f"You have arrived at [B]{current_location}[/B].\n\n"
    message += f"{location_summary}\n\n"

    # Points of interest from D4
    if poi_description:
        message += f"{poi_description}\n\n"
    
    # Enemies
    tile_enemies = enemies.get(current_location, [])
    if tile_enemies:
        for enemy in tile_enemies:
            bestiary_entry = bestiary.get(enemy.lower())
            if bestiary_entry:
                enemy_name = bestiary_entry["Name"]
                enemy_description = bestiary_entry.get("Description", "")
                message += f"There is a [B]{enemy_name}[/B] here. {enemy_description}\n"
        message += "\n"

    # Other players
    if other_players:
        message += "There are other people here:\n"
        for other in other_players:
            message += f"  - {other}\n"
        message += "\n"

    # Corpses
    tile_corpses = corpses.get(current_location, [])
    if tile_corpses:
        message += "You see some bodies here:\n"
        for corpse in tile_corpses:
            message += f"  - {corpse}\n"
        message += "\n"

    # Messages
    if tile_messages:
        message += "There are messages here:\n\n"
        message += "[TABLE width=\"100%\"]\n"
        for msg in tile_messages:
            message += "[TR]\n"
            message += f"[TD][CENTER][FONT=book antiqua]{msg}[/FONT][/CENTER][/TD]\n"
            message += "[/TR]\n"
        message += "[/TABLE]\n\n"

    # Actions
    message += "[B]Actions[/B]\n"
    seen_actions = set()  # To prevent duplicates

    # Actions from equipped weapon
    if tile_enemies:
        equipped_weapon = row.get("Equipped weapon", "").strip().lower()
        if equipped_weapon and equipped_weapon in items:
            weapon_data = items[equipped_weapon]
            if weapon_data["Action"] and weapon_data["Action"] not in seen_actions:
                seen_actions.add(weapon_data["Action"])  # Track printed actions
                action_name = weapon_data["Action"].strip().lower()
                action_desc = actions.get(action_name, "")
                message += f"[{weapon_data['Action']}]"
                if action_desc:
                    message += f" - {action_desc}"
                message += "\n"

    # Actions from inventory
    inventory = [row[f"Inventory slot {i}"].strip().lower() for i in range(1, 7) if row[f"Inventory slot {i}"] != "None"]
    for item_name in inventory:
        if item_name in items:
            item_data = items[item_name]
            if item_data["Action"] and item_data["Action"] not in seen_actions:
                seen_actions.add(item_data["Action"])  # Track printed actions
                action_name = item_data["Action"].strip().lower()
                action_desc = actions.get(action_name, "")
                message += f"[{item_data['Action']}]"
                if action_desc:
                    message += f" - {action_desc}"
                message += "\n"

    # Inventory
    inventory = [row[f"Inventory slot {i}"] for i in range(1, 7) if row[f"Inventory slot {i}"] != "None"]
    
    message += f"\n[spoiler=Inventory]"

    if inventory:
        for item_name in inventory:
            item = items.get(item_name.strip().lower())  # Match case-insensitively
            if item:
                message += f"    [B]{item['Name']}[/B] [SIZE=3]({item['Type']})[/SIZE]\n"
                message += f"    [SIZE=3]{item['Effect']}[/SIZE]\n"
                message += f"    [SIZE=3][I]{item['Description']}[/I][/SIZE]\n\n"
            else:
                message += f"  - Unknown item ({item_name})\n"
    else:
        message += "  None\n"

    message += f"[/spoiler]"

    # Write to file
    with open(file_path, "w", encoding="utf-8") as txt_file:
        txt_file.write(message)

    print(f"Generated: {file_path}")

##########################################################################################################################
