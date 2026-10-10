'use strict';
document.getElementById('run').onclick=async()=>{
  const output=document.getElementById('result'),root=document.getElementById('fixture'),passed=[];
  const assert=(ok,name)=>{if(!ok)throw Error(name);passed.push(name);};
  root.innerHTML=`<div class="field" id="div1"><table><tr><td>姓名：</td><td><textarea id="name"></textarea></td></tr><tr><td>班级：</td><td><textarea id="class"></textarea></td></tr></table></div>
  <div class="field" id="div2"><span class="topicnumber">1.</span><div class="topichtml">以下选择正确的是（）。</div><div><input type="radio" name="single" id="s1" style="display:none" checked><div class="label" for="s1">A、错误项</div></div><div><input type="radio" name="single" id="s2" style="display:none"><div class="label" for="s2">B、正确项</div></div></div>
  <div class="field" id="div3"><span class="topicnumber">2.</span><div class="topichtml">选择全部适用项目。【多选题】</div><input type="checkbox" id="m1" checked style="display:none"><div class="label" for="m1">A.不应选</div><input type="checkbox" id="m2" style="display:none"><div class="label" for="m2">B.应选乙</div><input type="checkbox" id="m3" style="display:none"><div class="label" for="m3">C.应选甲</div></div>
  <div class="field" id="div4"><span class="topicnumber">3.</span><div class="topichtml">此处填<input type="text" style="display:none"><label class="textEdit"><span class="textCont" contenteditable="true"></span></label>原词。<span class="req">*</span></div></div>
  <div id="ctlNext">提交</div>`;
  let events=0;
  root.addEventListener('input',()=>events++);
  for(const l of root.querySelectorAll('.label'))l.onclick=()=>{const e=document.getElementById(l.getAttribute('for'));e.click();};
  const editable=root.querySelector('[contenteditable]');
  editable.addEventListener('blur',()=>root.querySelector('input[type=text]').value=editable.textContent);
  const pack={profiles:{test:{count:3}},records:[
    {id:'one',type:'single',stem:'以下选择正确的是（）。',options:['正确项','错误项'],answer_texts:['正确项'],evidence_ids:[]},
    {id:'two',type:'multiple',stem:'选择全部适用项目。',options:['应选甲','应选乙','不应选'],answer_texts:['应选甲','应选乙'],evidence_ids:[]},
    {id:'three',type:'fill',stem:'此处填____原词。',options:[],answer_texts:['资料原词'],evidence_ids:[]}]};
  try{
    const parsed=KBAdapter.parse(),plan=KBMatch.analyze(parsed.questions,pack,'test');
    assert(parsed.errors.length===0&&plan.ready,'解析题号、题型、题干及换序选项');
    const who={name:'本地测试',className:'测试班'};await KBAdapter.fill(plan,who);
    assert(document.getElementById('name').value===who.name,'表格内姓名和班级');
    assert(!document.getElementById('s1').checked&&document.getElementById('s2').checked,'更正已有错误单选');
    assert(!document.getElementById('m1').checked&&document.getElementById('m2').checked&&document.getElementById('m3').checked,'清除多余多选并按文本换序');
    assert(root.querySelector('input[type=text]').value==='资料原词'&&events>=3,'填空事件与隐藏表单值同步');
    assert(KBAdapter.verify(plan,who).length===0,'填充前后题干一致及逐项核验');
    const unknown=document.createElement('div');unknown.className='field';unknown.id='div5';
    unknown.innerHTML='<span class="topicnumber">4.</span><div class="topichtml">未收录的题目。</div><input type="radio" name="unknown" id="u1" checked><label for="u1">A、用户已选</label><input type="radio" name="unknown" id="u2"><label for="u2">B、另一选项</label>';
    root.append(unknown);pack.profiles.test.count=4;
    const partial=KBMatch.analyze(KBAdapter.parse().questions,pack,'test');
    assert(partial.fillable&&!partial.ready&&partial.unmatched[0].n===4,'未知题不阻止已匹配题填写，同时阻止扩展提交');
    document.getElementById('m3').checked=false;
    await KBAdapter.fill(partial,who);
    assert(document.getElementById('u1').checked&&!document.getElementById('u2').checked&&document.getElementById('m3').checked,'部分填写保留未知题手动答案并修正匹配题');
    assert(KBAdapter.verify(partial,who,document,{matchedOnly:true}).length===0,'部分填写只核验已匹配题');
    assert(KBAdapter.verify(partial,who).some(s=>s.includes('4题未匹配')),'完整核验明确报告未匹配题号');
    unknown.remove();
    document.getElementById('m3').checked=false;assert(KBAdapter.verify(plan,who).length>0,'用户改选后阻止提交');
    document.querySelector('#div2 .topichtml').textContent='题目已改变';assert(KBAdapter.verify(plan,who).some(s=>s.includes('内容')),'题干变化阻止提交');
    output.textContent=`PASS ${passed.length}/${passed.length}\n`+passed.join('\n');output.className='ok';
  }catch(e){output.textContent='FAIL: '+e.message+'\n已通过：'+passed.join('\n');}
};
