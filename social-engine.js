import {awardFragment} from './variety-engine.js';
import {nextRandom} from './rng.js';
import {ECON,QUALITY_ORDER} from './economy.js';
import {clampRep} from './event-engine.js';
import {readGranary,depositTo,saveGranary,GRANARY_TIERS} from './granary.js';
import {currentSlot} from './storage.js';

// 社交引擎没有自己的 log 助手（note 在 farm-engine 里，反向引用会成环），就地写一个同样的。
function note(s,t){s.log.unshift(t);s.log=s.log.slice(0,8)}

export function newSocial(){return {poster:null,adoptions:[],waterBonus:0,shipments:0,coopPoints:0,tasks:[],tools:[],pk:null,trialBoost:false};}

// —— 包 K（第十四轮）：协作任务。两种任务，各有自己的结算时机 ——
// pest  ：指派即生效（本季虫害立刻降 15），季末结工给分。
// trial ：季末才掷骰，成了给「下一回收割品质抬一档」，四回里成三回。
export const TASK_TYPES={
 pest:{id:'pest',name:'盯虫害',word:'替你守一季田，本季虫害立刻降 15。',points:8,when:'now'},
 trial:{id:'trial',name:'试种新品种',word:'替你试一茬新种，秋收时品质抬一档——四回里成三回。',points:12,failPoints:3,when:'late'},
}
export const TASK_IDS=Object.keys(TASK_TYPES);

// —— 协作积分能换的东西 ——
export const REDEEMABLES=[
 {id:'seed',name:'御稻米稻种 ×3',cost:20,word:'从公中匀三份稻种给你。'},
 {id:'wen',name:'银钱 300 文',cost:15,word:'乡亲凑了三百文，算你替大家看田的谢礼。'},
 {id:'frag',name:'耕织图碎片 ×1',cost:30,word:'谁会不留着一片老画呢。'},
]
const REDEEM_MAP=Object.fromEntries(REDEEMABLES.map(r=>[r.id,r]));

// —— 稻田 PK 赢来的「御赐农具」。一件一次性，用完即消失。——
export const TOOL_KINDS={
 yield10:{id:'yield10',name:'御赐犁头',word:'下一次秋收，亩产多收一成。',when:'harvest'},
 pest20:{id:'pest20',name:'御赐药锄',word:'一用之下，本季虫害立降 20。',when:'now'},
}
const TOOL_IDS=Object.keys(TOOL_KINDS);
const Q_RANK=Object.fromEntries(QUALITY_ORDER.map((q,i)=>[q,i]));

export function normalizeSocial(s){
 if(s===undefined)return newSocial();
 if(!s||!Array.isArray(s.adoptions)||s.adoptions.some(a=>!a||typeof a.friend!=='string'||typeof a.variety!=='string'||!Number.isSafeInteger(a.m2)||a.m2!==1)||!Number.isSafeInteger(s.waterBonus)||s.waterBonus<0||!Number.isSafeInteger(s.shipments)||s.shipments<0)return null;
 // —— 包 K：v10 及以前的社交簿只有认养那几栏。协作这几栏缺了要补默认值，绝不能判成坏档。——
 if(!Number.isSafeInteger(s.coopPoints)||s.coopPoints<0)s.coopPoints=0;
 if(!Array.isArray(s.tasks)||s.tasks.some(t=>!t||typeof t.friend!=='string'||!TASK_TYPES[t.type]||!['running','done','failed'].includes(t.status)||!Number.isSafeInteger(t.year)||!['spring','summer','autumn','winter'].includes(t.season)))s.tasks=[]
 else s.tasks=s.tasks.map(t=>({friend:t.friend.slice(0,20),type:t.type,status:t.status,year:t.year,season:t.season}))
 if(!Array.isArray(s.tools)||s.tools.some(t=>!t||!TOOL_KINDS[t.kind]))s.tools=[]
 else s.tools=s.tools.map((t,i)=>({id:typeof t.id==='string'&&t.id?t.id:`tool${i}`,kind:t.kind,armed:t.armed===true}))
 if(s.trialBoost!==true)s.trialBoost=false;
 if(!s.pk||typeof s.pk!=='object'||typeof s.pk.code!=='string')s.pk=null;
 else s.pk={code:s.pk.code,atYear:s.pk.atYear,atSeason:s.pk.atSeason,metrics:s.pk.metrics,foe:s.pk.foe||null,result:s.pk.result||null,doneSeason:s.pk.doneSeason||null};
 return s;
}

/* ================= 协作任务 ================= */
const seasonKey=s=>`${s.year}-${s.season}`;

