/* Pure, model-free matching. Shared by the extension and Node regression tests. */
(function(root,factory){
  const api=factory(); if(typeof module==='object'&&module.exports) module.exports=api;
  else root.KBMatch=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Decimal points, arithmetic signs, units, negation and digits remain significant.
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s,，。;；:：、!?！？“”"'‘’()\[\]【】]/g,'');
  const stemKey=q=>norm(q.type==='fill'?q.stem.replace(/_{2,}/g,''):q.stem);
  const truth=s=>({'对':'对','正确':'对','错':'错','错误':'错'}[norm(s)]||null);
  const same=(a,b)=>a.length===b.length&&[...a].sort().every((x,i)=>x===[...b].sort()[i]);
  function optionsMatch(q,r){
    if(q.type==='fill') return q.blank_count===undefined||q.blank_count===1;
    if(q.type==='boolean') return same(q.options.map(truth),['对','错']);
    const a=q.options.map(norm), b=r.options.map(norm);
    return new Set(a).size===a.length&&new Set(b).size===b.length&&same(a,b);
  }
  function match(q,pack,profile){
    if(!pack.profiles[profile]) return {status:'unsupported_profile'};
    const stem=pack.records.filter(r=>r.type===q.type&&stemKey(r)===stemKey(q));
    const exact=stem.filter(r=>optionsMatch(q,r));
    if(!exact.length) return {status:stem.length?'options_differ':'unknown',candidate_ids:stem.map(r=>r.id)};
    const scoped=exact.filter(r=>r.profiles?.includes(profile));
    const applicable=scoped.length?scoped:exact.filter(r=>!r.profiles?.length);
    if(!applicable.length) return {status:'out_of_scope'};
    if(!scoped.length&&applicable.some(r=>r.conflict_ids?.length)) return {status:'conflict',candidate_ids:applicable.map(r=>r.id)};
    const answers=applicable.map(r=>r.answer_texts.map(t=>q.type==='boolean'?truth(t):norm(t)));
    if(answers.some(a=>!same(a,answers[0]))) return {status:'conflict',candidate_ids:applicable.map(r=>r.id)};
    const r=applicable[0];
    let indexes=[];
    if(q.type!=='fill'){
      indexes=r.answer_texts.map(t=>q.options.findIndex(o=>(q.type==='boolean'?truth(o):norm(o))===(q.type==='boolean'?truth(t):norm(t))));
      if(indexes.some(i=>i<0)||new Set(indexes).size!==indexes.length||(q.type!=='multiple'&&indexes.length!==1)) return {status:'invalid_answer'};
    }
    return {status:'matched',record_id:r.id,answer_texts:r.answer_texts,answer_indexes:indexes,
      evidence_ids:[...new Set(applicable.flatMap(r=>r.evidence_ids))],reason:r.reason,
      answer_status:r.answer_status,scope:r.review_scope||'原资料明确答案',
      conflict_review:r.conflict_review||[],match_kind:'exact_stem_and_options'};
  }
  function analyze(questions,pack,profile){
    const results=questions.map(q=>({...q,match:match(q,pack,profile)}));
    const expected=pack.profiles[profile]?.count;
    const countOK=questions.length===expected;
    const numbered=questions.every((q,i)=>q.n===i+1);
    const matched=results.filter(q=>q.match.status==='matched').length;
    return {profile,total:questions.length,expected,matched,countOK,numbered,
      fillable:countOK&&numbered&&matched>0,
      unmatched:results.filter(q=>q.match.status!=='matched').map(q=>({n:q.n,status:q.match.status})),
      ready:countOK&&numbered&&matched===questions.length,results};
  }
  // Order is deliberate: randomization or changed option order invalidates a filled plan.
  const fingerprint=questions=>JSON.stringify(questions.map(q=>[q.div,q.n,q.type,stemKey(q),q.options.map(norm),q.blank_count??0]));
  function parseResult(text){
    const t=String(text).replace(/\s+/g,' ');
    const correct=t.match(/答对\s*(\d+)\s*题/), count=t.match(/共\s*(\d+)\s*题/), total=t.match(/总分\s*[:：]?\s*(\d+(?:\.\d+)?)/);
    // Never infer a score from submission success or number correct.
    const score=t.match(/(?:得分|分数)\s*[:：]?\s*(\d+(?:\.\d+)?)/);
    return {score_displayed:score?Number(score[1]):null,total_score_displayed:total?Number(total[1]):null,
      correct_count_displayed:correct?Number(correct[1]):null,question_count_displayed:count?Number(count[1]):null};
  }
  return {norm,truth,stemKey,match,analyze,fingerprint,parseResult};
});
