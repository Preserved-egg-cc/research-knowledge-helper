"""Rebuild readable knowledge files and the extension pack without network access."""
from pathlib import Path
import hashlib
import json
import sys
from public_data import ROOT, read, dump, sha, load_data, validate_data


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + '\n', encoding='utf-8')


def render_record(r):
    lines = ['## ' + r['id'], '', r.get('stem', r.get('text', '')), '']
    if r.get('options'):
        lines += [o['label'] + '. ' + o['text'] for o in r['options']] + ['']
    if r.get('answer'):
        lines += ['资料答案：' + '；'.join(r['answer']['texts']), '']
    lines += ['答案/证据状态：`' + r['answer_status'] + '`。', '']
    if r.get('edition'):
        lines += ['版本：' + r['edition'], '']
    if r.get('scope'):
        lines += ['范围：' + r['scope'], '']
    for s in r['sources']:
        place = s.get('locator', s.get('article', ''))
        if s.get('pages'):
            place += '；物理页 ' + '、'.join(map(str, s['pages']))
        if s.get('printed_pages'):
            place += '；印刷页 ' + '、'.join(map(str, s['printed_pages']))
        lines += ['来源：`' + s['source_id'] + '` · ' + s['title'] + ' · ' + place, '']
        if s.get('url'):
            lines += ['[官方来源](' + s['url'] + ')', '']
    if r.get('notes'):
        lines += r['notes'] + ['']
    return '\n'.join(lines)


def main():
    validation = validate_data()
    if not validation['ok']:
        raise ValueError(validation['errors'])
    rows, reviewed, sources, conflicts, profiles = load_data()
    byid = {r['id']: r for r in rows}
    kb = ROOT/'knowledge_base'
    records = []
    for r in rows:
        if r['kind'] != 'question':
            continue
        records.append(dict(id=r['id'], type=r['type'], stem=r['stem'], options=[o['text'] for o in r['options']],
                            answer_texts=r['answer']['texts'], evidence_ids=[r['id']], answer_status=r['answer_status'],
                            profiles=[], conflict_ids=[c['id'] for c in conflicts if r['id'] in c['record_ids']],
                            reason='按所引资料的整理答案匹配；不推定为当前制度。'))
    # Preserve input order so identical matches keep stable preferred citations.
    records += reviewed
    evidence = {}
    for eid in sorted({eid for r in records for eid in r['evidence_ids']}):
        r = byid[eid]
        evidence[eid] = dict(id=eid, title=r.get('title', eid), text=r.get('text', r.get('stem')),
                             edition=r.get('edition'), scope=r.get('scope'), sources=r['sources'])
    pack = dict(schema_version=1, version=read(ROOT/'chrome_extension/manifest.json')['version'],
                data_release='public-review', records=records, evidence=evidence, conflicts=conflicts, profiles=profiles,
                corpus_hashes={p.name:sha(p) for p in sorted((kb/'data').iterdir()) if p.suffix in ('.json', '.jsonl')},
                evaluation_note='无私人答卷或判分记录；整理答案不是网站评分保证。')
    pack['content_sha256'] = hashlib.sha256(json.dumps(pack, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    dump(ROOT/'chrome_extension/data/answer-pack.json', pack)
    catalog = ['# 资料来源目录', '', '原始PDF、截图、私人答卷均不随此候选版分发。编号仅用于引用已整理文本。第三方资料许可见 [资料授权说明](../../docs/DATA_LICENSE.md)。', '',
               '| 来源 | 标题 | 类型 |', '| --- | --- | --- |']
    for s in sources:
        own = [r for r in rows if any(x['source_id']==s['id'] for x in r['sources'])]
        text = ['# ' + s['title'], '', '来源 ID：`' + s['id'] + '`。', '', s.get('availability', ''), '', s['rights'], '']
        if s.get('edition'):
            text += ['版本：' + s['edition'], '']
        if s.get('scope'):
            text += ['范围：' + s['scope'], '']
        if s.get('url'):
            text += ['[官方发布页](' + s['url'] + ')', '']
        text += [render_record(r) for r in own]
        write(kb/s['file'], '\n'.join(text))
        catalog.append(f'| `{s["id"]}` | [{s["title"]}]({Path(s["file"]).name}) | {s["kind"]} |')
    write(kb/'sources/README.md', '\n'.join(catalog))
    for topic in sorted({r['topic'] for r in rows if r['kind']=='question'}):
        own = [r for r in rows if r['kind']=='question' and r['topic']==topic]
        write(kb/'questions'/f'{topic}.md', '# ' + topic + '\n\n' + '\n'.join(render_record(r) for r in own))
    review_md = ['# 限定问卷的审阅答案', '', '按题干及全部选项精确匹配；范围见每项 evidence_ids 对应条款。本文件不包含个人作答或网站判分。', '']
    for r in reviewed:
        review_md += ['## ' + r['id'], '', r['stem'], '', *[f'{chr(65+i)}. {t}' for i,t in enumerate(r['options'])], '',
                      '答案：' + '；'.join(r['answer_texts']), '', '依据：' + '、'.join(r['evidence_ids']), '',
                      r['reason'], '', r['review_scope'], '', '问卷配置：' + '、'.join(r['profiles']), '']
    write(kb/'questions/审阅答案.md', '\n'.join(review_md))
    conflict_md = ['# 版本与来源冲突', '', '按适用文件区分，不以匹配分数选择制度版本。', '']
    for c in conflicts:
        conflict_md += ['## ' + c['id'] + ' · ' + c['title'], '', c['description'], '', '记录：' + '、'.join(c['record_ids']), '']
    write(kb/'CONFLICTS.md', '\n'.join(conflict_md))
    export = ['# 科研资料助手 · 上传合订版', '', '这是去身份的文本资料和审阅答案，未包含私人答卷或原图。第三方原文不适用软件代码MIT许可。按来源版本阅读；证据不足或冲突时明确说明。', '', '\n'.join(conflict_md)]
    export += [render_record(r) for r in rows] + ['\n'.join(review_md)]
    write(kb/'exports/knowledge-base.md', '\n\n'.join(export))
    dump(ROOT/'reports/build.json', dict(validation, extension_records=len(records), cited_evidence=len(evidence),
                                       version=pack['version'], pack_hash=pack['content_sha256']))
    print(json.dumps(read(ROOT/'reports/build.json'), ensure_ascii=False))


if __name__ == '__main__':
    main()
