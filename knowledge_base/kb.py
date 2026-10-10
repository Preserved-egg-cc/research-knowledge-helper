"""Portable, dependency-free evidence retrieval. Python 3.10+."""
from pathlib import Path
import argparse
import collections
import hashlib
import json
import math
import re
import sys
import unicodedata

BASE = Path(__file__).resolve().parent


def normalize(text):
    """Ignore typography, never remove negation, digits, units, decimal points or signs."""
    text = unicodedata.normalize('NFKC', text)
    return re.sub(r'''[\s,，。;；:：、!?！？“”‘’"'()\[\]【】]+''', '', text)


def stable_id(prefix, value):
    return prefix + '-' + hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]


def load_jsonl(path):
    return [json.loads(s) for s in path.read_text('utf-8').splitlines() if s.strip()]


def tokens(text):
    result = []
    for run in re.findall(r'[\u3400-\u9fff]+|[a-zA-Z]+|\d+(?:\.\d+)?', unicodedata.normalize('NFKC', text).lower()):
        if re.fullmatch(r'[\u3400-\u9fff]+', run):
            result.extend(run[i:i+2] for i in range(len(run)-1))
            if len(run) == 1:
                result.append(run)
        else:
            result.append(run)
    return result


def option_mapping(record, options):
    """Map by full option text, not letters. A changed option set must be re-reasoned."""
    if not options or record['kind'] != 'question' or record.get('type') == 'boolean':
        return None
    if sorted(normalize(o) for o in options) != sorted(normalize(o['text']) for o in record['options']):
        return {'status': 'options_differ', 'answer_labels': None}
    if len({normalize(o) for o in options}) != len(options):
        return {'status': 'ambiguous_duplicate_options', 'answer_labels': None}
    answer = record.get('answer')
    if answer is None:
        return {'status': 'answer_unresolved', 'answer_labels': None}
    wanted = {normalize(o) for o in answer['texts']}
    labels = [chr(65+i) for i, o in enumerate(options) if normalize(o) in wanted]
    return {'status': 'mapped', 'answer_labels': labels, 'answer_texts': answer['texts']}


