'use strict';
// Local-only runtime: submitting is deliberately unavailable.
window.chrome={runtime:{sendMessage:async message=>{
  if(message.action!=='pack')return {ok:false,error:'本地键盘测试不提供提交或记录功能'};
  return {ok:true,data:{version:'keyboard-fixture',content_sha256:'local-keyboard-test',
    profiles:{'keyboard-test':{title:'本地键盘测试',count:1}},evidence:{},
    records:[{id:'synthetic',type:'boolean',stem:'用于键盘回归的判断题。',options:[],
      answer_texts:['对'],profiles:[],evidence_ids:[],reason:'虚构控件案例'}]}};
}}};
let seen=0, blocked=0;
for(const type of ['keydown','keypress','keyup']) document.addEventListener(type,event=>{
  seen++;
  // A page-level shortcut sees a retargeted ASIDE for a Shadow DOM input.
  if(type==='keydown'&&event.key==='Backspace'&&!['INPUT','TEXTAREA'].includes(event.target.tagName)){
    event.preventDefault();blocked++;
  }
  document.getElementById('page-key-events').textContent=`页面收到键盘事件：${seen}；拦截退格：${blocked}`;
});
document.getElementById('run-keyboard').onclick=()=>{
  const output=document.getElementById('keyboard-result'),passed=[];
  const assert=(ok,message)=>{if(!ok)throw Error(message);passed.push(message);};
  try{
    const shadow=document.getElementById('kb-local-helper')?.shadowRoot;
    assert(!!shadow,'实际面板已加载');
    for(const id of ['person-name','person-class']){
      const input=shadow.getElementById(id),before=seen;
      let editingAllowed=true;
      for(const type of ['keydown','keypress','keyup'])for(const key of ['Backspace','Delete','ArrowLeft','a','Enter']){
        const event=new KeyboardEvent(type,{key,ctrlKey:key==='a',bubbles:true,composed:true,cancelable:true});
        input.dispatchEvent(event);editingAllowed&&=!event.defaultPrevented;
      }
      assert(editingAllowed&&seen===before,id+' 编辑键不被页面拦截且不取消原生动作');
    }
    const outside=new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true});
    document.body.dispatchEvent(outside);
    assert(outside.defaultPrevented,'助手以外的页面退格规则保持生效');
    const native=new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true});
    document.getElementById('native-name').dispatchEvent(native);
    assert(!native.defaultPrevented,'页面原生输入框仍正常处理按键');
    output.textContent=`PASS ${passed.length}/${passed.length}\n`+passed.join('\n');output.className='ok';
  }catch(error){output.textContent='FAIL: '+error.message+'\n'+passed.join('\n');}
};
