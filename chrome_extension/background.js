'use strict';
// A single serialized worker prevents two tabs from acquiring the same submission.
let queue=Promise.resolve();
const packPromise=fetch(chrome.runtime.getURL('data/answer-pack.json')).then(r=>r.json());
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
async function handle(msg,sender){
  const own=sender.url?.startsWith(chrome.runtime.getURL(''));
  const page=sender.url?new URL(sender.url):null;
  if(!own&&page?.origin!=='https://ks.wjx.com')throw Error('不支持的来源');
  const pack=await packPromise;
  if(msg.action==='pack')return pack;
  if(msg.action==='runs')return (await chrome.storage.local.get('runs')).runs||[];
  if(msg.action==='claim'){
    const run=msg.run;
    if(!sender.tab||!pack.profiles[run.profile]||page.pathname!==`/vm/${run.profile}.aspx`)throw Error('测试配置不符');
    if(run.pack_hash!==pack.content_sha256||!run.analysis.ready||run.analysis.total!==pack.profiles[run.profile].count)throw Error('答案包或题量不符');
    if(!run.person?.name?.trim()||!run.person?.className?.trim())throw Error('缺少身份字段');
    // Identity + questionnaire, NOT random question order. Refresh cannot evade a lock.
    const key='submitted:'+await digest(JSON.stringify([run.profile,run.person.name.trim(),run.person.className.trim()]));
    if((await chrome.storage.local.get(key))[key])throw Error('该姓名和班级已尝试提交此测试，请先核对网页结果。');
    const record={...run,id:crypto.randomUUID(),status:'submission_attempted',attempted_at:new Date().toISOString(),tab_id:sender.tab.id};
    const runs=(await chrome.storage.local.get('runs')).runs||[];
    await chrome.storage.local.set({[key]:record.id,runs:[...runs,record],['pending:'+sender.tab.id]:record.id});
    return {id:record.id};
  }
  if(msg.action==='result'){
    if(!sender.tab||!page.pathname.startsWith('/wjx/join/complete'))throw Error('不是结果页面');
    const pid=page.searchParams.get('activityid');
    const pending=(await chrome.storage.local.get('pending:'+sender.tab.id))['pending:'+sender.tab.id];
    const runs=(await chrome.storage.local.get('runs')).runs||[];
    const run=runs.find(r=>r.id===pending&&r.profile===pid);
    if(!run)return {saved:false};
    run.status='result_page_observed';run.result={...msg.result,observed_at:new Date().toISOString()};
    await chrome.storage.local.set({runs});return {saved:true,id:run.id};
  }
  throw Error('未知操作');
}
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  const task=queue.then(()=>handle(msg,sender));queue=task.catch(()=>{});
  task.then(data=>sendResponse({ok:true,data}),e=>sendResponse({ok:false,error:e.message}));return true;
});
