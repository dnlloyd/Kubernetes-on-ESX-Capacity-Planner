"""Rebuild the self-contained app, or verify that it matches source."""
from pathlib import Path
import argparse

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Check without writing the generated HTML')
args = parser.parse_args()
html = (root / 'index.html').read_text().replace(
    '<link rel="stylesheet" href="./styles.css">',
    '<style>' + (root / 'styles.css').read_text() + '</style>')
html = html.replace('<script type="module" src="./app.mjs"></script>',
    '<script type="module">\n' + (root / 'model.mjs').read_text().replace('export ', '') + '\n' +
    (root / 'app.mjs').read_text().split('\n', 1)[1] + '\n</script>')
target = root / 'az-planner.html'
if args.check:
    if not target.exists() or target.read_text() != html:
        raise SystemExit('Generated HTML differs. Run python3 scripts/build.py')
    print('PASS: az-planner.html matches the modular source.')
else:
    target.write_text(html)
    print('Built az-planner.html')
