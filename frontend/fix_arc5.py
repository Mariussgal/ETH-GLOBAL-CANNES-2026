from PIL import Image
img = Image.open('public/arc_logo_white.png')
data = img.load()
width, height = img.size

for y in range(height):
    count = 0
    for x in range(width):
        if data[x, y][3] > 10:
            count += 1
    if count > width * 0.8:
        print("Gradient found at Y:", y)
        break
