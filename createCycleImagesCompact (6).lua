-- Variables to control the overall image
local spriteWidth = 480
local spriteHeight = 240

local startX = 221  -- X position in image to begin creating grid from
local startY = 47   -- Y position in image to begin creating grid from

local gridWidth = 7
local gridHeight = 7

local offsetX = 18 -- offset per tile image when drawing grid
local offsetY = 10

-- Settings for the character sheet
-- Defeated (0 HP) enemies are never drawn. Defeated players are drawn as corpses and do not get a cycle image of their own.
local drawPlayerCorpses = true    -- false = leave player corpses out of the picture
-- PLACEHOLDER PATH: change this to the real corpse sprite. It is one generic sprite, drawn once per corpse.
-- Until the file exists no corpses are drawn, and the console says so once per run.
local corpseSpritePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\corpses\\corpse.png"

-- Player sprites are made again from the character sheet every run, so a changed weapon shows up straight away.
-- They are written to the output folder with the names the pictures use: "<Name> SW.png", SE, NE and NW.
local regeneratePlayerSprites = true  -- false = use the sprites already in the output folder, as before
local spriteArtPath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\"            -- holds the skin, hair, upper, lower, accessory over, accessory under, weapon over and weapon under folders
local playerSpritePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\output\\" -- where the finished player sprites go

-- Identity-obscuring items. DUMMIED OUT: the list is empty, so nothing happens yet.
-- A player wearing one of these as their trinket is drawn in everyone else's picture as a generic stranger instead
-- (they still see themselves normally). To switch it on, add the item here and make the stranger art:
--     disguiseItems["Stranger Ring"] = true      and      output\stranger SW.png, SE, NE and NW
local disguiseItems = {}
local disguiseSpriteName = "stranger"  -- PLACEHOLDER: the file name, without the direction, of the generic stranger sprite

-- Players stand in the SAME place in every picture of a location: a player's side depends only on where THEY came from, never on who is
-- looking. Enemies are the exception on purpose: they stand on the side OPPOSITE whoever's picture it is, and face them.
-- (Before, a player who had not moved was re-rolled for every picture.)
-- A player who has not moved has no side of their own. Stationary players are spread over the four sides, always the same way:
-- each goes to the side with the fewest players so far, and ties go in this order.
local stationaryDirectionOrder = {"SE", "NW", "SW", "NE"}

-- The centre tile is kept for an NPC or a point of interest. DUMMIED OUT: nothing yet says which location has one, so this list is empty.
-- To try it: centreEntities["A1"] = "campfire" draws centre\campfire.png on the centre tile of every picture of A1.
local centreEntities = {}
local centreSpritePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\centre\\"  -- PLACEHOLDER: the folder those images would be in

-- Diagnostic, leave off normally: draws small squares on every picture to show where things are placed.
--   red = each player tile's draw point   magenta = each enemy tile's   white = the centre tile's   blue = player feet if the point were top-left (+ 16, 44)
--   yellow cross = the origin of each tile                cyan square = the centre of each tile if it is a 36 x 20 diamond (origin + 18, 10)
--   (a tile's centre is also the next tile's origin, so most points show a cyan square with yellow arms)
local drawPlacementMarkers = false

--------------------------------------------------------------------------------------------------------------------------------
-- Who stands where
-- Every character stands on a TILE of the 7 x 7 grid, written (row, col): row 0 is the top tile, rows run down-left and columns run
-- down-right, the same numbering the tiles are drawn with.
--   players : the two outer rings, on the side they came from. Six tiles per side, filled in the order written here. The same in
--             every picture, whoever is looking.
--   enemies : the ring around the centre. Three tiles per side. They stand on the side OPPOSITE the player whose picture it is, and
--             face that player, so they move from picture to picture.
--   centre  : the tile (3, 3) is kept for an NPC or a point of interest (one per location).
--   corpses : lying beneath everyone, in the same place in every picture: first on the 16 corner tiles nobody ever stands on, then on
--             any free player tile, then anywhere else except the centre.
-- The sides are named for the direction of travel, so SE is where players who travelled SE stand: the side they came FROM.
--------------------------------------------------------------------------------------------------------------------------------
local playerTiles = {
    SE = { {3, 1}, {2, 1}, {4, 1}, {3, 0}, {2, 0}, {4, 0} },
    SW = { {1, 3}, {1, 2}, {1, 4}, {0, 3}, {0, 2}, {0, 4} },
    NE = { {5, 3}, {5, 4}, {5, 2}, {6, 3}, {6, 4}, {6, 2} },
    NW = { {3, 5}, {2, 5}, {4, 5}, {3, 6}, {2, 6}, {4, 6} },
}
local enemyTiles = {
    SE = { {3, 2}, {2, 2}, {4, 2} },
    SW = { {2, 3}, {2, 2}, {2, 4} },
    NE = { {4, 3}, {4, 4}, {4, 2} },
    NW = { {3, 4}, {2, 4}, {4, 4} },
}
local centreTile = {3, 3}

-- The point a sprite standing on a tile is drawn at: the tile's origin plus this offset. A tile's centre is its origin + (18, 10),
-- so this is the centre of the tile, 1 pixel lower. (The old slot table held exactly these points, give or take a pixel.)
-- If sprites ever seem to sit off their tiles, this is the one pair of numbers to change.
local slotOffsetX, slotOffsetY = 18, 11
local function tilePoint(row, col)
    return startX - row * offsetX + col * offsetX + slotOffsetX,
           startY + row * offsetY + col * offsetY + slotOffsetY
end

-- Enemies face whoever's picture it is, which is the opposite of the way that viewer faces.
local oppositeDirection = { SE = "NW", NW = "SE", NE = "SW", SW = "NE" }

local enemiesPath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\enemies\\"

-- The tiles nobody ever stands on: the 16 corner tiles of the outer two rings (not a player tile, an enemy tile or the centre).
-- Corpses go here first, so they lie in the same place in every picture and never under anyone.
local cornerTiles = {}
do
    local used = { [centreTile[1] .. "," .. centreTile[2]] = true }
    for _, tiles in pairs(playerTiles) do
        for _, tile in ipairs(tiles) do used[tile[1] .. "," .. tile[2]] = true end
    end
    for _, tiles in pairs(enemyTiles) do
        for _, tile in ipairs(tiles) do used[tile[1] .. "," .. tile[2]] = true end
    end
    for row = 0, gridWidth - 1 do
        for col = 0, gridWidth - 1 do
            if not used[row .. "," .. col] then table.insert(cornerTiles, {row, col}) end
        end
    end
end

-- Function to load images and their cels
local function loadImage(path)
    local image = app.open(path)
    local imageCel = image.cels[1].image
    return image, imageCel
end

