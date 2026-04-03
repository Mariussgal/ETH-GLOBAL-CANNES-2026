import sys
from PIL import Image

img = Image.open('public/arc_logo_clean.png')
data = img.load()
width, height = img.size

# We only look at the bottom half to avoid cropping the top arch
for y in range(height // 2, height):
    # Find continuous spans of alpha > 0
    span_start = -1
    for x in range(width):
        is_solid = data[x, y][3] > 10
        if is_solid:
            if span_start == -1:
                span_start = x
        else:
            if span_start != -1:
                span_len = x - span_start
                if span_len > 150: # The floor spans almost the whole image width
                    # Erase this span
                    for sx in range(span_start, x):
                        data[sx, y] = (255, 255, 255, 0)
                span_start = -1
    
    # Check if the row ended on a span
    if span_start != -1:
        span_len = width - span_start
        if span_len > 150:
            for sx in range(span_start, width):
                data[sx, y] = (255, 255, 255, 0)

# Save as arc_logo_final.png to bust cache AGAIN
img.save('public/arc_logo_final.png')
print("Done fix floor")
