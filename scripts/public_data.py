"""Offline validation of the distributable, de-identified data model."""
from pathlib import Path
import hashlib
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_KEYS = {'person', 'className', 'provenance', 'selected', 'feedback', 'raw_answer',
                'regions', 'partial_duplicates', 'occurrence_ids', 'visible_text',
                'attempted_at', 'tab_id', 'submissions', 'location_path'}


def read(path):
    return json.loads(path.read_text('utf-8'))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_data(root=ROOT):
    data = Path(root) / 'knowledge_base/data'
    rows = [json.loads(line) for name in ('records.jsonl', 'official_records.jsonl')
            for line in (data/name).read_text('utf-8').splitlines() if line.strip()]
    reviewed = read(data/'reviewed_answers.json')['records']
    sources = read(data/'source_catalog.json')
    conflicts = read(data/'conflicts.json') + read(data/'official_conflicts.json')
    return rows, reviewed, sources, conflicts, read(data/'profiles.json')


def privacy_errors(value, path='$'):
    errors = []
    if isinstance(value, dict):
        for k, v in value.items():
            if k in PRIVATE_KEYS:
                errors.append(path + ': forbidden field ' + k)
            errors += privacy_errors(v, path + '.' + k)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            errors += privacy_errors(v, path + f'[{i}]')
    elif isinstance(value, str):
        if re.search(r'(?:evaluation|history|work/crops)/|(?:joinactivity|comsign|jqnonce|anst)=|(?<![A-Za-z])[A-Za-z]:[\\/]|微信图片_', value):
            errors.append(path + ': private location or result token')
        if re.search(r'(?<!\d)1[3-9]\d{9}(?!\d)|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', value):
            errors.append(path + ': contact information needs review')
    return errors


def validate_data(root=ROOT, check_generated=False):
    root = Path(root)
    rows, reviewed, sources, conflicts, profiles = load_data(root)
    errors = privacy_errors([rows, reviewed, sources, conflicts, profiles])
    byid = {r['id']: r for r in rows}
    source_byid = {s['id']: s for s in sources}
    if len(byid) != len(rows) or len({r['id'] for r in reviewed}) != len(reviewed):
        errors.append('duplicate record IDs')
    if len(source_byid) != len(sources):
        errors.append('duplicate source IDs')
    for r in rows:
        if not r.get('sources') or not r.get('stem', r.get('text')):
            errors.append(r['id'] + ': missing text or source')
        for s in r['sources']:
            if s['source_id'] not in source_byid:
                errors.append(r['id'] + ': missing source catalog entry')
                continue
            if any(p < 1 or p > source_byid[s['source_id']].get('page_count', 0) for p in s.get('pages', [])):
                errors.append(r['id'] + ': invalid physical page')
            if check_generated and not (root/'knowledge_base'/s['file']).is_file():
                errors.append(r['id'] + ': missing readable source')
        if r['kind'] == 'question':
            answer = r.get('answer')
            if not answer:
                errors.append(r['id'] + ': answer missing')
            elif r['type'] != 'boolean':
                options = {o['label']: o['text'] for o in r['options']}
                if any(x not in options for x in answer['labels']) or answer['texts'] != [options.get(x) for x in answer['labels']]:
                    errors.append(r['id'] + ': answer labels/text disagree')
    for r in reviewed:
        if not r.get('evidence_ids') or any(e not in byid for e in r['evidence_ids']):
            errors.append(r['id'] + ': missing cited evidence')
        if any(p not in profiles for p in r['profiles']):
            errors.append(r['id'] + ': unknown profile')
        norm = lambda t: re.sub(r'''[\s,，。;；:：、!?！？“”‘’"'()\[\]【】]+''', '', unicodedata.normalize('NFKC', t))
        truth = lambda t: {'正确':'对', '错误':'错'}.get(norm(t), norm(t))
        canon = truth if r['type'] == 'boolean' else norm
        options = (r['options'] or ['对', '错']) if r['type'] == 'boolean' else r['options']
        if not r['answer_texts'] or (r['type'] != 'fill' and any(canon(a) not in [canon(o) for o in options] for a in r['answer_texts'])):
            errors.append(r['id'] + ': answer is not in options')
    for c in conflicts:
        if any(x not in byid for x in c['record_ids']):
            errors.append(c['id'] + ': unresolved conflict reference')
    return {'ok': not errors, 'errors': errors, 'source_records': len(rows),
            'reviewed_answers': len(reviewed), 'sources': len(sources), 'profiles': len(profiles)}
