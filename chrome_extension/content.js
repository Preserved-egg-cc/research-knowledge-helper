(async function(){
  'use strict';
  if(document.getElementById('kb-local-helper'))return;
  const ask=async(action,args={})=>{const r=await chrome.runtime.sendMessage({action,...args});if(!r?.ok)throw Error(r?.error||'扩展连接中断，请刷新页面');return r.data;};
  const pack=await ask('pack');
  const u=new URL(location.href),profile=u.pathname.match(/^\/vm\/([^/]+)\.aspx$/)?.[1]||u.searchParams.get('activityid');
  if(!pack.profiles[profile])return;
  const host=document.createElement('aside');host.id='kb-local-helper';
  host.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483646;width:min(380px,calc(100vw - 32px));';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=`<style>
    :host{font:14px/1.6 system-ui,sans-serif;color:#172c3e}*{box-sizing:border-box}
    section{background:#fff;border:1px solid #cbd5df;border-radius:14px;box-shadow:0 8px 28px #1233;padding:16px}
    header{display:flex;align-items:center;justify-content:space-between}h2{font-size:17px;margin:0}p{margin:8px 0}
    input,button{font:inherit}label{display:block}input{width:100%;padding:7px;border:1px solid #b8c5d0;border-radius:6px;margin:3px 0 8px}
    button{cursor:pointer;border:1px solid #a9bcc9;border-radius:7px;background:#eef3f7;color:#17364a;padding:7px 12px}
    button.primary{background:#17684d;color:white;border-color:#17684d}button:disabled{opacity:.45;cursor:not-allowed}
    .actions{display:flex;gap:8px;margin:4px 0 12px}.actions button{flex:1}
    #status{white-space:pre-wrap;font-size:13px}#unmatched{border-top:1px solid #e2e7eb;padding-top:12px}
    h3{font-size:14px;margin:0 0 8px}#details{max-height:30vh;overflow:auto;overflow-wrap:anywhere}
    #details p{margin:0}.question+.question{margin-top:12px}.muted{font-size:12px;color:#526574}
    [hidden]{display:none!important}
  </style><section><header><h2>科研资料助手</h2><button id="toggle" aria-label="收起资料助手">收起</button></header>
    <div id="body"><p class="muted" id="version"></p><div id="form">
    <label>姓名<input id="person-name" autocomplete="off"></label><label>班级<input id="person-class" autocomplete="off"></label>
    <div class="actions"><button id="analyze">检查题目</button><button id="submit" class="primary" disabled>提交</button></div></div>
    <p id="status" role="status" hidden></p>
    <div id="unmatched"><h3>未匹配题目<span id="unmatched-count"></span></h3><div id="details" aria-live="polite"><p class="muted">尚未检查</p></div></div>
    </div></section>`;
  document.body.append(host);
  const $=id=>shadow.getElementById(id),status=t=>{$('status').textContent=t;$('status').hidden=!t;};
  $('version').textContent=`${pack.profiles[profile].title} · v${pack.version}`;
  $('toggle').onclick=()=>{
    $('body').hidden=!$('body').hidden;
    $('toggle').textContent=$('body').hidden?'展开':'收起';
    $('toggle').setAttribute('aria-label',$('body').hidden?'展开资料助手':'收起资料助手');
  };
  let analysis=null,filled=null,busy=false,attempted=false;
  const person=()=>({name:$('person-name').value.trim(),className:$('person-class').value.trim()});
  function buttons(){
    $('analyze').disabled=busy||attempted;
    $('submit').disabled=busy||attempted||!filled||!analysis?.ready;
    for(const id of ['person-name','person-class'])$(id).disabled=busy||attempted;
  }
  async function action(fn){if(busy||attempted)return;busy=true;buttons();try{await fn();}catch(e){filled=null;status(e.message);}finally{busy=false;buttons();}}
  const reason=s=>({unknown:'资料未收录',options_differ:'选项与资料不同',conflict:'答案或版本冲突',out_of_scope:'依据适用范围不符',invalid_answer:'答案无法映射选项',unsupported_profile:'未适配的问卷'}[s]||s);
  function render(){
    const pending=analysis.results.filter(q=>q.match.status!=='matched');
    $('unmatched-count').textContent=pending.length?`（${pending.length}）`:'';
    $('details').replaceChildren();
    if(!pending.length){const p=document.createElement('p');p.className='muted';p.textContent='无';$('details').append(p);return;}
    for(const q of pending){
      const item=document.createElement('div'),title=document.createElement('p'),note=document.createElement('p');
      item.className='question';title.textContent=`${q.n}. ${q.stem}`;
      note.className='muted';note.textContent=reason(q.match.status);item.append(title,note);$('details').append(item);
    }
  }
  $('analyze').onclick=()=>action(async()=>{
    filled=null;
    const parsed=KBAdapter.parse();analysis=KBMatch.analyze(parsed.questions,pack,profile);
    analysis.parse_errors=parsed.errors;
    if(parsed.errors.length){analysis.ready=false;analysis.fillable=false;}
    render();
    if(!analysis.countOK||!analysis.numbered||parsed.errors.length){status('题目识别异常，请刷新后重试。');return;}
    if(!analysis.fillable){status('没有匹配题目。');return;}
    const who=person();
    if(!who.name||!who.className){status('填写姓名和班级后，再点“检查题目”。');return;}
    status('正在填写，请稍候…');
    await KBAdapter.fill(analysis,who);
    filled={...who};status(`已填写 ${analysis.matched}/${analysis.total} 题。`);
  });
  $('submit').onclick=()=>action(async()=>{
    if(!analysis?.ready||!filled)throw Error('请先完成题目检查。');
    const who=person();if(JSON.stringify(who)!==JSON.stringify(filled))throw Error('身份已修改，请重新检查题目。');
    const issues=KBAdapter.verify(analysis,who);if(issues.length)throw Error(issues.join('；'));
    const button=KBAdapter.submitButton();
    await ask('claim',{run:{profile,person:who,pack_version:pack.version,pack_hash:pack.content_sha256,analysis,paper_fingerprint:KBMatch.fingerprint(analysis.results)}});
    // Persist before the page click; never retry a submission automatically.
    attempted=true;status('已发起提交，请查看网页结果。');buttons();button.click();
  });
  for(const id of ['person-name','person-class']){
    const input=$(id);
    // Page shortcuts see the Shadow DOM host, not the input. Preserve native editing.
    for(const type of ['keydown','keypress','keyup'])input.addEventListener(type,e=>e.stopPropagation());
    input.addEventListener('input',()=>{filled=null;if(analysis)status('身份已修改，请重新检查题目。');buttons();});
  }
  if(u.pathname.startsWith('/wjx/join/complete')){
    $('form').hidden=true;$('unmatched').hidden=true;status('提交结果以网页显示为准。');
    let timer,last='';
    const capture=async()=>{
      const text=[...document.body.children].filter(e=>e!==host&&e.tagName!=='SCRIPT'&&e.tagName!=='STYLE').map(e=>e.innerText||'').join('\n').trim();
      if(text===last)return;last=text;
      const result={...KBMatch.parseResult(text),visible_text:text,location_path:u.pathname};
      const score=document.querySelector('.score-form__totalval .score-font-style'),right=document.getElementById('ksRightQVal');
      if(KBAdapter.visible(score)&&/^\d+(\.\d+)?$/.test(score.innerText.trim()))result.score_displayed=Number(score.innerText.trim());
      if(KBAdapter.visible(right)&&/^\d+$/.test(right.innerText.trim()))result.correct_count_displayed=Number(right.innerText.trim());
      try{await ask('result',{result});}catch(e){status(e.message);}
    };
    const observer=new MutationObserver(m=>{if(m.every(x=>x.target===host||host.contains(x.target)))return;clearTimeout(timer);timer=setTimeout(capture,500);});
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});await capture();
  }
})();
