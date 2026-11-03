// WE 模板识别与标记。词序号与 app.js 的分词保持一致。
const WE=(()=>{
  const RATE_KEY='essay-moxie-we-practice-v1';
  const labels={all:'全文',template:'模板',content:'内容'};
  let preferences={scope:'all',showTemplate:true,hiddenRate:80,rates:{all:40,template:40,content:80}};
  try{
    const saved=JSON.parse(localStorage.getItem(RATE_KEY)||'{}');
    if(Object.keys(labels).includes(saved.scope))preferences.scope=saved.scope;
    if(typeof saved.showTemplate==='boolean')preferences.showTemplate=saved.showTemplate;
    else preferences.scope='all';
    if([0,20,40,60,80,100].includes(saved.hiddenRate))preferences.hiddenRate=saved.hiddenRate;
    for(const key of Object.keys(labels))if([0,20,40,60,80,100].includes(saved.rates?.[key]))preferences.rates[key]=saved.rates[key];
  }catch{}
  let draft=null,editorMessage='';
  const persist=()=>localStorage.setItem(RATE_KEY,JSON.stringify(preferences));
  function wordSpans(text){
    let offset=0,index=0;
    const result=[];
    for(const token of tokens(text)){
      if(/^[A-Za-z0-9]/.test(token))result.push({index:index++,text:token,start:offset,end:offset+token.length});
      offset+=token.length;
    }
    return result;
  }
  function cleanTemplate(value){
    if(!value||!/^we-slot-[1-4]$/.test(value.id))return null;
    return {id:value.id,name:String(value.name||'模板 '+value.id.slice(-1)).trim().slice(0,60),text:String(value.text||''),updatedAt:validDate(value.updatedAt)||''};
  }
  function normalizeParts(value,text){
    if(!value||value.source!==text||!Array.isArray(value.templateWords))return null;
    const length=wordSpans(text).length;
    // 无效或过期的标记整份失效，不把丢失的模板词默认为内容。
    if(value.templateWords.some(i=>!Number.isInteger(i)||i<0||i>=length))return null;
    return {source:text,templateWords:[...new Set(value.templateWords)].sort((a,b)=>a-b),confirmed:value.confirmed===true,template:cleanTemplate(value.template)};
  }
  function normalizeTemplates(values,essays=[]){
    const slots=Array.from({length:4},(_,i)=>({id:'we-slot-'+(i+1),name:'模板 '+(i+1),text:'',updatedAt:''}));
    const candidates=[...(Array.isArray(values)?values:[]),...essays.map(e=>e.weParts?.template)];
    for(const value of candidates){
      const t=cleanTemplate(value);if(!t)continue;
      const i=Number(t.id.slice(-1))-1,old=slots[i];
      if(!old.updatedAt||(t.updatedAt&&Date.parse(t.updatedAt)>Date.parse(old.updatedAt)))slots[i]=t;
    }
    return slots;
  }
  function match(text,templateText){
    const ws=wordSpans(text),normalized=ws.map(w=>norm(w.text));
    const fragments=String(templateText).split(/\{\{[^{}]*\}\}|\[[^\]\n]*\]|【[^】]*】/g)
      .map(part=>wordSpans(part).map(w=>norm(w.text))).filter(part=>part.length);
    let cursor=0,matched=0;const found=[];
    for(const fragment of fragments){
      for(let i=cursor;i<=normalized.length-fragment.length;i++){
        if(fragment.every((word,j)=>word===normalized[i+j])){
          for(let j=0;j<fragment.length;j++)found.push(i+j);
          cursor=i+fragment.length;matched++;break;
        }
      }
    }
    return {templateWords:found,matched,total:fragments.length};
  }
  function ready(e){return e.weParts?.source===e.text&&e.weParts.confirmed===true}
  function hiding(e=current()){return ready(e)&&e.weParts.templateWords.length>0&&!preferences.showTemplate}
  function scope(e=current()){return !ready(e)?'all':hiding(e)?'content':preferences.scope}
  function pool(e=current()){
    const ws=wordSpans(e.text),type=scope(e),marked=new Set(e.weParts?.templateWords||[]);
    return ws.filter(w=>type==='all'||(type==='template'?marked.has(w.index):!marked.has(w.index)));
  }
  function practiceTokens(e=current()){
    let index=-1;
    const raw=tokens(e.text).map(text=>({text,index:/^[A-Za-z0-9]/.test(text)?++index:null}));
    if(!hiding(e))return raw;
    const marked=new Set(e.weParts.templateWords),before=[],after=[];let previous=null,next=null;
    for(let i=0;i<raw.length;i++){before[i]=previous;if(raw[i].index!==null)previous=raw[i].index}
    for(let i=raw.length-1;i>=0;i--){after[i]=next;if(raw[i].index!==null)next=raw[i].index}
    const visible=[],quotes={"'":false,'"':false};
    raw.forEach((t,i)=>{
      if(t.index!==null){if(!marked.has(t.index))visible.push(t);return}
      if(!/^\s+$/.test(t.text)){
        let opening=/^[“‘(\[{]$/.test(t.text);
        if(Object.prototype.hasOwnProperty.call(quotes,t.text)){opening=!quotes[t.text];quotes[t.text]=!quotes[t.text]}
        const owner=opening?after[i]:(before[i]??after[i]);
        if(owner!==null&&marked.has(owner))return;
      }
      const last=visible[visible.length-1];
      if(/^\s+$/.test(t.text)&&last&&/^\s+$/.test(last.text))last.text+=t.text;
      else visible.push({...t});
    });
    while(visible.length&&/^\s+$/.test(visible[0].text))visible.shift();
    while(visible.length&&/^\s+$/.test(visible[visible.length-1].text))visible.pop();
    return visible.map(t=>/^\s+$/.test(t.text)?{...t,text:t.text.includes('\n')?'\n\n':' '}:t);
  }
  function pick(e){
    const eligible=pool(e),count=pct===0?0:Math.min(eligible.length,Math.max(1,Math.round(eligible.length*pct/100)));
    const ranked=eligible.map(w=>({index:w.index,rank:-Math.log(Math.max(Number.EPSILON,Math.random()))/(wrongPriority&&e.wrong[norm(w.text)]?3:1)}));
    ranked.sort((a,b)=>a.rank-b.rank);
    return new Set(ranked.slice(0,count).map(w=>w.index));
  }
  function signature(){
    const e=current(),s=scope(e);
    return JSON.stringify([e.id,e.text,s,hiding(e),pct,$('mode').value,s==='all'?null:e.weParts?.templateWords]);
  }
  function updateScope(){
    const e=current(),active=scope(e),hidden=hiding(e),canHide=ready(e)&&e.weParts.templateWords.length>0;
    pct=hidden?preferences.hiddenRate:preferences.rates[active];
    $('weScope').classList.remove('hidden');
    document.querySelectorAll('[data-template-visible]').forEach(b=>{
      const hide=b.dataset.templateVisible==='hide';
      b.disabled=hide&&!canHide;b.classList.toggle('active',hide===hidden);b.setAttribute('aria-pressed',String(hide===hidden));
    });
    $('advancedScopes').classList.toggle('hidden',hidden);
    document.querySelectorAll('[data-scope]').forEach(b=>{
      const key=b.dataset.scope;
      b.disabled=key!=='all'&&!ready(e);b.classList.toggle('active',key===active);
      b.setAttribute('aria-pressed',String(key===active));b.textContent=labels[key]+' '+preferences.rates[key]+'%';
    });
    $('weSetupHint').classList.toggle('hidden',canHide);
    $('weSetupText').textContent=ready(e)?'本篇尚未标记模板，可在编辑文章中给模板文字设置格式。':'在编辑文章中标记模板并保存，即可隐藏模板。';
    document.querySelectorAll('[data-p]').forEach(b=>b.classList.toggle('active',Number(b.dataset.p)===pct));
  }
  function describe(count){
    const e=current(),s=scope(e),total=pool(e).length,hidden=hiding(e);
    let message;
    if(!total)message=hidden?'模板已隐藏，当前没有内容词可练习。':'当前没有可练习的'+labels[s]+'词，请检查文章标记。';
    else if(pct===0)message=hidden?'模板已隐藏 · 0%：仅阅读内容，不计成绩。':'显示模板 · 0%：阅读完整原文，不计成绩。';
    else message=(hidden?'隐藏模板 · 内容':labels[s])+' '+pct+'%：本次挖空 '+count+' / '+total+' 个'+(s==='all'?'':labels[s])+'词。'+(hidden?'模板不显示、不计入空白率或成绩。':s==='content'?'模板保留原文。':s==='template'?'内容保留原文。':'');
    $('scopeSummary').textContent=message;
  }
  function setRate(value){if(hiding())preferences.hiddenRate=value;else preferences.rates[scope()]=value;persist()}
  function setScope(value){if(Object.keys(labels).includes(value)&&(value==='all'||ready(current()))){preferences.scope=value;persist();updateControls();renderPractice()}}
  function setVisibility(show){
    if(!show&&(!ready(current())||!current().weParts.templateWords.length))return;
    preferences.showTemplate=show;if(show)preferences.scope='all';
    persist();updateControls();renderPractice();
  }
  function ensureDraft(){
    const report=Rich.analyze(),text=report.model.source;
    draft={source:text,templateWords:report.templateWords,confirmed:!report.errors.length,template:draft?.template||null};
    return draft;
  }
  function templateOptions(selected){
    $('weTemplateSelect').innerHTML='<option value="">手动标记（不选模板）</option>'+state.weTemplates.map(t=>`<option value="${t.id}">${esc(t.name)}${t.text.trim()?'':' · 待录入'}</option>`).join('');
    $('weTemplateSelect').value=selected||'';
  }
  function openEditor(e){
    draft=normalizeParts(e?.weParts,$('editText').value);
    templateOptions(draft?.template?.id);
    editorMessage='文字格式会直接决定模板与内容；保存前请核对下方颜色。';
    Rich.load($('editText').value,e?.weFormat,draft);
    renderEditor();
  }
  function renderEditor(){
    const d=ensureDraft(),report=Rich.analyze(),marked=new Set(d.templateWords),invalid=new Set(report.errors.map(e=>e.index)),ws=wordSpans(d.source);
    let html='',offset=0;
    for(const w of ws){
      html+=esc(d.source.slice(offset,w.start));
      html+=`<button type="button" class="markWord ${invalid.has(w.index)?'isInvalid':marked.has(w.index)?'isTemplate':'isContent'}" data-word="${w.index}" aria-pressed="${marked.has(w.index)}" aria-label="${esc(w.text)}：${invalid.has(w.index)?'格式不一致':marked.has(w.index)?'模板':'内容'}">${esc(w.text)}</button>`;
      offset=w.end;
    }
    html+=esc(d.source.slice(offset));
    const preview=$('wePreview'),scroll=preview.scrollTop;
    preview.innerHTML=html||'<span class="muted">先粘贴文章原文，再标记模板。</span>';preview.scrollTop=scroll;
    $('weCounts').textContent=`模板 ${marked.size} 词 · 内容 ${ws.length-marked.size-invalid.size} 词`;
    $('weMatchMessage').textContent=editorMessage;
    $('weIdentify').disabled=!$('weTemplateSelect').value||!ws.length;
  }
  function identify(){
    const d=ensureDraft(),template=state.weTemplates.find(t=>t.id===$('weTemplateSelect').value);
    if(!template?.text.trim())return alert('请先在“四套模板”中录入这套模板。');
    const result=match(d.source,template.text);draft.template={...template};
    editorMessage=`匹配到 ${result.matched} / ${result.total} 段固定文字，已设为加粗。请核对并修正后保存。`;
    Rich.setWords(result.templateWords);
  }
  function editorParts(text){
    const d=ensureDraft();
    return normalizeParts({...d,source:d.source.trim()},text);
  }
  function openTemplates(){
    $('templateSlots').innerHTML=state.weTemplates.map((t,i)=>`<section class="templateSlot"><label class="field">第 ${i+1} 套模板名称<input data-template-name="${t.id}" maxlength="60" value="${esc(t.name)}"></label><label class="field">固定文字与可变部分<textarea class="edit" data-template-text="${t.id}" placeholder="例如：In conclusion, {{结论}}.\n请粘贴你自己的完整模板。">${esc(t.text)}</textarea></label></section>`).join('');
    $('templateDialog').showModal();
  }
  function saveTemplates(){
    const selected=$('weTemplateSelect').value;
    state.weTemplates=state.weTemplates.map((old,i)=>{
      const name=document.querySelector(`[data-template-name="${old.id}"]`).value.trim()||'模板 '+(i+1);
      const text=document.querySelector(`[data-template-text="${old.id}"]`).value.trim();
      return name===old.name&&text===old.text?old:{id:old.id,name,text,updatedAt:now()};
    });
    save();templateOptions(selected);
    if(!$('editor').classList.contains('hidden'))renderEditor();
    $('templateDialog').close();
  }
  function init(){
    Rich.init(()=>renderEditor());
    document.querySelectorAll('[data-template-visible]').forEach(b=>b.onclick=()=>setVisibility(b.dataset.templateVisible==='show'));
    document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>setScope(b.dataset.scope));
    $('weSetup').onclick=openCurrentEditor;
    $('weTemplatesBtn').onclick=$('libraryTemplates').onclick=openTemplates;
    $('saveTemplates').onclick=saveTemplates;$('weIdentify').onclick=identify;
    $('weTemplateSelect').onchange=()=>{
      ensureDraft();draft.template=cleanTemplate(state.weTemplates.find(t=>t.id===$('weTemplateSelect').value));
      editorMessage='点击“按模板识别”可重新设置加粗标记；也可以直接编辑文字格式。';renderEditor();
    };
    $('wePreview').onclick=ev=>{
      const target=ev.target.closest('[data-word]');if(!target)return;
      const report=Rich.analyze(),word=report.words.find(w=>w.index===Number(target.dataset.word));if(!word)return;
      Rich.updateRange(word.start,word.end,{b:!report.templateWords.includes(word.index),i:false,u:false,font:report.model.bodyFont});
    };
  }
  const label=s=>Object.keys(labels).includes(s)?labels[s]:'全文';
  const historyLabel=h=>(h.hideTemplate===true?'隐藏模板 · ':h.hideTemplate===false?'显示模板 · ':'')+label(h.scope);
  return {wordSpans,normalizeParts,normalizeTemplates,match,ready,hiding,scope,pool,pick,practiceTokens,signature,updateScope,describe,setRate,openEditor,editorParts,init,label,historyLabel};
})();
