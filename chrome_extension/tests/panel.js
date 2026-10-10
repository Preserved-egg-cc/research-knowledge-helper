'use strict';
const fixture=document.getElementById('fixture');
fixture.innerHTML=`<div class="field" id="div1"><table><tr><td>姓名</td><td><textarea id="native-name"></textarea></td></tr><tr><td>班级</td><td><textarea id="native-class"></textarea></td></tr></table></div>
<div class="field" id="div2"><span class="topicnumber">1.</span><div class="topichtml">已经收录的示例判断题。</div><input type="radio" name="q1" id="q1a"><label for="q1a">对</label><input type="radio" name="q1" id="q1b"><label for="q1b">错</label></div>
<div class="field" id="div3"><span class="topicnumber">2.</span><div class="topichtml">尚未收录的示例题目。</div><input type="radio" name="q2" id="q2a"><label for="q2a">甲</label><input type="radio" name="q2" id="q2b" checked><label for="q2b">乙</label></div>
<div class="field" id="div4"><span class="topicnumber">3.</span><div class="topichtml">选项变化的示例题目。</div><input type="radio" name="q3" id="q3a"><label for="q3a">甲</label><input type="radio" name="q3" id="q3c" checked><label for="q3c">丙</label></div>
<button id="ctlNext">提交</button>`;
const pack={version:'panel-fixture',content_sha256:'local-panel-test',profiles:{'panel-test':{title:'本地面板测试',count:3}},evidence:{},records:[
  {id:'known',type:'boolean',stem:'已经收录的示例判断题。',options:[],answer_texts:['对'],profiles:[],evidence_ids:[]},
  {id:'changed',type:'single',stem:'选项变化的示例题目。',options:['甲','乙'],answer_texts:['甲'],profiles:[],evidence_ids:[]}
]};
let claims=0,pageClicks=0;
window.chrome={runtime:{sendMessage:async message=>{
  if(message.action==='pack')return {ok:true,data:pack};
  if(message.action==='claim'){claims++;return {ok:true,data:{id:'synthetic-local-claim'}};}
  return {ok:false,error:'本地测试不提供此操作'};
}}};
document.getElementById('ctlNext').onclick=()=>{pageClicks++;document.getElementById('page-submit-count').textContent='本地提交点击：'+pageClicks;};
document.getElementById('run-panel').onclick=async()=>{
  const output=document.getElementById('panel-result'),passed=[],button=document.getElementById('run-panel');button.disabled=true;
  const assert=(ok,message)=>{if(!ok)throw Error(message);passed.push(message);};
  const s=document.getElementById('kb-local-helper').shadowRoot,$=id=>s.getElementById(id);
  const idle=async()=>{for(let i=0;i<400;i++){if(!$('analyze').disabled)return;await new Promise(r=>setTimeout(r,25));}throw Error('操作未结束');};
  const check=async()=>{$('analyze').click();await idle();};
  try{
    assert([...s.querySelectorAll('button')].map(b=>b.textContent).join('|')==='收起|检查题目|提交','面板只保留三个按钮');
    assert(!s.querySelector('#export,#history,#view-json,#fill')&&$('details').textContent==='尚未检查','移除旧入口并显示未匹配区');
    await check();assert(!document.getElementById('q1a').checked&&$('submit').disabled,'缺少身份只检查，不填写或提交');
    KBAdapter.setValue($('person-name'),'测试甲');KBAdapter.setValue($('person-class'),'测试班');
    $('analyze').click();assert($('person-name').disabled&&$('person-class').disabled,'填写期间锁定身份输入');await idle();
    assert(document.getElementById('q1a').checked&&claims===0&&pageClicks===0,'检查题目自动填写，绝不自动提交');
    assert(document.getElementById('q2b').checked&&document.getElementById('q3c').checked,'未匹配题保留原有手动选择');
    assert($('details').querySelectorAll('.question').length===2&&!$('details').textContent.includes('已经收录')&&$('details').textContent.includes('选项与资料不同'),'列表只展示未匹配题及原因');
    assert($('submit').disabled,'存在未匹配题时提交禁用');
    $('toggle').click();assert($('body').hidden&&$('toggle').textContent==='展开','可收起面板');$('toggle').click();assert(!$('body').hidden,'可展开面板');
    pack.records.push({id:'new',type:'single',stem:'尚未收录的示例题目。',options:['甲','乙'],answer_texts:['乙'],profiles:[],evidence_ids:[]});pack.records[1].options=['甲','丙'];
    await check();assert($('details').textContent==='无'&&!$('submit').disabled,'全部匹配后显示无，并允许提交');
    KBAdapter.setValue($('person-name'),'测试乙');assert($('submit').disabled,'修改身份后必须重新检查');await check();
    document.querySelector('#div2 .topichtml').textContent='已经改变的题目。';$('submit').click();await idle();
    assert(claims===0&&pageClicks===0&&$('submit').disabled,'提交前拦住题面变化');
    document.querySelector('#div2 .topichtml').textContent='已经收录的示例判断题。';await check();
    $('submit').click();for(let i=0;i<100&&pageClicks===0;i++)await new Promise(r=>setTimeout(r,10));
    assert(claims===1&&pageClicks===1&&$('submit').disabled,'仅显式提交时获取锁并点击一次本地按钮');
    $('submit').click();assert(pageClicks===1,'不重复提交');
    output.textContent=`PASS ${passed.length}/${passed.length}\n`+passed.join('\n');output.className='ok';
  }catch(error){output.textContent='FAIL: '+error.message+'\n'+passed.join('\n');}
};