function doTask(current,action){
 const s=structuredClone(current);s.social??=newSocial();const x=s.social;let error=null
 const def=TASK_TYPES[action.task]
 if(!action.friend||!String(action.friend).trim())error='请先写下这位好友的昵称。'
 else if(!def)error='没有这种协作任务。'
 else if(!x.adoptions.some(a=>a.friend===action.friend))error='这位还不是认养好友。先请他认养一平米，才谈得上搭把手。'
 else if(x.tasks.some(t=>t.friend===action.friend&&t.status==='running'))error='这位好友手上还压着一桩活，等这季做完再说。'
 else{
  const friend=x.adoptions.find(a=>a.friend===action.friend).friend
  x.tasks.push({friend,type:def.id,status:'running',year:s.year,season:s.season})
  if(def.when==='now'&&def.id==='pest'){
   const before=Math.round(s.pests);s.pests=Math.max(0,Math.round(s.pests)-15)
   note(s,`${friend}挽起袖子下了田，一垄一垄翻叶背捉虫——本季虫害从 ${before} 降到 ${Math.round(s.pests)}，季末再记你这笔人情。`)
  }else note(s,`${friend}应下了「${def.name}」这桩活：${def.word}`)
 }
 return error?{state:current,error}:{state:s,error:null}
}

// 季末结工：由 farm-engine 在新一季开局时调用（这里只认「任务所属的那一季已经过完了」）。
export function settleCoopTasks(s){
 const x=s.social;if(!x||!Array.isArray(x.tasks))return [];
 const lines=[]
 for(const t of x.tasks){
  if(t.status!=='running'||t.season===s.season)continue
  const def=TASK_TYPES[t.type];if(!def)continue
  if(t.type==='trial'){
   if(nextRandom(s)<.25){t.status='failed';x.coopPoints+=def.failPoints;lines.push(`试种没成：${t.friend}试的那一茬没能挺过去（协作积分 +${def.failPoints}，好歹把种子留下了一袋。）`)}
   else{t.status='done';x.trialBoost=true;x.coopPoints+=def.points;lines.push(`试种成了：${t.friend}替你试的那一茬长住了，下一回收割品质抬一档（协作积分 +${def.points}）。`)}
  }else{
   t.status='done';x.coopPoints+=def.points;lines.push(`${def.name}结工：${t.friend}替你整整看了一季田（协作积分 +${def.points}）。`)
  }
 }
 for(const l of lines)note(s,l)
 return lines
}

function redeem(current,action){
 const s=structuredClone(current);s.social??=newSocial();const x=s.social;let error=null
 const r=REDEEM_MAP[action.what]
 if(!r)error='积分换不了这个。'
 else if(x.coopPoints<r.cost)error=`${r.name}要 ${r.cost} 点协作积分，手上只有 ${x.coopPoints} 点。`
 else{
  x.coopPoints-=r.cost
  if(r.id==='seed'){s.seedBag??={};const b=s.seedBag.royal||0;s.seedBag.royal=Math.min(ECON.seedCap,b+3);note(s,`用 ${r.cost} 点协作积分换来御稻米稻种 3 份（现有 ${s.seedBag.royal} 份）。`)}
  else if(r.id==='wen'){s.sales??={wen:0};s.sales.wen=(s.sales.wen||0)+300;note(s,`用 ${r.cost} 点协作积分换来三百文谢礼（现有 ${s.sales.wen} 文）。`)}
  else{awardFragment(s,'social');note(s,`用 ${r.cost} 点协作积分换来一片耕织图碎片。`)}
 }
 return error?{state:current,error}:{state:s,error:null}
}

