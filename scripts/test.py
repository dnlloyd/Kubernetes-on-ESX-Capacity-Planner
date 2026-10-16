"""Run the current model regression suite with Node.js."""
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js is required to run the tests.')
for test in sorted((root / 'tests').glob('test-*.mjs')):
    print(test.name, flush=True)
    subprocess.run([node, str(test)], cwd=root, check=True)
subprocess.run(['python3', str(root / 'scripts/build.py'), '--check'], cwd=root, check=True)
