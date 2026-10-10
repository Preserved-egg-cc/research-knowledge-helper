"""Create deterministic local ZIPs. Never creates a release or uploads files."""
from pathlib import Path
import hashlib
import json
import zipfile
from public_data import ROOT, read, sha
from check_release import check, public_files


def archive(target, files, prefix):
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(files):
            rel = p.relative_to(ROOT).as_posix()
            info = zipfile.ZipInfo(prefix + rel, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, p.read_bytes(), compresslevel=9)
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == len(files)
        for p in files:
            name = prefix + p.relative_to(ROOT).as_posix()
            assert hashlib.sha256(z.read(name)).hexdigest() == sha(p)
    target.with_suffix('.zip.sha256').write_text(sha(target)+'  '+target.name+'\n', encoding='utf-8')
    return {'file': target.name, 'files': len(files), 'bytes': target.stat().st_size, 'sha256': sha(target)}


def main():
    result = check()
    if not result['ok']:
        raise ValueError(result['errors'])
    dist = ROOT/'dist'
    dist.mkdir(exist_ok=True)
    version = read(ROOT/'chrome_extension/manifest.json')['version']
    files = public_files()
    packages = [archive(dist/f'research-knowledge-helper-{version}-review.zip', files, 'research-knowledge-helper/')]
    names = ['manifest.json', 'core.js', 'adapter.js', 'content.js', 'background.js', 'popup.html',
             'README.md', 'INSTALL.md', 'PRIVACY.md', 'LICENSE', 'NOTICE', 'data/answer-pack.json']
    packages += [archive(dist/f'research-knowledge-helper-extension-{version}-review.zip',
                         [ROOT/'chrome_extension'/n for n in names], '')]
    (dist/'SHA256SUMS').write_text(''.join(p['sha256']+'  '+p['file']+'\n' for p in packages), encoding='utf-8')
    print(json.dumps({'local_only': True, 'packages': packages}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