/* ================= 稻田 PK ================= */
// 本机数据：生态 / 上一季实收产量 / 上一季品质。三项一比，各得 1 分，2 分以上获胜。
export function pkMetrics(s){
 const last=(s.harvested&&s.result)||(Array.isArray(s.history)&&s.history[0])||null
 return {n:s.year,e:Math.round(s.ecology||0),y:last?Math.round(last.yieldKg||0):0,q:last?last.quality:'劣'}
}
const b64e=t=>btoa(String.fromCharCode(...new TextEncoder().encode(t)))
const b64d=t=>new TextDecoder().decode(Uint8Array.from(atob(t),c=>c.charCodeAt(0)))
export function pkCode(s){return 'JXPK-'+b64e(JSON.stringify(pkMetrics(s))).replace(/=+$/,'')}
export function pkRead(code){
 try{
  const raw=String(code||'').trim().replace(/\s+/g,'')
  if(!/^JXPK-/.test(raw))return null
  const o=JSON.parse(b64d(raw.slice(5)))
  if(!o||!Number.isFinite(o.n)||!Number.isFinite(o.e)||!Number.isFinite(o.y)||!QUALITY_ORDER.includes(o.q))return null
  if(o.e<0||o.e>100||o.y<0||o.n<1)return null
  return {n:Math.floor(o.n),e:Math.floor(o.e),y:Math.floor(o.y),q:o.q}
 }catch{return null}
}
export function pkCompare(mine,foe){
 const lines=[],score=[0,0]
 const add=(label,a,b,fmt=v=>String(v))=>{
  const w=a===b?0:(a>b?1:2)
  if(w===1)score[0]++;else if(w===2)score[1]++
  lines.push(`${label}：你 ${fmt(a)}　对方 ${fmt(b)}　—　${w===0?'平':w===1?'你胜':'对方胜'}`)
 }
 add('生态值',mine.e,foe.e)
 add('上一季实收',mine.y,foe.y,v=>v+' kg')
 add('上一季品质',Q_RANK[mine.q]??0,Q_RANK[foe.q]??0,v=>QUALITY_ORDER[v]||'劣')
 return {score,win:score[0]>=2,tie:score[0]===score[1],lines,foe}
}

function pk(current,action){
 const s=structuredClone(current);s.social??=newSocial();const x=s.social;let error=null
 if(action.type==='social:pk-code'){
  x.pk={code:pkCode(s),atYear:s.year,atSeason:s.season,metrics:pkMetrics(s),foe:x.pk?.foe||null,result:x.pk?.result||null,doneSeason:x.pk?.doneSeason||null}
  note(s,`本机年景已封成一枚分享码：${x.pk.code}。把它发给朋友，让他把码贴回来。`)
 }else{
  if(x.pk?.result&&x.pk.doneSeason===seasonKey(s))error='这一季已经比过一场了，等下一季再约。'
  else{
   const foe=pkRead(action.code)
   if(!foe)error='这串码读不出来——确认是「JXPK-」开头、没被聊天软件折断的那一整串。'
   else{
    const mine=pkMetrics(s),r=pkCompare(mine,foe)
    const toolId=`t${s.year}${['spring','summer','autumn','winter'].indexOf(s.season)}-${nextRandom(s).toString(36).slice(2,7)}`
    let tool=null
    if(r.win){const kind=TOOL_IDS[Math.floor(nextRandom(s)*TOOL_IDS.length)%TOOL_IDS.length];tool={id:toolId,kind,armed:false};x.tools.push(tool)}
    x.pk={code:action.code,atYear:s.year,atSeason:s.season,metrics:mine,foe,result:{...r,tool:tool?tool.kind:null},doneSeason:seasonKey(s)}
    note(s,`与${foe.n}年那位朋友比了一场：生态 ${mine.e}／${foe.e}、实收 ${mine.y}／${foe.y} kg、品质 ${mine.q}／${foe.q}——${r.win?'你赢了':r.tie?'打平':'你输了'}（${r.score[0]} : ${r.score[1]}）。`)
    if(tool)note(s,`赢了这场，乡里送来一件御赐农具：${TOOL_KINDS[tool.kind].name}——${TOOL_KINDS[tool.kind].word}`)
   }
  }
 }
 return error?{state:current,error}:{state:s,error:null}
}

function useTool(current,action){
 const s=structuredClone(current);s.social??=newSocial();const x=s.social;let error=null
 const i=x.tools.findIndex(t=>t.id===action.tool)
 if(i<0)error='这件农具不在手上——它可能已经用掉了。'
 else{
  const t=x.tools[i],k=TOOL_KINDS[t.kind]
  if(k.when==='now'){
   const before=Math.round(s.pests);s.pests=Math.max(0,Math.round(s.pests)-20);x.tools.splice(i,1)
   note(s,`${k.name}使过一回：本季虫害从 ${before} 降到 ${Math.round(s.pests)}，器物也就此用尽。`)
  }else{
   for(const o of x.tools)o.armed=false;t.armed=true
   note(s,`${k.name}已挂在犁上——${k.word}用完就没了，赶在下一次秋收前别浪费。`)
  }
 }
 return error?{state:current,error}:{state:s,error:null}
}

