import {createProcessing} from './processing-ui.js'
import {createSales} from './sales-ui.js'
import {createStory} from './story-ui.js'
import {createVariety} from './variety-ui.js'
import {createSocial} from './social-ui.js'
import {createNpc} from './npc-ui.js'
import {createFinale} from './finale-ui.js'
import {clearOpening} from './opening-cg.js'
import {SAVE_KEY,TERMS,WATER,PEST,createFarm,reduceFarm,readSave,planted,tds,pestLabel,estimate,seedOf,seedTotal,plotVarietyOf,omenOf,dayLeftMs,reputationOf,termInfoOf,termDayOf,termLeftOf,activeQuests,questInfo,questRemain,pendingEventOf,eventQueueLen,paidText,affordable,finaleWordsOf,finaleReadyOf,finaleMetricsOf} from './farm-engine.js'
import {slotKey,currentSlot} from './storage.js'
import {ECON,DAY_MS,INSPECT_LIMIT,seedPriceOf,TOOL_LEVELS,LAND_LEVELS,WORKSHOP_LEVELS,HOUSE_LEVELS,toolOf,landOf,roomsOf,houseOf,OMEN_EVENT_MAP} from './economy.js'
import {VARIETIES,growDaysOf} from './variety-engine.js'
import {riceAtLeast,repWord,TERM_DAYS,TERM_GRACE} from './event-engine.js'
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
// 「隐性感知」文案表：所有数值都在 engine 里，这里只把状态翻成看得懂的话。
const waterWord=v=>v>=70?'水色清亮，能照见云影':v>=40?'水色寻常，说不上好坏':v>=20?'水面泛浑，风过有股闷味':'水浑得发褐，田里透着死气'
const soilWord=v=>v>=80?'田土过湿，脚陷得深':v>=60?'田土润得正好，踩下去陷一指':v>=40?'田面见干，该引水了':'田土发白，裂出了细纹'
const ecoWord=v=>v>=70?'田埂上蛙鸣虫飞，鸟雀也不怕人':v>=40?'草木寻常，一切如故':v>=20?'田边静了些，少见虫鸟':'田里死寂，连风过都显得空'
const leafWord=v=>v<=20?'稻叶干净，虫影都少见':v<=50?'叶背有零星虫斑，还不碍事':'叶子被啃得斑斑驳驳'
const growthWord=q=>q==='特优'?'稻穗沉得压弯了腰，粒粒饱实':q==='优'?'稻穗长得壮实':q==='良'?'稻穗长得齐整':'谷粒看着有些发瘪'
const QUAL_CLASS={'特优':'q-gold',优:'q-silver',良:'q-bronze',中:'q-bronze',劣:'q-gray'}
const qualityChip=(q,extra='')=>`<i class="q-chip ${QUAL_CLASS[q]||'q-gray'}" title="品质：${q}${extra}"></i>`
const WATER_NARR={yuquan:'引一渠山泉入田，费工费时，水色最清',river:'就着河渠引水，省力，也说不上讲究',tap:'接井上的铁管水，图快，田里不太受用'}
const PEST_NARR={pesticide:'重药下去，虫是没了，田也伤了',crab:'把稻田蟹放进田里，虫少，田也活',manual:'卷起裤腿下田捉虫，费力气，稳当'}
// 包 P：每个选项都有代价，把「代价」直接写在按钮上，玩家才知道自己在拿什么换什么。
const costText=c=>[c.wen?`${c.wen} 文`:'',c.stamina?`${c.stamina} 点体力`:''].filter(Boolean).join(' · ')||'不花钱'
const vName=id=>(VARIETIES.find(v=>v.id===id)||{}).name||'稻种'
function statusCards(s){
 if(s.ui?.showNumbers)return [['土壤湿度',s.moisture+'%','适宜 60–80%'],['水质 TDS',tds(s)+' mg/L','水质 '+s.water+' / 100'],['生态值',s.ecology+' / 100','产量系数 ×'+(.8+.004*s.ecology).toFixed(2)],['病虫害',pestLabel(s.pests),s.pests+' / 100']]
 return [['田水',waterWord(s.water),'近前细看'],['田土',soilWord(s.moisture),'脚下的感觉'],['生气',ecoWord(s.ecology),'田埂上的动静'],['稻叶',leafWord(s.pests),'低头翻叶背']]
}
export function mountFarm({onChange,onAction}){
 const demo=new URLSearchParams(location.search).get('demo')==='1';let storageWarning='';let raw=null
 // —— 包 A：正式局走档位（jingxi-farm-v3-slot1~4），试玩局仍走 sessionStorage、绝不占档位。——
 const key=demo?SAVE_KEY+'-demo':slotKey(currentSlot()??1)
 try{raw=(demo?sessionStorage:localStorage).getItem(key);if(raw===null)for(const k of ['jingxi-farm-v2','jingxi-farm-v1']){const old=(demo?sessionStorage:localStorage).getItem(k+(demo?'-demo':''));if(old!==null&&readSave(old)){raw=old;break;}}}catch{storageWarning='浏览器存档不可用，本局仅保存在内存中。';}
 let state=readSave(raw)||createFarm(Date.now()>>>0);if(raw&&!readSave(raw))storageWarning='旧存档无法读取，已开启新一局。'
 let message='',resetPending=false,granaryOpen=false,detectTimer=0,tickTimer=0,dgTimer=0,dgHits=0,dgEvent='',dgArmed=false;let view=new URLSearchParams(location.search).get('view');let activity=['processing','sales','npc','variety','social','ending'].includes(view)?view:'farm';if(state.space==='home'&&['processing','sales','npc','social'].includes(activity))activity='farm';if(state.space==='town'&&activity==='farm')activity='sales';let processing,sales,story,variety,social,finale,npc
 // —— 包 B：当前选中的稻种（插秧与买种都用它）——
 let pickedVariety=state.riceVariety||Object.keys(state.seedBag||{})[0]||'royal'
 // 种袋里有种的品种 + 已收获/已收录（粮店会进货）的品种，一起列出来
 const pickable=()=>{const bag=state.seedBag||{},book=state.varietyBook||{},list=[]
  for(const [id,n] of Object.entries(bag))if(n>0)list.push({id,have:n,buyable:true})
  for(const id of [...(book.harvested||[]),...(book.unlocked||[])])if(!list.some(x=>x.id===id))list.push({id,have:0,buyable:true})
  return list}
 function persist(){try{// —— 包 A：档位上要显示「账号名 / 最近游玩时间」，顺手写进存档，不给它单开一个键。——
  state.profile={name:state.profile?.name||'林宇的田',savedAt:Date.now()};(demo?sessionStorage:localStorage).setItem(key,JSON.stringify(state));}catch{storageWarning='存档写入失败，请保持页面开启。';}}
 function dispatch(action,{quiet=false}={}){if(action.type==='detect')action={...action,at:Date.now()};if(action.now===undefined&&['tick','advance','inspect','plant'].includes(action.type))action={...action,now:Date.now()};const oldSeason=state.season,before=state;const result=reduceFarm(state,action);message=result.error||'';if(!result.error){state=result.state;persist();if(!quiet)onChange({...state,activity});}document.querySelector('#farm-root').dataset.state=JSON.stringify(state);if(!quiet){render();if(state.pending&&activity==='farm')requestAnimationFrame(()=>document.querySelector('.farm-event')?.scrollIntoView({behavior:'smooth',block:'center'}));else if(state.season!==oldSeason)window.scrollTo({top:0,behavior:'smooth'});}
  // 演出必须等 render() 之后叫：panel 的 DOM 先落定，收起时才不会闪一下旧内容。
  // quiet 的内部推进（每秒的节气倒计时、生长 tick）一律不演 —— 那不是玩家做的动作。
  if(!result.error&&!quiet&&onAction)try{onAction(action,before,state);}catch{}
  return !result.error;}
 function setActivity(next){if(next==='farm'&&state.space!=='home')dispatch({type:'space:switch',space:'home'});if(['processing','sales','npc','social'].includes(next)&&state.space!=='town')dispatch({type:'space:switch',space:'town'});if(activity==='processing'&&next!=='processing')processing.pause();if(next!=='ending')finale?.dismiss?.();activity=next;const u=new URL(location.href);u.searchParams.set('view',next);history.replaceState({},'',u);onChange({...state,activity});render();window.scrollTo({top:0,behavior:'smooth'});}

 // —— 生长时间：每 20 秒一个游戏天。定时器只做两件事：到点推进一天；把剩余秒数写到进度条上。——
 function updateGrowthUI(now=Date.now()){
  const s=state;if(s.season!=='summer')return
  const cap=Math.max(1,s.growTarget||3)
  const fill=document.querySelector('#growth-track span');if(fill)fill.style.width=Math.min(100,s.growth/cap*100)+'%'
  const line=document.querySelector('#growth-line')
  if(line)line.textContent=s.pending?'田里还有事没了结，日子先停在这里':s.growth>=cap?'稻子已经长足，可以进秋分了':`已过 ${s.growth} / ${cap} 天 · 再过约 ${Math.max(0,Math.ceil(dayLeftMs(s,now)/1000))} 秒是下一个游戏天`
 }
 // —— 包 J1：节气条每秒只改倒计时文字，不重建 DOM、不写存档 ——
 function updateTermUI(now=Date.now()){
  const el=document.querySelector('#term-eta');if(!el)return
  const t0=state.termAt||now,base=t0+((state.seasonDay||0)+1)*DAY_MS
  const next=Math.max(0,Math.ceil((base-now)/1000))
  el.textContent=(state.seasonDay||0)>=TERM_DAYS+TERM_GRACE?'':` · 再过 ${next} 秒翻一日`
 }
 // —— 包 J1：天灾的 3 秒按压条。玩家按下按钮才开始计时，点够阈值算守住，点不够按满损结算。——
 // 两条纪律：
 //   ① 绝不在页面一刷新就自动开始倒计时 —— 玩家还没读完灾情就判负，那是耍人；
 //   ② render() 会因节气翻日而重建 DOM，所以同一场天灾只补画进度，不重置倒计时。
 function beginDisaster(){
  const btn=document.querySelector('.dg-hit')
  if(!btn||btn.dataset.event!==dgEvent){if(dgTimer)clearInterval(dgTimer);dgTimer=0;dgEvent='';dgHits=0;dgArmed=false}
  if(!btn)return
  const need=Number(btn.dataset.need)||1,id=btn.dataset.event,act=btn.dataset.act||'应对',WINDOW=3000
  const paint=()=>{
   const f=document.querySelector('.disaster-game .dg-track span'),c=document.querySelector('.dg-count')
   if(f)f.style.width=(dgHits/need*100)+'%'
   if(c)c.textContent=dgHits
  }
  const finish=()=>{
   if(!dgTimer)return
   clearInterval(dgTimer);dgTimer=0
   const live=document.querySelector('.dg-hit');if(live)live.disabled=true
   dispatch({type:'event:disaster',event:id,hits:dgHits})
  }
  const startTimer=()=>{
   const t0=Date.now()
   dgTimer=setInterval(()=>{
    const left=Math.max(0,WINDOW-(Date.now()-t0))
    const t=document.querySelector('.dg-timer')
    if(t)t.textContent=`还剩 ${(left/1000).toFixed(1)} 秒`
    if(left<=0)finish()
   },100)
  }
  btn.onclick=()=>{
   if(!dgArmed){ // 第一下是「动手」，倒计时这时才起步
    dgArmed=true;dgEvent=id;dgHits=0;btn.textContent='连点 · '+act;btn.classList.add('arming');paint();startTimer();return
   }
   if(!dgTimer)return
   dgHits=Math.min(need,dgHits+1);paint()
   if(dgHits>=need){const t=document.querySelector('.dg-timer');if(t)t.textContent='守住了';finish()}
  }
  if(dgArmed&&dgEvent===id){btn.textContent='连点 · '+act;btn.classList.add('arming');paint()}
 }
 function startTick(){
  if(tickTimer)return
  tickTimer=setInterval(()=>{
   const now=Date.now()
   if(state.season==='summer'){
    const cap=Math.max(1,state.growTarget||3)
    const due=state.seasonAt&&!state.pending&&state.growth<cap&&now>=state.seasonAt+(state.growth+1)*DAY_MS
    if(due){const before=state.growth;dispatch({type:'tick',now},{quiet:true});if(state.growth!==before&&(state.growth>=cap||state.pending)){render();return}}
    updateGrowthUI(now)
   }
   // 节气倒计时四季都走。只有在「该翻一天」时才真正落到存档里，免得每秒写一次 localStorage。
   const t0=state.termAt||now
   const d=Math.min(TERM_DAYS+TERM_GRACE,Math.floor((now-t0)/DAY_MS))
   if(d>(state.seasonDay||0)){dispatch({type:'tick',now},{quiet:true});render();return}
   updateTermUI(now)
  },1000)
 }
 function eventHTML(){
  const can=c=>(state.sales?.wen||0)>=(c.wen||0)&&state.stamina>=(c.stamina||0)
  const label=c=>`<small class="event-cost">${c.desc||''}<br>代价：${costText(c)}${can(c)?'':' · 眼下办不到'}</small>`
  if(state.pending?.type==='water')return `<section class="farm-event" aria-label="水源选择"><div class="farm-kicker">生态抉择 · 引水入田</div><h2>今年用哪一汪水？</h2><p>田里等着水。选哪一汪，往后几年的田土都记着。</p><div class="event-choices">${Object.entries(WATER).map(([k,c])=>`<button data-action="water" data-choice="${k}" ${can(c)?'':'disabled'}><b>${c.name}</b><span>${WATER_NARR[k]}</span>${label(c)}</button>`).join('')}</div></section>`
  if(state.pending?.type==='pest')return `<section class="farm-event" aria-label="虫害应对"><div class="farm-kicker">生态抉择 · 田间虫害</div><h2>稻叶遭虫，如何应对？</h2><p>虫一天天啃下去，稻叶会先薄下去。</p><div class="event-choices">${Object.entries(PEST).map(([k,c])=>`<button data-action="pest" data-choice="${k}" ${can(c)?'':'disabled'}><b>${c.name}</b><span>${PEST_NARR[k]}</span>${label(c)}</button>`).join('')}</div></section>`
  return ''
 }
 // —— 当年特殊事件：一年一条，不阻塞主线，随时处置 ——
 function omenEventHTML(){
  const ev=OMEN_EVENT_MAP[state.omenEvent?.id]
  if(!ev||state.omenEvent.resolved)return ''
  const wen=state.sales?.wen||0,rice=state.rice||0
  const pay=ev.pay||{},canPay=wen>=(pay.wen||0)&&rice>=(pay.rice||0)
  const r=ev.resist||{},canResist=!r.stamina||state.stamina>=r.stamina
  const need=[pay.wen?`${pay.wen} 文（${wen>=pay.wen?'够':'还差 '+(pay.wen-wen)+' 文'}）`:'',pay.rice?`${pay.rice} kg 稻米（${rice>=pay.rice?'够':'还差 '+(pay.rice-rice)+' kg'}）`:'',r.stamina?`扛下来要 ${r.stamina} 点体力`:'',r.ecology?`生态 −${r.ecology}`:'',r.pests?`虫害 +${r.pests}`:''].filter(Boolean).join(' · ')
  return `<section class="farm-event omen-event" aria-label="当年乡里事"><div class="farm-kicker">今年乡里 · ${ev.name}</div><h2>${ev.name}</h2><p>${ev.text}</p><div class="event-choices"><button data-action="omen" data-choice="pay" ${canPay?'':'disabled'}><b>${ev.payText}</b><span>${need}</span></button><button data-action="omen" data-choice="resist" ${canResist?'':'disabled'}><b>${ev.resistText}</b><span>${canResist?'不花钱，但代价落在地里':'体力不够，眼下扛不住'}</span></button></div></section>`
 }
 // —— 包 J1：节气倒计时条。朱红渐空；最后一日闪烁；过窗口后转成「误期」警示。——
function termBarHTML(s){
 const t=termInfoOf(s),day=termDayOf(s),left=termLeftOf(s),over=left<=0
 const pct=Math.max(0,Math.min(100,(1-Math.min(TERM_DAYS,day)/TERM_DAYS)*100))
 const cls=`term-bar${over?' over':''}${left===1?' urgent':''}`
 const note=over?`已过 ${day-TERM_DAYS} 天 —— 这一季的收成要打对折`:`还剩 ${left} 个游戏日`
 return `<div class="${cls}" id="term-bar" data-day="${day}" aria-label="${t.name}倒计时：${note}"><div class="term-head"><b>${TERMS[s.season][0]} · ${t.name}</b><span>${note}</span></div><div class="term-track"><span style="width:${pct}%"></span></div><p class="term-say">${over?t.warn:t.say}<em id="term-eta"></em></p></div>`
}
// —— 包 J1：限时任务卡。剩余天数 + 备货进度 + 交差 / 回绝。——
function questHTML(s){
 const list=activeQuests(s)
 if(!list.length)return ''
 const needText=(q,t)=>{
  const n=t.need||{},out=[]
  if(n.rice)out.push(`${n.rice.kg} kg ${n.rice.quality||''}米（仓中合格 ${Math.round(riceAtLeast(s,n.rice.quality||'劣'))} kg）`)
  if(n.wen)out.push(`${n.wen} 文（现有 ${(s.sales?.wen||0).toLocaleString()} 文）`)
  if(n.crab)out.push(`稻田蟹 ${n.crab} 只（现有 ${s.crabs||0} 只）`)
  if(n.food)out.push(`${n.food.name||n.food.key} ${n.food.n} 份（现有 ${((s.workshop?.foods||{})[n.food.key]||0)} 份）`)
  if(t.cost?.stamina)out.push(`额外耗体力 ${t.cost.stamina}`)
  return out.join(' · ')
 }
 const card=q=>{
  const t=questInfo(q);if(!t)return ''
  const left=questRemain(s,q),urgent=left<=1
  const c={...(t.need?.rice?{rice:t.need.rice}:{}),...(t.need?.wen?{wen:t.need.wen}:{}),...(t.need?.crab?{crab:t.need.crab}:{}),...(t.need?.food?{food:t.need.food}:{}),...(t.cost||{})}
  const can=affordable(s,c)
  const rw=[t.reward?.wen?`${t.reward.wen} 文`:'',t.reward?.rep?`声望 +${t.reward.rep}`:'',t.reward?.seed?`稻种 ×${t.reward.seed.n}`:'',t.reward?.fragment?`耕织图残片 ×${t.reward.fragment}`:''].filter(Boolean).join(' · ')
  return `<article class="errand-card${urgent?' urgent':''}"><header><h3>${esc(t.title)}</h3><span class="errand-days">${left>0?`剩 ${left} 日`:'已误期'}</span></header><p>${esc(t.text)}</p><dl class="errand-need"><dt>要交</dt><dd>${esc(needText(q,t))}</dd><dt>得赏</dt><dd>${esc(rw||'一句谢')}</dd>${t.penalty?.rep?`<dt>误期</dt><dd class="bad">声望 −${t.penalty.rep}</dd>`:''}</dl><div class="errand-acts"><button class="farm-primary" data-action="quest-fulfill" data-quest="${q.id}" ${can?'':'disabled'}>${can?'交差领赏':'东西还没备齐'}</button><button class="errand-giveup" data-action="errand-giveup" data-quest="${q.id}" title="回绝也算失败，但只扣一半声望">回绝</button></div></article>`
 }
 return `<section class="errand-board" aria-label="限时差事"><div class="farm-card-head"><h2>差事</h2><span>${list.length} 件在办</span></div>${list.map(card).join('')}</section>`
}
// —— 包 J1：随机事件。天灾给一条 3 秒按压条，人祸三选一，奇遇直接收下。——
function eventPopupHTML(s){
 const ev=pendingEventOf(s)
 if(!ev)return ''
 const queued=eventQueueLen(s)
 const tail=queued?`<small class="ev-queue">后面还有 ${queued} 件事等着。</small>`:''
 if(ev.kind==='disaster'){
  return `<section class="farm-event disaster-event" aria-label="天灾应对"><div class="farm-kicker">天时 · ${esc(ev.name)}</div><h2>${esc(ev.name)}</h2><p>${esc(ev.text)}</p><div class="disaster-game"><div class="dg-track"><span style="width:0%"></span></div><div class="dg-row"><b class="dg-count">0</b><small> / ${ev.need} 下</small><span class="dg-timer">按下即开始计时</span></div><button class="dg-hit" data-need="${ev.need}" data-event="${ev.id}" data-act="${esc(ev.act)}">开始应对 · ${esc(ev.act)}</button></div><p class="muted">按下之后有 3 秒：点够 ${ev.need} 下就能把损失压到 ${Math.round(ev.winLoss*100)}%；点不够则要差 ${Math.round(ev.loseLoss*100)}%。${tail}</p></section>`
 }
 if(ev.kind==='choice'){
  return `<section class="farm-event choice-event" aria-label="人祸抉择"><div class="farm-kicker">人事 · ${esc(ev.name)}</div><h2>${esc(ev.name)}</h2><p>${esc(ev.text)}</p><div class="event-choices">${(ev.options||[]).map(o=>{const can=affordable(s,o.cost);const gain=o.gain?.rep?`声望 ${o.gain.rep>0?'+':''}${o.gain.rep}`:'';return `<button data-action="event-choice" data-event="${ev.id}" data-choice="${o.key}" ${can?'':'disabled'}><b>${esc(o.label)}</b><span>${esc(o.desc||'')}</span><small class="event-cost">${o.cost?`代价：${paidText(o.cost)}`:'不花钱'}${gain?` · ${gain}`:''}${can?'':' · 眼下办不到'}</small></button>`}).join('')}</div>${tail}</section>`
 }
 const got=[ev.gain?.wen?`${ev.gain.wen} 文`:'',ev.gain?.rep?`声望 +${ev.gain.rep}`:'',ev.gain?.seed?`稻种 ×${ev.gain.seed.n}`:'',ev.gain?.fragment?`耕织图残片 ×${ev.gain.fragment}`:'',ev.gain?.ecology?`生态 +${ev.gain.ecology}`:'',ev.gain?.water?`水质 +${ev.gain.water}`:''].filter(Boolean).join(' · ')
 return `<section class="farm-event fortune-event" aria-label="奇遇"><div class="farm-kicker">奇遇 · ${esc(ev.name)}</div><h2>${esc(ev.name)}</h2><p>${esc(ev.text)}</p><div class="event-choices"><button data-action="event-accept" data-event="${ev.id}"><b>收下这份运气</b><span>${esc(got||'记在心里')}</span><small class="event-cost">不花钱</small></button></div>${tail}</section>`
}
// —— 稻种选择：种袋里有种的可以直接下地，已收获过的粮店会进货（按稀有度 20~200 文/份）——
 function seedPicker(){
  const list=pickable()
  if(!list.length)return `<div class="seed-picker"><p class="muted">种袋空空：秋收留种、图鉴收录、穿越任务、粮店购买都能补种；实在没有，可以向邻里借种。</p></div>`
  return `<div class="seed-picker">${list.map(({id,have})=>{const v=VARIETIES.find(x=>x.id===id)||{},choose=id===pickedVariety;return `<button class="seed-chip ${choose?'on':''}" data-pick="${id}" aria-pressed="${choose}"><b>${v.name}</b><span>${have>0?`余 ${have} 份`:'种袋已空'} · 长 ${growDaysOf(id)} 天 · ${v.yield} kg/亩 · ${v.quality}${v.unlockReq?' · 稀有':''}</span></button>`}).join('')}</div>`
 }
 function actions(){
  if(state.season==='spring'){
   const have=seedOf(state,pickedVariety),room=10-planted(state)
   const byStamina=Math.floor(state.stamina/ECON.staminaPlant)
   const canPlant=have>0&&room>0&&byStamina>0
   const cap=Math.min(have,room,byStamina)
   return `${seedPicker()}<div class="plant-control"><label for="plant-count">用「${vName(pickedVariety)}」插秧亩数</label><input id="plant-count" type="number" min="1" max="${Math.max(1,cap)}" step="1" value="1" ${canPlant?'':'disabled'}><button data-action="plant-count" ${canPlant?'':'disabled'}>确认插秧</button><button data-action="plant-all" ${canPlant?'':'disabled'}>种满空地</button>${seedTotal(state)===0?`<button data-action="beg-seeds" ${state.seedBeg===`${state.year}-${state.season}`?'disabled':''}>${state.seedBeg===`${state.year}-${state.season}`?'本季已借过种':'向邻里借种 · 3 份御稻米'}</button>`:''}</div><p class="farm-hint">1 份种子 = 1 亩地，插 1 亩耗 ${ECON.staminaPlant} 点体力。种袋里当前有 ${seedTotal(state)} 份（「${vName(pickedVariety)}」${have} 份）。插秧后要等 ${growDaysOf(pickedVariety)} 个游戏天（1 天 = 现实 ${DAY_MS/1000} 秒）才可收割，可用巡田催一催。</p><button class="farm-primary" data-action="advance" ${!planted(state)?'disabled':''}>进入小暑 · 开始生长 →</button>`
  }
  if(state.season==='summer'){
   const cap=Math.max(1,state.growTarget||3),left=INSPECT_LIMIT-(state.inspectUsed||0)
   const done=state.growth>=cap
   return `<div class="growth-track" id="growth-track" aria-label="生长进度 ${state.growth}/${cap}"><span style="width:${state.growth/cap*100}%"></span></div><p id="growth-line" class="growth-line"></p><div class="farm-tools"><button class="tool-btn" data-action="inspect" ${state.pending||done||left<=0||state.stamina<ECON.staminaInspect?'disabled':''}>${left>0?`下田催一天 · 费 ${ECON.staminaInspect} 点体力（本季还剩 ${left} 次）`:'本季催苗次数已用满'}</button></div><button class="farm-primary" data-action="advance" ${!done||state.pending?'disabled':''}>${done?'进入秋分 · 收割 →':`还差 ${cap-state.growth} 天（约 ${Math.ceil(dayLeftMs(state,Date.now())/1000)} 秒）`}</button>`
  }
  if(state.season==='autumn'){const cost=Math.max(1,Math.round(ECON.staminaHarvest*toolOf(state).harvestStamina));return `<button class="farm-primary" data-action="${state.harvested?'advance':'harvest'}" ${!state.harvested&&state.stamina<cost?'disabled':''}>${state.harvested?'进入冬至 · 休耕 →':`收割并结算 · 费 ${cost} 点体力（${toolOf(state).name}）`}</button>`}
  return `<p>休耕后生态 +10，体力恢复至 100。留种只留六成、按品种分别入库；仓库存量与银钱保留——明年要种满十亩，得先去集市补种。</p><button class="farm-primary" data-action="advance">完成休耕 · 迎接第 ${state.year+1} 年 →</button>`
 }
 // —— Q-9.14：升级面板。等级 / 下一级价格 / 增益对比 / 买不起就写清还差多少 ——
 function upgradeHTML(){
  const wen=state.sales?.wen||0
  const row=(kind,label,curName,curDesc,nextName,nextDesc,cost,finish)=>{
   if(!nextName)return `<div class="upgrade-row done"><div><b>${label}</b><span>${curName}</span><small>${curDesc}</small></div><i class="upgrade-max">已至顶级</i></div>`
   const short=cost-wen
   return `<div class="upgrade-row"><div><b>${label}</b><span>${curName} → ${nextName}</span><small>${nextDesc}</small></div><button data-action="upgrade" data-kind="${kind}" ${wen<cost||finish?'disabled':''}>${finish?'已满级':`${cost.toLocaleString()} 文${short>0?`（还差 ${short.toLocaleString()} 文）`:''}`}</button></div>`
  }
  const t=state.tools?.level||0,nt=TOOL_LEVELS[t+1]
  const l=state.landLevel||0,nl=LAND_LEVELS[l+1]
  const r=state.workshop?.rooms||1,nr=WORKSHOP_LEVELS[r]
  const h=state.house?.level||0,nh=HOUSE_LEVELS[h+1]
  return `<details class="upgrade-panel" ${wen>0?'open':''}><summary>家业升级 · 银钱 ${wen.toLocaleString()} 文</summary>
  ${row('tool','农具',`Lv${t} ${toolOf(state).name}`,`收割体力 ×${toolOf(state).harvestStamina} · 亩产 ×${toolOf(state).yieldMul}`,nt?`Lv${t+1} ${nt.name}`:'',nt?`收割体力 ×${nt.harvestStamina}（省 ${Math.round((1-nt.harvestStamina)*100)}%）· 亩产 ×${nt.yieldMul}`:'',nt?nt.cost:0,t>=7)}
  ${row('land','土地',LAND_LEVELS[l].name,`品质分 +${LAND_LEVELS[l].qBonus}`,nl?nl.name:'',nl?`品质分 +${nl.qBonus}（好品相更容易出）`:'',nl?nl.costPerAcre*10:0,l>=2)}
  ${row('workshop','作坊',`Lv${r}`,`加工损耗 −${(roomsOf(state).lossBonus*100).toFixed(0)}%`,nr?`Lv${nr.level}`:'',nr?`加工损耗 −${(nr.lossBonus*100).toFixed(0)}%`:'',nr?nr.cost:0,r>=5)}
  ${row('house','老宅',HOUSE_LEVELS[h].name,HOUSE_LEVELS[h].effect,nh?nh.name:'',nh?nh.effect:'',nh?nh.cost:0,h>=3)}
  <p class="muted">农具越高级，季末的工具维护费也越高（每级 4 文/季）；作坊扩建与老宅修缮都要现钱，别把种子的钱花光。</p></details>`
 }
 function granaryHTML(){
  const now=state.result
  return `<div class="farm-card-head"><h2>粮仓</h2><span>存粮 ${state.rice.toLocaleString()} kg</span></div>
  <div class="granary-now">${now?`<span>本季入库</span><strong>${now.yieldKg.toLocaleString()} <small>kg</small></strong>${qualityChip(now.quality,state.ui?.showNumbers?` · 综合分 ${now.score}`:'')}<small class="muted">鼠标停在色块上看品质</small>`:'<span class="muted">本季还没有新谷入仓。</span>'}</div>
  <ol class="granary-history">${state.history.map(h=>`<li><span>第 ${h.year} 年</span>${qualityChip(h.quality)}<b>${h.yieldKg.toLocaleString()} kg</b></li>`).join('')||'<li class="muted">还没有往年的记录。</li>'}</ol>
  <button class="farm-primary" data-action="granary">收起粮仓</button>`
 }
 // 包 O：季末结算单。收入与开销逐项列清，让玩家看得见钱是怎么没的。
function settleHTML(){
 const t=state.settle;if(!t)return ''
 const rows=[['本季毛收入',t.income],['地租（'+t.acres+' 亩）',-t.rent],['工具维护',-t.upkeep],['老宅修缮',-t.house]]
 if(t.bribe>0)rows.push(['衙门例钱',-t.bribe])
 return `<div class="farm-card-head"><h2>季末结算</h2><span>${TERMS[t.ended]?TERMS[t.ended][0]:t.ended}季末</span></div>
 <ul class="settle-list">${rows.map(([k,v])=>`<li><span>${k}</span><b class="${v>=0?'in':'out'}">${v>=0?'+':''}${v.toLocaleString()} 文</b></li>`).join('')}</ul>
 <div class="settle-net"><span>本季净收益</span><strong class="${t.net>=0?'in':'out'}">${t.net>=0?'+':''}${t.net.toLocaleString()} 文</strong></div>
 ${t.short>0?`<p class="muted">钱不够，还欠着 ${t.short} 文没结清。</p>`:''}
 <p class="muted">存粮 ${state.rice.toLocaleString()} kg · 银钱 ${(state.sales?.wen||0).toLocaleString()} 文</p>`
}
function showDetect(){
  const s=state;let el=document.querySelector('#detect-panel')
  if(!el){el=document.createElement('div');el.id='detect-panel';el.className='detect-panel';document.body.append(el);}
  el.innerHTML=`<b>田情检测</b><div><span>水质 TDS</span><strong>${tds(s)} mg/L</strong></div><div><span>生态值</span><strong>${s.ecology} / 100</strong></div><div><span>病虫害</span><strong>${pestLabel(s.pests)}（${s.pests}）</strong></div><div><span>土壤湿度</span><strong>${s.moisture}%</strong></div><small>这一瓢水看明白了 · 3 秒后收起</small>`
  el.classList.add('show');clearTimeout(detectTimer);detectTimer=setTimeout(()=>el.classList.remove('show'),3000)
 }
 function render(){
  const term=TERMS[state.season],n=planted(state),q=state.result||estimate(state),showNum=!!state.ui?.showNumbers,omen=omenOf(state)
  const list=pickable();if(!list.some(x=>x.id===pickedVariety))pickedVariety=list[0]?.id||state.riceVariety||'royal'
  const price=seedPriceOf(pickedVariety)
  document.querySelector('#farm-root').innerHTML=`<div class="farm-heading"><span>京西御田 · 一产种植</span><h1>第 ${state.year} 年 · ${term[0]}季 ${term[1]}</h1><p>${term[2]}期 · <b class="omen-chip" title="${omen.desc}">年景：${omen.name}</b>${state.year>=3?' · 已解锁轮作':''} · ${demo?'试玩局，不影响正式存档':'自动保存本机进度'}</p>${finaleReadyOf(state)&&!state.finale?.choice?`<button class="finale-call" data-action="finale-go">朝廷来收贡米 →</button>`:''}<button class="space-switch" data-space="town">去上庄镇 →</button>${(()=>{const done=state.detect&&state.detect.year===state.year&&state.detect.season===state.season;const dis=done||state.stamina<ECON.staminaDetect;return `<button class="detect-btn" data-action="detect" ${dis?'disabled':''} title="${done?'本季已检测过，等下一季':''}">${done?'本季已检测田情':`检测田情 · 费 ${ECON.staminaDetect} 点体力`}</button>`;})()}${resetPending?`<button class="reset-btn arming" data-action="reset-confirm" title="清掉这一档的全部进度">再点一次：推倒重来，从第 1 年春天种起</button><button class="reset-btn" data-action="reset-cancel">算了，接着种</button>`:`<button class="reset-btn" data-action="reset-request" title="清掉这一档的进度，从第 1 年春重新开始">重开一局</button>`}</div>
  ${termBarHTML(state)}
  <section class="farm-stats${showNum?' debug':' fuzzy'}" aria-label="田间观察">${statusCards(state).map(([a,b,c])=>`<div><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('')}</section>
  <div class="farm-columns"><section class="farm-card plot-card"><div class="farm-card-head"><h2>十亩御田</h2><span>${n} / 10 亩已插秧</span><button class="granary-btn" data-action="granary">${granaryOpen?'收起粮仓':'开仓看看'}</button></div><div class="farm-resources"><span title="声望：限时任务的成败、人祸的抉择都会记在这上头">声望 <b>${reputationOf(state)}</b> <small>${repWord(reputationOf(state))}</small></span><span class="fin-whisper" title="乡评只给一句模糊话，不报数字——你做过的事，乡里都记着">乡评 <small>${finaleWordsOf(state).moral}</small></span><span>种子 <b>${seedTotal(state)}</b> 份</span><span>体力 <b>${state.stamina}</b></span><span>稻田蟹 <b>${state.crabs}</b> 只</span><span>稻米 <b>${state.rice.toLocaleString()}</b> kg</span><span>银钱 <b>${(state.sales?.wen||0).toLocaleString()}</b> 文</span></div><div class="farm-tools"><button class="tool-btn" data-action="buy-seeds" ${(state.sales?.wen||0)<price*5?'disabled':''}>买 5 份「${vName(pickedVariety)}」 · ${price*5} 文</button><button class="tool-btn" data-action="hire" ${state.stamina>=100||((state.sales?.wen||0)<ECON.hireCost&&(state.barter||0)>=ECON.barterPerSeason)?'disabled':''}>${(state.sales?.wen||0)>=ECON.hireCost?`雇短工 · ${ECON.hireCost} 文（体力 +${ECON.hireStamina}）`:((state.barter||0)<ECON.barterPerSeason?`邻里换工 · 不花钱（体力 +${ECON.hireStamina}，本季限 ${ECON.barterPerSeason} 次）`:'雇短工 · 钱不够')}</button></div><div class="farm-plots">${state.plots.map((p,i)=>{const vid=plotVarietyOf(state,i);return `<button data-action="plant-one" data-plot="${i}" ${state.season!=='spring'||p||!seedOf(state,pickedVariety)||state.stamina<ECON.staminaPlant?'disabled':''} aria-label="第 ${i+1} 亩，${p?`已种${vName(vid)}`:'空地'}" title="${p?`第 ${i+1} 亩 · ${vName(vid)}`:`第 ${i+1} 亩 · 空地（将种 ${vName(pickedVariety)}）`}"><small>${String(i+1).padStart(2,'0')} / ${landOf(state).name}</small><span>${state.season==='winter'?'冬藏':state.harvested?'已收割':p?vName(vid):'空地'}</span><i>${p?'稻':'田'}</i></button>`}).join('')}</div><p class="farm-hint">1 份种子 = 1 亩地，插 1 亩耗 ${ECON.staminaPlant} 点体力。春季先在上方选稻种，再点空地逐亩插秧；不同地块可以种不同品种，收获时按各块品种分别结算。</p>${actions()}${upgradeHTML()}</section>
  <aside class="farm-card journal-card">${eventPopupHTML(state)}${questHTML(state)}${omenEventHTML()}${eventHTML()||(granaryOpen?granaryHTML():`<div class="farm-card-head"><h2>田间手记</h2><span>${term[1]}</span></div><div class="yield-preview">${state.harvested?`<span>本季稻谷已入仓</span><p class="muted">仓里有今年的谷子，开仓才看得清成色与斤数。</p>`:`<span>眼下的田</span><p class="muted">稻子还得慢慢养，收成如何，等秋收开仓才知分晓。</p>`}${showNum?`<small class="debug-note">估算 ${q.yieldKg.toLocaleString()} kg · 品质 ${q.quality} · 综合分 ${q.score} · 生态系数 ×${q.ecoMultiplier.toFixed(2)} · 年景 ×${q.omenYield} · 农具 ${q.tools}</small>`:''}</div>`)}${settleHTML()}<ol class="farm-log">${state.log.slice(0,3).map(t=>`<li>${esc(t)}</li>`).join('')}</ol><div class="farm-message" role="status">${esc(message||storageWarning)}</div><details class="farm-rules" ${showNum?'hidden':''}><summary>老农的经验</summary><p>水要清，田要润，虫要早除。这三样缺一样，谷粒就瘪几分。</p><p>一年一个年景，倒春寒拖日子，大旱要多花水钱，虫害年的虫子格外密——顺着年景来，别硬顶。</p><p>天时占一半，人算一半——剩下的，秋收那天开仓就知道了。</p></details><details class="farm-rules" ${showNum?'':'hidden'}><summary>查看品质与产量规则（调试）</summary><p>基础亩产按品种（kg）：御稻米 50 / 紫金箍 46 / 大粒紫金箍 53 / 大明芒 49 / 大红芒 48 / 小红芒 88 / 银坊 95 / 水源三百粒 130 / 越富系三 150 / 京越一号 160 / 津稻三零五 200 / 上香一号 200 / 京西稻三号 205。品质系数：特优 1.35 / 优 1.2 / 良 1.0 / 劣 0.65。产量 = Σ(各亩品种亩产 × 轮作系数) × 品质系数 × (0.8 + 0.004 × 生态) × 年景系数 × 农具系数，向下取整。</p><p>适湿分 = 100 − 距离 60–80% 区间的差值 × 2（最低 0）。品质分 = 40% 水质 + 25% 适湿分 + 20% (100 − 病虫害值) + 15% 生态值 + 土地等级加成。特优需分数≥90、水质≥80、虫害≤10、生态≥70；优需分数≥78、水质≥60、虫害≤25、生态≥50；良需分数≥58；其余为劣。</p><p>售价（文/斤，良级基准）：市场 3 / 粮店 2 / 酒楼 5；品质倍率 特优 ×3.33、优 ×2、良 ×1、劣 ×0.33。1 石 = 50 kg = 100 斤。手续费按笔计：市场 5 / 粮店 3 / 酒楼 5 文。稻田蟹可售：市场 6 / 粮店 5 / 酒楼 12 文/只。</p><p>季末结算：地租 ${ECON.rentPerAcre} 文/亩、工具维护 ${ECON.toolUpkeep} 文/件、老宅修缮 ${ECON.houseUpkeep} 文；有收入的季末 30% 概率被衙门索去 20%。秋收有 30% 概率遇天灾减产 30–50%。存粮超过 3 季按半价出售。加工损耗从 30% 随已学配方递减至 10%，作坊每扩建一级再降 3%~13%。</p><p>时间：夏季 1 游戏天 = 现实 ${DAY_MS/1000} 秒，巡田可以把时间整体提前 1 天（每季上限 ${INSPECT_LIMIT} 次）；关掉页面再回来最多补算 3 天。年景每年重 roll，第 3 年起同块地连作减产 8%、换品种加成 6%。体力：插秧 ${ECON.staminaPlant}/亩、巡田 ${ECON.staminaInspect}/次、收割 ${ECON.staminaHarvest}/次（高级农具可减）、检测 ${ECON.staminaDetect}/次（每季限一次）；玉泉 8、河水 4、井水 2；投蟹 10、农药 4、人工捉虫 30。每次季节推进体力保底回到 ${ECON.staminaFloor}，冬至休耕直接回满 100；雇短工 ${ECON.hireCost} 文换 ${ECON.hireStamina} 点体力，钱不够时每季可邻里换工 ${ECON.barterPerSeason} 次。</p><p>种子价格（文/份，按稀有度）：${VARIETIES.map(v=>`${v.name} ${seedPriceOf(v.id)}`).join(' / ')}。收录新品种会白送 3 份该品种稻种；穿越任务结算也会带回稀有稻种；种袋空了可以向邻里借 3 份御稻米（每季 1 次）。</p></details>`
  document.querySelectorAll('nav [data-season]').forEach(b=>{b.disabled=true;b.classList.toggle('active',b.dataset.season===state.season);b.setAttribute('aria-current',b.dataset.season===state.season?'step':'false');b.querySelector('span').textContent=TERMS[b.dataset.season][2];})
  document.querySelector('#farm-root').hidden=activity!=='farm';document.querySelector('#processing-root').hidden=activity!=='processing';document.querySelector('#sales-root').hidden=activity!=='sales';document.querySelector('#npc-root').hidden=activity!=='npc';document.querySelector('#variety-root').hidden=activity!=='variety';document.querySelector('#social-root').hidden=activity!=='social';document.querySelector('#ending-root').hidden=activity!=='ending'
  document.querySelectorAll('[data-activity]').forEach(b=>{b.classList.toggle('active',b.dataset.activity===activity);b.setAttribute('aria-selected',b.dataset.activity===activity?'true':'false');})
  if(activity==='processing')processing?.render(message||storageWarning)
  if(activity==='sales')sales?.render(message||storageWarning)
  if(activity==='npc')npc?.render(message||storageWarning)
  if(activity==='variety')variety?.render(message||storageWarning)
  if(activity==='social')social?.render(message||storageWarning)
  if(activity==='ending')finale?.render(message||storageWarning)
  story?.render(message||storageWarning)
  const host=document.querySelector('#farm-root');host.dataset.state=JSON.stringify(state)
  updateGrowthUI();updateTermUI();beginDisaster()
  document.querySelectorAll('button[data-space]').forEach(b=>b.onclick=()=>{if(dispatch({type:'space:switch',space:b.dataset.space}))setActivity(b.dataset.space==='town'?'sales':'farm');})
  host.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{
   const a=b.dataset.action
   if(a==='reset-request'){resetPending=true;render();return;}if(a==='reset-cancel'){resetPending=false;render();return;}
   if(a==='granary'){granaryOpen=!granaryOpen;render();return;}
   if(a==='detect'){if(dispatch({type:'detect'}))showDetect();return;}
   // 重开＝重新开始一局，片头也该跟着重看一遍：清掉「已看过」标记再叫一次开场 CG。
   if(a==='reset-confirm'){state=createFarm(Date.now()>>>0);resetPending=false;persist();clearOpening();onChange({...state,activity});render();window.__replayOpening?.();return;}
   // —— 包 K：终章入口。触发条件成立时，田页顶部直接给一条去路。——
   if(a==='finale-go'){setActivity('ending');return;}
   if(a==='plant-count')return dispatch({type:'plant',count:Number(document.querySelector('#plant-count').value),variety:pickedVariety})
   if(a==='buy-seeds')return dispatch({type:'seed:buy',count:5,variety:pickedVariety})
   if(a==='beg-seeds')return dispatch({type:'seed:beg'})
   if(a==='plant-one')return dispatch({type:'plant',count:1,plot:Number(b.dataset.plot),variety:pickedVariety})
   if(a==='plant-all'){const room=Math.min(seedOf(state,pickedVariety),10-planted(state));return dispatch({type:'plant',count:Math.max(1,Math.min(room,Math.floor(state.stamina/ECON.staminaPlant))),variety:pickedVariety});}
   // —— 包 J1：差事与随机事件。天灾的连点由 beginDisaster 接管，不走这里。——
   if(a==='quest-fulfill')return dispatch({type:'quest:fulfill',quest:b.dataset.quest})
   if(a==='errand-giveup')return dispatch({type:'quest:giveup',quest:b.dataset.quest})
   if(a==='event-choice')return dispatch({type:'event:choose',event:b.dataset.event,choice:b.dataset.choice})
   if(a==='event-accept')return dispatch({type:'event:accept',event:b.dataset.event})
   if(a==='disaster-hit')return
   dispatch({type:a,choice:b.dataset.choice,kind:b.dataset.kind,variety:b.dataset.variety})
  }))
  host.querySelectorAll('[data-pick]').forEach(b=>b.addEventListener('click',()=>{pickedVariety=b.dataset.pick;render();}))
 }
 processing=createProcessing({getState:()=>state,dispatch,goFarm:()=>setActivity('farm')})
 sales=createSales({getState:()=>state,dispatch})
 story=createStory({getState:()=>state,dispatch})
 variety=createVariety({getState:()=>state,dispatch})
 social=createSocial({getState:()=>state,dispatch})
 finale=createFinale({getState:()=>state,dispatch})
 npc=createNpc({getState:()=>state,dispatch,goHome:()=>setActivity('farm')})
 document.querySelectorAll('[data-activity]').forEach(b=>b.addEventListener('click',()=>setActivity(b.dataset.activity)))
 persist();render();startTick();onChange({...state,activity});return {getState:()=>structuredClone(state),setActivity,setSaleChannel:id=>sales.setChannel(id),switchSpace:space=>{dispatch({type:'space:switch',space});setActivity(space==='town'?'sales':'farm');},dispatch}
}
