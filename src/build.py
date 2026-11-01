"""Assemble the page: src/*.html|js + render/final/*.png -> index.html (one self-contained file).

    python3 src/build.py              # writes index.html (standalone page)
    python3 src/build.py --artifact   # also writes dist/artifact.html (no <html>/<head>, for claude.ai Artifacts)

Needs Pillow (pip install pillow) to convert the renders to WebP and embed them as data URIs.
Env: Q=96 WebP quality.
"""
import base64, io, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
FIN = os.environ.get('FIN') or os.path.join(ROOT, 'render', 'final')
NAMES = {'u': 'unlit', 'c': 'lit-c', 'l': 'lit-l', 'r': 'lit-r', 'b': 'lit-b'}

def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()

imgs, total = {}, 0
for key, name in NAMES.items():
    im = Image.open(os.path.join(FIN, name + '.png')).convert('RGB')
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=int(os.environ.get('Q', '96')), method=6)
    data = buf.getvalue(); total += len(data)
    imgs[key] = 'data:image/webp;base64,' + base64.b64encode(data).decode()
print('webp total KB', total // 1024)

page = ''.join([
    read('head.html'),
    read('tracks.js'),
    'const TRACKS = TRACKS_SRC;\n',
    read('sound.js'),
    read('scene.js').replace('/*IMAGES*/null', json.dumps(imgs)),
])

if '--artifact' in sys.argv:
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    with open(os.path.join(ROOT, 'dist', 'artifact.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    print('wrote dist/artifact.html')

# standalone document: the head-like part (title, meta, fonts, styles) goes into <head>
cut = page.index('<div class="shell">')
head, body = page[:cut], page[cut:]
doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
       '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
       'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n'
       + head + '</head>\n<body>\n' + body + '\n</body>\n</html>\n')
with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(doc)
print('wrote index.html', len(doc) // 1024, 'KB')
