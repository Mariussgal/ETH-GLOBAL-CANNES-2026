from PIL import Image
img = Image.open('public/arc_logo_white.png')
data = img.load()
width, height = img.size

row_max = []
for y in range(height):
    m = 0
    for x in range(width):
        a = data[x, y][3]
        if a > m: m = a
    row_max.append(m)

print("Row max alpha from bottom:", row_max[-30:])
