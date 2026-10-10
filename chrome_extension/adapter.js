/* Normal visible-form interaction; no hidden answer data or submission endpoints. */
(function(root){
  'use strict';
  const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
  const stripLabel=t=>t.trim().replace(/^[A-Z][.、．]\s*/,'');
  function textWithoutControls(el){
    const copy=el.cloneNode(true);
    copy.querySelectorAll('input,textarea,select,[contenteditable],.textEdit,.req,.topicnumber,.qtypetip').forEach(e=>e.remove());
    return copy.textContent.trim().replace(/【(?:多选题|单选题|判断题)】/g,'').trim();
  }
  function parse(doc=document){
    const questions=[], errors=[];
    for(const block of doc.querySelectorAll('div.field[id]')){
      if(!/^div\d+$/.test(block.id)||!visible(block)) continue;
      const number=block.querySelector('.topicnumber');
      if(!number) continue; // identity blocks do not have an exam number
      const n=Number(number.textContent.match(/\d+/)?.[0]);
      const title=block.querySelector('.topichtml');
      if(!n||!title){errors.push('题号或题干无法解析：'+block.id);continue;}
      const controls=[...block.querySelectorAll('input[type=radio],input[type=checkbox]')];
      const blanks=[...block.querySelectorAll('[contenteditable=true]')].filter(visible);
      let type=blanks.length?'fill':controls.some(e=>e.type==='checkbox')?'multiple':controls.length?'single':'unsupported';
      const options=controls.map(e=>{
        const label=[...block.querySelectorAll('.label,label')].find(l=>l.getAttribute('for')===e.id);
        if(!label||!visible(label)){errors.push('选项标签无法解析：'+e.id);return '';}
        return stripLabel(label.innerText);
      });
      if(type==='single'&&options.length===2&&options.every(t=>root.KBMatch.truth(t))) type='boolean';
      if(type==='unsupported'||(type==='fill'&&blanks.length!==1)) errors.push('不支持的题型：'+block.id);
      questions.push({div:block.id,n,type,stem:textWithoutControls(title),options,blank_count:blanks.length});
    }
    return {questions,errors};
  }
  function identities(doc=document){
    const blocks=[...doc.querySelectorAll('div.field[id]')].filter(visible);
    const result={};
    for(const b of blocks){
      if(b.querySelector('.topicnumber')) continue;
      for(const e of b.querySelectorAll('input[type=text],textarea')){
        if(!visible(e))continue;
        const label=e.closest('tr')?.innerText||b.querySelector('.topichtml')?.innerText||'';
        const k=label.includes('姓名')?'name':label.includes('班级')?'className':null;
        if(k){ if(result[k]) throw Error('身份字段重复，停止填写');result[k]=e; }
      }
    }
    if(!result.name||!result.className)throw Error('未识别到姓名和班级字段');
    return result;
  }
  function setValue(el,value){
    el.focus();
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();
    if(el.value!==value)throw Error('字段写入后校验失败');
  }
  // Pace every actual option change, including each checkbox in a multi-select.
  const INPUT_DELAY_MIN_MS=250, INPUT_DELAY_MAX_MS=650;
  const pause=()=>new Promise(resolve=>setTimeout(resolve,
    INPUT_DELAY_MIN_MS+Math.floor(Math.random()*(INPUT_DELAY_MAX_MS-INPUT_DELAY_MIN_MS+1))));
  async function fill(analysis,person,doc=document){
    if(!analysis.fillable||analysis.parse_errors?.length)throw Error('题量或解析异常，或没有可填写的匹配题');
    const parsed=parse(doc);
    if(parsed.errors.length||root.KBMatch.fingerprint(parsed.questions)!==root.KBMatch.fingerprint(analysis.results))throw Error('题目内容或顺序已变化，请重新检查');
    const identity=identities(doc);
    setValue(identity.name,person.name);setValue(identity.className,person.className);
    for(const q of analysis.results){
      if(q.match.status!=='matched')continue; // Preserve any manual answer on unresolved questions.
      const block=doc.getElementById(q.div);
      if(!visible(block))throw Error('题目已隐藏或被移除');
      if(q.type==='fill'){
        const el=block.querySelector('[contenteditable=true]');
        el.focus();el.textContent=q.match.answer_texts[0];
        el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:q.match.answer_texts[0]}));
        el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Unidentified'}));
        el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();
        await pause();
      }else{
        const controls=[...block.querySelectorAll('input[type=radio],input[type=checkbox]')];
        for(let i=0;i<controls.length;i++){
          const e=controls[i], target=q.match.answer_indexes.includes(i);
          if(e.checked===target)continue;
          if(e.type==='radio'&&!target)continue;
          const label=[...block.querySelectorAll('.label,label')].find(l=>l.getAttribute('for')===e.id);
          label.click();
          await pause();
        }
      }
    }
    const issues=verify(analysis,person,doc,{matchedOnly:true});
    if(issues.length)throw Error('填写校验未通过：'+issues.join('；'));
  }
  function verify(analysis,person,doc=document,{matchedOnly=false}={}){
    const issues=[];
    const parsed=parse(doc);
    if(parsed.errors.length||root.KBMatch.fingerprint(parsed.questions)!==root.KBMatch.fingerprint(analysis.results)) issues.push('题目内容或顺序已变化');
    const ids=identities(doc);
    if(ids.name.value!==person.name||ids.className.value!==person.className)issues.push('姓名或班级不符');
    for(const q of analysis.results){
      if(q.match.status!=='matched'){
        if(!matchedOnly)issues.push(q.n+'题未匹配，需人工核对');
        continue;
      }
      const b=doc.getElementById(q.div);
      if(!b){issues.push(q.n+'题已消失');continue;}
      if(q.type==='fill'){
        const el=b.querySelector('[contenteditable=true]'), backing=b.querySelector('input[type=text]');
        if(el?.textContent!==q.match.answer_texts[0]||(backing&&backing.value!==q.match.answer_texts[0]))issues.push(q.n+'题填空未同步');
      }else{
        const inputs=[...b.querySelectorAll('input[type=radio],input[type=checkbox]')];
        if(inputs.some((e,i)=>e.checked!==q.match.answer_indexes.includes(i)))issues.push(q.n+'题勾选不符');
      }
    }
    return issues;
  }
  function submitButton(doc=document){
    const b=doc.getElementById('ctlNext');
    if(!visible(b)||b.textContent.trim()!=='提交'||b.disabled)throw Error('没有可用的单页提交按钮');
    return b;
  }
  root.KBAdapter={parse,identities,setValue,fill,verify,submitButton,visible};
})(globalThis);
