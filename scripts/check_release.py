"""Check the candidate tree, data privacy, local links and package contents."""
from pathlib import Path
import argparse
import json
import re
from public_data import ROOT, dump, privacy_errors, read, validate_data

SKIP = {'.git', '__pycache__', '.venv', 'node_modules', 'dist'}
TOP = {'.github', 'chrome_extension', 'docs', 'knowledge_base', 'scripts', 'tests', 'reports'}
ROOT_FILES = {'README.md', 'LICENSE', 'NOTICE', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md',
              'AGENTS.md', 'CLAUDE.md', 'package.json', '.gitignore', '.gitattributes'}
SUFFIXES = {'.md', '.py', '.js', '.json', '.jsonl', '.html', '.yml', '.yaml', '.svg'}
FORBIDDEN_PARTS = {'evaluation', 'history', 'work', 'private', 'local_data', 'screenshots'}


def public_files(root=ROOT):
    root = Path(root)
    return sorted(p for p in root.rglob('*') if p.is_file() and not any(x in SKIP for x in p.relative_to(root).parts))


def check(root=ROOT, denied_terms=()):
    root = Path(root)
    errors = []
    files = public_files(root)
    for p in files:
        rel = p.relative_to(root)
        if p.is_symlink():
            errors.append(str(rel) + ': symbolic links are not packaged')
            continue
        if any(x in FORBIDDEN_PARTS for x in rel.parts):
            errors.append(str(rel) + ': private directory')
        if len(rel.parts)==1:
            if p.name not in ROOT_FILES:
                errors.append(str(rel) + ': unexpected root file')
        elif rel.parts[0] not in TOP or (p.suffix not in SUFFIXES and p.name not in {'LICENSE', 'NOTICE'}):
            errors.append(str(rel) + ': file type is not allowed')
        try:
            content = p.read_text('utf-8')
        except (UnicodeError, OSError):
            errors.append(str(rel) + ': binary or unreadable content')
            continue
        for i, term in enumerate(denied_terms):
            if term and (term in content or term in rel.as_posix()):
                errors.append(str(rel) + f': local deny-list entry {i+1}')
        if re.search(r'(?<![A-Za-z])[A-Za-z]:[\\/](?:Users|Python_project)|(?:joinactivity|comsign|jqnonce|anst)=[A-Za-z0-9%]{5,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}', content):
            errors.append(str(rel) + ': possible local path or secret')
        if p.suffix == '.md':
            for target in re.findall(r'\]\(([^)]+)\)', content):
                if target.startswith(('https://', 'http://', '#')):
                    continue
                target = target.split('#')[0]
                if not (p.parent/target).is_file():
                    errors.append(str(rel) + ': missing linked file ' + target)
    data = validate_data(root, check_generated=True)
    errors += data['errors']
    pack_path = root/'chrome_extension/data/answer-pack.json'
    if pack_path.exists():
        errors += privacy_errors(read(pack_path), '$.answer_pack')
    else:
        errors.append('missing generated answer pack; run scripts/build.py')
    return {'ok': not errors, 'files_checked': len(files), 'errors': errors,
            'data': data, 'private_raw_files_distributed': False,
            'limitations': '自动扫描不能识别所有自然语言个人信息；还需人工审阅数据授权及文本。'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deny-file', type=Path, help='Local JSON array of private terms; keep outside this repository')
    args = parser.parse_args()
    denied = read(args.deny_file) if args.deny_file else []
    out = check(denied_terms=denied)
    dump(ROOT/'reports/release_check.json', out)
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0 if out['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
