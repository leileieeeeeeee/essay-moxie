// 只存文字和白名单格式，不保存或执行粘贴来的 HTML。
const Rich=(()=>{
  const plain={b:false,i:false,u:false,font:''};
  let config={bodyFont:'',detectFonts:true},selection={start:0,end:0},onChange=()=>{};
  let history=[],historyAt=-1,composing=false;
  const cleanFont=s=>String(s||'').split(',')[0].replace(/["']/g,'').trim().replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80);
  const style=r=>({b:r.b===true,i:r.i===true,u:r.u===true,font:cleanFont(r.font)});
  const key=r=>JSON.stringify([r.b,r.i,r.u,r.font.toLowerCase()]);
  function merge(runs){
    const result=[];
    for(const r of runs){
      if(!r.text)continue;
      const item={text:String(r.text),...style(r)},last=result[result.length-1];
      if(last&&key(last)===key(item))last.text+=item.text;else result.push(item);
    }
    return result;
  }
  function normalize(value,text){
    if(!value||value.source!==text||!Array.isArray(value.runs)||value.runs.some(r=>!r||typeof r.text!=='string'))return null;
    if(value.runs.map(r=>r.text).join('')!==text)return null;
    return {source:text,runs:merge(value.runs),bodyFont:cleanFont(value.bodyFont),detectFonts:value.detectFonts!==false};
  }
  function readDOM(root){
    const runs=[],positions=new WeakMap();let length=0,lastChar='',lastAuto=false;
    function append(text,s,auto=false){
      text=text.replace(/\u00a0/g,' ');if(!text)return;
      runs.push({text,...s,auto});length+=text.length;lastChar=text.slice(-1);lastAuto=auto;
    }
    function newline(s,paragraph=false){
      if(!length)return;
      if(lastChar!=='\n')append('\n',s,true);
      if(paragraph&&!runs.slice(-2).map(r=>r.text).join('').endsWith('\n\n'))append('\n',s,true);
    }
    function walk(node,parent){
      if(node.nodeType===3){positions.set(node,{start:length});append(node.nodeValue,parent);return}
      if(node.nodeType!==1)return;
      const tag=node.tagName;
      if(/^(SCRIPT|STYLE|HEAD|TITLE|NOSCRIPT|IFRAME|OBJECT|SVG|CANVAS|IMG|INPUT|BUTTON|TEMPLATE)$/.test(tag)||node.hidden||node.style.display==='none')return;
      if(tag==='BR'){positions.set(node,{start:length,bounds:[length]});append('\n',parent);return}
      const s={...parent};
      if(/^(B|STRONG|H[1-6])$/.test(tag))s.b=true;
      if(/^(I|EM)$/.test(tag))s.i=true;
      if(tag==='U')s.u=true;
      const weight=node.style.fontWeight;
      if(weight)s.b=weight==='bold'||weight==='bolder'||Number(weight)>=600;
      if(node.style.fontStyle)s.i=/italic|oblique/.test(node.style.fontStyle);
      const decoration=node.style.textDecorationLine||node.style.textDecoration;
      if(decoration)s.u=decoration.includes('underline');
      const font=node.style.fontFamily||node.getAttribute('face');
      if(font)s.font=cleanFont(font);
      const block=/^(P|DIV|LI|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE|TR|UL|OL|PRE)$/.test(tag)&&node!==root;
      if(block)newline(parent);
      const pos={start:length,bounds:[length]};positions.set(node,pos);
      for(const child of node.childNodes){walk(child,s);pos.bounds.push(length)}
      if(block)newline(parent,tag==='P');
    }
    walk(root,plain);
    // 自动添加的段落结束符只用于连接段落；保留用户实际输入的换行。
    while(lastAuto&&runs.length&&runs[runs.length-1].auto){
      runs.pop();length--;lastAuto=runs.length&&runs[runs.length-1].auto;
    }
    return {source:runs.map(r=>r.text).join(''),runs:merge(runs),positions};
  }
  function read(){return {...readDOM($('editRich')),...config}}
  function slice(runs,start,end){
    let offset=0;const out=[];
    for(const r of runs){const a=Math.max(start-offset,0),b=Math.min(end-offset,r.text.length);if(b>a)out.push({...r,text:r.text.slice(a,b)});offset+=r.text.length}
    return out;
  }
  function analyze(model=read()){
    const words=WE.wordSpans(model.source),marked=[],errors=[];let offset=0;
    const spans=model.runs.map(r=>{const s={...r,start:offset,end:offset+r.text.length};offset=s.end;return s});
    const baseline=model.bodyFont.toLowerCase();
    for(const word of words){
      const parts=spans.filter(r=>r.end>word.start&&r.start<word.end);
      const signatures=new Set(parts.map(r=>key({...r,font:r.font||model.bodyFont})));
      if(signatures.size>1){errors.push({...word});continue}
      const r=parts[0]||plain,font=(r.font||model.bodyFont).toLowerCase();
      if(r.b||r.i||r.u||(model.detectFonts&&font!==baseline))marked.push(word.index);
    }
    return {model,words,templateWords:marked,errors};
  }
  function capture(){
    const s=window.getSelection(),root=$('editRich');
    if(!s?.rangeCount)return selection;
    const range=s.getRangeAt(0);
    if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return selection;
    const model=readDOM(root);
    const offset=(node,n)=>{const p=model.positions.get(node);return Math.min(model.source.length,node.nodeType===3?(p?.start||0)+n:p?.bounds?.[n]??p?.start??0)};
    selection={start:offset(range.startContainer,range.startOffset),end:offset(range.endContainer,range.endOffset)};
    return selection;
  }
  function select(start,end=start){
    const root=$('editRich'),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];let length=0;
    while(walker.nextNode()){const node=walker.currentNode;nodes.push({node,start:length,end:length+node.length});length+=node.length}
    const point=offset=>{const item=nodes.find(x=>x.end>=offset)||nodes[nodes.length-1];return item?[item.node,Math.max(0,Math.min(item.node.length,offset-item.start))]:[root,0]};
    const range=document.createRange();range.setStart(...point(start));range.setEnd(...point(end));
    root.focus();const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);selection={start,end};
  }
  function render(runs,range=null){
    const root=$('editRich'),scroll=root.scrollTop,fragment=document.createDocumentFragment();
    for(const r of merge(runs)){
      const span=document.createElement('span');span.textContent=r.text;
      if(r.b)span.style.fontWeight='700';if(r.i)span.style.fontStyle='italic';if(r.u)span.style.textDecoration='underline';
      if(r.font)span.style.fontFamily=r.font;
      fragment.appendChild(span);
    }
    root.replaceChildren(fragment);root.style.fontFamily=config.bodyFont||'';
    if(range)select(range.start,range.end);root.scrollTop=scroll;
  }
  function remember(){
    const model=read(),item={source:model.source,runs:model.runs,...config,selection:{...capture()}};
    const comparable=x=>JSON.stringify([x.source,x.runs,x.bodyFont,x.detectFonts]);
    if(historyAt>=0&&comparable(history[historyAt])===comparable(item))return;
    history=history.slice(0,historyAt+1);history.push(item);if(history.length>100)history.shift();historyAt=history.length-1;
  }
  function notify(record=true){
    const report=analyze();$('editText').value=report.model.source;
    if(record)remember();renderValidation(report);onChange(report);
    $('richUndo').disabled=historyAt<=0;$('richRedo').disabled=historyAt>=history.length-1;
    return report;
  }
  function undo(direction){
    const next=historyAt+direction;if(next<0||next>=history.length)return;
    historyAt=next;const item=history[next];config={bodyFont:item.bodyFont,detectFonts:item.detectFonts};
    render(item.runs,item.selection);fontOptions();notify(false);
  }
  function updateRange(start,end,format){
    const model=read();
    if(end<=start){$('formatHelp').textContent='请先选中文字，再设置模板格式。';return}
    const middle=slice(model.runs,start,end).map(r=>({...r,...format}));
    render([...slice(model.runs,0,start),...middle,...slice(model.runs,end,model.source.length)],{start,end});fontOptions();notify();
  }
  function format(kind){
    const {start,end}=capture();
    if(kind==='content')updateRange(start,end,{...plain,font:config.bodyFont});
    else if(kind==='font')updateRange(start,end,{font:config.bodyFont.toLowerCase()==='georgia'?'Arial':'Georgia'});
    else updateRange(start,end,{[kind]:true});
  }
  function setWords(indices){
    const model=read(),set=new Set(indices);let offset=0;const runs=[];
    for(const w of WE.wordSpans(model.source)){
      if(w.start>offset)runs.push({text:model.source.slice(offset,w.start),...plain,font:config.bodyFont});
      runs.push({text:w.text,...plain,b:set.has(w.index),font:config.bodyFont});offset=w.end;
    }
    if(offset<model.source.length)runs.push({text:model.source.slice(offset),...plain,font:config.bodyFont});
    render(runs);notify();
  }
  function fonts(runs){
    const count=new Map();
    for(const r of runs)if(r.font)count.set(r.font,(count.get(r.font)||0)+(r.text.match(/[A-Za-z0-9]/g)||[]).length);
    return [...count].sort((a,b)=>b[1]-a[1]).map(([name])=>name);
  }
  function fontOptions(){
    const choices=[...new Set([config.bodyFont,...fonts(read().runs)].filter(Boolean))];
    $('bodyFont').innerHTML='<option value="">默认正文字体</option>'+choices.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');
    $('bodyFont').value=config.bodyFont;$('detectFonts').checked=config.detectFonts;
  }
  function paste(html,text,showHelp=true){
    let incoming;
    if(html){const doc=new DOMParser().parseFromString(html,'text/html');incoming=readDOM(doc.body)}
    else incoming={source:String(text||'').replace(/\r\n?/g,'\n'),runs:[{text:String(text||'').replace(/\r\n?/g,'\n'),...plain}]};
    if(!incoming.source)return;
    const model=read(),range=capture();
    // 首次粘贴时用出现最多的字体预选正文，可在下拉框中调整。
    if(!config.bodyFont&&fonts(incoming.runs).length)config.bodyFont=fonts(incoming.runs)[0];
    const runs=merge([...slice(model.runs,0,range.start),...incoming.runs,...slice(model.runs,range.end,model.source.length)]);
    const caret=range.start+incoming.source.length;render(runs,{start:caret,end:caret});fontOptions();notify();
    if(showHelp)$('formatHelp').textContent=html?'已粘贴文字与可识别格式，请核对模板词和正文字体；纯文本来源需手动标记。':'已粘贴纯文本，请选中模板文字后设置格式。';
  }
  function load(text,value,parts){
    let model=normalize(value,text);
    config=model?{bodyFont:model.bodyFont,detectFonts:model.detectFonts}:{bodyFont:'',detectFonts:true};
    if(!model){
      const set=new Set(parts?.source===text?parts.templateWords:[]),runs=[];let offset=0;
      for(const w of WE.wordSpans(text)){if(w.start>offset)runs.push({text:text.slice(offset,w.start),...plain});runs.push({text:w.text,...plain,b:set.has(w.index)});offset=w.end}
      if(offset<text.length)runs.push({text:text.slice(offset),...plain});model={source:text,runs};
    }
    selection={start:0,end:0};render(model.runs);history=[];historyAt=-1;fontOptions();
    $('formatHelp').textContent='加粗、斜体、下划线或非正文字体代表模板。一个单词的格式必须一致。';
    return notify();
  }
  function renderValidation(report){
    const errors=report.errors;$('formatStatus').textContent=errors.length?`有 ${errors.length} 个单词格式不一致，修正后才能保存。`:`格式检查通过 · 模板 ${report.templateWords.length} 词 · 内容 ${report.words.length-report.templateWords.length} 词`;
    $('formatStatus').classList.toggle('bad',!!errors.length);$('formatErrors').classList.toggle('hidden',!errors.length);
    $('formatErrors').innerHTML=errors.slice(0,20).map(e=>`<div class="formatError"><span class="grow"><b>${esc(e.text)}</b> · 第 ${e.index+1} 词</span><button type="button" class="smallBtn" data-fix="template" data-error-word="${e.index}">整词设为模板</button><button type="button" class="smallBtn" data-fix="content" data-error-word="${e.index}">整词设为内容</button><button type="button" class="smallBtn" data-fix="locate" data-error-word="${e.index}">定位</button></div>`).join('')+(errors.length>20?'<p>先修正以上单词，随后继续显示其余问题。</p>':'');
    $('saveEssay').disabled=!!errors.length;
  }
  function prepareSave(){
    const report=notify(false);
    if(report.errors.length){$('formatErrors').scrollIntoView({behavior:'smooth',block:'center'});return null}
    const m=report.model,source=m.source.trim(),start=m.source.length-m.source.trimStart().length;
    return {source,runs:merge(slice(m.runs,start,start+source.length)),...config};
  }
  function init(callback){
    onChange=callback;
    $('editRich').addEventListener('input',()=>{if(!composing)notify()});
    $('editRich').addEventListener('compositionstart',()=>{composing=true});
    $('editRich').addEventListener('compositionend',()=>{composing=false;notify()});
    document.addEventListener('selectionchange',capture);
    $('editRich').addEventListener('paste',ev=>{
      ev.preventDefault();
      if(!ev.clipboardData){$('formatHelp').textContent='未能读取剪贴板，请重新复制并粘贴。';return}
      paste(ev.clipboardData.getData('text/html'),ev.clipboardData.getData('text/plain'));
    });
    // 拖放不接收外部 HTML，避免浏览器绕过格式检查直接插入节点。
    $('editRich').addEventListener('drop',ev=>{ev.preventDefault();$('formatHelp').textContent='请用复制、粘贴导入文章，以保留并检查格式。'});
    $('editRich').addEventListener('beforeinput',ev=>{
      if(ev.inputType==='historyUndo'||ev.inputType==='historyRedo'){ev.preventDefault();undo(ev.inputType==='historyUndo'?-1:1)}
      else if(!ev.isComposing&&(ev.inputType==='insertParagraph'||ev.inputType==='insertLineBreak')){ev.preventDefault();paste('','\n',false)}
    });
    $('editRich').addEventListener('keydown',ev=>{
      if(ev.key==='Enter'&&!ev.isComposing){ev.preventDefault();paste('','\n',false);return}
      if(!(ev.ctrlKey||ev.metaKey)||ev.isComposing)return;
      const key=ev.key.toLowerCase();
      if(key==='z'||key==='y'){ev.preventDefault();undo(key==='y'||ev.shiftKey?1:-1)}
      else if(['b','i','u'].includes(key)){ev.preventDefault();format(key)}
    });
    document.querySelectorAll('[data-format]').forEach(b=>{b.onmousedown=ev=>ev.preventDefault();b.onclick=()=>format(b.dataset.format)});
    $('richUndo').onclick=()=>undo(-1);$('richRedo').onclick=()=>undo(1);
    $('bodyFont').onchange=()=>{config.bodyFont=$('bodyFont').value;$('editRich').style.fontFamily=config.bodyFont||'';notify()};
    $('detectFonts').onchange=()=>{config.detectFonts=$('detectFonts').checked;notify()};
    $('formatErrors').onclick=ev=>{
      const button=ev.target.closest('[data-error-word]');if(!button)return;
      const error=analyze().errors.find(e=>e.index===Number(button.dataset.errorWord));if(!error)return;
      if(button.dataset.fix==='locate'){select(error.start,error.end);$('editRich').scrollIntoView({behavior:'smooth',block:'center'});return}
      updateRange(error.start,error.end,{...plain,b:button.dataset.fix==='template',font:config.bodyFont});
    };
  }
  return {normalize,readDOM,analyze,read,load,init,prepareSave,setWords,select,capture,updateRange,paste};
})();
