const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
test('persistent submit lock is atomic across tabs, refresh and worker restart',async()=>{
  const state={};
  function worker(){
    let listener;
    const ctx={URL,TextEncoder,crypto:webcrypto,fetch:async()=>({json:async()=>({content_sha256:'hash',profiles:{test:{count:1}}})}),
      chrome:{runtime:{getURL:p=>'chrome-extension://unit/'+p,onMessage:{addListener:f=>listener=f}},storage:{local:{
        get:async k=>({[k]:state[k]}),set:async x=>Object.assign(state,x)}}}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../background.js'),'utf8'),ctx);
    return (msg,tab=1,url='https://ks.wjx.com/vm/test.aspx')=>new Promise(resolve=>listener(msg,{url,tab:{id:tab}},resolve));
  }
  const call=worker(),run={profile:'test',pack_hash:'hash',person:{name:'测试甲',className:'测试班'},analysis:{ready:true,total:1},paper_fingerprint:'one'};
  assert.equal((await call({action:'claim',run:{...run,analysis:{ready:false,fillable:true,total:1}}})).ok,false);
  assert.equal(state.runs,undefined,'partial fill must not create a submission record or lock');
  const replies=await Promise.all([call({action:'claim',run}),call({action:'claim',run},2)]);
  assert.equal(replies.filter(x=>x.ok).length,1);assert.equal(state.runs.length,1);
  const restarted=worker();assert.equal((await restarted({action:'claim',run:{...run,paper_fingerprint:'new random order'}})).ok,false);
  assert.equal((await restarted({action:'result',result:{visible_text:'提交成功',score_displayed:null}},1,'https://ks.wjx.com/wjx/join/completemobile2.aspx?activityid=wrong')).data.saved,false);
  assert.equal((await restarted({action:'result',result:{visible_text:'提交成功',score_displayed:null}},1,'https://ks.wjx.com/wjx/join/completemobile2.aspx?activityid=test')).data.saved,true);
  assert.equal(state.runs[0].result.score_displayed,null);
  assert.equal((await restarted({action:'claim',run},4,'https://unrelated.test/')).ok,false);
});