class Library:
    def __init__(self, base=BASE, include_official=True):
        self.base = Path(base)
        self.records = load_jsonl(self.base / 'data/records.jsonl')
        self.conflicts = json.loads((self.base / 'data/conflicts.json').read_text('utf-8'))
        if include_official and (self.base / 'data/official_records.jsonl').exists():
            self.records += load_jsonl(self.base / 'data/official_records.jsonl')
            self.conflicts += json.loads((self.base / 'data/official_conflicts.json').read_text('utf-8'))
        self.by_id = {r['id']: r for r in self.records}
        self.segments = []
        for r in self.records:
            if r['kind'] == 'question':
                # Answers are returned as evidence, not used to inflate retrieval relevance.
                texts = [r['stem'] + '\n' + '\n'.join(o['text'] for o in r['options'])]
            else:
                paras = [p for p in r['text'].split('\n') if p.strip()]
                texts = [r['title'] + '\n' + p for p in paras]
            for t in texts:
                terms = collections.Counter(tokens(t))
                if terms:
                    self.segments.append((r['id'], t, terms, sum(terms.values())))
        self.df = collections.Counter()
        for _, _, terms, _ in self.segments:
            self.df.update(terms.keys())
        self.avg_len = sum(s[3] for s in self.segments) / max(1, len(self.segments))

    def search(self, query, top_k=5, options=None):
        qterms = set(tokens(query))
        qnorm = normalize(query)
        ranked = {}
        for rid, excerpt, terms, length in self.segments:
            overlap = qterms & terms.keys()
            if not overlap:
                continue
            score = 0.0
            for term in overlap:
                idf = math.log(1 + (len(self.segments) - self.df[term] + .5) / (self.df[term] + .5))
                tf = terms[term]
                score += idf * tf * 2.5 / (tf + 1.5 * (.25 + .75 * length / self.avg_len))
            if rid not in ranked or score > ranked[rid][0]:
                ranked[rid] = (score, excerpt, len(overlap) / max(1, len(qterms)), False)
        for r in self.records:
            if r['kind'] == 'question' and qnorm and qnorm == normalize(r['stem']):
                ranked[r['id']] = (10000., r['stem'], 1., True)
        ordered = sorted(ranked, key=lambda rid: (-ranked[rid][0], rid))
        # Matching words only means a candidate, never proof that the question is answerable.
        strong = bool(ordered and (ranked[ordered[0]][3] or (ranked[ordered[0]][2] >= .30 and ranked[ordered[0]][0] >= 4)))
        results = []
        for rid in ordered[:top_k]:
            score, excerpt, coverage, exact = ranked[rid]
            r = self.by_id[rid]
            item = dict(r, match_score=round(score, 4), query_term_coverage=round(coverage, 4), match_type='exact_stem' if exact else 'bm25_candidate', matched_excerpt=excerpt)
            if options:
                item['option_mapping'] = option_mapping(r, options)
            results.append(item)
        active_conflicts = []
        # Curated source conflicts are activated by their actual subject, not vague overlap.
        for c in self.conflicts:
            if any(all(normalize(t) in qnorm for t in group) for group in c.get('query_terms', [])):
                active_conflicts.append(c)
                for rid in c['record_ids']:
                    if rid not in [r['id'] for r in results] and rid in self.by_id:
                        r = self.by_id[rid]
                        results.append(dict(r, match_score=0., query_term_coverage=0., match_type='conflict_evidence', matched_excerpt=r.get('text', r.get('stem', ''))))
        if active_conflicts:
            status = 'conflict'
        elif not strong:
            status = 'insufficient_evidence'
        elif any(r['match_type'] == 'exact_stem' and r['answer_status'] == 'conflict' for r in results):
            status = 'conflict'
        elif results and results[0]['match_type'] == 'exact_stem' and results[0].get('answer') and (not options or results[0].get('type') == 'boolean' or (results[0].get('option_mapping') or {}).get('status') == 'mapped'):
            status = 'source_answer'
        else:
            status = 'evidence_candidates'
        return {'query': query, 'status': status, 'score_note': '匹配分数用于排序，不是答案概率；候选条款须核对适用对象、版本、否定词和全部选项。', 'conflicts': active_conflicts, 'results': results}


def validate(base=BASE):
    root = Path(base).resolve().parent
    sys.path.insert(0, str(root / 'scripts'))
    from public_data import validate_data
    return validate_data(root)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('search'); p.add_argument('query'); p.add_argument('--top-k', type=int, default=5); p.add_argument('--format', choices=['json', 'text'], default='text'); p.add_argument('--options-json', help='当前选项文本的 JSON 数组，用于换序映射'); p.add_argument('--original-only', action='store_true', help='仅检索原始整理资料，不包含官方补充')
    p = sub.add_parser('get'); p.add_argument('id'); p.add_argument('--format', choices=['json', 'text'], default='json')
    sub.add_parser('validate')
    args = parser.parse_args()
    if args.command == 'validate':
        out = validate(); print(json.dumps(out, ensure_ascii=False, indent=2)); return 0 if out['ok'] else 1
    lib = Library(include_official=not getattr(args, 'original_only', False))
    if args.command == 'get':
        if args.id not in lib.by_id:
            print(json.dumps({'error': 'unknown_id', 'id': args.id}, ensure_ascii=False)); return 2
        out = lib.by_id[args.id]
    else:
        if args.top_k < 1:
            parser.error('--top-k must be positive')
        options = json.loads(args.options_json) if args.options_json else None
        if options is not None and (not isinstance(options, list) or not all(isinstance(x, str) for x in options)):
            parser.error('--options-json must be an array of strings')
        out = lib.search(args.query, args.top_k, options)
    if args.format == 'json' or args.command == 'get':
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print('状态：' + out['status']); print(out['score_note'])
        for r in out['results']:
            print('\n' + r['id'] + ' | ' + str(r['match_score']) + ' | ' + r['title'])
            print(r.get('text', r.get('stem', '')))
            if r.get('answer'):
                print('资料答案：' + json.dumps(r['answer'], ensure_ascii=False))
            print('来源：' + json.dumps(r['sources'], ensure_ascii=False))
        if out['conflicts']:
            print('\n冲突：' + json.dumps(out['conflicts'], ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
