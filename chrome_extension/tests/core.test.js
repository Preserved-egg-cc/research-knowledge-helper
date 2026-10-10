const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../core.js');
const pack=require('../data/answer-pack.json');
const q={type:'single',stem:'使用氮气时压力不能超过0.5 MPa。',options:['0.5 MPa','5 MPa']};
const r={id:'test',...q,answer_texts:['0.5 MPa'],evidence_ids:[],profiles:[]};
const p={profiles:{test:{count:1}},records:[r]};
test('option reorder maps by text',()=>assert.deepEqual(C.match({...q,options:[...q.options].reverse()},p,'test').answer_indexes,[1]));
test('negation, gas, decimal, unit and sign differences stop matching',()=>{
  for(const stem of [q.stem.replace('氮','氢'),q.stem.replace('不能','能'),q.stem.replace('0.5','05'),q.stem.replace('MPa','kPa'),q.stem.replace('0.5','-0.5')])assert.equal(C.match({...q,stem},p,'test').status,'unknown');
});
test('changed options and duplicated meanings block',()=>{
  for(const options of [['0.5 MPa','50 MPa'],['0.5 MPa','0.5 MPa']])assert.equal(C.match({...q,options},p,'test').status,'options_differ');
});
test('conflicting answers are not selected by array order',()=>assert.equal(C.match(q,{...p,records:[r,{...r,id:'conflict',answer_texts:['5 MPa']}]},'test').status,'conflict'));
test('unreviewed version conflict blocks; exact profile review can resolve',()=>{
  const conflicted={...r,conflict_ids:['C']};assert.equal(C.match(q,{...p,records:[conflicted]},'test').status,'conflict');
  assert.equal(C.match(q,{...p,records:[conflicted,{...r,id:'reviewed',profiles:['test']}]},'test').status,'matched');
});
test('different profile cannot use scoped inference',()=>assert.equal(C.match(q,{...p,records:[{...r,profiles:['other']}]},'test').status,'out_of_scope'));
test('true/false aliases and ordering handled explicitly',()=>{
  const b={type:'boolean',stem:'句子',options:['错误','正确']};
  assert.deepEqual(C.match(b,{...p,records:[{...r,...b,options:[],answer_texts:['对']}]},'test').answer_indexes,[1]);
  assert.equal(C.match({...b,options:['是','否']},{...p,records:[{...r,...b}]},'test').status,'options_differ');
});
test('one blank supported, multiple blanks refused',()=>{
  const b={type:'fill',stem:'答案为____。',options:[],answer_texts:['原词'],profiles:[]};
  assert.equal(C.match({...b,stem:'答案为 。',blank_count:1},{...p,records:[b]},'test').status,'matched');
  assert.equal(C.match({...b,blank_count:2},{...p,records:[b]},'test').status,'options_differ');
});
test('count, numbering and unknown questions disable readiness',()=>{
  assert.ok(C.analyze([{...q,n:1}],p,'test').ready);
  for(const qs of [[],[{...q,n:2}],[{...q,n:1,stem:'未知'}],[{...q,n:1},{...q,n:2}]])assert.equal(C.analyze(qs,p,'test').ready,false);
});
test('partial matching permits filling known questions but never submission',()=>{
  const plan=C.analyze([{...q,n:1},{...q,n:2,stem:'尚未收录'}],{...p,profiles:{test:{count:2}}},'test');
  assert.equal(plan.fillable,true);assert.equal(plan.ready,false);
  assert.deepEqual(plan.unmatched,[{n:2,status:'unknown'}]);
  for(const qs of [[],[{...q,n:2}],[{...q,n:1,stem:'未知'}]])assert.equal(C.analyze(qs,p,'test').fillable,false);
});
test('fingerprint detects reordered options, ignores answers filled in separate fields',()=>{
  assert.notEqual(C.fingerprint([q]),C.fingerprint([{...q,options:[...q.options].reverse()}]));
  assert.equal(C.fingerprint([q]),C.fingerprint([{...q,checked:[1]}]));
});
test('success alone is not a score',()=>{
  assert.equal(C.parseResult('提交成功').score_displayed,null);
  assert.equal(C.parseResult('答对20题 共20题 总分100').score_displayed,null);
  assert.equal(C.parseResult('得分 85 总分 100 答对17题 共20题').score_displayed,85);
});
test('pack has only cited reviewed answers and no runtime identity/tokens',()=>{
  for(const r of pack.records){assert.ok(r.answer_texts.length);assert.ok(r.evidence_ids.length);for(const e of r.evidence_ids)assert.ok(pack.evidence[e],e);}
});
test('all reviewed answer cases survive shuffled options without a model',()=>{
  let total=0;
  for(const r of pack.records.filter(r=>r.profiles.length)){
    const options=r.type==='boolean'?['错','对']:[...r.options].reverse();
    const found=C.match({...r,options,blank_count:r.type==='fill'?1:0},pack,r.profiles[0]);
    assert.equal(found.status,'matched',r.id+' '+r.stem);
    assert.deepEqual(found.answer_texts.map(C.norm).sort(),r.answer_texts.map(C.norm).sort(),r.id);total++;
  }
  assert.equal(total,255);
});
