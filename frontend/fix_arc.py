import sys
try:
    from PIL import Image
    import math

    img = Image.open('public/arc_logo.png')
    img = img.convert("RGBA")
    data = img.load()
    
    width, height = img.size
    # first, let's sample what the brightest pixel is
    max_lum = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = data[x, y]
            lum = (r * 0.299 + g * 0.587 + b * 0.114)
            if lum > max_lum: max_lum = lum
            
    print("Max lum:", max_lum)
            
    for y in range(height):
        for x in range(width):
            r, g, b, a = data[x, y]
            lum = (r * 0.299 + g * 0.587 + b * 0.114)
            # Map [35, 100] to [0, 255] just to be safe
            alpha = (lum - 40) / 60.0 * 255
            alpha = max(0, min(255, int(alpha)))
            
            data[x, y] = (255, 255, 255, alpha)

    img.save('public/arc_logo.png')
    print("Done arc_logo.png")
except Exception as e:
    print('Error:', e)
