import sys
from PIL import Image

img = Image.open('public/arc_logo_white.png')
data = img.load()
width, height = img.size

# Zero out the bottom 15% unconditionally to remove the base gradient
crop_y = int(height * 0.85)

for y in range(height):
    for x in range(width):
        if y >= crop_y:
            data[x, y] = (255, 255, 255, 0)
        else:
            # sharpen the remaining image to remove any soft halo
            if data[x, y][3] > 80:
                data[x, y] = (255, 255, 255, 255)
            else:
                data[x, y] = (255, 255, 255, 0)

img.save('public/arc_logo_white.png')
print("Done crop")
