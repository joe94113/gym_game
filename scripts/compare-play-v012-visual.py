"""Compare fixed review screenshots; this is evidence, not an image edit."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

root = Path(__file__).resolve().parent.parent
relative_directory = 'artifacts/performance-v012/visual' + ('/grips' if '--grips' in sys.argv else '')
directory = root / relative_directory
capture = json.loads((directory / 'capture.json').read_text(encoding='utf-8-sig'))
before = [record for record in capture['records'] if record['version'] == 'before']
after = {(record['id'], record['view']): record for record in capture['records'] if record['version'] == 'after'}
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
rows, images = [], []
for record in before:
    other = after[record['id'], record['view']]
    old = Image.open(root / record['path']).convert('RGB')
    new = Image.open(root / other['path']).convert('RGB')
    assert old.size == new.size
    diff = ImageChops.difference(old, new)
    channels = diff.split()
    maximum = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
    histogram = maximum.histogram()
    changed = old.width * old.height - histogram[0]
    rms = (sum(value ** 2 for value in ImageStat.Stat(diff).rms) / 3) ** .5
    rows.append({'id': record['id'], 'view': record['view'], 'before': record['path'], 'after': other['path'],
                 'size': list(old.size), 'changedPixels': changed, 'changedPercent': changed / (old.width * old.height) * 100,
                 'maxChannelDifference': max(i for i, count in enumerate(histogram) if count), 'rgbRMSE': rms})
    pair = Image.new('RGB', (old.width * 2, old.height + 30), '#172327')
    pair.paste(old, (0, 30)); pair.paste(new, (old.width, 30))
    draw = ImageDraw.Draw(pair)
    draw.text((8, 7), f"BEFORE: {record['id']} / {record['view']}", fill='white', font=font)
    draw.text((old.width + 8, 7), 'AFTER', fill='white', font=font)
    images.append(pair)
sheets = []
for offset in range(0, len(images), 3):
    page = images[offset:offset + 3]
    sheet = Image.new('RGB', (page[0].width, sum(item.height for item in page)), '#172327')
    y = 0
    for item in page:
        sheet.paste(item, (0, y)); y += item.height
    relative = f'{relative_directory}/comparison-{offset // 3 + 1}.png'
    sheet.save(root / relative); sheets.append(relative)
report = {'scope': 'Pixel comparison of matched isolated native review renders; continuous motion and hidden surfaces require separate review.',
          'allPixelIdentical': all(row['changedPixels'] == 0 for row in rows), 'pairs': rows, 'sheets': sheets}
(directory / 'pixel-comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