/* ================= 跨时空粮仓 ================= */
function contribute(current,action){
 const s=structuredClone(current);s.social??=newSocial();const x=s.social;let error=null
 const kg=Math.floor(Number(action.kg))
 if(!Number.isInteger(kg)||kg<=0)error='要倒进去的斤两得是个正整数。'
 else if(kg>Math.floor(s.rice||0))error=`仓里只剩 ${Math.floor(s.rice||0)} kg 稻米，倒不出 ${kg} kg。`
 else{
  const slot=currentSlot()??1
  const {granary,crossed}=depositTo(readGranary(),slot,kg)
  if(!saveGranary(granary))error='粮仓的账写不进去：浏览器存储可能满了。'
  else{
   s.rice-=kg
   note(s,`往跨时空粮仓倒了 ${kg} kg 稻米（你这档累计 ${granary.slots[String(slot)]} kg，仓里共 ${granary.total} kg）。`)
   for(const t of crossed){
    if(t.id==='archive'){awardFragment(s,'social');awardFragment(s,'social');awardFragment(s,'social');note(s,`粮仓满 ${t.kg} kg，解锁「${t.name}」——三片耕织图碎片随信送到。`)}
    else if(t.id==='plaque'){s.reputation=clampRep((s.reputation??50)+20);note(s,`粮仓满 ${t.kg} kg，御赐匾额挂上了门楣——声望 +20。`)}
    else note(s,`粮仓满 ${t.kg} kg，解锁「${t.name}」——往后每一季开局，公中都会匀你两份御稻米稻种。`)}
  }
 }
 return error?{state:current,error}:{state:s,error:null}
}

/* ================= 给 farm-engine 用的两个钩子 ================= */
// 秋收落账前取一次：试种的品质抬档 + 御赐犁头的产量加成。取完即消耗。
export function socialHarvestBonus(s){
 const x=s.social;const out={qualityUp:0,yieldMul:1,words:[]}
 if(!x)return out
 if(x.trialBoost){
  out.qualityUp=1;x.trialBoost=false
  out.words.push('试种的那一茬果然争气：这一季的谷子品质抬了一档。')
 }
 const i=(x.tools||[]).findIndex(t=>t.armed&&TOOL_KINDS[t.kind]?.when==='harvest')
 if(i>=0){
  const t=x.tools[i],k=TOOL_KINDS[t.kind]
  out.yieldMul=1.1;x.tools.splice(i,1)
  out.words.push(`${k.name}挂在犁上用了这一回，亩产多收一成，器物随即报废。`)
 }
 return out
}
export function stepQuality(quality,up=1){
 const i=Q_RANK[quality];if(i===undefined)return quality
 return QUALITY_ORDER[Math.min(QUALITY_ORDER.length-1,i+up)]
}
export function coopSummary(s){
 const x=s.social||newSocial()
 return {points:x.coopPoints,running:x.tasks.filter(t=>t.status==='running').length,done:x.tasks.filter(t=>t.status!=='running').length,tools:x.tools.length,tiers:GRANARY_TIERS.length}
}

export function reduceSocial(current,action){const s=structuredClone(current);s.social??=newSocial();const x=s.social;let error=null;const fail=t=>error=t;
 if(action.type==='social:poster'){x.poster={season:s.season,code:`JX-${s.year}-${Math.random().toString(36).slice(2,8).toUpperCase()}`};s.log.unshift(`时空求助海报已生成：${x.poster.code}。`);}
 else if(action.type==='social:adopt'){if(!action.friend||!action.variety)fail('请填写好友昵称和认养品种。');else if(x.adoptions.some(a=>a.friend===action.friend))fail('该好友已经认养过一平米。');else{x.adoptions.push({friend:String(action.friend).slice(0,20),variety:String(action.variety),m2:1,watered:0});s.log.unshift(`${action.friend} 认养 1 平米${action.variety}稻田。`);if(nextRandom(s)<.5)awardFragment(s,'social');}}
 else if(action.type==='social:water'){const a=x.adoptions.find(a=>a.friend===action.friend);if(!a)fail('找不到这位认养好友。');else{a.watered++;x.waterBonus++;s.log.unshift(`好友浇水：现代水源加成 +1（累计 ${x.waterBonus}）。`);}}
 else if(action.type==='social:ship'){if(!s.harvested)fail('秋收后才能寄出真实京西稻米。');else{x.shipments++;s.log.unshift(`已向认养好友寄出第 ${x.shipments} 份京西稻米。`);if(nextRandom(s)<.5)awardFragment(s,'social');}}
 // —— 包 K（第十四轮）：协作任务 / 积分兑换 / 稻田 PK / 御赐农具 / 跨时空粮仓 ——
 else if(action.type==='social:task')return doTask(current,action)
 else if(action.type==='social:redeem')return redeem(current,action)
 else if(action.type==='social:pk-code'||action.type==='social:pk-import')return pk(current,action)
 else if(action.type==='social:tool')return useTool(current,action)
 else if(action.type==='social:contribute')return contribute(current,action)
 else fail('未知社交操作。');return error?{state:current,error}:{state:s,error:null};}
