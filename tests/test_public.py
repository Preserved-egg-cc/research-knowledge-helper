from pathlib import Path
import hashlib
import json
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'knowledge_base'))
sys.path.insert(0, str(ROOT/'scripts'))
from kb import Library, option_mapping
from public_data import load_data, privacy_errors, validate_data


class PublicReleaseTests(unittest.TestCase):
    def test_data_and_citations(self):
        result = validate_data(check_generated=True)
        self.assertTrue(result['ok'], result['errors'])
        self.assertEqual((result['source_records'], result['reviewed_answers'], result['sources']), (669, 255, 34))

    def test_retrieval_cases(self):
        lib = Library()
        cases = json.loads((ROOT/'tests/retrieval_cases.json').read_text('utf-8'))
        for c in cases:
            with self.subTest(query=c['query']):
                out = lib.search(c['query'], 5)
                gold = c.get('gold_ids', [])
                if c.get('gold_stem'):
                    gold = [r['id'] for r in lib.records if r['kind']=='question' and r['stem'].startswith(c['gold_stem'])]
                if gold:
                    self.assertTrue(set(gold)&{r['id'] for r in out['results'][:5]})
                else:
                    self.assertEqual(out['status'], c['status'])
                if 'conflict_id' in c:
                    self.assertIn(c['conflict_id'], [x['id'] for x in out['conflicts']])
                for rid in gold:
                    if 'answer' in c:
                        self.assertEqual(lib.by_id[rid]['answer']['texts'], c['answer'])
                    if 'answer_labels' in c:
                        self.assertEqual(lib.by_id[rid]['answer']['labels'], c['answer_labels'])

    def test_official_evidence_for_scholarship_and_campus_card(self):
        lib = Library()
        for query, legacy, ending in [
            ('保留入学资格保留学籍正式入学后可参评学业奖学金', 'E22', 'A008'),
            ('完成集中学习回培养单位校园卡剩余资金清算功能保留至毕业', 'E23', 'A022'),
            ('未经批准离校续假未批准逾期不返校无故旷学', 'E15', 'S003')]:
            found = lib.search(query, 5)['results']
            self.assertTrue(any(r['id'].endswith(ending) and r['sources'][0].get('legacy_id')==legacy for r in found))
        campus = next(r for r in lib.records if r['id'].endswith('A022') and r['sources'][0].get('legacy_id')=='E23')
        self.assertEqual(campus['sources'][0]['pages'], [172])
        self.assertEqual(campus['sources'][0]['printed_pages'], [162])

    def test_option_order_and_changed_meaning(self):
        q = next(r for r in Library().records if r['kind']=='question' and r['stem'].startswith('氧气的性质'))
        self.assertEqual(option_mapping(q, ['助燃','有毒','可燃','窒息'])['answer_labels'], ['A'])
        self.assertEqual(option_mapping(q, ['助燃','有毒','可燃','易燃'])['status'], 'options_differ')

    def test_private_fields_and_tokens_are_rejected(self):
        self.assertTrue(privacy_errors({'person': {'name': 'Example'}}))
        self.assertTrue(privacy_errors({'source': 'evaluation' + '/sample.json'}))
        self.assertTrue(privacy_errors({'url': 'https://example.invalid/?' + 'comsign' + '=example-token'}))
        self.assertFalse(privacy_errors({'url': 'https://www.ucas.ac.cn/'}))

    def test_rebuild_is_deterministic(self):
        targets = [ROOT/'chrome_extension/data/answer-pack.json', ROOT/'knowledge_base/exports/knowledge-base.md']
        before = [hashlib.sha256(p.read_bytes()).hexdigest() for p in targets]
        subprocess.run([sys.executable, '-X', 'utf8', str(ROOT/'scripts/build.py')], check=True, capture_output=True)
        self.assertEqual(before, [hashlib.sha256(p.read_bytes()).hexdigest() for p in targets])


if __name__ == '__main__':
    unittest.main()
