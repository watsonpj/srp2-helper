--local csvPath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\smogoff rpg 2 test form (Responses) - Sheet1.csv"
local csvPath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\SRP2 Test Form (Responses) - Responses to CSV for sprites.csv"
local basePath = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\"
local outputDir = "C:\\Users\\Admin\\Pictures\\aseprite\\lua testing\\output\\"

-- Function to read CSV file
local function readCSV(path)
  local file = io.open(path, "r")
  local data = {}
  for line in file:lines() do
    local fields = {}
    for field in line:gmatch("[^,]+") do
      table.insert(fields, field)
    end
    table.insert(data, fields)
  end
  file:close()
  return data
end

-- Function to load images based on options
local function loadImages(options)
  local images = {
    skin = app.open(basePath .. "skin\\skin" .. options.skin .. ".png"),
    hair = app.open(basePath .. "hair\\hair " .. options.hairstyle .. options.hair .. ".png"),
    upper = app.open(basePath .. "upper\\upper" .. options.upper .. ".png"),
    lower = app.open(basePath .. "lower\\lower" .. options.lower .. ".png"),
  }
  
  if options.accessoryOver ~= "None" then
    images.accessoryOver = app.open(basePath .. "accessory over\\accessory " .. options.accessoryOver .. ".png")
  end
  
  if options.accessoryUnder ~= "None" then
    images.accessoryUnder = app.open(basePath .. "accessory under\\accessory " .. options.accessoryUnder .. ".png")
  end
  
  if options.weaponOver ~= "None" then
    images.weaponOver = app.open(basePath .. "weapon over\\" .. options.weaponOver .. ".png")
  end
  
  if options.weaponUnder ~= "None" then
    images.weaponUnder = app.open(basePath .. "weapon under\\" .. options.weaponUnder .. ".png")
  end
  
  return images
end

-- Function to flip an image horizontally
local function flipImageHorizontally(image)
  local width = image.width
  local height = image.height
  local flippedImage = Image(width, height)
  for y = 0, height - 1 do
    for x = 0, width - 1 do
      flippedImage:putPixel(x, y, image:getPixel(width - 1 - x, y))
    end
  end
  return flippedImage
end

-- Function to split, trim, flip, and save image halves
local function splitAndSaveImage(compositeSprite, name)
  local width = compositeSprite.width
  local height = compositeSprite.height
  local trim = 8

  -- Create left half (SW) with 8 pixels trimmed from the left
  app.command.NewFile{ ui=false, width=width / 2 - trim, height=height }
  local leftSprite = app.activeSprite
  local leftImage = leftSprite.cels[1].image
  for y = 0, height - 1 do
    for x = 0, width / 2 - trim - 1 do
      leftImage:putPixel(x, y, compositeSprite.cels[1].image:getPixel(x + trim, y))
    end
  end
  leftSprite:saveCopyAs(outputDir .. name .. " SW.png")

  -- Flip left half and save as SE
  local leftFlippedImage = flipImageHorizontally(leftImage)
  leftFlippedImage:saveAs(outputDir .. name .. " SE.png")
  leftSprite:close()

  -- Create right half (NE) with 8 pixels trimmed from the right
  app.command.NewFile{ ui=false, width=width / 2 - trim, height=height }
  local rightSprite = app.activeSprite
  local rightImage = rightSprite.cels[1].image
  for y = 0, height - 1 do
    for x = 0, width / 2 - trim - 1 do
      rightImage:putPixel(x, y, compositeSprite.cels[1].image:getPixel(x + width / 2, y))
    end
  end
  rightSprite:saveCopyAs(outputDir .. name .. " NE.png")

  -- Flip right half and save as NW
  local rightFlippedImage = flipImageHorizontally(rightImage)
  rightFlippedImage:saveAs(outputDir .. name .. " NW.png")
  rightSprite:close()
end

-- Function to create composite image
local function createCompositeImage(images, name)
  -- Create a new sprite with the same dimensions as the skin image
  app.command.NewFile{ ui=false, width=images.skin.width, height=images.skin.height }
  local compositeSprite = app.activeSprite
  local compositeImage = compositeSprite.cels[1].image
  
  -- Clear the composite image
  compositeImage:clear()

  -- Draw images in the correct order
  local layers = {
                  "weaponUnder",
                  "skin",
                  "lower",
                  "upper",
                  "accessoryUnder",
                  "hair",
                  "accessoryOver",
                  "weaponOver",
                }

  for _, layer in ipairs(layers) do
    if images[layer] then
      local image = images[layer].cels[1].image
      compositeImage:drawImage(image, 0, 0)
      images[layer]:close()
    end
  end

  -- Split, trim, flip, and save the composite image
  splitAndSaveImage(compositeSprite, name)
  compositeSprite:close()
end

-- Read CSV data
local csvData = readCSV(csvPath)

-- Process each row in CSV (skip the header)
for i = 2, #csvData do
  local row = csvData[i]
  local accessoryColor = row[10]:match("Option(%d+)")
  local options = {
    skin = row[6]:match("Option(%d+)"),
    hair = row[7]:match("Option(%d+)"),
    upper = row[8]:match("Option(%d+)"),
    lower = row[9]:match("Option(%d+)"),
    accessoryOver = row[3] ~= "None" and (row[3]:lower() .. accessoryColor) or "None",
    accessoryUnder = row[4] ~= "None" and (row[4]:lower() .. accessoryColor) or "None",
    weaponOver = row[2] ~= "None" and row[2]:lower() or "None",
    weaponUnder = row[11] ~= "None" and row[11]:lower() or "None",
    hairstyle = row[5]:lower()  -- Extracting the hairstyle value
  }

  local images = loadImages(options)
  createCompositeImage(images, row[1])
end

app.alert("Composite images created, trimmed, split, and flipped successfully!")
