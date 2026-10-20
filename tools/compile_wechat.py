"""Compile every template and stylesheet with the installed official WeChat compilers."""
from pathlib import Path
import json, os, subprocess
ROOT = Path(__file__).resolve().parents[1]
MINI = ROOT / 'miniprogram'
WXTOOLS = Path(os.environ.get('WXTOOLS', r'E:\application\微信web开发者工具'))
CANDIDATES = [WXTOOLS / 'resources/app.asar.unpacked/node_modules/wcc-exec', WXTOOLS / 'code/package.nw/node_modules/wcc-exec']
BIN = next((p for p in CANDIDATES if (p / 'wcc.exe').is_file() and (p / 'wcsc.exe').is_file()), None)
if BIN is None:
    raise FileNotFoundError('WeChat WXML/WXSS compiler not found; set WXTOOLS to the installed developer tools directory')
OUT = ROOT / 'dist' / 'validation'
OUT.mkdir(parents=True, exist_ok=True)
for file in MINI.rglob('*.json'):
    json.loads(file.read_text(encoding='utf-8'))
for file in MINI.rglob('*.js'):
    subprocess.run(['node', '--check', str(file)], check=True)
for file in list(MINI.rglob('*.wxml')) + list(MINI.rglob('*.wxss')):
    compiler = 'wcc.exe' if file.suffix == '.wxml' else 'wcsc.exe'
    output = OUT / (file.relative_to(MINI).as_posix().replace('/', '-') + '.js')
    args = [str(BIN / compiler), '-o', str(output)]
    if compiler == 'wcsc.exe':
        args.append('-lc')
    sources = [file.relative_to(MINI).as_posix()]
    if compiler == 'wcsc.exe':
        sources += [p.relative_to(MINI).as_posix() for p in MINI.rglob('*.wxss') if p != file]
    result = subprocess.run(args + sources, cwd=MINI, capture_output=True, timeout=30)
    if result.returncode or not output.exists() or output.stat().st_size < 100:
        raise RuntimeError(result.stdout.decode(errors='replace') + result.stderr.decode(errors='replace'))
    if compiler == 'wcc.exe':
        subprocess.run(['node', '--check', str(output)], check=True)
print('PASS: JSON, all JS syntax, all official WXML/WXSS compilers')
