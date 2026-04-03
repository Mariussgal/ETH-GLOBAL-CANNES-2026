import sys
try:
    from PIL import Image

    img = Image.open('public/arc_logo_white.png')
    img = img.convert("RGBA")
    data = img.load()
    
    width, height = img.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = data[x, y]
            if a < 150:
                data[x, y] = (255, 255, 255, 0)
            else:
                data[x, y] = (255, 255, 255, 255)

    img.save('public/arc_logo_white_sharp.png')
    print("Done arc_logo_white_sharp.png")
except Exception as e:
    print('Error:', e)
