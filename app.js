const SUPABASE_URL='https://jszwddbnryqumbyxopzh.supabase.co';
const SUPABASE_KEY='sb_publishable_UguHYWQ7TJh-TQrbd8UkNw_7JVSRPAg';
const KEY='essay-moxie-v2',AUTH_KEY='essay-moxie-auth-v1';
const DEFAULT="In today’s fast-changing society, there is an ongoing debate about whether experiential learning can be effective in formal education. While some people believe that experiential learning is beneficial in high schools and colleges, others disagree with this idea. In this essay, I will explain why I strongly agree with this statement and provide examples to support my position.\n\nFirstly, experiential learning helps students develop practical abilities. This is because hands-on experience allows students to apply theoretical knowledge in real situations. Moreover, experiential learning can improve students’ competitiveness in the job market. Additionally, it helps students gain a deeper understanding of knowledge. For example, conducting experiments is an essential part of learning physics because students can observe scientific principles directly rather than simply reading about them in textbooks.\n\nOn the other hand, in some cases, some people believe that experiential learning is not efficient. For instance, it often requires more time and resources than traditional classroom teaching. However, this view overlooks the fact that experiential learning usually produces better learning outcomes and helps students retain knowledge for a longer period of time.\n\nIn conclusion, while it is true that experiential learning may require additional time and effort, its benefits far outweigh the drawbacks. Therefore, I strongly agree that experiential learning is beneficial in high schools and colleges because it promotes practical skills, deeper understanding, and greater competitiveness in the job market.";
const $=id=>document.getElementById(id),now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(16).slice(2);
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{essays:[{id:'demo',title:'Experiential Learning',text:DEFAULT,history:[],wrong:{},createdAt:now()}],current:'demo'};
let auth=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');
let pct=40,answers=[],editing=null,deleteTarget=null,wrongPriority=false,syncing=false,practiceSignature='';

const VIEW_KEY='essay-moxie-library-view-v1';
const DEFAULT_VIEW={search:'',group:'',tag:'',recent:'all',practice:'all',sort:'date-desc'};
let libraryView;
try{libraryView={...DEFAULT_VIEW,...JSON.parse(localStorage.getItem(VIEW_KEY)||'{}')}}catch{libraryView={...DEFAULT_VIEW}}
const titleCollator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});

