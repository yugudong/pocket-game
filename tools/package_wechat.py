"""Package only runtime source and README, never local developer credentials."""
from pathlib import Path
import hashlib, json, re, sys, zipfile
ROOT = Path(__file__).resolve().parents[1]
MINI = ROOT / 'miniprogram'
VERSION = sys.argv[1] if len(sys.argv) > 1 else json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
if not re.fullmatch(r'\d+\.\d+\.\d+', VERSION):
    raise ValueError('Version must be major.minor.patch')
OUTPUT = ROOT / 'dist' / f'pocket-board-games-{VERSION}-wechat.zip'
OUTPUT.parent.mkdir(exist_ok=True)
ALLOWED = {'.js', '.json', '.wxml', '.wxss', '.png'}
with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(MINI.rglob('*')):
        if file.is_file() and file.suffix in ALLOWED and file.name != 'project.private.config.json' and 'node_modules' not in file.parts:
            archive.write(file, 'miniprogram/' + file.relative_to(MINI).as_posix())
    archive.write(ROOT / 'README.md', 'README.md')
    for name in ('CHANGELOG.md', '微信小程序开发经验总结.md'):
        file = ROOT / name
        if file.is_file():
            archive.write(file, name)
    for file in sorted((ROOT / 'docs').rglob('*')):
        if file.is_file() and file.suffix in {'.md', '.json', '.txt'}:
            archive.write(file, file.relative_to(ROOT).as_posix())
with zipfile.ZipFile(OUTPUT) as archive:
    assert 'miniprogram/assets/avatar.png' in archive.namelist()
    assert not any('private.config' in name for name in archive.namelist())
digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
(OUTPUT.parent / (OUTPUT.name + '.sha256')).write_text(digest + '  ' + OUTPUT.name + '\n', encoding='utf-8')
print(f'{OUTPUT}\n{OUTPUT.stat().st_size} bytes\nSHA-256 {digest}')