-- Functions to read CSV files. The parser understands quoted cells ("Kusarigama, Sickle"), blank cells, a UTF-8 BOM and CRLF,
-- so a comma or an empty cell can no longer shift the columns.
-- Quote-aware CSV parser: handles "quoted, commas", "" for a literal quote, empty cells, CRLF, a UTF-8 BOM,
-- a missing final newline, and line breaks inside quoted cells. Returns a list of rows, each a list of strings.
local function parseCSV(text)
    if text:sub(1, 3) == "\239\187\191" then text = text:sub(4) end   -- strip a UTF-8 BOM (Excel adds one)
    local rows, row, field = {}, {}, {}
    local inQuotes = false
    local i, n = 1, #text

    local function endField()
        row[#row + 1] = table.concat(field)
        field = {}
    end
    local function endRow()
        endField()
        if not (#row == 1 and row[1] == "") then   -- ignore completely blank lines
            rows[#rows + 1] = row
        end
        row = {}
    end

    while i <= n do
        local c = text:sub(i, i)
        if inQuotes then
            if c == '"' then
                if text:sub(i + 1, i + 1) == '"' then   -- "" inside quotes is one literal quote
                    field[#field + 1] = '"'
                    i = i + 1
                else
                    inQuotes = false
                end
            else
                field[#field + 1] = c
            end
        else
            if c == '"' then
                inQuotes = true
            elseif c == "," then
                endField()
            elseif c == "\n" then
                endRow()
            elseif c ~= "\r" then
                field[#field + 1] = c
            end
        end
        i = i + 1
    end
    if #field > 0 or #row > 0 then endRow() end   -- last line had no trailing newline
    return rows
end

-- Drop-in replacement for readCSV: same return shape as before (rows of fields, header removed),
-- but returns nil plus a message when the file is missing, which is what the callers already expect.
local function readCSV(path)
    local file = io.open(path, "r")
    if not file then
        return nil, "Could not open CSV file: " .. path
    end
    local text = file:read("*a")
    file:close()
    local rows = parseCSV(text)
    table.remove(rows, 1)    -- header
    return rows
end

-- Reads a CSV whose first row is a header. Returns a list of records keyed by column name (record["Current location"]),
-- then nil, then the header names. On failure returns nil plus a message.
local function readSheet(path)
    local file = io.open(path, "r")
    if not file then
        return nil, "Could not open CSV file: " .. path
    end
    local text = file:read("*a")
    file:close()
    local rows = parseCSV(text)
    local header = table.remove(rows, 1)
    if not header then
        return nil, "CSV file is empty: " .. path
    end
    for i, name in ipairs(header) do
        header[i] = (name:gsub("^%s+", ""):gsub("%s+$", ""))   -- tolerate stray spaces around header names
    end
    local records = {}
    for _, row in ipairs(rows) do
        local record = {}
        for i, name in ipairs(header) do
            record[name] = row[i] or ""
        end
        records[#records + 1] = record
    end
    return records, nil, header
end

-- Small helpers for the character sheet
local function rtrim(s)
    return (s:gsub("%s+$", ""))
end

-- Anything that is not an "Enemy" counts as a player (a blank Entity Type is a player), matching the Cycle Messages page
local function isEnemy(character)
    return ((character["Entity Type"] or "Player"):gsub("^%s+", ""):gsub("%s+$", "")):lower() == "enemy"
end

-- 0 HP or less. (A blank or non-numeric HP is not treated as defeated.)
local function isDefeated(character)
    local hp = tonumber(character["Current HP"])
    return hp ~= nil and hp <= 0
end

-- A file name from a sheet means "draw this" unless it is blank or "none.png"
local function hasImage(fileName)
    return fileName ~= "" and fileName:lower() ~= "none.png"
end

-- Function to create a new sprite with the necessary dimensions
local function createNewSprite()
    local newSprite = Sprite(spriteWidth, spriteHeight)

    -- Add background layer filled with black
    local bgLayer = newSprite:newLayer()
    bgLayer.name = "Background"
    local bgCel = newSprite:newCel(bgLayer, 1)
    local bgImage = Image(spriteWidth, spriteHeight, ColorMode.RGB)
    bgImage:clear(Color(0, 0, 0))
    bgCel.image = bgImage

    -- Create the parent group/folder for tiles and decorations
    local parentGroup = newSprite:newGroup()
    parentGroup.name = "Tiles and decorations"

    return newSprite, parentGroup
end

-- Function to create a new layer with a specific name under the parent group
local function createNamedLayer(sprite, parentGroup, name)
    local layer = sprite:newLayer()
    layer.name = name
    layer.parent = parentGroup
    return layer
end

-- Function to place the image into the new image and assign it to a cel
local function placeImageOnLayer(layer, imageCel, x, y)
    if layer.isGroup then
        print("Cannot place image on group layer: " .. layer.name)
        return
    end
    local newImage = Image(layer.sprite.width, layer.sprite.height)
    newImage:drawImage(imageCel, Point(x, y))
    
    local cel = layer:cel(1)
    if cel == nil then
        cel = layer.sprite:newCel(layer, 1, newImage, Point(0, 0))
    else
        cel.image:drawImage(newImage)
    end
end

-- Function to determine the direction a player travelled, from previous and current location.
-- Seen on the minimap (the grid turned 45 degrees clockwise: letters run down-right, numbers run down-left):
--     letter up   (A -> B) = SE        letter down   (B -> A) = NW
--     number up   (1 -> 2) = SW        number down   (2 -> 1) = NE
-- The label is the way the character faces (it names the image file) and it picks the slot set. The slots sit on the side
-- the character came from, so someone who travelled SE stands towards the upper left of the picture.
-- Assumes moves go along a row or a column.
-- Returns nil for a player who has not moved (or has no previous location): they have no direction of travel, so
-- assignPlayerDirections() gives them a side. Nothing in this script is random.
local function determineDirection(prevLocation, currLocation)
    if prevLocation == nil or prevLocation == "" or prevLocation == currLocation then
        return nil
    end

    -- Determine the direction based on the movement from previous to current location
    if prevLocation < currLocation then
        if prevLocation:sub(1, 1) == currLocation:sub(1, 1) then
            return "SW" -- the number went up
        else
            return "SE" -- the letter went up
        end
    else
        if prevLocation:sub(1, 1) == currLocation:sub(1, 1) then
            return "NE" -- the number went down
        else
            return "NW" -- the letter went down
        end
    end
end

-- Which sprite stands for this player in the viewer's picture: normally their own. The identity-obscuring items
-- (disguiseItems, currently empty) make everyone else see a stranger instead.
local function spriteNameFor(player, viewerName)
    if player.trinket ~= "" and disguiseItems[player.trinket] and player.playerName ~= viewerName then
        return disguiseSpriteName
    end
    return player.playerName
end

-- Function to load text character images only when needed
local missingGlyphs = {}  -- characters already reported, so each one is named once per run

-- When a font image is missing, say what is actually in that folder, because the usual causes are a different folder, a file
-- whose real name is "-.png.png" (Windows hides the .png), or a look-alike character in the file name.
local function describeFontFolder(charImagePath)
    local folder = charImagePath:match("^(.*)\\[^\\]*$")
    local okDir, isDir = pcall(app.fs.isDirectory, folder)
    if okDir and not isDir then
        return " The font folder itself does not exist: " .. tostring(folder)
    end
    local okList, files = pcall(app.fs.listFiles, folder)
    if not okList or type(files) ~= "table" then
        return ""
    end
    local unusual = {}
    for _, name in ipairs(files) do
        if not name:match("^%w%.png$") then table.insert(unusual, name) end   -- anything but a plain letter or digit image
    end
    return " That folder holds " .. #files .. " files. Names that are not a plain letter or digit: " ..
           (#unusual > 0 and ("\"" .. table.concat(unusual, "\", \"") .. "\"") or "none")
end

local function getTextImage(char)
    local charImagePath 
    if char == "/" then
        charImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\font outline\\forward slash.png"
    else 
        charImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\font outline\\" .. char .. ".png"
    end
    if app.fs.isFile(charImagePath) then
        return loadImage(charImagePath)
    end
    -- A character with no image is simply left out of the text. Say so once, because for "-" that turns a negative
    -- bonus into a positive-looking number.
    if not missingGlyphs[char] then
        missingGlyphs[char] = true
        -- (a byte that is only part of a multi-byte character is shown as ? so the console never gets invalid text)
        local shown = (char:byte() >= 32 and char:byte() < 127) and char or "?"
        local shownPath = charImagePath:sub(1, #charImagePath - #char - 4) .. shown .. ".png"   -- the path again, without the raw byte
        print("No font image for \"" .. shown .. "\" (character code " .. string.format("%02X", char:byte()) .. "), so it is left out of the text: " ..
              shownPath .. (char == "-" and " (negative bonuses will be drawn WITHOUT their minus sign)" or "") ..
              (char:byte() > 126 and " (this is part of a non-ASCII character, such as a typographic minus sign; the sheet should use a plain hyphen)" or "") ..
              describeFontFolder(charImagePath))
    end
    return nil, nil
end

-- Function to calculate text width
local function getTextWidth(text)
    local width = 0
    for char in text:gmatch(".") do
        if char == "I" or char == "i"
        or char == "M" or char == "m"
        or char == "T" or char == "t"
        or char == "W" or char == "w" then
            width = width + 7  -- Wider letters
        elseif char == " " then
            width = width + 6  -- Space character
        else
            width = width + 6  -- Normal character width
        end
    end
    return width
end

-- Function to draw text on any layer with alignment
local function drawTextOnLayer(targetLayer, text, startX, startY, align)

    app.fgColor = Color { r = 255, g = 255, b = 255, a = 255 } -- White with full opacity

    -- Determine full text width
    local totalWidth = getTextWidth(text)

    -- Adjust starting position based on alignment
    if align == "centre" then
        startX = startX - (totalWidth / 2)
    elseif align == "right" then
        startX = startX - totalWidth
    end

    -- Draw text
    local x, y = startX, startY
    for char in text:gmatch(".") do
        if char ~= " " then

            local charImage, charImageCel = getTextImage(char)
            if charImage and charImageCel then

                placeImageOnLayer(targetLayer, charImageCel, x, y)
                charImage:close()
                
                -- Adjust the spacing based on the character
                if char == "I" or char == "i"
                or char == "M" or char == "m"
                or char == "T" or char == "t"
                or char == "W" or char == "w" then
                    x = x + 7  -- Reduced spacing by 3 (total 7 pixels)
                else
                    x = x + 6  -- Reduced spacing by 4 (total 6 pixels)
                end
            end
        else
            x = x + 6  -- Space for the space character
        end
    end
end

local function truncateString(str, maxLength)
    if #str > maxLength then
        return str:sub(1, maxLength)  -- Cut the string at maxLength
    else
        return str  -- Return as-is if it's already short enough
    end
end

-- Status effects are drawn as 3x3 sprites in their own slots on the UI. Not implemented yet.
-- Plan: for each "Status ..." column in the character row (Status Blind, Status Burned, ...), if it is TRUE draw that status's
-- sprite in its slot, and if it is FALSE draw nothing.
local function drawStatusSprites(uiLayer, playerRow)
    -- TODO
end

-- Function to draw player name, HP and bonuses to the UI layer
local function addPlayerDetails(uiLayer, playerName, currentHP, maxHP, attackBonus, defenceBonus, speedBonus)

    -- Inventory label
    drawTextOnLayer(uiLayer, "Inventory", 424, 10, "centre")

    -- Add player name
    drawTextOnLayer(uiLayer, truncateString(playerName, 12), 9, 179, "left")  -- Player status tab, 12 char max
    drawTextOnLayer(uiLayer, truncateString(playerName, 14), 380, 23, "left") -- Player inventory tab, 14 char max

    -- Add HP
    drawTextOnLayer(uiLayer, currentHP .. "/" .. maxHP, 108, 185, "centre")

    -- Add HP current
    --drawTextOnLayer(uiLayer, currentHP, 105, 185, "right")

    -- Add HP max
    --drawTextOnLayer(uiLayer, maxHP, 111, 185, "left")

    -- Add attack bonus
    if tonumber(attackBonus) ~= 0 then
        drawTextOnLayer(uiLayer, attackBonus, 32, 191, "right")
    end

    -- Add defence bonus
    if tonumber(defenceBonus) ~= 0 then
        drawTextOnLayer(uiLayer, defenceBonus, 57, 191, "right")
    end

    -- Add speed bonus
    if tonumber(speedBonus) ~= 0 then
        drawTextOnLayer(uiLayer, speedBonus, 82, 191, "right")
    end


end

local function round(x)
    return math.floor(x + 0.5)  -- Adds 0.5 before flooring
end


--------------------------------------------------------------------------------------------------------------------------------------------------

-- Load the character sheet. Columns are looked up by header name, so their order in the sheet does not matter.
local playerListFilename = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\smogoff rpg 2 test form (Responses) - Character sheets.csv"
local playerData, err, sheetHeader = readSheet(playerListFilename)
if not playerData then
    print(err)
    return
end

-- Stop with a clear message if the sheet is missing a column this script reads.
-- ("Entity Type" and "Base Name" are optional: without them every row counts as a player and sprites use Name.)
do
    local requiredColumns = {
        "Name", "Current location", "Previous location", "Current HP", "Max HP", "Attack Bonus", "Defence Bonus", "Speed Bonus",
        "Equipped weapon", "Equipped armour", "Equipped trinket",
        "Inventory slot 1", "Inventory slot 2", "Inventory slot 3", "Inventory slot 4", "Inventory slot 5", "Inventory slot 6",
        "Likes", "Cycle"
    }
    local present = {}
    for _, name in ipairs(sheetHeader) do present[name] = true end
    local missing = {}
    for _, name in ipairs(requiredColumns) do
        if not present[name] then table.insert(missing, name) end
    end
    if #missing > 0 then
        print("The character sheet is missing these columns: " .. table.concat(missing, ", "))
        return
    end
end

--------------------------------------------------------------------------------------------------------------------------------
-- Player sprites
-- Each living player's four sprites (SW, SE, NE, NW) are built from the character sheet every run, so they always match the
-- weapon the player is holding. The art is layered bottom to top like this (the order the old sprite script used):
--     weapon under, skin, lower, upper, accessory under, hair, accessory over, weapon over
-- Each art file holds two poses side by side: the left one becomes SW (and SE, mirrored), the right one NE (and NW, mirrored),
-- each with 8 pixels trimmed off its outer edge.
-- Art that is missing is left out and listed in the console; the player is still made. Without skin art there is nothing to
-- draw on, so that player is skipped (their existing sprites, if any, are used).
--------------------------------------------------------------------------------------------------------------------------------

-- The sheet columns that say how a player looks. Colour cells can say "Option3" or just 3.
local appearanceColumns = {
    "Hairstyle", "Skin tone", "Hair colour", "Upper colour", "Lower colour", "Accessory over", "Accessory under", "Accessory colour"
}

local spriteTrim = 8  -- pixels trimmed off the outer edge of each pose
local lastPlayerSpriteSize = nil  -- "W x H" of the sprites just made, shown on the summary line

local function trimText(s)
    return ((s or ""):gsub("^%s+", ""):gsub("%s+$", ""))
end

-- "Option3" -> "3", "3" -> "3", anything without a number -> nil
local function optionNumber(value)
    return (tostring(value or ""):match("%d+"))
end

-- Blank, "None" and "none" all mean "nothing"
local function isNone(value)
    local v = trimText(value)
    return v == "" or v:lower() == "none"
end

-- The art files for one player, bottom to top. Returns nil and a reason if a cell the file names depend on is blank.
local function describeSpriteLayers(player)
    local skin = optionNumber(player["Skin tone"])
    local hairColour = optionNumber(player["Hair colour"])
    local upper = optionNumber(player["Upper colour"])
    local lower = optionNumber(player["Lower colour"])
    local hairstyle = trimText(player["Hairstyle"]):lower()
    if not (skin and hairColour and upper and lower) or hairstyle == "" then
        return nil, "hairstyle, skin tone, hair, upper or lower colour is blank in the sheet"
    end

    local accessoryColour = optionNumber(player["Accessory colour"])
    local accessoryOver = trimText(player["Accessory over"]):lower()
    local accessoryUnder = trimText(player["Accessory under"]):lower()
    if (not isNone(accessoryOver) or not isNone(accessoryUnder)) and not accessoryColour then
        return nil, "an accessory is chosen but Accessory colour is blank in the sheet"
    end

    local weapon = trimText(player["Equipped weapon"]):lower()   -- the weapon held right now; art is named after the item
    local layers = {}
    local function add(folder, fileName, required)
        layers[#layers + 1] = {
            label = folder .. "\\" .. fileName .. ".png",
            path = spriteArtPath .. folder .. "\\" .. fileName .. ".png",
            required = required,
        }
    end
    if not isNone(weapon) then add("weapon under", weapon) end
    add("skin", "skin" .. skin, true)
    add("lower", "lower" .. lower)
    add("upper", "upper" .. upper)
    if not isNone(accessoryUnder) then add("accessory under", "accessory " .. accessoryUnder .. accessoryColour) end
    add("hair", "hair " .. hairstyle .. hairColour)
    if not isNone(accessoryOver) then add("accessory over", "accessory " .. accessoryOver .. accessoryColour) end
    if not isNone(weapon) then add("weapon over", weapon) end
    return layers
end

local function flipImageHorizontally(image)
    local width = image.width
    local height = image.height
    local flipped = Image(width, height)
    for y = 0, height - 1 do
        for x = 0, width - 1 do
            flipped:putPixel(x, y, image:getPixel(width - 1 - x, y))
        end
    end
    return flipped
end

-- Builds and saves the four sprites for one player. Returns true if they were made.
local function makePlayerSprite(player, missingArt)
    local name = rtrim(player["Name"])
    local layers, reason = describeSpriteLayers(player)
    if not layers then
        print("No sprites made for " .. name .. ": " .. reason .. ". Their existing sprites, if any, are used.")
        return false
    end

    -- Open the art that exists, and note what is missing
    local opened, skinSprite = {}, nil
    for _, layer in ipairs(layers) do
        if app.fs.isFile(layer.path) then
            local sprite = app.open(layer.path)
            opened[#opened + 1] = sprite
            if layer.required then skinSprite = sprite end
        else
            missingArt[layer.label] = missingArt[layer.label] or {}
            table.insert(missingArt[layer.label], name)
        end
    end
    if not skinSprite then
        for _, sprite in ipairs(opened) do sprite:close() end
        print("No sprites made for " .. name .. ": their skin art is missing. Their existing sprites, if any, are used.")
        return false
    end

    -- Composite: everything drawn on top of each other, the size of the skin art
    local width, height = skinSprite.width, skinSprite.height
    local composite = Image(width, height)
    for _, sprite in ipairs(opened) do
        composite:drawImage(sprite.cels[1].image, 0, 0)
        sprite:close()
    end

    -- Split into the two poses, trimming the outer edge of each
    local half = math.floor(width / 2)
    local poseWidth = half - spriteTrim
    lastPlayerSpriteSize = poseWidth .. " x " .. height
    local southWest = Image(poseWidth, height)
    local northEast = Image(poseWidth, height)
    for y = 0, height - 1 do
        for x = 0, poseWidth - 1 do
            southWest:putPixel(x, y, composite:getPixel(x + spriteTrim, y))
            northEast:putPixel(x, y, composite:getPixel(x + half, y))
        end
    end

    local poses = {
        { "SW", southWest },
        { "SE", flipImageHorizontally(southWest) },
        { "NE", northEast },
        { "NW", flipImageHorizontally(northEast) },
    }
    local allSaved = true
    for _, pose in ipairs(poses) do
        local path = playerSpritePath .. name .. " " .. pose[1] .. ".png"
        local saved, problem = pcall(function() pose[2]:saveAs(path) end)
        if not saved then
            print("Could not save " .. path .. ": " .. tostring(problem))
            allSaved = false
        end
    end
    return allSaved
end

-- Makes the sprites for every living player. Does nothing (with a message) if the sheet has no appearance columns yet,
-- so a sheet without them behaves exactly as it did before.
local function makeAllPlayerSprites(players, header)
    local present = {}
    for _, columnName in ipairs(header) do present[columnName] = true end
    local absent = {}
    for _, columnName in ipairs(appearanceColumns) do
        if not present[columnName] then table.insert(absent, columnName) end
    end
    if #absent > 0 then
        print("Player sprites were not remade: the character sheet has no column(s) " .. table.concat(absent, ", ") ..
              ". The sprites already in the output folder are used.")
        return
    end

    local missingArt, made = {}, 0
    for _, player in ipairs(players) do
        if makePlayerSprite(player, missingArt) then made = made + 1 end
    end
    print("Player sprites made: " .. made .. " of " .. #players .. (lastPlayerSpriteSize and (" (each " .. lastPlayerSpriteSize .. " pixels)") or ""))

    local files = {}
    for label in pairs(missingArt) do files[#files + 1] = label end
    table.sort(files)
    if #files > 0 then
        print("Missing sprite art (the players are drawn without it):")
        for _, label in ipairs(files) do
            print("  " .. label .. "   <- " .. table.concat(missingArt[label], ", "))
        end
    end
end

-- Works out, once, which side every living player stands on. Someone who travelled takes the side their journey names (they stand
-- on the side they came from). Someone who has not moved is spread across the sides: each goes to the side with the fewest
-- players so far. This depends only on the sheet, never on who is looking, so every picture of a location is identical.
local function assignPlayerDirections()
    for location, list in pairs(locationMap) do
        local counts = { SE = 0, SW = 0, NE = 0, NW = 0 }
        for _, player in ipairs(list) do
            player.direction = determineDirection(player.prevLocation, location)
            if player.direction then counts[player.direction] = counts[player.direction] + 1 end
        end
        for _, player in ipairs(list) do
            if not player.direction then
                local best = stationaryDirectionOrder[1]
                for _, direction in ipairs(stationaryDirectionOrder) do
                    if counts[direction] < counts[best] then best = direction end
                end
                player.direction = best
                counts[best] = counts[best] + 1
            end
        end
    end
end

-- Diagnostic (drawPlacementMarkers): one layer of small squares showing where the script places things, so the picture can be
-- checked against the tile art and the sprites without guessing. See the settings at the top for the colours.
local function drawPlacementMarkerLayer(newSprite, parentGroup)
    local layer = createNamedLayer(newSprite, parentGroup, "Placement markers")
    local image = Image(newSprite.width, newSprite.height)
    local function square(cx, cy, r, g, b)
        local color = app.pixelColor.rgba(r, g, b, 255)
        for dy = -1, 1 do
            for dx = -1, 1 do image:putPixel(cx + dx, cy + dy, color) end
        end
    end
    local function cross(cx, cy, r, g, b)
        local color = app.pixelColor.rgba(r, g, b, 255)
        for d = -2, 2 do
            image:putPixel(cx + d, cy, color)
            image:putPixel(cx, cy + d, color)
        end
    end
    -- A tile's centre (origin + 18, 10) is also the origin of its neighbour one column along, so most points are both:
    -- the origins are drawn first as crosses and the centres on top as squares, so a point that is both shows a square with arms.
    for gridRow = 0, gridWidth - 1 do
        for col = 0, gridWidth - 1 do
            cross(startX - gridRow * offsetX + col * offsetX, startY + gridRow * offsetY + col * offsetY, 255, 220, 0)  -- yellow cross: the tile's origin
        end
    end
    for gridRow = 0, gridWidth - 1 do
        for col = 0, gridWidth - 1 do
            square(startX - gridRow * offsetX + col * offsetX + offsetX, startY + gridRow * offsetY + col * offsetY + offsetY, 0, 255, 255)  -- cyan square: the centre
        end
    end
    for _, direction in ipairs({"SE", "SW", "NE", "NW"}) do
        for _, tile in ipairs(enemyTiles[direction]) do
            local x, y = tilePoint(tile[1], tile[2]); square(x, y, 255, 0, 255)     -- magenta: an enemy tile's draw point
        end
        for _, tile in ipairs(playerTiles[direction]) do
            local x, y = tilePoint(tile[1], tile[2])
            square(x, y, 255, 0, 0)                                                  -- red: a player tile's draw point
            square(x + 16, y + 44, 0, 128, 255)                                      -- blue: the feet, if that point were the sprite's top-left
        end
    end
    local x, y = tilePoint(centreTile[1], centreTile[2]); square(x, y, 255, 255, 255)  -- white: the centre tile's draw point
    newSprite:newCel(layer, 1, image, Point(0, 0))
end

-- Sort the rows into players and enemies, and group them by location.
-- Made global variables here; noting in case we need to revert
locationMap = {}               -- living players by location (used to draw everyone standing with the viewer)
local enemiesAtLocation = {}   -- living enemies by location (replaces the old Enemies.csv)
local corpsesAtLocation = {}   -- defeated players by location, drawn as corpses (a defeated enemy is not drawn at all)
local playerRows = {}          -- living players: one cycle image is made for each (a defeated player does not get one)
local totalCorpses = 0
for _, playerRow in ipairs(playerData) do
    local location = playerRow["Current location"]
    if isEnemy(playerRow) then
        if not isDefeated(playerRow) then
            if not enemiesAtLocation[location] then
                enemiesAtLocation[location] = {}
            end
            table.insert(enemiesAtLocation[location], playerRow)
        end
    elseif isDefeated(playerRow) then
        if not corpsesAtLocation[location] then
            corpsesAtLocation[location] = {}
        end
        table.insert(corpsesAtLocation[location], playerRow)
        totalCorpses = totalCorpses + 1
    else
        table.insert(playerRows, playerRow)
        if not locationMap[location] then
            locationMap[location] = {}
        end
        table.insert(locationMap[location], {
            playerName = rtrim(playerRow["Name"]),
            prevLocation = playerRow["Previous location"],
            trinket = rtrim(playerRow["Equipped trinket"] or "")
        })
    end
end

-- Corpses are only drawn if they are switched on and the corpse sprite file exists (the path is a placeholder for now)
local corpsesEnabled = drawPlayerCorpses and totalCorpses > 0
if corpsesEnabled and not app.fs.isFile(corpseSpritePath) then
    print("Corpse sprite not found, so no corpses are drawn: " .. corpseSpritePath)
    corpsesEnabled = false
end

-- Decide, once, where everyone stands (the same in every picture)
assignPlayerDirections()

-- Make every living player's sprites before any picture is drawn, because each picture shows other players too
if regeneratePlayerSprites then
    makeAllPlayerSprites(playerRows, sheetHeader)
end

--------------------------------------------------------------------------------------------------------------------------------

-- A message that would repeat in every picture is only printed once per run.
local reportedOnce = {}
local function reportOnce(message)
    if not reportedOnce[message] then
        reportedOnce[message] = true
        print(message)
    end
end

-- Works out who stands where in a location, as a list of {kind, name, x, y, path}, plus the set of tiles the PLAYERS (and the centre)
-- take. Players take the next free tile on their side in sheet order and enemies take their tiles in sheet order. Nothing about the
-- players depends on who is looking, EXCEPT a disguised player's sprite; the enemies stand opposite the viewer, facing them.
local function planCast(location, viewerName, viewerDirection)
    local cast, taken = {}, {}
    local function claim(row, col) taken[row .. "," .. col] = true end
    claim(centreTile[1], centreTile[2])

    local used = { SE = 0, SW = 0, NE = 0, NW = 0 }
    for _, player in ipairs(locationMap[location] or {}) do
        local direction = player.direction
        used[direction] = used[direction] + 1
        local tile = playerTiles[direction][used[direction]]
        if tile then
            claim(tile[1], tile[2])
            local x, y = tilePoint(tile[1], tile[2])
            table.insert(cast, { kind = "Player", name = player.playerName, x = x, y = y,
                path = playerSpritePath .. spriteNameFor(player, viewerName) .. " " .. direction .. ".png",
                missing = "Player sprite not found, so not drawn: " })
        else
            reportOnce("No free player slot at " .. location .. " (" .. direction .. "): not drawing " .. player.playerName)
        end
    end

    -- Enemies stand on the side opposite the viewer (who stands on the side they came from, looking towards the centre) and face the
    -- viewer. The side is named for the way it faces, so the same name gives both the tiles and the sprite.
    local enemyDirection = oppositeDirection[viewerDirection or ""] or "NW"
    for index, enemy in ipairs(enemiesAtLocation[location] or {}) do
        local tile = enemyTiles[enemyDirection][index]
        if tile then
            local x, y = tilePoint(tile[1], tile[2])
            local spriteName = enemy["Base Name"]
            if not spriteName or spriteName == "" then
                spriteName = enemy["Name"]
            end
            table.insert(cast, { kind = "Enemy", name = enemy["Name"], x = x, y = y,
                path = enemiesPath .. spriteName .. " " .. enemyDirection .. ".png",
                missing = "Enemy sprite not found: " })
        else
            reportOnce("No free enemy slot at " .. location .. ": not drawing " .. enemy["Name"])
        end
    end

    local centreName = centreEntities[location]
    if centreName and centreName ~= "" then
        local x, y = tilePoint(centreTile[1], centreTile[2])
        table.insert(cast, { kind = "Centre", name = centreName, x = x, y = y,
            path = centreSpritePath .. centreName .. ".png", missing = "Centre sprite not found: " })
    end
    return cast, taken
end

-- Draws everyone on a layer of their own, back to front: whoever is lower in the picture (larger y) is nearer, so is drawn later and
-- sits in front. Ties go left to right, so the order never depends on anything but the positions.
local function drawCast(newSprite, parentGroup, cast)
    table.sort(cast, function(a, b)
        if a.y ~= b.y then return a.y < b.y end
        if a.x ~= b.x then return a.x < b.x end
        if a.kind ~= b.kind then return a.kind < b.kind end
        return a.name < b.name
    end)
    for _, member in ipairs(cast) do
        if app.fs.isFile(member.path) then
            local image, imageCel = loadImage(member.path)
            local layer = createNamedLayer(newSprite, parentGroup, member.kind .. ": " .. member.name)
            placeImageOnLayer(layer, imageCel, member.x, member.y)
            image:close()
        else
            print(member.missing .. member.path)
        end
    end
end

-- Corpses of defeated players: one generic sprite, once per corpse, on a layer of its own that is created first so that it lies beneath
-- everyone standing. Where they lie must not depend on who is looking, and the enemies move with the viewer, so corpses ignore the
-- enemies: they take the 16 corner tiles nobody stands on first, then any free player tile, then any other tile except the centre.
-- (Only in that last case could an enemy stand over one. Enemy corpses are not drawn.)
local function drawCorpses(newSprite, parentGroup, location, taken)
    local corpses = corpsesAtLocation[location] or {}
    if not corpsesEnabled or #corpses == 0 then
        return
    end
    local candidates, seen = {}, {}
    local function consider(row, col)
        local key = row .. "," .. col
        if not taken[key] and not seen[key] then
            seen[key] = true
            table.insert(candidates, {row, col})
        end
    end
    for _, tile in ipairs(cornerTiles) do consider(tile[1], tile[2]) end
    for _, direction in ipairs({"SE", "SW", "NE", "NW"}) do
        for _, tile in ipairs(playerTiles[direction]) do consider(tile[1], tile[2]) end
    end
    for row = 0, gridWidth - 1 do
        for col = 0, gridWidth - 1 do consider(row, col) end
    end

    local layer = createNamedLayer(newSprite, parentGroup, "Corpses")
    local corpseSprite, corpseCel = loadImage(corpseSpritePath)
    local drawn = 0
    for _, tile in ipairs(candidates) do
        if drawn >= #corpses then
            break
        end
        local x, y = tilePoint(tile[1], tile[2])
        placeImageOnLayer(layer, corpseCel, x, y)
        drawn = drawn + 1
    end
    corpseSprite:close()
    if drawn < #corpses then
        reportOnce("No free tile for " .. (#corpses - drawn) .. " corpse(s) at " .. location .. ": not drawn")
    end
end

-- Iterate over the players and generate images based on their current location
for _, playerRow in ipairs(playerRows) do
    local playerName = rtrim(playerRow["Name"])
    local currentLocation = playerRow["Current location"]
    local previousLocation = playerRow["Previous location"]
    local currentHP = playerRow["Current HP"]
    local maxHP = playerRow["Max HP"]
    local attackBonus = playerRow["Attack Bonus"]
    local defenceBonus = playerRow["Defence Bonus"]
    local speedBonus = playerRow["Speed Bonus"]
    local currentLikes = playerRow["Likes"]
    local currentCycle = playerRow["Cycle"]
    local locationCSV = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\locations\\" .. currentLocation .. ".csv"

    -- Read the location CSV data
    local csvData, err = readCSV(locationCSV)
    if not csvData then
        print(err)
        return
    end

    -- Create a new sprite
    local newSprite, parentGroup = createNewSprite()

    -- Load the tile images
    local imageCache = {}
    local function getImage(path)
        if not imageCache[path] then
            local image, imageCel = loadImage(path)
            imageCache[path] = {image = image, imageCel = imageCel}
        end
        return imageCache[path].image, imageCache[path].imageCel
    end

    -- Place the tiles and decorations
    for row = 1, #csvData do
        local rowData = csvData[row]
        local tileLabel = rowData[1]
        -- File names as written in the location sheet. "none.png" or a blank cell means nothing to draw.
        -- (The old check compared the whole path to "none.png", which could never match.)
        local tileFile = rowData[3] or ""
        local decorationBorderFile = rowData[4] or ""
        local decorationTileFile = rowData[5] or ""
        local tileImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\tiles\\" .. tileFile
        local decorationBorderImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\decorations\\" .. decorationBorderFile
        local decorationTileImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\decorations\\" .. decorationTileFile
        
        local col = (row - 1) % gridWidth
        local gridRow = math.floor((row - 1) / gridWidth)
        
        local x = startX - gridRow * offsetX + col * offsetX
        local y = startY + gridRow * offsetY + col * offsetY
        
        -- Create a layer for each image based on tile label
        local layerName = "Tile " .. tileLabel
        local layer = createNamedLayer(newSprite, parentGroup, layerName)
        
        -- Place the main tile image
        if tileFile ~= "" then
            local tileImage, tileImageCel = getImage(tileImagePath)
            placeImageOnLayer(layer, tileImageCel, x, y)
        end
        
        -- Place the decoration border image if available
        if hasImage(decorationBorderFile) then
            local decorationLayerName = "Decoration Border " .. tileLabel
            local decorationLayer = createNamedLayer(newSprite, parentGroup, decorationLayerName)
            local decorationImage, decorationImageCel = getImage(decorationBorderImagePath)
            placeImageOnLayer(decorationLayer, decorationImageCel, x, y)
        end
        
        -- Place the decoration tile image if available
        if hasImage(decorationTileFile) then
            local decorationLayerName = "Decoration Tile " .. tileLabel
            local decorationLayer = createNamedLayer(newSprite, parentGroup, decorationLayerName)
            local decorationImage, decorationImageCel = getImage(decorationTileImagePath)
            placeImageOnLayer(decorationLayer, decorationImageCel, x, y)
        end
    end

    -- Who stands where is the same in every picture of this location. Only the way the enemies face depends on whose picture it is:
    -- they face this player, who stands on the side the player came from and looks towards the centre.
    local viewerDirection = nil
    for _, member in ipairs(locationMap[currentLocation] or {}) do
        if member.playerName == playerName then
            viewerDirection = member.direction
        end
    end
    local cast, taken = planCast(currentLocation, playerName, viewerDirection)
    drawCorpses(newSprite, parentGroup, currentLocation, taken)  -- first, so that they lie beneath everyone standing
    drawCast(newSprite, parentGroup, cast)                       -- back to front

    -- Add UI image layer
    local uiLayer = newSprite:newLayer()
    uiLayer.name = "UI"
    uiLayer.parent = parentGroup
    local uiImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\ui\\frames.png"
    local uiImage, uiImageCel = loadImage(uiImagePath)
    local uiCel = newSprite:newCel(uiLayer, 1, uiImageCel, Point(0, 0))
    uiImage:close()

    -- HP
    local hpImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\ui\\hitpoint.png"

    -- Base HP is 10, and segments are 10% of the bar
    -- However because max HP can be increased, let's calculate currentHP/maxHP as a percentage
    local tenthHP = round((currentHP/maxHP) * 10)

    -- For as many times as the player has HP, draw an HP segment and move forward
    for hpIterator = 1, tenthHP do
        local hpLayer = newSprite:newLayer()  -- Create a new layer for each HP segment
        hpLayer.name = "HP_" .. hpIterator   -- Give each layer a unique name

        local drawPos = 91 + (4 * (hpIterator - 1))  -- Adjust position
        local hpImage, hpImageCel = loadImage(hpImagePath)  -- Reload the image each time
        local hpCel = newSprite:newCel(hpLayer, 1, hpImageCel, Point(drawPos, 182))  -- Place Cel

        hpImage:close()  -- Free the image after it's used
    end

    -- Equipment
    -- Weapon: 29, 203
    local weaponLayer = newSprite:newLayer()
    weaponLayer.name = "Weapon"
    weaponLayer.parent = parentGroup
    local weaponImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow["Equipped weapon"] .. ".png"
    local weaponImage, weaponImageCel = loadImage(weaponImagePath)
    local weaponCel = newSprite:newCel(weaponLayer, 1, weaponImageCel, Point(29, 202))
    weaponImage:close()

    -- Armour: 59, 203
    local armourLayer = newSprite:newLayer()
    armourLayer.name = "Armour"
    armourLayer.parent = parentGroup
    local armourImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow["Equipped armour"] .. ".png"
    local armourImage, armourImageCel = loadImage(armourImagePath)
    local armourCel = newSprite:newCel(armourLayer, 1, armourImageCel, Point(58, 202))
    armourImage:close()

    -- Trinket: 88, 203
    local trinketLayer = newSprite:newLayer()
    trinketLayer.name = "Trinket"
    trinketLayer.parent = parentGroup
    local trinketImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow["Equipped trinket"] .. ".png"
    local trinketImage, trinketImageCel = loadImage(trinketImagePath)
    local trinketCel = newSprite:newCel(trinketLayer, 1, trinketImageCel, Point(87, 202))
    trinketImage:close()

    -- Items
    -- Slot 1: 385, 35
    local item1Layer = newSprite:newLayer()
    item1Layer.name = "Item 1"
    item1Layer.parent = parentGroup
    local item1ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow["Inventory slot 1"] .. ".png"
    local item1Image, item1ImageCel = loadImage(item1ImagePath)
    local item1Cel = newSprite:newCel(item1Layer, 1, item1ImageCel, Point(385, 35))
    item1Image:close()

    -- Slot 2: 412, 35
    local item2Layer = newSprite:newLayer()
    item2Layer.name = "Item 2"
    item2Layer.parent = parentGroup
    local item2ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow["Inventory slot 2"] .. ".png"
    local item2Image, item2ImageCel = loadImage(item2ImagePath)
    local item2Cel = newSprite:newCel(item2Layer, 1, item2ImageCel, Point(412, 35))
    item2Image:close()

    -- Slot 3: 439, 35
    local item3Layer = newSprite:newLayer()
    item3Layer.name = "Item 3"
    item3Layer.parent = parentGroup
    local item3ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow["Inventory slot 3"] .. ".png"
    local item3Image, item3ImageCel = loadImage(item3ImagePath)
    local item3Cel = newSprite:newCel(item3Layer, 1, item3ImageCel, Point(439, 35))
    item3Image:close()

    -- Slot 4: 385, 63
    local item4Layer = newSprite:newLayer()
    item4Layer.name = "Item 4"
    item4Layer.parent = parentGroup
    local item4ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow["Inventory slot 4"] .. ".png"
    local item4Image, item4ImageCel = loadImage(item4ImagePath)
    local item4Cel = newSprite:newCel(item4Layer, 1, item4ImageCel, Point(385, 62))
    item4Image:close()

    -- Slot 5: 412, 63
    local item5Layer = newSprite:newLayer()
    item5Layer.name = "Item 5"
    item5Layer.parent = parentGroup
    local item5ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow["Inventory slot 5"] .. ".png"
    local item5Image, item5ImageCel = loadImage(item5ImagePath)
    local item5Cel = newSprite:newCel(item5Layer, 1, item5ImageCel, Point(412, 62))
    item5Image:close()

    -- Slot 6: 439, 63
    local item6Layer = newSprite:newLayer()
    item6Layer.name = "Item 6"
    item6Layer.parent = parentGroup
    local item6ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow["Inventory slot 6"] .. ".png"
    local item6Image, item6ImageCel = loadImage(item6ImagePath)
    local item6Cel = newSprite:newCel(item6Layer, 1, item6ImageCel, Point(439, 62))
    item6Image:close()

    -- Likes: 460, 81
    local likesLayerIcon = newSprite:newLayer()
    likesLayerIcon.name = "Likes icon"
    likesLayerIcon.stackIndex = #newSprite.layers + 1 -- Puts it on the highest layer

    local likesImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\ui\\likes.png"
    local likesImage, likesImageCel = loadImage(likesImagePath)
    
    local likesIconCel = newSprite:newCel(likesLayerIcon, 1, likesImageCel, Point(460, 81)) -- For the image

    local likesLayerCount = newSprite:newLayer()
    likesLayerCount.name = "Like count"
    likesLayerIcon.stackIndex = #newSprite.layers + 1 -- Puts it on the highest layer

    local likesCountCel = newSprite:newCel(likesLayerCount, 1) -- For the text

    -- Add Likes separately to draw on top of items
    app.activeLayer = likesLayerCount
    local textCel = newSprite:newCel(likesLayerCount, 1)
    drawTextOnLayer(likesLayerCount, currentLikes, 457, 85, "right")
    
    likesImage:close()

    -- Add player name, HP and bonuses to UI layer
    addPlayerDetails(uiLayer, playerName, currentHP, maxHP, attackBonus, defenceBonus, speedBonus)

    -- Status effects (not drawn yet, see drawStatusSprites)
    drawStatusSprites(uiLayer, playerRow)

    -- Cycle number
    drawTextOnLayer(uiLayer, "Cycle " .. currentCycle, 222, 9, "centre")

    -- Location label
    drawTextOnLayer(uiLayer, currentLocation, 34, 43, "centre")

    --------------------------------------------------------------------------------------------------------------------------------

    -- Minimap

    --[[
        A	        B	        C	        D	        E	        F	        G	        H
    1	(36, 8)	    (40, 10)	(44, 12)	(48, 14)	(52, 16)	(56, 18)	(60, 20)	(64, 22)
    2	(32, 10)	(36, 12)	(40, 14)	(44, 16)	(48, 18)	(52, 20)	(56, 22)	(60, 24)
    3	(28, 12)	(32, 14)	(36, 16)	(40, 18)	(44, 20)	(48, 22)	(52, 24)	(56, 26)
    4	(24, 14)	(28, 16)	(32, 18)	(36, 20)	(40, 22)	(44, 24)	(48, 26)	(52, 28)
    5	(20, 16)	(24, 18)	(28, 20)	(32, 22)	(36, 24)	(40, 26)	(44, 28)	(48, 30)
    6	(16, 18)	(20, 20)	(24, 22)	(28, 24)	(32, 26)	(36, 28)	(40, 30)	(44, 32)
    7	(12, 20)	(16, 22)	(20, 24)	(24, 26)	(28, 28)	(32, 30)	(36, 32)	(40, 34)
    8	(8, 22)	    (12, 24)	(16, 26)	(20, 28)	(24, 30)	(28, 32)	(32, 34)	(36, 36)
    ]]

    -- Player maps stored at "C:\Users\Admin\Pictures\aseprite\lua testing\player maps" .. playerName .. ".csv"
    -- Read map and draw explored node image at explored node positions, and current node at current position, "currentLocation"
    -- Explored node: "C:\Users\Admin\Pictures\aseprite\lua testing\ui\node explored.png"
    -- Current node: "C:\Users\Admin\Pictures\aseprite\lua testing\ui\node current.png"

    --------------------------------------------------------------------------------------------------------------------------------

    -- Create the minimap base layer
    local minimapLayer = newSprite:newLayer()
    minimapLayer.name = "Minimap"
    minimapLayer.stackIndex = #newSprite.layers + 1  -- Topmost layer

    -- File path for player map
    local playerMapPath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\player maps\\" .. playerName .. ".csv"

    -- Load minimap icons
    local exploredImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\ui\\node explored.png"
    local currentImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\ui\\node current.png"

    local exploredImage, exploredImageCel = loadImage(exploredImagePath)
    local currentImage, currentImageCel = loadImage(currentImagePath)

    -- Mapping for coordinate positions (A1, B1, C1... H8)
    local coords = {
        {36, 8}, {40, 10}, {44, 12}, {48, 14}, {52, 16}, {56, 18}, {60, 20}, {64, 22},
        {32, 10}, {36, 12}, {40, 14}, {44, 16}, {48, 18}, {52, 20}, {56, 22}, {60, 24},
        {28, 12}, {32, 14}, {36, 16}, {40, 18}, {44, 20}, {48, 22}, {52, 24}, {56, 26},
        {24, 14}, {28, 16}, {32, 18}, {36, 20}, {40, 22}, {44, 24}, {48, 26}, {52, 28},
        {20, 16}, {24, 18}, {28, 20}, {32, 22}, {36, 24}, {40, 26}, {44, 28}, {48, 30},
        {16, 18}, {20, 20}, {24, 22}, {28, 24}, {32, 26}, {36, 28}, {40, 30}, {44, 32},
        {12, 20}, {16, 22}, {20, 24}, {24, 26}, {28, 28}, {32, 30}, {36, 32}, {40, 34},
        {8, 22},  {12, 24}, {16, 26}, {20, 28}, {24, 30}, {28, 32}, {32, 34}, {36, 36},
    }

    -- Read CSV and draw each explored node on its own layer
    local file = io.open(playerMapPath, "r")
    if file then
        local mapRows = parseCSV(file:read("*a"))
        file:close()
        for row, cells in ipairs(mapRows) do
            for col, cell in ipairs(cells) do
                local posIndex = ((row - 1) * 8) + col  -- Map cell to correct coordinates
                local x, y = table.unpack(coords[posIndex])

                if cell == "explored" then
                    -- Create a new layer for each explored node
                    local exploredLayer = newSprite:newLayer()
                    exploredLayer.name = "Explored " .. row .. col
                    exploredLayer.stackIndex = #newSprite.layers + 1  -- Put it on the topmost layer

                    -- Create a cel for the explored node on the new layer
                    newSprite:newCel(exploredLayer, 1, exploredImageCel, Point(x, y))
                end
            end
        end
    end
    
    -- Function to turn currentLocation string into coords
    local function getCoordinates(reference)
        if #reference ~= 2 then
            return nil, "Invalid reference format. Must be two characters."
        end

        local column = string.upper(string.sub(reference, 1, 1))
        local row = tonumber(string.sub(reference, 2, 2))

        if not row or row < 1 or row > 8 then
            return nil, "Invalid row number. Must be between 1 and 8."
        end

        local columnNumber = string.byte(column) - string.byte("A") + 1

        if columnNumber < 1 or columnNumber > 8 then
            return nil, "Invalid column letter. Must be between A and H."
        end

        local index = (row - 1) * 8 + columnNumber

        if index < 1 or index > #coords then
            return nil, "Coordinate reference out of range."
        end

        return coords[index][1], coords[index][2]
    end
    
    local x, y = getCoordinates(currentLocation)

    -- Draw the current node image
    local currentNodeCel = newSprite:newCel(minimapLayer, 1, currentImageCel, Point(x, y))

    -- Clean up images
    exploredImage:close()
    currentImage:close()

    -------------------------------------------------------------------------------------------------------------------------------

    -- Save the new sprite as a .ase file
    local outputFilename = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\cycle images\\" .. playerName .. " " .. currentLocation .. ".ase"
    if drawPlacementMarkers then
        drawPlacementMarkerLayer(newSprite, parentGroup)
    end

    newSprite:saveAs(outputFilename)

    -- Close all cached images
    for _, imageData in pairs(imageCache) do
        imageData.image:close()
    end

    app.refresh()
end
