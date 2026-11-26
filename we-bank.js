// Private WE banks are loaded from a file in the browser, never from the public site.
const WEBank=(()=>{
  const paragraph='{{论点}} This is because {{解释}}. For example, {{例子}}.';
  const slotPattern=()=>/\{\{([^{}\n]+)\}\}|\[([^\]\n]+)\]|【([^】\n]+)】/g;
  const key=s=>s.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'');
  const titleKey=s=>key(s.replace(/^\s*(?:WE\s*)?(?:#?\d+\s*[.、．:：\-]\s*)?/i,''));
  const validText=(s,max)=>typeof s==='string'&&s.trim()!==''&&s.length<=max;
  const validChain=a=>Array.isArray(a)&&a.length<=10&&a.every(c=>c&&typeof c.zh==='string'&&c.zh.length<=1000&&Array.isArray(c.en)&&c.en.length<=15&&c.en.every(s=>validText(s,600)));
  const validEntry=e=>e&&/^we-bank-[a-z0-9-]{1,50}$/.test(e.id)&&Number.isInteger(e.n)&&e.n>0&&e.n<=999&&
    typeof e.code==='string'&&/^\d{0,12}$/.test(e.code)&&validText(e.title,150)&&validText(e.prompt,4000)&&
    validText(e.type,40)&&Array.isArray(e.tags)&&e.tags.length>0&&e.tags.length<=12&&e.tags.every(s=>validText(s,40))&&
    Array.isArray(e.cards)&&e.cards.length<=35&&e.cards.every(c=>c&&typeof c.side==='string'&&c.side.length<=160&&validText(c.label,150)&&validText(c.point,1500)&&validChain(c.reason)&&validChain(c.example));
  function parse(raw){
    const obj=JSON.parse(raw.replace(/^\uFEFF/,''));
    if(obj?.format!=='essay-moxie-we-bank-v1'||!Array.isArray(obj.entries)||!obj.entries.length||obj.entries.length>200||!obj.entries.every(validEntry))
      throw new Error('题库格式不正确。请选择 WE 题库文件，不是整站备份。');
    return obj.entries;
  }
  function plan(entries,existing,blocked=[]){
    const ids=new Set([...existing.map(e=>e.id),...blocked]);
    const titles=new Set(existing.filter(e=>e.group==='WE').map(e=>titleKey(e.title)));
    const prompts=new Set(existing.filter(e=>e.weBank?.prompt).map(e=>key(e.weBank.prompt)));
    const codes=new Set(existing.filter(e=>e.weBank?.code).map(e=>e.weBank.code));
    const add=[];
    for(const e of entries){
      const title=titleKey(e.title),prompt=key(e.prompt);
      if(ids.has(e.id)||titles.has(title)||prompts.has(prompt)||(e.code&&codes.has(e.code)))continue;
      add.push(e);ids.add(e.id);titles.add(title);prompts.add(prompt);if(e.code)codes.add(e.code);
    }
    return {add,skipped:entries.length-add.length};
  }
  function fields(template){return [...new Set([...template.matchAll(slotPattern())].map(m=>(m[1]||m[2]||m[3]).trim()).filter(Boolean))]}
  function fill(template,values){
    const fixed=[];
    let text='',last=0;
    function appendFixed(s){if(s){fixed.push([text.length,text.length+s.length]);text+=s}}
    for(const m of template.matchAll(slotPattern())){
      appendFixed(template.slice(last,m.index));
      const v=values[(m[1]||m[2]||m[3]).trim()]?.trim();
      if(!v)throw new Error('请填完模板空格再生成练习。');
      text+=v;last=m.index+m[0].length;
    }
    appendFixed(template.slice(last));
    return {text,fixed};
  }
  function related(entry,all){
    return [entry,...all.filter(e=>e.id!==entry.id&&e.cards.length&&e.tags.some(t=>entry.tags.includes(t)))];
  }
  return {paragraph,validEntry,parse,plan,fields,fill,related};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WEBank;
