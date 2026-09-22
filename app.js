const SUPABASE_URL='https://jszwddbnryqumbyxopzh.supabase.co';
const SUPABASE_KEY='sb_publishable_UguHYWQ7TJh-TQrbd8UkNw_7JVSRPAg';
const KEY='essay-moxie-v2',AUTH_KEY='essay-moxie-auth-v1';
const DEFAULT="In today’s fast-changing society, there is an ongoing debate about whether experiential learning can be effective in formal education. While some people believe that experiential learning is beneficial in high schools and colleges, others disagree with this idea. In this essay, I will explain why I strongly agree with this statement and provide examples to support my position.\n\nFirstly, experiential learning helps students develop practical abilities. This is because hands-on experience allows students to apply theoretical knowledge in real situations. Moreover, experiential learning can improve students’ competitiveness in the job market. Additionally, it helps students gain a deeper understanding of knowledge. For example, conducting experiments is an essential part of learning physics because students can observe scientific principles directly rather than simply reading about them in textbooks.\n\nOn the other hand, in some cases, some people believe that experiential learning is not efficient. For instance, it often requires more time and resources than traditional classroom teaching. However, this view overlooks the fact that experiential learning usually produces better learning outcomes and helps students retain knowledge for a longer period of time.\n\nIn conclusion, while it is true that experiential learning may require additional time and effort, its benefits far outweigh the drawbacks. Therefore, I strongly agree that experiential learning is beneficial in high schools and colleges because it promotes practical skills, deeper understanding, and greater competitiveness in the job market.";
const $=id=>document.getElementById(id),now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(16).slice(2);
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{essays:[{id:'demo',title:'Experiential Learning',text:DEFAULT,history:[],wrong:{}}],current:'demo'};
let auth=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');
let pct=40,answers=[],editing=null,deleteTarget=null,wrongPriority=false,syncing=false;

state.hiddenCloud=state.hiddenCloud||[];state.pendingDeletes=state.pendingDeletes||[];
state.essays=(state.essays||[]).map(e=>({...e,id:e.id||uid(),history:e.history||[],wrong:e.wrong||{},cloud:!!e.cloud,dirty:!!e.dirty,updatedAt:e.updatedAt||now()}));
if(!state.essays.length)state.essays=[{id:'demo-'+uid(),title:'Experiential Learning',text:DEFAULT,history:[],wrong:{},cloud:false,dirty:false,updatedAt:now()}];
if(!state.essays.some(e=>e.id===state.current))state.current=state.essays[0].id;

