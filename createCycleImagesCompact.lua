-- Variables to control the overall image
local spriteWidth = 480
local spriteHeight = 240

local startX = 221  -- X position in image to begin creating grid from
local startY = 47   -- Y position in image to begin creating grid from

local gridWidth = 7
local gridHeight = 7

local offsetX = 18 -- offset per tile image when drawing grid
local offsetY = 10

-- Positions for player images based on direction, adjusted with new offsets
local directionSlots = {
    SE = {
        {219 - 16, 142 - 44},
        {237 - 16, 132 - 44},
        {201 - 16, 152 - 44},
        {201 - 16, 132 - 44},
        {219 - 16, 122 - 44},
        {183 - 16, 142 - 44}
    },
    SW = {
        {291 - 16, 142 - 44},
        {271 - 16, 132 - 44},
        {309 - 16, 152 - 44},
        {309 - 16, 132 - 44},
        {291 - 16, 122 - 44},
        {327 - 16, 142 - 44}
    },
    NE = {
        {219 - 16, 181 - 44},
        {237 - 16, 192 - 44},
        {201 - 16, 171 - 44},
        {201 - 16, 192 - 44},
        {219 - 16, 202 - 44},
        {183 - 16, 182 - 44}
    },
    NW = {
        {291 - 16, 181 - 44},
        {309 - 16, 171 - 44},
        {273 - 16, 191 - 44},
        {309 - 16, 191 - 44},
        {326 - 16, 182 - 44},
        {291 - 16, 202 - 44}
    }
}

-- The same but for enemies, using the last three slots
local directionEnemySlots = {
    SE = {
        {201 - 16, 132 - 44},
        {219 - 16, 122 - 44},
        {183 - 16, 142 - 44}
    },
    SW = {
        {309 - 16, 132 - 44},
        {291 - 16, 122 - 44},
        {327 - 16, 142 - 44}
    },
    NE = {
        {201 - 16, 192 - 44},
        {219 - 16, 202 - 44},
        {183 - 16, 182 - 44}
    },
    NW = {
        {309 - 16, 191 - 44},
        {326 - 16, 182 - 44},
        {291 - 16, 202 - 44}
    }
}

-- Function to load images and their cels
local function loadImage(path)
    local image = app.open(path)
    local imageCel = image.cels[1].image
    return image, imageCel
end

-- Function to read the CSV file
local function readCSV(path)
    local file = io.open(path, "r")
    local data = {}
    local isHeader = true
    for line in file:lines() do
        if isHeader then
            isHeader = false
        else
            local fields = {}
            for field in line:gmatch("[^,]+") do
                table.insert(fields, field)
            end
            table.insert(data, fields)
        end
    end
    file:close()
    return data
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