function cleanGroup(value){
  const group=String(value||'').trim().slice(0,40)||'WE';
  return /^(we|swt)$/i.test(group)?group.toUpperCase():group;
}
function cleanTags(value){
  const values=Array.isArray(value)?value:String(value||'').split(/[,，;；\n]+/);
  const seen=new Set();
  return values.map(t=>String(t).trim().slice(0,40)).filter(t=>{
    const key=t.toLocaleLowerCase();
    if(!t||seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,20);
}
function validDate(value){
  return typeof value==='string'&&value&&Number.isFinite(Date.parse(value))?value:null;
}
function normalizeEssay(e,fallback={}){
  const field=key=>Object.prototype.hasOwnProperty.call(e,key)?e[key]:fallback[key];
  const text=String(e.text||'');
  let weParts=WE.normalizeParts(field('weParts'),text),weFormat=Rich.normalize(field('weFormat'),text);
  if(weFormat){
    const report=Rich.analyze(weFormat);
    if(report.errors.length)weParts=null;
    // 旧设备可能只更新整词标记；此时沿用新的标记，编辑时重新生成加粗格式。
    else if(!weParts||JSON.stringify(report.templateWords)!==JSON.stringify(weParts.templateWords))weFormat=null;
  }
  // 旧版只保存更新时间，不能当作录入时间；更早的时间戳 ID 可恢复原录入时间。
  const oldId=/^e(\d{13})$/.exec(e.id||'');
  const storedDate=field('createdAt');
  const createdAt=validDate(storedDate)||(storedDate===undefined&&oldId?new Date(Number(oldId[1])).toISOString():null);
  return {...e,id:e.id||uid(),title:String(e.title||'未命名文章'),text:String(e.text||''),
    history:Array.isArray(e.history)?e.history:[],wrong:e.wrong&&typeof e.wrong==='object'?e.wrong:{},
    cloud:!!e.cloud,dirty:!!e.dirty,updatedAt:validDate(e.updatedAt)||now(),
    group:cleanGroup(field('group')),tags:cleanTags(field('tags')),recent:field('recent')===true,createdAt,
    weParts,weFormat,weBank:WEBank.validEntry(field('weBank'))?field('weBank'):null};
}
function emptyEssay(){
  return normalizeEssay({id:'local-'+uid(),title:'新文章',text:'请点击编辑文章并粘贴原文。',createdAt:now()});
}
function normalizeState(value){
  const essays=(Array.isArray(value.essays)?value.essays:[]).map(e=>normalizeEssay(e));
  if(!essays.length)essays.push(emptyEssay());
  return {...value,essays,current:essays.some(e=>e.id===value.current)?value.current:essays[0].id,
    weTemplates:WE.normalizeTemplates(value.weTemplates,essays),
    hiddenCloud:Array.isArray(value.hiddenCloud)?value.hiddenCloud:[],
    pendingDeletes:Array.isArray(value.pendingDeletes)?value.pendingDeletes:[]};
}
state=normalizeState(state);

function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function saveAuth(){auth?localStorage.setItem(AUTH_KEY,JSON.stringify(auth)):localStorage.removeItem(AUTH_KEY)}
function current(){return state.essays.find(x=>x.id===state.current)||state.essays[0]}
function tokens(s){
  const raw=String(s||'').match(/\s+|[A-Za-z0-9]+(?:[‘’'ʼ＇-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]/g)||[];
  const result=[];
  let quoted=false;
  for(let i=0;i<raw.length;i++){
    const token=raw[i];
    if(/^[‘’'ʼ＇]$/.test(token)){
      // 成对的单引号保留为标点；词尾所有格撇号与前面的单词一起填空。
      if(quoted&&token!=='‘'){quoted=false;result.push(token);continue}
      if(/^[A-Za-z0-9]/.test(result[result.length-1]||'')){
        result[result.length-1]+=token;continue;
      }
      if(/^[A-Za-z0-9]/.test(raw[i+1]||''))quoted=true;
    }
    result.push(token);
  }
  return result;
}
function words(s){return tokens(s).filter(t=>!/^\s+$/.test(t))}
function norm(s){return(s||'').toLowerCase().replace(/[‘’ʼ＇]/g,"'").replace(/[^a-z0-9'-]/g,'')}

function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function jwtPayload(token){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{return{}}}
function loggedIn(){return !!auth?.access_token}
function markChanged(e){e.updatedAt=now();if(e.cloud)e.dirty=true;save();if(e.cloud)syncSoon()}

function setSyncStatus(type,text){$('syncDot').className='syncDot '+(type||'');$('syncText').textContent=text}
function updateAccountUI(){
  $('accountBtn').textContent=loggedIn()?'账号/同步':'登录同步';
  $('cloudChoice').classList.toggle('hidden',!loggedIn());
  $('signedOut').classList.toggle('hidden',loggedIn());$('signedIn').classList.toggle('hidden',!loggedIn());
  if(loggedIn()){$('accountEmail').textContent=auth.user?.email||jwtPayload(auth.access_token).email||'已登录';setSyncStatus(navigator.onLine?'ok':'','已登录 · '+(navigator.onLine?'云同步可用':'离线'))}
  else setSyncStatus('','本地模式 · 无需登录');
}
function dateInput(value){
  if(!validDate(value))return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const d=new Date(value),pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function studiedToday(e){return e.history.some(h=>dateInput(h.date)===dateInput(now()))}
function saveView(){localStorage.setItem(VIEW_KEY,JSON.stringify(libraryView))}
function filterOptions(id,values,selected,allLabel){
  const unique=[...new Set(values)];
  if(selected&&!unique.includes(selected))unique.push(selected);
  unique.sort(titleCollator.compare);
  $(id).innerHTML=`<option value="">${allLabel}</option>`+unique.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  $(id).value=selected;
}
function renderFilters(){
  filterOptions('filterGroup',['WE','SWT',...state.essays.map(e=>e.group)],libraryView.group,'全部分组');
  filterOptions('filterTag',state.essays.flatMap(e=>e.tags),libraryView.tag,'全部标签');
  $('filterRecent').value=libraryView.recent;
  $('filterPractice').value=libraryView.practice;
  $('sortEssays').value=libraryView.sort;
  if($('searchEssays').value!==libraryView.search)$('searchEssays').value=libraryView.search;
  $('groupOptions').innerHTML=[...new Set(['WE','SWT',...state.essays.map(e=>e.group)])].sort(titleCollator.compare).map(g=>`<option value="${esc(g)}"></option>`).join('');
}
function visibleEssays(){
  const query=libraryView.search.trim().toLocaleLowerCase();
  return state.essays.filter(e=>{
    if(query&&!`${e.title} ${e.group} ${e.tags.join(' ')}`.toLocaleLowerCase().includes(query))return false;
    if(libraryView.group&&e.group!==libraryView.group)return false;
    if(libraryView.tag&&!e.tags.includes(libraryView.tag))return false;
    if(libraryView.recent==='recent'&&!e.recent)return false;
    if(libraryView.recent==='other'&&e.recent)return false;
    if(libraryView.practice==='todo'&&studiedToday(e))return false;
    if(libraryView.practice==='done'&&!studiedToday(e))return false;
    if(libraryView.practice==='never'&&e.history.length)return false;
    return true;
  }).sort((a,b)=>{
    if(libraryView.sort==='name-asc')return titleCollator.compare(a.title,b.title);
    if(libraryView.sort==='name-desc')return titleCollator.compare(b.title,a.title);
    // 未记录日期的旧文章放在末尾，同日期或未知日期保留原有顺序。
    if(!a.createdAt&&!b.createdAt)return 0;
    if(!a.createdAt)return 1;
    if(!b.createdAt)return -1;
    return (Date.parse(a.createdAt)-Date.parse(b.createdAt))*(libraryView.sort==='date-asc'?1:-1);
  });
}
function essayBadges(e){
  return `<span class="tag groupTag">${esc(e.group)}</span>`+(e.recent?'<span class="tag recentTag">近期题库</span>':'')+e.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('');
}
function chooseEssay(id){
  state.current=id;save();renderAll();$('library').classList.add('hidden');$('editor').classList.add('hidden');
}
function renderList(){
  renderFilters();
  const list=visibleEssays(),done=list.filter(studiedToday).length;
  $('libraryCount').textContent=`筛选 ${list.length} / ${state.essays.length} 篇 · 今日已练 ${done} 篇`;
  $('essayList').innerHTML=list.length?list.map(e=>`<div class="essayItem ${e.id===state.current?'active':''}" data-id="${esc(e.id)}">
    <div class="row"><button class="essayTitle grow" data-open="${esc(e.id)}">${esc(e.title)}</button><button class="status ${e.cloud?(e.dirty?'pending':'cloud'):''}" data-cloud="${esc(e.id)}">${e.cloud?(e.dirty?'待同步':'☁ 已同步'):'仅本机'}</button></div>
    <div class="badges">${essayBadges(e)}</div>
    <div class="muted">${e.history.length} 次练习 · ${words(e.text).filter(x=>/[A-Za-z0-9]/.test(x)).length} 词 · ${e.createdAt?'录入 '+dateInput(e.createdAt):'录入日期未记录'}</div>
    <div class="row itemActions"><span class="muted grow">${studiedToday(e)?'✓ 今日已练':e.history.length?'今日未练':'尚未练习'}</span><button class="smallBtn" data-recent="${esc(e.id)}" aria-pressed="${e.recent}">${e.recent?'取消近期标记':'标为近期题库'}</button><button class="smallBtn" data-edit="${esc(e.id)}">编辑</button></div>
  </div>`).join(''):'<div class="emptyState">没有符合条件的文章。可以更换筛选条件，或添加文章。</div>';
  $('essayList').querySelectorAll('.essayItem').forEach(el=>el.onclick=ev=>{
    if(ev.target.closest('button'))return;
    chooseEssay(el.dataset.id);
  });
  $('essayList').querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>chooseEssay(el.dataset.open));
  $('essayList').querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>openEditor(el.dataset.edit));
  $('essayList').querySelectorAll('[data-recent]').forEach(el=>el.onclick=()=>{
    const e=state.essays.find(e=>e.id===el.dataset.recent);e.recent=!e.recent;markChanged(e);renderList();renderHeader();
  });
  $('essayList').querySelectorAll('[data-cloud]').forEach(el=>el.onclick=async()=>{
    const e=state.essays.find(x=>x.id===el.dataset.cloud);
    if(!loggedIn()){openAuth();return}
    if(!e.cloud){e.cloud=true;markChanged(e);renderList();await syncAll()}
    else if(confirm('取消这篇文章的云同步并保留本地副本？云端版本将从其他设备删除。'))await detachEssay(e);
  });
}
function renderHeader(){
  renderBankDetail();
  const e=current(),h=e.history||[];
  $('currentTitle').textContent=e.title;
  $('currentMeta').innerHTML=essayBadges(e);
  $('progressText').textContent=(e.cloud?'☁ 云同步 · ':'仅本机 · ')+(h.length?`最近：${WE.historyLabel(h[0])} ${h[0].pct}% 空白 · ${h[0].score.toFixed(1)} 分`:'还没有练习记录');
}

let blankRevealFrame=0;
function revealActiveBlank(){
  const el=document.activeElement;
  if(!el?.matches('.blank')||!el.isConnected)return;
  const rect=el.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  // 使用实际可见视口，并扣除底部操作栏；桌面浏览器原生 focus 不会避开固定栏。
  const viewport=window.visualViewport,viewportTop=viewport?.offsetTop||0;
  const top=viewportTop+20;
  let bottom=viewportTop+(viewport?.height||window.innerHeight)-20;
  const toolbar=document.querySelector('.bottom')?.getBoundingClientRect();
  if(toolbar?.height>0&&toolbar.top<bottom&&toolbar.bottom>top)bottom=Math.min(bottom,toolbar.top-20);
  if(bottom-top<rect.height+20)return;
  // 已完整可见时不滚动；超出可用区域时将当前格移至中部。
  if(rect.top<top||rect.bottom>bottom){
    window.scrollBy({top:rect.top+rect.height/2-(top+bottom)/2,left:0,behavior:'auto'});
  }
}
function scheduleBlankReveal(){
  cancelAnimationFrame(blankRevealFrame);
  blankRevealFrame=requestAnimationFrame(revealActiveBlank);
}
function focusBlank(el,atEnd=false){
  if(!el)return;
  el.focus({preventScroll:true});
  if(atEnd)el.setSelectionRange(el.value.length,el.value.length);
  revealActiveBlank();scheduleBlankReveal();
}
window.addEventListener('resize',scheduleBlankReveal);
window.visualViewport?.addEventListener('resize',scheduleBlankReveal);

function renderPractice(){
  answers=[];$('resultCard').classList.add('hidden');let e=current(),mode=$('mode').value;
  practiceSignature=WE.signature();
  if(pct===100&&WE.scope()==='all'&&mode==='full'){$('practice').innerHTML='<textarea id="full" class="full" placeholder="从头默写整篇文章…" spellcheck="false"></textarea>';WE.describe(WE.pool().length);return}
  const hidden=WE.pick(e);WE.describe(hidden.size);
  let html='',hint=$('hint').value;
  WE.practiceTokens(e).forEach(({text:t,index:wordIndex})=>{
    if(/^\s+$/.test(t)){html+=t.includes('\n')?t.replace(/\n/g,'<br>'):' ';return}
    if(!/[A-Za-z0-9]/.test(t)){html+=esc(t);return}
    if(hidden.has(wordIndex)){
      const i=answers.length;answers.push(t);
      const ph=hint==='first'?t[0]+'…':'',w=Math.max(56,Math.min(155,t.length*9+22));
      html+=`<input class="blank" data-i="${i}" data-word="${wordIndex}" aria-label="第 ${i+1} 个填空" style="width:${w}px" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false">`;
    }else html+=esc(t);
  });

  $('practice').innerHTML=html||(WE.hiding()?'<div class="emptyState">模板已隐藏，本篇没有内容词。</div>':'');let ins=[...document.querySelectorAll('.blank')];
  const focusNext=i=>focusBlank(ins[i+1]);
  ins.forEach((el,i)=>{
    el.addEventListener('focus',scheduleBlankReveal);
    const backToPrevious=ev=>{
      if(ev.isComposing||ev.keyCode===229||el.value!=='')return;
      ev.preventDefault();
      const previous=ins[i-1];
      if(previous)focusBlank(previous,true);
    };
    el.addEventListener('keydown',ev=>{
      if(ev.isComposing||ev.keyCode===229)return;
      if(ev.key==='Backspace'){
        backToPrevious(ev);
        return;
      }
      if(ev.key==='Enter'||ev.key===' '||ev.key==='Spacebar'){
        ev.preventDefault();
        focusNext(i);
      }
    });
    // 软键盘可能不发送 keydown；只在删除前已为空时退格，删掉最后一个字时仍留在当前格。
    el.addEventListener('beforeinput',ev=>{
      if(ev.inputType==='deleteContentBackward')backToPrevious(ev);
    });
    // 部分 iPhone/iPad 软键盘不会稳定触发空格的 keydown，用 input 事件兜底。
    el.addEventListener('input',ev=>{
      if(ev.isComposing)return;
      if(/\s/.test(el.value)){
        el.value=el.value.replace(/\s+/g,'');
        focusNext(i);
      }
    });
  });
}
function alignScore(expected,typed){let a=expected.map(norm).filter(Boolean),b=typed.map(norm).filter(Boolean),n=a.length,m=b.length,dp=Array.from({length:n+1},()=>Array(m+1).fill(0));for(let i=0;i<=n;i++)dp[i][0]=i;for(let j=0;j<=m;j++)dp[0][j]=j;for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return{score:Math.max(0,(1-dp[n][m]/Math.max(1,n))*100),distance:dp[n][m],total:n}}
function submit(){
  if(pct===0||!WE.pool().length)return;
  let e=current(),score=0,total=0,wrong=[];
  if(pct===100&&WE.scope()==='all'&&$('mode').value==='full'){let ex=words(e.text).filter(x=>/[A-Za-z0-9]/.test(x)),ty=words($('full').value).filter(x=>/[A-Za-z0-9]/.test(x)),r=alignScore(ex,ty);score=r.score;total=r.total;for(let i=0;i<Math.min(ex.length,ty.length);i++)if(norm(ex[i])!==norm(ty[i])&&wrong.length<15){wrong.push(`${ty[i]||'∅'} → ${ex[i]}`);e.wrong[norm(ex[i])]=(e.wrong[norm(ex[i])]||0)+1}}
  else{let ins=[...document.querySelectorAll('.blank')],correct=0;total=answers.length;ins.forEach((el,i)=>{if(norm(el.value)===norm(answers[i])){correct++;el.style.borderBottomColor='#12b76a'}else{el.style.borderBottomColor='#f04438';e.wrong[norm(answers[i])]=(e.wrong[norm(answers[i])]||0)+1;if(wrong.length<15)wrong.push(`${el.value||'∅'} → ${answers[i]}`)}});score=total?correct/total*100:100}
  e.history=e.history||[];e.history.unshift({id:uid(),date:now(),scope:WE.scope(),hideTemplate:WE.hiding(),pct,score,blankCount:total,eligibleCount:WE.pool().length});e.history=e.history.slice(0,50);markChanged(e);$('score').innerHTML=`得分 <span class="${score>=90?'good':'bad'}">${score.toFixed(1)}%</span>`;$('detail').textContent=wrong.length?'错词示例：'+wrong.join(' ｜ '):'全部正确 🎉';$('resultCard').classList.remove('hidden');renderHeader();renderHistory();renderList();$('resultCard').scrollIntoView({behavior:'smooth'})
}
function renderHistory(){let h=current().history||[];$('history').innerHTML=h.length?h.slice(0,8).map(x=>`<div class="history">${new Date(x.date).toLocaleString()} · ${WE.historyLabel(x)} ${x.pct}% 空白 · <b>${x.score.toFixed(1)}</b></div>`).join(''):'<div class="muted" style="margin-top:8px">完成一次练习后会记录在这里。</div>'}
function updateControls(){
  WE.updateScope();
  const full=pct===100&&WE.scope()==='all',reading=pct===0,empty=!WE.pool().length;
  $('mode').disabled=!full;$('mode').title=full?'选择 100% 默写方式':'仅在全文范围、空白率 100% 时可选择';
  if(!full)$('mode').value='grid';
  $('hint').disabled=reading||empty||(full&&$('mode').value==='full');$('submit').disabled=reading||empty;$('regen').disabled=reading||empty;
}
function applyHint(){let first=$('hint').value==='first';document.querySelectorAll('.blank').forEach(el=>{let a=answers[Number(el.dataset.i)]||'';el.placeholder=first&&a?a[0]+'…':''})}
function renderAll(refreshPractice=true){renderList();renderHeader();updateAccountUI();updateControls();if(refreshPractice||practiceSignature!==WE.signature())renderPractice();renderHistory()}

async function authRequest(path,body){let r=await fetch(SUPABASE_URL+path,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.msg||data.message||data.error_description||'请求失败');return data}
async function ensureToken(){if(!auth)return false;let p=jwtPayload(auth.access_token);if((p.exp||0)*1000>Date.now()+60000)return true;try{let d=await authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:auth.refresh_token});auth={...d,user:d.user||auth.user};saveAuth();return true}catch{auth=null;saveAuth();updateAccountUI();return false}}
async function rest(path,options={}){if(!await ensureToken())throw new Error('请重新登录');let r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{...options,headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json',...(options.headers||{})}});if(!r.ok){let d=await r.json().catch(()=>({}));throw new Error(d.message||d.hint||'云端请求失败')}return r}
function cloudPayload(e){return{title:e.title,text:e.text,history:e.history||[],wrong:e.wrong||{},group:e.group,tags:e.tags,recent:e.recent,createdAt:e.createdAt,weParts:e.weParts,weFormat:e.weFormat,weBank:e.weBank||undefined}}
async function uploadEssay(e){
  const user=jwtPayload(auth.access_token).sub;if(!user)throw new Error('登录信息无效');
  const sentAt=e.updatedAt;
  const row={user_id:user,client_id:e.id,payload:cloudPayload(e),updated_at:sentAt||now(),deleted_at:null};
  await rest('essay_records?on_conflict=user_id,client_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([row])});
  if(e.updatedAt===sentAt)e.dirty=false;
  save();
}

async function pushDelete(id){await rest('essay_records?client_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({deleted_at:now(),updated_at:now()})})}
function mergeRemote(rows){
  rows.forEach(r=>{
    const local=state.essays.find(e=>e.id===r.client_id),remoteTime=Date.parse(r.updated_at||0),localTime=Date.parse(local?.updatedAt||0);
    if(r.deleted_at){if(local?.cloud&&remoteTime>=localTime)state.essays=state.essays.filter(e=>e.id!==r.client_id);return}
    if(state.hiddenCloud.includes(r.client_id)||!r.payload)return;
    // 旧设备尚未升级时，缺少的新字段沿用本机的分组、标签等信息。
    const incoming=normalizeEssay({...r.payload,id:r.client_id,cloud:true,dirty:false,updatedAt:r.updated_at},local);
    if(!local)state.essays.push(incoming);
    else if(local.cloud&&!local.dirty&&remoteTime>localTime)Object.assign(local,incoming);
  });
  if(!state.essays.length)state.essays.push(emptyEssay());
  if(!state.essays.some(e=>e.id===state.current))state.current=state.essays[0].id;
  state.weTemplates=WE.normalizeTemplates(state.weTemplates,state.essays);
}

async function syncAll(silent=false){
  if(!loggedIn()||syncing)return;if(!navigator.onLine){setSyncStatus('','离线 · 更改将在联网后同步');return}syncing=true;const before={id:current().id,text:current().text};setSyncStatus('busy','正在同步…');
  try{if(!await ensureToken())throw new Error('登录已过期');for(let id of [...state.pendingDeletes]){await pushDelete(id);state.pendingDeletes=state.pendingDeletes.filter(x=>x!==id);save()}for(let e of state.essays.filter(x=>x.cloud&&x.dirty))await uploadEssay(e);let r=await rest('essay_records?select=client_id,payload,updated_at,deleted_at&order=updated_at.asc'),rows=await r.json();mergeRemote(rows);save();renderAll(before.id!==current().id||before.text!==current().text);setSyncStatus('ok','已同步 · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));if(!silent)alert('同步完成')}
  catch(err){setSyncStatus('','同步失败 · 本地数据已保留');if(!silent)alert(err.message)}finally{syncing=false}
}
let syncTimer;function syncSoon(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncAll(true),800)}
function openAuth(){updateAccountUI();$('authDialog').showModal()}
async function login(){let email=$('authEmail').value.trim(),password=$('authPassword').value;if(!email||password.length<6)return alert('请输入邮箱和至少6位密码');try{let d=await authRequest('/auth/v1/token?grant_type=password',{email,password});auth=d;saveAuth();updateAccountUI();await syncAll(true);$('authDialog').close();renderAll()}catch(e){alert(e.message)}}
async function signup(){let email=$('authEmail').value.trim(),password=$('authPassword').value;if(!email||password.length<6)return alert('请输入邮箱和至少6位密码');try{let d=await authRequest('/auth/v1/signup',{email,password});if(d.access_token){auth=d;saveAuth();updateAccountUI();await syncAll(true);$('authDialog').close()}else alert('注册成功，请先到邮箱完成验证，然后回来登录。')}catch(e){alert(e.message)}}
function logout(){auth=null;saveAuth();updateAccountUI();$('authDialog').close();renderList()}
async function detachEssay(e){let old=e.id;if(e.cloud){state.pendingDeletes.push(old);state.hiddenCloud.push(old)}e.id='local-'+uid();e.cloud=false;e.dirty=false;e.updatedAt=now();state.current=e.id;save();renderAll();await syncAll(true)}
function askDelete(id){deleteTarget=id;let e=state.essays.find(x=>x.id===id);if(!e)return;if(!e.cloud){if(confirm(`确定删除《${e.title}》吗？成绩和错词也会一起删除。`))removeLocal(id);return}$('deleteTitle').textContent=`《${e.title}》已开启云同步，请选择删除范围。`;$('deleteDialog').showModal()}
function removeLocal(id){
  state.essays=state.essays.filter(e=>e.id!==id);
  if(!state.essays.length)state.essays.push(emptyEssay());
  if(state.current===id)state.current=state.essays[0].id;
  save();$('editor').classList.add('hidden');renderAll();
}

function openEditor(id=null){
  const e=id?state.essays.find(e=>e.id===id):null;
  editing=e?.id||null;
  $('editTitle').value=e?.title||'';$('editText').value=e?.text||'';
  $('editGroup').value=e?.group||libraryView.group||'WE';
  $('editTags').value=e?e.tags.join('，'):libraryView.tag;
  $('editRecent').checked=e?e.recent:libraryView.recent==='recent';
  $('editCreatedAt').value=e?dateInput(e.createdAt):dateInput(now());
  $('editCloud').checked=!!e?.cloud;
  $('deleteEssay').classList.toggle('hidden',!e);
  WE.openEditor(e);
  $('editor').classList.remove('hidden');
  $('editor').scrollIntoView({behavior:'smooth',block:'start'});
}
function openCurrentEditor(){openEditor(current().id)}
async function saveEditor(){
  const weFormat=Rich.prepareSave();if(!weFormat)return;
  const title=$('editTitle').value.trim(),text=weFormat.source;
  if(!title||!text)return alert('请填写标题和文章原文');
  const e=editing?state.essays.find(e=>e.id===editing):null;
  if(editing&&!e)return alert('这篇文章已被删除，请重新打开文章库。');
  const date=$('editCreatedAt').value;
  const createdAt=e&&date===dateInput(e.createdAt)?e.createdAt:date||null;
  const metadata={title,text,group:cleanGroup($('editGroup').value),tags:cleanTags($('editTags').value),recent:$('editRecent').checked,weParts:WE.editorParts(text),weFormat,
    createdAt:!e&&date===dateInput(now())?now():createdAt};
  const wantCloud=loggedIn()?$('editCloud').checked:!!e?.cloud;
  const before={id:current().id,text:current().text};
  if(e){
    Object.assign(e,metadata);
    if(e.cloud&&!wantCloud)await detachEssay(e);
    else{e.cloud=wantCloud;markChanged(e)}
  }else{
    const item=normalizeEssay({...metadata,id:'e-'+uid(),cloud:wantCloud,dirty:wantCloud,updatedAt:now()});
    state.essays.unshift(item);state.current=item.id;save();if(wantCloud)syncSoon();
  }
  $('editor').classList.add('hidden');
  renderAll(before.id!==current().id||before.text!==current().text);
}
function updateView(){
  libraryView={search:$('searchEssays').value,group:$('filterGroup').value,tag:$('filterTag').value,
    recent:$('filterRecent').value,practice:$('filterPractice').value,sort:$('sortEssays').value};
  saveView();renderList();
}
['filterGroup','filterTag','filterRecent','filterPractice','sortEssays'].forEach(id=>$(id).onchange=updateView);
$('searchEssays').oninput=updateView;
$('resetFilters').onclick=()=>{libraryView={...DEFAULT_VIEW};saveView();renderList()};

document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{WE.setRate(+b.dataset.p);updateControls();renderPractice()});
$('hint').onchange=applyHint;$('mode').onchange=()=>{updateControls();renderPractice()};$('regen').onclick=renderPractice;$('submit').onclick=submit;
$('libraryBtn').onclick=()=>{renderList();$('library').classList.toggle('hidden')};$('accountBtn').onclick=openAuth;$('loginBtn').onclick=login;$('signupBtn').onclick=signup;$('logoutBtn').onclick=logout;$('syncNowBtn').onclick=()=>syncAll();
$('uploadAllBtn').onclick=async()=>{if(confirm('将当前所有仅本机文章上传到云端？')){state.essays.forEach(e=>{e.cloud=true;e.dirty=true;e.updatedAt=now()});save();renderList();await syncAll()}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('wrongBtn').onclick=()=>{wrongPriority=!wrongPriority;$('wrongBtn').classList.toggle('primary',wrongPriority);renderPractice()};
$('addBtn').onclick=()=>openEditor();
$('cancelEdit').onclick=()=>$('editor').classList.add('hidden');
$('saveEssay').onclick=saveEditor;

$('currentTitle').onclick=openCurrentEditor;$('editCurrent').onclick=openCurrentEditor;$('deleteCurrent').onclick=()=>askDelete(current().id);$('deleteEssay').onclick=()=>askDelete(editing);
$('deleteLocalOnly').onclick=()=>{state.hiddenCloud.push(deleteTarget);$('deleteDialog').close();removeLocal(deleteTarget)};
$('deleteEverywhere').onclick=()=>{state.pendingDeletes.push(deleteTarget);$('deleteDialog').close();removeLocal(deleteTarget);syncSoon()};
$('detachCloud').onclick=async()=>{let e=state.essays.find(x=>x.id===deleteTarget);$('deleteDialog').close();if(e)await detachEssay(e)};
$('clearHistory').onclick=()=>{let e=current();if(!(e.history||[]).length)return alert('当前文章还没有成绩记录。');if(confirm(`确定清空《${e.title}》的全部成绩记录吗？`)){e.history=[];e.wrong={};markChanged(e);renderHeader();renderHistory();renderList()}};
$('exportBtn').onclick=()=>{let blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='essay-moxie-backup.json';a.click();URL.revokeObjectURL(a.href)};
$('importFile').onchange=async ev=>{
  const file=ev.target.files[0];if(!file)return;
  try{
    const obj=JSON.parse(await file.text());
    if(!Array.isArray(obj.essays)||!obj.essays.length||obj.essays.some(e=>!e||typeof e.text!=='string'))throw new Error('invalid');
    if(!confirm('导入备份将替换本机文章库，是否继续？'))return;
    state=normalizeState(obj);state.essays.forEach(e=>{e.dirty=!!e.cloud});
    libraryView={...DEFAULT_VIEW};saveView();save();renderAll();
    if(loggedIn())syncSoon();
    alert('导入成功');
  }catch{alert('备份文件无效')}
  finally{ev.target.value=''}
};

let bankEntries=[],bankFileVersion=0,bankBusy=false,bankSources=[];
function bankStatus(message){$('bankImportStatus').textContent=message}
function bankBlocked(rows=[]){
  return [...state.pendingDeletes,...state.hiddenCloud,...rows.filter(r=>r.deleted_at).map(r=>r.client_id)];
}
function updateBankImport(){
  const {add,skipped}=WEBank.plan(bankEntries,state.essays,bankBlocked());
  $('bankImport').disabled=bankBusy||!add.length;
  if(bankEntries.length)bankStatus(`文件有 ${bankEntries.length} 题；本机初步检查：可新增 ${add.length} 题，跳过 ${skipped} 题。`+
     ($('bankCloud').checked?' 导入前会再检查云端。':' 仅保存到此浏览器。'));
}
$('openBank').onclick=()=>{
  if(bankBusy)return;
  bankFileVersion++;bankEntries=[];$('bankFile').value='';
  $('bankCloud').checked=loggedIn();
  $('bankCloud').disabled=!loggedIn();
  bankStatus(loggedIn()?'请选择题库文件。':'未登录。可导入本机；要直接写入云端，请先关闭并登录原账号。');
  updateBankImport();$('bankImportDialog').showModal();
};
$('bankFile').onchange=async ev=>{
  const v=++bankFileVersion;
  const file=ev.target.files[0];bankEntries=[];updateBankImport();
  if(!file){bankStatus('请选择题库文件。');return}
  bankStatus('正在检查题库…');
  try{
    if(file.size>5*1024*1024)throw new Error('WE 题库文件不能超过 5 MB。');
    const entries=WEBank.parse(await file.text());
    if(v!==bankFileVersion)return;
    bankEntries=entries;updateBankImport();
  }catch(e){if(v===bankFileVersion)bankStatus(e instanceof SyntaxError?'文件不是有效的 JSON。':e.message)}
};
$('bankCloud').onchange=updateBankImport;
$('bankImportDialog').addEventListener('cancel',event=>{if(bankBusy)event.preventDefault()});
function bankItem(e,cloud){
  return normalizeEssay({id:e.id,title:e.title,group:'WE',tags:[...e.tags,e.type,'WE 主题题库'],
    text:e.cards.length?[...new Set(e.cards.map(c=>c.point))].join('\n\n'):e.prompt,weBank:e,
    cloud,dirty:false,createdAt:now(),updatedAt:now()});
}
async function fetchBankRows(user){
  // Page through this account's records, including tombstones to avoid re-adding
  // records explicitly deleted on another device.
  const rows=[];
  const prefix='essay_records?select=client_id,payload,updated_at,deleted_at&order=client_id.asc&user_id=eq.'+encodeURIComponent(user);
  for(let page=0;page<100;page++){
    const response=await rest(prefix+'&limit=100&offset='+page*100);
    const batch=await response.json();
    if(!Array.isArray(batch))throw new Error('无法核对云端题库。');
    rows.push(...batch);
    if(batch.length<100)return rows;
  }
  throw new Error('云端题库太大，未执行导入。');
}
$('bankImport').onclick=async()=>{
  if(bankBusy||!bankEntries.length)return;
  const cloud=$('bankCloud').checked;
  bankBusy=true;$('bankImport').disabled=true;$('bankFile').disabled=true;$('bankCloud').disabled=true;$('bankClose').disabled=true;
  let saved=0,skipped=0,ok=false,writeStarted=false;
  try{
    let rows=[],user='';
    if(cloud){
      if(syncing)throw new Error('正在同步，请等同步结束后重试。');
      if(!await ensureToken()||!(user=jwtPayload(auth.access_token).sub))throw new Error('请先重新登录原账号，再导入云端。');
      bankStatus('正在核对云端已有题目…');
      rows=await fetchBankRows(user);
    }
    // Check device and cloud together. Existing rows are never sent back to the database.
    const remote=rows.filter(r=>!r.deleted_at&&r.payload).map(r=>({ ...r.payload,id:r.client_id,group:cleanGroup(r.payload.group)}));
    const plan=WEBank.plan(bankEntries,[...state.essays,...remote],bankBlocked(rows));
    skipped=plan.skipped;
    const items=plan.add.map(e=>bankItem(e,cloud));
    let add=items;
    if(cloud&&items.length){
      if(jwtPayload(auth?.access_token||'').sub!==user)throw new Error('登录账号变更，已停止导入。');
      bankStatus('正在追加新题…');
      const body=items.map(e=>({user_id:user,client_id:e.id,payload:cloudPayload(e),updated_at:e.updatedAt,deleted_at:null}));
      writeStarted=true;
      const res=await rest('essay_records?on_conflict=user_id,client_id&select=client_id',
        {method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(body)});
      const inserted=new Set((await res.json()).map(r=>r.client_id));
      add=items.filter(e=>inserted.has(e.id));
      skipped+=items.length-add.length;
    }
    if(cloud&&jwtPayload(auth?.access_token||'').sub===user)mergeRemote(rows);
    const ids=new Set(state.essays.map(e=>e.id));
    state.essays.push(...add.filter(e=>!ids.has(e.id)));
    save();renderAll();saved=add.length;ok=true;
  }catch(e){
    bankStatus(writeStarted?'未能确认导入结果：'+e.message+'。云端可能已收到；重新导入会先核对并跳过重复。':e.message);
  }finally{
    bankBusy=false;$('bankFile').disabled=false;$('bankClose').disabled=false;$('bankCloud').disabled=!loggedIn();
    if(ok){bankEntries=[];$('bankFile').value='';bankStatus(`已${cloud?'写入云端':'追加到本机'} ${saved} 题，跳过 ${skipped} 题。没有覆盖已有文章。用文章库的“标签”按主题找题。`)}
    $('bankImport').disabled=ok||!WEBank.plan(bankEntries,state.essays,bankBlocked()).add.length;
  }
};
function renderBankDetail(){
  const e=current().weBank;
  $('weBankDetail').classList.toggle('hidden',!e);
  if(!e)return;
  $('weBankPrompt').textContent=e.prompt;
  $('weBankNote').textContent=e.cards.length?'原题 · '+e.type+' · '+e.cards.length+' 张论点卡（不是完整范文）':'原题 · 原文件只有题干，可选同主题题目的素材。';
}
function bankCard(){
  return bankSources[+$('bankSource').value]?.cards[+$('bankCard').value];
}
function renderBankCard(){
  const c=bankCard();
  const lines=a=>a.map(x=>[x.zh,x.en.join(' → ')].filter(Boolean).join('\n')).join('\n');
  $('bankCardView').textContent=c?[c.point,c.reason.length?'论证：\n'+lines(c.reason):'',c.example.length?'例子：\n'+lines(c.example):''].filter(Boolean).join('\n\n'):'该题没有论点卡。可切换到同主题题目，或填入自己的论点。';
}
function renderBankSources(){
  const cards=bankSources[+$('bankSource').value]?.cards||[];
  $('bankCard').innerHTML=cards.length?cards.map((c,i)=>`<option value="${i}">${esc([c.side,c.label].filter(Boolean).join(' · '))}${c.priority?' ★':''}</option>`).join(''):'<option value="">无</option>';
  renderBankCard();
}
function bankTemplate(){
  return state.weTemplates.find(t=>t.id===$('bankTemplate').value)||{text:WEBank.paragraph};
}
function renderBankFields(){
  $('bankPreview').textContent='';
  const fields=WEBank.fields(bankTemplate().text);
  $('bankFields').innerHTML=fields.map((name,i)=>`<label class="field">${esc(name)}<textarea rows="2" maxlength="1500" data-bank-field="${i}"></textarea></label>`).join('');
  if(!fields.length){$('bankFields').textContent='这套模板未标注空格。请在“四套模板”用 {{论点}} 等标记可替换的文字，或选正文段练习。';return}
  const button=document.createElement('button');button.type='button';button.className='smallBtn';button.textContent='把选中的英文论点放入空格';
  const field=document.createElement('select');field.setAttribute('aria-label','要填入的空格');
  field.innerHTML=fields.map((name,i)=>`<option value="${i}">${esc(name)}</option>`).join('');
  button.onclick=()=>{
    const c=bankCard();if(!c)return;
    const i=+field.value;
    const area=$('bankFields').querySelector(`[data-bank-field="${i}"]`);
    area.value=c.point;area.focus();$('bankPreview').textContent='';
  };
  $('bankFields').append(field,button);
}
$('weBankPractice').onclick=()=>{
  const entry=current().weBank;if(!entry)return;
  const all=[...new Map(state.essays.filter(e=>e.weBank).map(e=>[e.weBank.id,e.weBank])).values()];
  bankSources=WEBank.related(entry,all);
  $('bankSource').innerHTML=bankSources.map((e,i)=>`<option value="${i}">${i===0?'本题：':'同主题：'}${esc(e.title)}</option>`).join('');
  $('bankTemplate').innerHTML='<option value="">正文段练习（论点 → 解释 → 例子）</option>'+
    state.weTemplates.filter(t=>t.text.trim()).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');
  renderBankSources();renderBankFields();$('bankPracticeDialog').showModal();
};
$('bankSource').onchange=renderBankSources;$('bankCard').onchange=renderBankCard;$('bankTemplate').onchange=renderBankFields;
function bankBuild(){
  const t=bankTemplate(),names=WEBank.fields(t.text);
  if(!names.length)throw new Error('请选择含可替换空格的模板。');
  const values=Object.create(null);
  for(const [i,name] of names.entries())values[name]=$('bankFields').querySelector(`[data-bank-field="${i}"]`).value;
  const {text,fixed}=WEBank.fill(t.text,values);
  const templateWords=WE.wordSpans(text).filter(w=>fixed.some(([a,b])=>w.start>=a&&w.end<=b)).map(w=>w.index);
  return {text,weParts:{source:text,confirmed:true,template:t.id?t:null,templateWords}};
}
$('bankPreviewBtn').onclick=()=>{try{$('bankPreview').textContent=bankBuild().text}catch(e){$('bankPreview').textContent=e.message}};
$('bankMake').onclick=()=>{
  try{
    const draft=bankBuild(),source=current();
    const existing=state.essays.find(e=>!e.weBank&&e.title===source.title+' · 模板练习'&&e.text===draft.text);
    if(existing){$('bankPracticeDialog').close();chooseEssay(existing.id);return}
    const item=normalizeEssay({...draft,id:'e-'+uid(),title:source.title+' · 模板练习',group:'WE',
      tags:source.tags,createdAt:now(),cloud:false});
    state.essays.unshift(item);$('bankPracticeDialog').close();chooseEssay(item.id);
  }catch(e){$('bankPreview').textContent=e.message}
};

window.addEventListener('online',()=>syncAll(true));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncAll(true)});
WE.init();renderAll();save();if(loggedIn())syncAll(true);
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