function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function saveAuth(){auth?localStorage.setItem(AUTH_KEY,JSON.stringify(auth)):localStorage.removeItem(AUTH_KEY)}
function current(){return state.essays.find(x=>x.id===state.current)||state.essays[0]}
function words(s){return s.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]/g)||[]}
function norm(s){return(s||'').toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'-]/g,'')}
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
function renderList(){
  $('essayList').innerHTML=state.essays.map(e=>`<div class="essayItem ${e.id===state.current?'active':''}" data-id="${esc(e.id)}"><div class="row"><b class="grow">${esc(e.title)}</b><button class="status ${e.cloud?(e.dirty?'pending':'cloud'):''}" data-cloud="${esc(e.id)}">${e.cloud?(e.dirty?'待同步':'☁ 已同步'):'仅本机'}</button></div><div class="muted">${e.history.length} 次练习 · ${words(e.text).filter(x=>/[A-Za-z0-9]/.test(x)).length} 词</div></div>`).join('');
  document.querySelectorAll('.essayItem').forEach(el=>el.onclick=ev=>{if(ev.target.closest('[data-cloud]'))return;state.current=el.dataset.id;save();renderAll();$('library').classList.add('hidden')});
  document.querySelectorAll('[data-cloud]').forEach(el=>el.onclick=async()=>{let e=state.essays.find(x=>x.id===el.dataset.cloud);if(!loggedIn()){openAuth();return}if(!e.cloud){e.cloud=true;e.dirty=true;markChanged(e);renderList();await syncAll()}else if(confirm('取消这篇文章的云同步并保留本地副本？云端版本将从其他设备删除。'))await detachEssay(e)});
}
function renderHeader(){let e=current();$('currentTitle').textContent=e.title;let h=e.history||[];$('progressText').textContent=(e.cloud?'☁ 云同步 · ':'仅本机 · ')+(h.length?`最近：${h[0].pct}% 空白 · ${h[0].score.toFixed(1)} 分`:'还没有练习记录')}
function shouldHide(token,e){if(!/[A-Za-z0-9]/.test(token))return false;let base=pct/100;if(wrongPriority&&(e.wrong[norm(token)]||0)>0)base=Math.min(1,base+.35);return Math.random()<base}
function renderPractice(){
  answers=[];$('resultCard').classList.add('hidden');let e=current(),mode=$('mode').value;
  if(pct===100&&mode==='full'){$('practice').innerHTML='<textarea id="full" class="full" placeholder="从头默写整篇作文…" spellcheck="false"></textarea>';return}
  let toks=e.text.split(/(\s+)/),html='',hint=$('hint').value;
  toks.forEach(chunk=>{if(/^\s+$/.test(chunk)){html+=chunk.includes('\n')?chunk.replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>'):' ';return}words(chunk).forEach(t=>{if(!/[A-Za-z0-9]/.test(t)){html+=esc(t);return}let hide=pct===100||shouldHide(t,e);if(hide){let i=answers.length;answers.push(t);let ph=hint==='first'?t[0]+'…':'';let w=Math.max(56,Math.min(155,t.length*9+22));html+=`<input class="blank" data-i="${i}" style="width:${w}px" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false">`}else html+=esc(t)})});
  $('practice').innerHTML=html;let ins=[...document.querySelectorAll('.blank')];ins.forEach((el,i)=>el.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();ins[i+1]?.focus()}}));
}
function alignScore(expected,typed){let a=expected.map(norm).filter(Boolean),b=typed.map(norm).filter(Boolean),n=a.length,m=b.length,dp=Array.from({length:n+1},()=>Array(m+1).fill(0));for(let i=0;i<=n;i++)dp[i][0]=i;for(let j=0;j<=m;j++)dp[0][j]=j;for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return{score:Math.max(0,(1-dp[n][m]/Math.max(1,n))*100),distance:dp[n][m],total:n}}
function submit(){
  let e=current(),score=0,total=0,wrong=[];
  if(pct===100&&$('mode').value==='full'){let ex=words(e.text).filter(x=>/[A-Za-z0-9]/.test(x)),ty=words($('full').value).filter(x=>/[A-Za-z0-9]/.test(x)),r=alignScore(ex,ty);score=r.score;total=r.total;for(let i=0;i<Math.min(ex.length,ty.length);i++)if(norm(ex[i])!==norm(ty[i])&&wrong.length<15){wrong.push(`${ty[i]||'∅'} → ${ex[i]}`);e.wrong[norm(ex[i])]=(e.wrong[norm(ex[i])]||0)+1}}
  else{let ins=[...document.querySelectorAll('.blank')],correct=0;total=answers.length;ins.forEach((el,i)=>{if(norm(el.value)===norm(answers[i])){correct++;el.style.borderBottomColor='#12b76a'}else{el.style.borderBottomColor='#f04438';e.wrong[norm(answers[i])]=(e.wrong[norm(answers[i])]||0)+1;if(wrong.length<15)wrong.push(`${el.value||'∅'} → ${answers[i]}`)}});score=total?correct/total*100:100}
  e.history=e.history||[];e.history.unshift({id:uid(),date:now(),pct,score});e.history=e.history.slice(0,50);markChanged(e);$('score').innerHTML=`得分 <span class="${score>=90?'good':'bad'}">${score.toFixed(1)}%</span>`;$('detail').textContent=wrong.length?'错词示例：'+wrong.join(' ｜ '):'全部正确 🎉';$('resultCard').classList.remove('hidden');renderHeader();renderHistory();renderList();$('resultCard').scrollIntoView({behavior:'smooth'})
}
function renderHistory(){let h=current().history||[];$('history').innerHTML=h.length?h.slice(0,8).map(x=>`<div class="history">${new Date(x.date).toLocaleString()} · ${x.pct}% 空白 · <b>${x.score.toFixed(1)}</b></div>`).join(''):'<div class="muted" style="margin-top:8px">完成一次练习后会记录在这里。</div>'}
function updateControls(){let full=pct===100;$('mode').disabled=!full;$('mode').title=full?'选择 100% 默写方式':'仅在空白率为 100% 时可选择';if(!full)$('mode').value='grid';$('hint').disabled=full&&$('mode').value==='full'}
function applyHint(){let first=$('hint').value==='first';document.querySelectorAll('.blank').forEach(el=>{let a=answers[Number(el.dataset.i)]||'';el.placeholder=first&&a?a[0]+'…':''})}
function renderAll(){renderList();renderHeader();updateAccountUI();updateControls();renderPractice();renderHistory()}

async function authRequest(path,body){let r=await fetch(SUPABASE_URL+path,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.msg||data.message||data.error_description||'请求失败');return data}
async function ensureToken(){if(!auth)return false;let p=jwtPayload(auth.access_token);if((p.exp||0)*1000>Date.now()+60000)return true;try{let d=await authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:auth.refresh_token});auth={...d,user:d.user||auth.user};saveAuth();return true}catch{auth=null;saveAuth();updateAccountUI();return false}}
async function rest(path,options={}){if(!await ensureToken())throw new Error('请重新登录');let r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{...options,headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json',...(options.headers||{})}});if(!r.ok){let d=await r.json().catch(()=>({}));throw new Error(d.message||d.hint||'云端请求失败')}return r}
function cloudPayload(e){return{title:e.title,text:e.text,history:e.history||[],wrong:e.wrong||{}}}
async function uploadEssay(e){let user=jwtPayload(auth.access_token).sub;if(!user)throw new Error('登录信息无效');let row={user_id:user,client_id:e.id,payload:cloudPayload(e),updated_at:e.updatedAt||now(),deleted_at:null};await rest('essay_records?on_conflict=user_id,client_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([row])});e.dirty=false;save()}
async function pushDelete(id){await rest('essay_records?client_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({deleted_at:now(),updated_at:now()})})}
function mergeRemote(rows){
  rows.forEach(r=>{let local=state.essays.find(e=>e.id===r.client_id),remoteTime=Date.parse(r.updated_at||0),localTime=Date.parse(local?.updatedAt||0);if(r.deleted_at){if(local?.cloud&&remoteTime>=localTime)state.essays=state.essays.filter(e=>e.id!==r.client_id);return}if(state.hiddenCloud.includes(r.client_id))return;let incoming={id:r.client_id,title:r.payload.title,text:r.payload.text,history:r.payload.history||[],wrong:r.payload.wrong||{},cloud:true,dirty:false,updatedAt:r.updated_at};if(!local)state.essays.push(incoming);else if(local.cloud&&!local.dirty&&remoteTime>localTime)Object.assign(local,incoming)});
  if(!state.essays.length)state.essays.push({id:'local-'+uid(),title:'新作文',text:'请点击编辑文章并粘贴作文原文。',history:[],wrong:{},cloud:false,dirty:false,updatedAt:now()});if(!state.essays.some(e=>e.id===state.current))state.current=state.essays[0].id;
}
async function syncAll(silent=false){
  if(!loggedIn()||syncing)return;if(!navigator.onLine){setSyncStatus('','离线 · 更改将在联网后同步');return}syncing=true;setSyncStatus('busy','正在同步…');
  try{if(!await ensureToken())throw new Error('登录已过期');for(let id of [...state.pendingDeletes]){await pushDelete(id);state.pendingDeletes=state.pendingDeletes.filter(x=>x!==id);save()}for(let e of state.essays.filter(x=>x.cloud&&x.dirty))await uploadEssay(e);let r=await rest('essay_records?select=client_id,payload,updated_at,deleted_at&order=updated_at.asc'),rows=await r.json();mergeRemote(rows);save();renderAll();setSyncStatus('ok','已同步 · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));if(!silent)alert('同步完成')}
  catch(err){setSyncStatus('','同步失败 · 本地数据已保留');if(!silent)alert(err.message)}finally{syncing=false}
}
let syncTimer;function syncSoon(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncAll(true),800)}
function openAuth(){updateAccountUI();$('authDialog').showModal()}
async function login(){let email=$('authEmail').value.trim(),password=$('authPassword').value;if(!email||password.length<6)return alert('请输入邮箱和至少6位密码');try{let d=await authRequest('/auth/v1/token?grant_type=password',{email,password});auth=d;saveAuth();updateAccountUI();await syncAll(true);$('authDialog').close();renderAll()}catch(e){alert(e.message)}}
async function signup(){let email=$('authEmail').value.trim(),password=$('authPassword').value;if(!email||password.length<6)return alert('请输入邮箱和至少6位密码');try{let d=await authRequest('/auth/v1/signup',{email,password});if(d.access_token){auth=d;saveAuth();updateAccountUI();await syncAll(true);$('authDialog').close()}else alert('注册成功，请先到邮箱完成验证，然后回来登录。')}catch(e){alert(e.message)}}
function logout(){auth=null;saveAuth();updateAccountUI();$('authDialog').close();renderList()}
async function detachEssay(e){let old=e.id;if(e.cloud){state.pendingDeletes.push(old);state.hiddenCloud.push(old)}e.id='local-'+uid();e.cloud=false;e.dirty=false;e.updatedAt=now();state.current=e.id;save();renderAll();await syncAll(true)}
function askDelete(id){deleteTarget=id;let e=state.essays.find(x=>x.id===id);if(!e)return;if(!e.cloud){if(confirm(`确定删除《${e.title}》吗？成绩和错词也会一起删除。`))removeLocal(id);return}$('deleteTitle').textContent=`《${e.title}》已开启云同步，请选择删除范围。`;$('deleteDialog').showModal()}
function removeLocal(id){state.essays=state.essays.filter(e=>e.id!==id);if(!state.essays.length)state.essays.push({id:'local-'+uid(),title:'新作文',text:'请点击编辑文章并粘贴作文原文。',history:[],wrong:{},cloud:false,dirty:false,updatedAt:now()});state.current=state.essays[0].id;save();$('editor').classList.add('hidden');renderAll()}

document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{pct=+b.dataset.p;document.querySelectorAll('[data-p]').forEach(x=>x.classList.toggle('active',x===b));updateControls();renderPractice()});
$('hint').onchange=applyHint;$('mode').onchange=()=>{updateControls();renderPractice()};$('regen').onclick=renderPractice;$('submit').onclick=submit;
$('libraryBtn').onclick=()=>$('library').classList.toggle('hidden');$('accountBtn').onclick=openAuth;$('loginBtn').onclick=login;$('signupBtn').onclick=signup;$('logoutBtn').onclick=logout;$('syncNowBtn').onclick=()=>syncAll();
$('uploadAllBtn').onclick=async()=>{if(confirm('将当前所有仅本机文章上传到云端？')){state.essays.forEach(e=>{e.cloud=true;e.dirty=true;e.updatedAt=now()});save();renderList();await syncAll()}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('wrongBtn').onclick=()=>{wrongPriority=!wrongPriority;$('wrongBtn').classList.toggle('primary',wrongPriority);renderPractice()};
$('addBtn').onclick=()=>{editing=null;$('editTitle').value='';$('editText').value='';$('editCloud').checked=false;$('deleteEssay').classList.add('hidden');$('editor').classList.remove('hidden')};$('cancelEdit').onclick=()=>$('editor').classList.add('hidden');
function openCurrentEditor(){let e=current();editing=e.id;$('editTitle').value=e.title;$('editText').value=e.text;$('editCloud').checked=e.cloud;$('deleteEssay').classList.toggle('hidden',false);$('editor').classList.remove('hidden')}
$('saveEssay').onclick=async()=>{let title=$('editTitle').value.trim(),text=$('editText').value.trim(),wantCloud=loggedIn()&&$('editCloud').checked;if(!title||!text)return alert('请填写标题和作文原文');if(editing){let e=state.essays.find(x=>x.id===editing);if(e.cloud&&!wantCloud){e.title=title;e.text=text;await detachEssay(e)}else{e.title=title;e.text=text;e.cloud=wantCloud;markChanged(e)}}else{let id='e-'+uid();state.essays.unshift({id,title,text,history:[],wrong:{},cloud:wantCloud,dirty:wantCloud,updatedAt:now()});state.current=id;save();if(wantCloud)syncSoon()}$('editor').classList.add('hidden');renderAll()};
$('currentTitle').onclick=openCurrentEditor;$('editCurrent').onclick=openCurrentEditor;$('deleteCurrent').onclick=()=>askDelete(current().id);$('deleteEssay').onclick=()=>askDelete(editing);
$('deleteLocalOnly').onclick=()=>{state.hiddenCloud.push(deleteTarget);$('deleteDialog').close();removeLocal(deleteTarget)};
$('deleteEverywhere').onclick=()=>{state.pendingDeletes.push(deleteTarget);$('deleteDialog').close();removeLocal(deleteTarget);syncSoon()};
$('detachCloud').onclick=async()=>{let e=state.essays.find(x=>x.id===deleteTarget);$('deleteDialog').close();if(e)await detachEssay(e)};
$('clearHistory').onclick=()=>{let e=current();if(!(e.history||[]).length)return alert('当前文章还没有成绩记录。');if(confirm(`确定清空《${e.title}》的全部成绩记录吗？`)){e.history=[];e.wrong={};markChanged(e);renderHeader();renderHistory();renderList()}};
$('exportBtn').onclick=()=>{let blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='essay-moxie-backup.json';a.click();URL.revokeObjectURL(a.href)};
$('importFile').onchange=async ev=>{try{let obj=JSON.parse(await ev.target.files[0].text());if(!obj.essays?.length)throw 0;state={...obj,hiddenCloud:obj.hiddenCloud||[],pendingDeletes:obj.pendingDeletes||[]};state.essays=state.essays.map(e=>({...e,history:e.history||[],wrong:e.wrong||{},cloud:!!e.cloud,dirty:!!e.cloud,updatedAt:e.updatedAt||now()}));save();renderAll();alert('导入成功，云端文章将在联网后同步')}catch{alert('备份文件无效')}};
window.addEventListener('online',()=>syncAll(true));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncAll(true)});
renderAll();save();if(loggedIn())syncAll(true);
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