-- Function to determine the direction based on previous and current location
local function determineDirection(prevLocation, currLocation)
    if prevLocation == currLocation then
        -- If the player hasn't moved, pick a random direction for now
        local directions = {"NW", "NE", "SW", "SE"}
        return directions[math.random(#directions)]
    end

    -- Determine the direction based on the movement from previous to current location
    if prevLocation < currLocation then
        if prevLocation:sub(1, 1) == currLocation:sub(1, 1) then
            return "SE"
        else
            return "SW"
        end
    else
        if prevLocation:sub(1, 1) == currLocation:sub(1, 1) then
            return "NW"
        else
            return "NE"
        end
    end
end

-- Function to invert direction (for enemies)
local function determineOppositeDirection(prevLocation, currLocation)
    if prevLocation == currLocation then
        -- If the player hasn't moved, pick a random direction for now
        local directions = {"NW", "NE", "SW", "SE"}
        return directions[math.random(#directions)]
    end

    -- Determine the direction based on the movement from previous to current location
    if prevLocation < currLocation then
        if prevLocation:sub(1, 1) == currLocation:sub(1, 1) then
            return "NW"
        else
            return "NE"
        end
    else
        if prevLocation:sub(1, 1) == currLocation:sub(1, 1) then
            return "SE"
        else
            return "SW"
        end
    end
end

-- Function to draw player image
local function drawPlayerImage(playerName, prevLocation, direction)
    local playerImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\output\\" .. playerName .. " " .. direction .. ".png"
    local playerImage, playerImageCel = loadImage(playerImagePath)

    -- Find and use an available slot
    for slotIndex, slot in ipairs(slots[direction]) do
        if not occupiedSlots[direction][slotIndex] then
            local x, y = slot[1], slot[2]
            placeImageOnLayer(directionLayers[direction], playerImageCel, x, y)
            occupiedSlots[direction][slotIndex] = true
            playerImage:close()
            return
        end
    end

    -- Close the player image if no slot is found
    playerImage:close()
end

-- Function to draw all players in a given location
-- Made global variables here; noting in case we need to revert
local function drawPlayersAtLocation(newSprite, parentGroup, location)
    slots = {
        SE = {table.unpack(directionSlots.SE)},
        SW = {table.unpack(directionSlots.SW)},
        NE = {table.unpack(directionSlots.NE)},
        NW = {table.unpack(directionSlots.NW)}
    }
    occupiedSlots = {
        SE = {},
        SW = {},
        NE = {},
        NW = {}
    }

    -- Create a new layer for each direction
    directionLayers = {}
    for direction in pairs(slots) do
        directionLayers[direction] = createNamedLayer(newSprite, parentGroup, "Direction " .. direction)
    end

    -- Draw players in the location
    for _, player in ipairs(locationMap[location]) do
        local playerName = player.playerName
        local prevLocation = player.prevLocation
        local direction = determineDirection(prevLocation, location)
        drawPlayerImage(playerName, prevLocation, direction)
    end
end

-- Function to load text character images only when needed
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

-- Function to draw player name, status, and Likes to the UI layer
local function addPlayerDetails(uiLayer, playerName, status, currentHP, maxHP, attackBonus, defenceBonus, speedBonus)

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

    -- Add status
    drawTextOnLayer(uiLayer, status, 108, 193, "centre")

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

local function drawMinimap(playerName, currentLocation)
    -- Load the node images
    local exploredImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\ui\\node explored.png"
    local currentImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\ui\\node current.png"
    local exploredImage, exploredImageCel = loadImage(exploredImagePath)
    local currentImage, currentImageCel = loadImage(currentImagePath)

    -- Read the CSV into a table
    local mapPath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\player maps\\" .. playerName .. ".csv"
    local mapData = {}
    for line in io.lines(mapPath) do
        table.insert(mapData, {})
        for value in line:gmatch("[^,]+") do
            table.insert(mapData[#mapData], value)
        end
    end

    -- Coordinates matrix
    local coords = {
        { {36,8}, {40,10}, {44,12}, {48,14}, {52,16}, {56,18}, {60,20}, {64,22} },
        { {32,10}, {36,12}, {40,14}, {44,16}, {48,18}, {52,20}, {56,22}, {60,24} },
        { {28,12}, {32,14}, {36,16}, {40,18}, {44,20}, {48,22}, {52,24}, {56,26} },
        { {24,14}, {28,16}, {32,18}, {36,20}, {40,22}, {44,24}, {48,26}, {52,28} },
        { {20,16}, {24,18}, {28,20}, {32,22}, {36,24}, {40,26}, {44,28}, {48,30} },
        { {16,18}, {20,20}, {24,22}, {28,24}, {32,26}, {36,28}, {40,30}, {44,32} },
        { {12,20}, {16,22}, {20,24}, {24,26}, {28,28}, {32,30}, {36,32}, {40,34} },
        { {8,22}, {12,24}, {16,26}, {20,28}, {24,30}, {28,32}, {32,34}, {36,36} }
    }

    -- Draw the minimap
    local minimapLayer = newSprite:newLayer()
    minimapLayer.name = "Minimap"

    for row = 1, #mapData do
        for col = 1, #mapData[row] do
            local x, y = table.unpack(coords[row][col])

            if mapData[row][col] == "explored" then
                local cel = newSprite:newCel(minimapLayer, 1, exploredImageCel, Point(x, y))
            end

            local location = string.char(64 + col) .. row
            if location == currentLocation then
                local cel = newSprite:newCel(minimapLayer, 1, currentImageCel, Point(x, y))
            end
        end
    end

    -- Close images
    exploredImage:close()
    currentImage:close()
end

local function loadEnemyData(csvPath)
    local enemyData = {}
    local file = io.open(csvPath, "r")
    if not file then
        return nil, "Could not open CSV file: " .. csvPath
    end

    local header = file:read("*l")
    if not header then
        file:close()
        return nil, "CSV file is empty."
    end

    local locations = {}
    for location in header:gmatch("([^,]+)") do
        table.insert(locations, location)
    end

    local enemyLine = file:read("*l")
    if enemyLine then
        local enemies = {}
        local currentEnemy = ""
        local enemyIndex = 1
        for i = 1, #enemyLine do
            local char = string.sub(enemyLine, i, i)
            if char == "," then
                if currentEnemy == "" then
                    enemies[enemyIndex] = nil
                else
                    enemies[enemyIndex] = currentEnemy
                end
                currentEnemy = ""
                enemyIndex = enemyIndex + 1
            else
                currentEnemy = currentEnemy .. char
            end
        end
        if currentEnemy == "" then
            enemies[enemyIndex] = nil
        else
            enemies[enemyIndex] = currentEnemy
        end

        for i, location in ipairs(locations) do
            enemyData[location] = enemies[i]
        end
    end

    file:close()
    return enemyData, nil
end

local function determineOppositeDirection(currentLocation, previousLocation)
    -- Your existing determineDirection function, modified to return the opposite
    local direction = determineDirection(previousLocation, currentLocation)
    local oppositeDirections = {
        SE = "NW",
        NW = "SE",
        NE = "SW",
        SW = "NE",
        N = "S",
        S = "N",
        E = "W",
        W = "E",
        -- Add any other directions you use
    }
    return oppositeDirections[direction] or nil
end

local function drawEnemiesAtLocation(newSprite, parentGroup, currentLocation, previousLocation)

    local enemiesPath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\enemies\\"
    local enemiesCsvPath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\smogoff rpg 2 - Enemies.csv"

    local enemyData, errorMsg = loadEnemyData(enemiesCsvPath)
    if errorMsg then
        print(errorMsg)
        return
    end

    local enemyName = enemyData[currentLocation]
    if not enemyName or enemyName == "" then
        return -- No enemy at this location
    end

    local directionEnemy = determineOppositeDirection(currentLocation, previousLocation)
    if not directionEnemy then
        return -- Could not determine the opposite direction
    end

    local enemySpritePath = enemiesPath .. enemyName .. " " .. directionEnemy .. ".png"

    local enemySprite, enemyCel, loadError = loadImage(enemySpritePath)
    if loadError then
        print(loadError)
        return
    end

    if not enemySprite or not enemyCel then
        print("Failed to load enemy sprite: " .. enemySpritePath)
        return
    end

    -- Define enemy slots, similar to player slots
    local enemySlots = {
        SE = {table.unpack(directionSlots.SE)},
        SW = {table.unpack(directionSlots.SW)},
        NE = {table.unpack(directionSlots.NE)},
        NW = {table.unpack(directionSlots.NW)}
    }

    local enemyDirectionLayer = createNamedLayer(newSprite, parentGroup, "Enemy Direction " .. directionEnemy)

    -- Draw the enemy sprite at the appropriate slot
    local slot = enemySlots[directionEnemy]
    if slot then
        placeImageOnLayer(enemyDirectionLayer, enemyCel, slot[1], slot[2])
    else
        print("Enemy slot not defined for direction: " .. directionEnemy);
    end

    enemySprite:close() -- Close the loaded sprite
end

--------------------------------------------------------------------------------------------------------------------------------------------------

-- Load the player list CSV data
local playerListFilename = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\smogoff rpg 2 test form (Responses) - Character sheets.csv"
local playerData, err = readCSV(playerListFilename)
if not playerData then
    print(err)
    return
end

-- Create a map of players by location
-- Made global variables here; noting in case we need to revert
locationMap = {}
for _, playerRow in ipairs(playerData) do
    local playerName = playerRow[1]:gsub("%s+$", "")
    local currentLocation = playerRow[2]
    local previousLocation = playerRow[3]

    if not locationMap[currentLocation] then
        locationMap[currentLocation] = {}
    end
    table.insert(locationMap[currentLocation], {
        playerName = playerName,
        prevLocation = previousLocation,
        status = playerRow[4],
        currentHP = playerRow[5],
        maxHP = playerRow[6],
        attackBonus = playerRow[7],
        defenceBonus = playerRow[8],
        speedBonus = playerRow[9]
    })
end

--------------------------------------------------------------------------------------------------------------------------------

-- Iterate over the players and generate images based on their current location
for _, playerRow in ipairs(playerData) do
    local playerName = playerRow[1]:gsub("%s+$", "")
    local currentLocation = playerRow[2]
    local previousLocation = playerRow[3]
    local status = playerRow[4]
    local currentHP = playerRow[5]
    local maxHP = playerRow[6]
    local attackBonus = playerRow[7]
    local defenceBonus = playerRow[8]
    local speedBonus = playerRow[9]
    local currentLikes = playerRow[19]
    local currentCycle = playerRow[20]
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
        local tileImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\tiles\\" .. rowData[3]
        local decorationBorderImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\decorations\\" .. rowData[4]
        local decorationTileImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\decorations\\" .. rowData[5]
        
        local col = (row - 1) % gridWidth
        local gridRow = math.floor((row - 1) / gridWidth)
        
        local x = startX - gridRow * offsetX + col * offsetX
        local y = startY + gridRow * offsetY + col * offsetY
        
        -- Create a layer for each image based on tile label
        local layerName = "Tile " .. tileLabel
        local layer = createNamedLayer(newSprite, parentGroup, layerName)
        
        -- Place the main tile image
        if tileImagePath and tileImagePath ~= "" then
            local tileImage, tileImageCel = getImage(tileImagePath)
            placeImageOnLayer(layer, tileImageCel, x, y)
        end
        
        -- Place the decoration border image if available
        if decorationBorderImagePath and decorationBorderImagePath ~= "" and decorationBorderImagePath ~= "none.png" then
            local decorationLayerName = "Decoration Border " .. tileLabel
            local decorationLayer = createNamedLayer(newSprite, parentGroup, decorationLayerName)
            local decorationImage, decorationImageCel = getImage(decorationBorderImagePath)
            placeImageOnLayer(decorationLayer, decorationImageCel, x, y)
        end
        
        -- Place the decoration tile image if available
        if decorationTileImagePath and decorationTileImagePath ~= "" and decorationTileImagePath ~= "none.png" then
            local decorationLayerName = "Decoration Tile " .. tileLabel
            local decorationLayer = createNamedLayer(newSprite, parentGroup, decorationLayerName)
            local decorationImage, decorationImageCel = getImage(decorationTileImagePath)
            placeImageOnLayer(decorationLayer, decorationImageCel, x, y)
        end
    end

    -- Add player images for the current location
    drawPlayersAtLocation(newSprite, parentGroup, currentLocation)

    --------------------------------------------------------------------------------------------------------------------------------
    -- Draw enemies (WIP)
    --------------------------------------------------------------------------------------------------------------------------------
    
    drawEnemiesAtLocation(newSprite, parentGroup, currentLocation, previousLocation);
    --------------------------------------------------------------------------------------------------------------------------------
    -- Read Enemies.csv and find the entry for our currentLocation
    
    -- If there is an enemy...
    -- Enemies facing inverse direction to player
    --local directionEnemy = determineOppositeDirection(currentLocation, previousLocation)

    -- Append directionEnemy to enemy name to load its sprite from \enemies\
    -- enemyName .. directionEnemy .. ".png"

    -- Draw at one of the appropriate predefined slots
    --------------------------------------------------------------------------------------------------------------------------------

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
    local weaponImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow[10] .. ".png"
    local weaponImage, weaponImageCel = loadImage(weaponImagePath)
    local weaponCel = newSprite:newCel(weaponLayer, 1, weaponImageCel, Point(29, 202))
    weaponImage:close()

    -- Armour: 59, 203
    local armourLayer = newSprite:newLayer()
    armourLayer.name = "Armour"
    armourLayer.parent = parentGroup
    local armourImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow[11] .. ".png"
    local armourImage, armourImageCel = loadImage(armourImagePath)
    local armourCel = newSprite:newCel(armourLayer, 1, armourImageCel, Point(58, 202))
    armourImage:close()

    -- Trinket: 88, 203
    local trinketLayer = newSprite:newLayer()
    trinketLayer.name = "Trinket"
    trinketLayer.parent = parentGroup
    local trinketImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow[12] .. ".png"
    local trinketImage, trinketImageCel = loadImage(trinketImagePath)
    local trinketCel = newSprite:newCel(trinketLayer, 1, trinketImageCel, Point(87, 202))
    trinketImage:close()

    -- Items
    -- Slot 1: 385, 35
    local item1Layer = newSprite:newLayer()
    item1Layer.name = "Item 1"
    item1Layer.parent = parentGroup
    local item1ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow[13] .. ".png"
    local item1Image, item1ImageCel = loadImage(item1ImagePath)
    local item1Cel = newSprite:newCel(item1Layer, 1, item1ImageCel, Point(385, 35))
    item1Image:close()

    -- Slot 2: 412, 35
    local item2Layer = newSprite:newLayer()
    item2Layer.name = "Item 2"
    item2Layer.parent = parentGroup
    local item2ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow[14] .. ".png"
    local item2Image, item2ImageCel = loadImage(item2ImagePath)
    local item2Cel = newSprite:newCel(item2Layer, 1, item2ImageCel, Point(412, 35))
    item2Image:close()

    -- Slot 3: 439, 35
    local item3Layer = newSprite:newLayer()
    item3Layer.name = "Item 3"
    item3Layer.parent = parentGroup
    local item3ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow[15] .. ".png"
    local item3Image, item3ImageCel = loadImage(item3ImagePath)
    local item3Cel = newSprite:newCel(item3Layer, 1, item3ImageCel, Point(439, 35))
    item3Image:close()

    -- Slot 4: 385, 63
    local item4Layer = newSprite:newLayer()
    item4Layer.name = "Item 4"
    item4Layer.parent = parentGroup
    local item4ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow[16] .. ".png"
    local item4Image, item4ImageCel = loadImage(item4ImagePath)
    local item4Cel = newSprite:newCel(item4Layer, 1, item4ImageCel, Point(385, 62))
    item4Image:close()

    -- Slot 5: 412, 63
    local item5Layer = newSprite:newLayer()
    item5Layer.name = "Item 5"
    item5Layer.parent = parentGroup
    local item5ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow[17] .. ".png"
    local item5Image, item5ImageCel = loadImage(item5ImagePath)
    local item5Cel = newSprite:newCel(item5Layer, 1, item5ImageCel, Point(412, 62))
    item5Image:close()

    -- Slot 6: 439, 63
    local item6Layer = newSprite:newLayer()
    item6Layer.name = "Item 6"
    item6Layer.parent = parentGroup
    local item6ImagePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\items\\" .. playerRow[18] .. ".png"
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

    -- Add player name and status to UI layer
    addPlayerDetails(uiLayer, playerName, status, currentHP, maxHP, attackBonus, defenceBonus, speedBonus)

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
        local row = 0
        for line in file:lines() do
            row = row + 1
            local col = 0
            for cell in line:gmatch("[^,]+") do
                col = col + 1
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
        file:close()
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
    newSprite:saveAs(outputFilename)

    -- Close all cached images
    for _, imageData in pairs(imageCache) do
        imageData.image:close()
    end

    app.refresh()
end
