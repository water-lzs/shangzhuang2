import {newWorkshop,normalizeWorkshop,reduceProcessing,matureVats} from './processing-engine.js'
import {newSales,normalizeSales,reduceSales} from './sales-engine.js'
import {newStory,normalizeStory,reduceStory} from './story-engine.js'
import {tickResearch,techEffects} from './tech-engine.js'
import {newVarietyBook,normalizeVarietyBook,reduceVarieties,awardFragment,awardShard,VARIETIES,growDaysOf,maxGrowDays} from './variety-engine.js'
import {ECON,JIN_PER_KG,JIN_PER_STONE,QUALITY_ORDER,YIELD_TABLE,DAY_MS,CATCHUP_MAX,INSPECT_LIMIT,seedPriceOf,START_SEEDS,BEG_SEEDS,OMENS,OMEN_KEYS,OMEN_EVENTS,OMEN_EVENT_MAP,ROTATION,TOOL_LEVELS,LAND_LEVELS,WORKSHOP_LEVELS,HOUSE_LEVELS,toolOf,landOf,roomsOf,houseOf} from './economy.js'
import {nextRandom} from './rng.js'
import {newSocial,normalizeSocial,reduceSocial,settleCoopTasks,socialHarvestBonus,stepQuality} from './social-engine.js'
// —— 包 K（第十四轮）：跨时空粮仓。只读它一个阈值开关（共用种子库），写盘在 social-engine 那边。——
import {granarySeedBonus} from './granary.js'
import {reduceEnding} from './ending-engine.js'
// —— 包 J1（第六轮）：节气倒计时 · 限时任务 · 随机事件 · 声望。
// 事件引擎刻意只依赖 variety-engine 与 rng，这里单向引用，不会形成环。
import {TERM_DAYS,TERM_GRACE,TERM_INFO,dayOf,absDay,termLeft,missedTerm,REP_START,repOf,clampRep,newQuestState,newEventState,normalizeQuests,normalizeEvents,rollQuests,rollEvents,tickQuests,questFulfill,questGiveup,questLeft,questTpl,disasterResolve,eventChoose,eventAccept,autoResolvePending,QUEST_MAP,EVENT_MAP,canPay,costText as payText,TRAVEL_STAMINA,travelEncounter} from './event-engine.js'
// —— 包 J2（第七轮）：场景隐藏热点。同样只单向引用，不成环 ——
import {newHotspotState,normalizeHotspots,touchHotspot,HOTSPOTS as HOTSPOT_DEFS,HOTSPOT_MAP,exploredThisYear,exploredCount,hotspotOf} from './hotspot-engine.js'
// —— 包 K（第八轮）Q-9.13：隐藏式多结局。四维记账在 reduceFarm 出口统一收口，
//    免得散落到十几个 action 分支里各写一遍、日后漏记。——
import {newFinale,normalizeFinale,reduceFinale,trackFinale,finaleReady,finaleMetrics,blurWords,FINALE_CHOICES,FINALES} from './finale-engine.js'
// —— 包 M3（第十一轮）：镇上街坊。同样只单向引用（npc → event/rng/variety），不成环 ——
import {newNpcState,normalizeNpc,reduceNpc,feeCutOf,tributeOpen} from './npc-engine.js'
// Pure, serializable farming rules. All numbers here are game balancing parameters.
export const SAVE_KEY='jingxi-farm-v3'
export const TERMS={spring:['春','谷雨','插秧'],summer:['夏','小暑','生长'],autumn:['秋','秋分','收割'],winter:['冬','冬至','休耕']}
// —— 包 P：两个「生态抉择」不再是单选题，每个选项都有代价 ——
// 水源：玉泉最好但要花工钱与体力；河水免费却有把虫卵引进田的风险；井水最省事但伤生态。
export const WATER={
 yuquan:{name:'玉泉山水',quality:60,ecology:10,wen:15,stamina:8,desc:'水色最清，可要从山脚开渠引来，工钱与人工都不便宜。'},
 river:{name:'普通河水',quality:25,ecology:0,wen:0,stamina:4,riskPest:.3,riskPestAdd:20,desc:'不花钱，但河里带着虫卵，有概率把虫害一起引进田。'},
 tap:{name:'铁管井水',quality:10,ecology:-8,wen:0,stamina:2,desc:'离田最近、最省力气，但井水偏硬，田土与生态都要吃亏。'}
}
// 虫害：农药立竿见影但生态崩，投蟹要买蟹苗却能养生态还能捕来卖，人工不伤生态但费体力且除不净。
export const PEST={
 pesticide:{name:'喷洒农药',pests:0,ecology:-30,wen:8,stamina:4,desc:'虫子立时清光，代价是田埂上的那股生气。'},
 crab:{name:'投放稻田蟹',pestRate:.2,ecology:20,wen:20,stamina:10,yieldsCrabs:true,desc:'蟹苗要花钱，但蟹能压虫、养生态，秋后还能捕来卖。'},
 manual:{name:'人工捉虫',pestsDelta:-50,ecology:10,wen:0,stamina:30,desc:'不伤生态，可弯腰半日，还除不干净。'}
}
// —— 经济参数已抽到 economy.js（生产端与销售端共用，避免循环依赖）。这里只做转出，方便 UI 引用。——
export {ECON,JIN_PER_KG,JIN_PER_STONE,QUALITY_ORDER,YIELD_TABLE} from './economy.js'
// Narrative lines only. All balancing numbers stay in the rules above, never in the copy.
const NARR={
 plant:(n,name)=>`你弯腰插下 ${n} 亩${name}秧苗，指尖沾满了泥水。`,
 waterNeed:()=>'田里的水见了底，该引一渠水进来了。',
 water:{yuquan:'你引了玉泉山水入田，水色清亮，稻叶似乎舒展了些。',river:'你引了河水入田，水面浮着碎草屑，说不上好坏。',tap:'铁管水注进田里，水面泛起一层白沫，泥腥味压了很久才散。'},
 pestOut:()=>'稻叶上爬起了虫影，叶脉一点点被啃薄。',
 pest:{pesticide:'药水泼下去，虫子是没了，田埂上那股生气也淡了。',crab:'稻田蟹下了田，水渠里多了窸窣的动静。',manual:'你卷起裤腿下田捉虫，弯腰半日，直起身时天都暗了。'},
 inspect:n=>`第 ${n} 次下田：秧苗又抽高了一截，你把水草拨开看了看根。`,
 harvest:()=>'秋收的稻谷入了仓。你按老规矩留下了一批种子，来年还得靠它们。',
 shortage:()=>'天时不顺，稻穗还没长实就塌了一片，这一季的收成薄得让人心慌。',
 settle:net=>net>=0?'入冬前算了账：地租、维护、修缮一笔笔支出去，进出相抵，钱袋还剩些。':'入冬前算了账：地租、维护、修缮支出去，钱袋眼见着瘪了。',
 bribe:()=>'衙门里来过人，说是有笔例钱要交，你没敢多问，数着铜钱递过去。',
 buySeed:(n,name)=>`你在集市的种摊前蹲了半晌，称回 ${n} 份${name}稻种。`,
 beg:()=>'钱袋空了，种袋也见了底。你厚着脸皮去邻家敲门，周伯匀了三份稻种给你。',
 hire:()=>'你从镇上喊来两个短工搭手，田里的活计总算松快了些。',
 barter:()=>'钱袋空了，只好去邻家换工——搭上一份人情，总算把最要紧的活计赶开了。',
 crabCatch:n=>`秋后放水，田里爬出一篓稻田蟹，足有 ${n} 只。`,
 winter:()=>'休耕结束，土地缓过了劲，新一年的春播该开始了。',
 omenResolve:(cho)=>cho?'你数出铜钱把事情了了，乡里没再多话。':'你按下没给，事情就那么过去了，只是田里得自己多担待。',
 upgrade:(name,kind)=>kind==='tool'?`你把积蓄换成了${name}，田里的活计眼看着轻了一半。`:kind==='land'?`十亩田改成了${name}，泥色都深了一层。`:kind==='workshop'?`作坊扩到了${name}，出料更顺了。`:`老宅翻修出${name}，账本和种谱总算有了正经去处。`,
 tickLog:d=>`又过了 ${d} 天，稻苗在风里又密了一线。`
}
const clamp=(x,min=0,max=100)=>Math.min(max,Math.max(min,x))
const round=x=>Math.round(x*10)/10
export const planted=s=>s.plots.filter(Boolean).length
// —— 包 J1：给 UI 用的只读助手（节气 / 声望 / 任务 / 事件）——
export const reputationOf=s=>repOf(s)
export const termInfoOf=s=>TERM_INFO[s.season]
export const termDayOf=s=>dayOf(s)
export const termLeftOf=s=>termLeft(s)
export const activeQuests=s=>s.quests?.active||[]
export const questInfo=q=>questTpl(q)
export const questRemain=(s,q)=>questLeft(s,q)
export const pendingEventOf=s=>{const p=s.events?.pending;return p?EVENT_MAP[p.id]||null:null}
export const eventQueueLen=s=>(s.events?.queue||[]).length
export const paidText=c=>payText(c)
export const affordable=(s,c)=>canPay(s,c)
// —— 包 J2：给 UI 用的场景热点只读助手 ——
export const hotspotDef=id=>hotspotOf(id)
export const hotspotList=space=>HOTSPOT_DEFS.filter(h=>h.space===space)
export const hotspotSeen=(s,id)=>exploredThisYear(s,id)
export const hotspotFound=s=>exploredCount(s)
export const hotspotLast=s=>s.hotspots?.last||null
// —— 包 K：终章只读助手。四维的读数与文案都从 finale-engine 出，UI 不自己算。——
export const finaleReadyOf=s=>finaleReady(s)
export const finaleMetricsOf=s=>finaleMetrics(s)
export const finaleWordsOf=s=>blurWords(s)
export const finaleChoiceList=()=>FINALE_CHOICES
export const finaleData=id=>FINALES[id]||FINALES.unknown
export const tds=s=>Math.round(500-4*s.water)
export function pestLabel(p){return p===0?'无':p<=20?'轻度':p<=50?'中度':'重度';}
// —— 包 B：种子不再是「一个数字」，而是按品种分开的种袋 ——
export const seedOf=(s,id)=>Math.max(0,(s.seedBag||{})[id]||0)
export const seedTotal=s=>Object.values(s.seedBag||{}).reduce((n,v)=>n+v,0)
export const varietyName=id=>(VARIETIES.find(v=>v.id===id)||{}).name||'稻种'
// 每块地种的是哪个品种：没记录就回落到本年的默认品种。
export const plotVarietyOf=(s,i)=>(s.plotVarieties||[])[i]||s.riceVariety||'royal'
export const omenOf=s=>OMENS[s.omen]||OMENS.normal
// 轮作（第 3 年起）：同块地连作减产，换品种有加成
export function rotationMulAt(s,i,id){if(s.year<ROTATION.fromYear)return 1;const prev=(s.prevPlotVarieties||[])[i];if(!prev)return 1;return prev===id?ROTATION.sameMul:ROTATION.swapMul;}
export function createFarm(seed=1){return {space:'home',ending:null,workshop:newWorkshop(),sales:newSales(),story:newStory(),varietyBook:newVarietyBook(),social:newSocial(),ui:{showNumbers:false},detect:null,barter:0,version:10,year:1,season:'spring',seedBag:{...START_SEEDS},land:10,landLevel:0,house:{level:0},plots:Array(10).fill(false),plotVarieties:Array(10).fill(null),prevPlotVarieties:Array(10).fill(null),previousPlots:Array(10).fill(false),moisture:70,water:40,ecology:50,pests:0,stamina:100,crabs:0,rice:0,riceLots:[],settle:null,tools:{level:0},riceVariety:'royal',growth:0,growTarget:0,seasonAt:0,inspectUsed:0,omen:'normal',omenEvent:null,omenEvents:[],pending:null,plan:null,rng:seed>>>0,harvested:false,result:null,history:[],reputation:REP_START,seasonDay:0,latePrev:false,disasterLoss:0,quests:newQuestState(),events:newEventState(),hotspots:newHotspotState(),finale:newFinale(50),npc:newNpcState(),profile:{name:'林宇的田',savedAt:0},log:['林宇穿越回清代，绑定京西稻贡米系统。','林宇领到 3 份御稻米稻种与 10 亩初级地——种子得靠秋收留种、图鉴奖励或去粮店买。']};}
const random=nextRandom; // 随机数实现在 rng.js，各玩法模块共用同一套种子，读档才能重放一致
function note(s,t){s.log.unshift(t);s.log=s.log.slice(0,8);}
export function yieldBaseOf(s){const t=s.plotVarieties;if(Array.isArray(t)&&t.length===10){const ids=[...new Set(t.filter(Boolean))];if(ids.length)return Math.round(ids.reduce((n,id)=>n+(YIELD_TABLE[id]||ECON.yieldBase),0)/ids.length);}return YIELD_TABLE[s.riceVariety]||ECON.yieldBase;}
// —— 基础亩产按地块各自的品种取；轮作系数逐块算 ——
function yieldPerAcre(s){let kg=0,acres=0;for(let i=0;i<10;i++){if(!s.plots[i])continue;const id=plotVarietyOf(s,i);kg+=(YIELD_TABLE[id]||ECON.yieldBase)*rotationMulAt(s,i,id);acres++;}return {kg,acres};}
export function estimate(s){
 const acres=planted(s),health=clamp(100-Math.max(0,60-s.moisture,s.moisture-80)*2)
 const land=landOf(s),tool=toolOf(s),omen=omenOf(s)
 // —— 包 I2：已完成科技的分支效果（产量 / 体力 / 引水工钱 …）在这里一次取齐 ——
 const te=techEffects(s.story?.tech)
 // 品质分把「生态值」也算进去：光引玉泉、不管生态，照样出不了特优。地力（土地等级）再往上加一手。
 const score=clamp(round(ECON.qWaterW*s.water+ECON.qHealthW*health+ECON.qPestW*(100-s.pests)+ECON.qEcoW*s.ecology)+land.qBonus)
 const quality=score>=90&&s.water>=80&&s.pests<=10&&s.ecology>=70?'特优':score>=78&&s.water>=60&&s.pests<=25&&s.ecology>=50?'优':score>=58?'良':'劣'
 const multiplier={特优:1.35,优:1.2,良:1,劣:.65}[quality],ecoMultiplier=.8+.004*s.ecology
 const {kg}=yieldPerAcre(s)
 const base=acres?Math.round(kg/acres):(YIELD_TABLE[s.riceVariety]||ECON.yieldBase)
 // 留种不再是「收多少返多少」：只留六成，其余得花钱去集市买。按品种分别留。
 const keepBag={};for(let i=0;i<10;i++){if(!s.plots[i])continue;const id=plotVarietyOf(s,i);keepBag[id]=(keepBag[id]||0)+1;}
 for(const k of Object.keys(keepBag))keepBag[k]=Math.min(ECON.seedCap,Math.round(keepBag[k]*ECON.seedKeepRate))
 const reservedSeeds=Object.values(keepBag).reduce((n,v)=>n+v,0)
 // —— 包 J1：天时账。误了节气窗口当季砍半；这一季的天灾损失另算，秋收时一次性扣。——
 const lateMul=s.latePrev?.5:1,disasterMul=1-Math.max(0,Math.min(1,s.disasterLoss||0)),timingMul=round(lateMul*disasterMul*100)/100
 return {year:s.year,acres,quality,score,health,base,qualityMultiplier:multiplier,ecoMultiplier:round(ecoMultiplier*100)/100,ecology:s.ecology,water:s.water,moisture:s.moisture,pests:s.pests,tools:tool.name,land:land.name,omen:omen.name,omenYield:omen.yieldMul,techYield:te.yieldMul,lateMul,disasterMul,timingMul,keepBag,reservedSeeds,yieldKg:Math.floor(kg*multiplier*ecoMultiplier*omen.yieldMul*tool.yieldMul*te.yieldMul*lateMul*disasterMul)}
}
// —— 时间：夏季以「游戏内天」推进。1 天 = 现实 20 秒，巡田可把进度整体提前 1 天。——
export function dayLeftMs(s,now=0){if(s.season!=='summer')return 0;const cap=Math.max(1,s.growTarget||3);if(s.growth>=cap)return 0;return Math.max(0,(s.seasonAt||0)+(s.growth+1)*DAY_MS-now);}
// 推进 n 天：田土随之发干，跨过计划的节点就抛出引水 / 虫害事件（一次只抛一个，处理完才继续走时间）。
// 注意：这里只改 growth，不动 seasonAt —— 时间基准由 tick / 巡田统一维护。
function advanceDays(s,n){
 const cap=Math.max(1,s.growTarget||3),before=s.growth
 s.growth=Math.min(cap,before+n)
 for(let d=before+1;d<=s.growth;d++){
  s.moisture=clamp(s.moisture-8)
  if(!s.plan?.waterDone&&d>=(s.plan?.waterDay||99)){s.plan.waterDone=true;s.pending={type:'water',id:`${s.year}-water`};note(s,NARR.waterNeed());break}
  if(!s.plan?.pestDone&&d>=(s.plan?.pestDay||99)){s.plan.pestDone=true;s.pests=s.plan.pestSeverity;s.pending={type:'pest',id:`${s.year}-pest`};note(s,NARR.pestOut());break}
 }
}
// 抽一个年景（每年开局 roll），并从不重复的池子里抽一条当年特殊事件。
function rollYear(s){
 s.omen=OMEN_KEYS[Math.floor(random(s)*OMEN_KEYS.length)%OMEN_KEYS.length]
 const pool=OMEN_EVENTS.filter(e=>!(s.omenEvents||[]).includes(e.id))
 if(pool.length){const ev=pool[Math.floor(random(s)*pool.length)%pool.length];s.omenEvents=[...(s.omenEvents||[]),ev.id].slice(-OMEN_EVENTS.length);s.omenEvent={id:ev.id,resolved:false};note(s,`今年乡里出了桩事：${ev.name}。`);}
 else s.omenEvent=null
}
// —— 包 O：季末结算。固定开销 + 随机例钱 + 稻米陈化，一次算清并留下面板数据。——
function settleSeason(s,ended){
 const x=s.sales??=newSales()
 const te=techEffects(s.story?.tech)
 const acres=planted(s)||(s.previousPlots||[]).filter(Boolean).length
 const pieces=(s.tools?.level||0)+1
 const rent=Math.round(ECON.rentPerAcre*acres),upkeep=Math.round(ECON.toolUpkeep*pieces),house=ECON.houseUpkeep
 const income=Math.max(0,Math.floor(x.seasonIncome||0))
 let bribe=0;if(income>0&&random(s)<ECON.bribeChance)bribe=Math.floor(income*ECON.bribeRate)
 const cost=rent+upkeep+house+bribe,paid=Math.min(x.wen,cost)
 x.wen=Math.max(0,x.wen-paid);x.seasonIncome=0;x.foodSold=0;x.riceSoldKg=0;x.season=s.season
 s.barter=0; // 每季重置「邻里换工」次数
 s.settle={year:s.year,ended,acres,income,rent,upkeep,house,bribe,cost,paid,short:cost-paid,net:income-cost}
 for(const lot of s.riceLots||[])lot.age++
 // 体力保底：防止「体力耗尽 + 无钱雇工 + 生态事件挂着」把整局卡死。
 const before=s.stamina;s.stamina=Math.max(s.stamina,ECON.staminaFloor)
 if(s.stamina>before)note(s,'歇了一季，身上的乏总算缓过来些。')
 if(bribe>0)note(s,NARR.bribe())
 note(s,NARR.settle(s.settle.net))
 // —— 包 I2：天工开物分支的持续影响（生态）与研发进度，都在季末一起走 ——
 if(te.ecoPerSeason){const b0=s.ecology;s.ecology=clamp(s.ecology+te.ecoPerSeason);if(Math.round(s.ecology)!==Math.round(b0))note(s,te.ecoPerSeason>0?`新法子养着地，田埂的生气回来一些（生态 +${te.ecoPerSeason}）。`:`新法子费地力，田埂的生气淡了一层（生态 ${te.ecoPerSeason}）。`)}
 tickResearch(s)
}
// —— 包 J1：进入新的一季。清节气计时 → 收尾拖着没处理的事件 → 结掉逾期的差事 → 派这一季的差事与事件。——
function enterSeason(s,NOW){
 s.seasonDay=0;s.termAt=NOW||0;s.termWarned=false
 autoResolvePending(s)
 tickQuests(s)
 rollQuests(s)
 rollEvents(s)
 // —— 包 K（第十四轮）：协作任务结工。认的是「任务派下去的那一季已经过完了」，
 //    所以这一句要放在换季之后（进到这里时 s.season 已经是新的一季）。没有任务时不掷骰，RNG 也不动。——
 settleCoopTasks(s)
 // —— 包 K：跨时空粮仓解锁「共用种子库」后，每一季开局公中都匀两份御稻米稻种。
 //    没有这个键（没倒过谷子 / 换台机器）就什么都不发生。——
 const coopSeed=granarySeedBonus()
 if(coopSeed>0){s.seedBag??={};const b=s.seedBag.royal||0;s.seedBag.royal=Math.min(ECON.seedCap,b+coopSeed);if(s.seedBag.royal>b)note(s,`从共用种子库领了 ${s.seedBag.royal-b} 份御稻米稻种——粮仓里存着众人攒下的谷子。`)}
 // —— 包 M2：新一季先看缸。酿够两季的那几口出酒入库，缸位随之腾出来。
 //    放在最后，是为了让这条消息压在本季差事/事件之上，玩家一进新季就看见。——
 const wine=matureVats(s.workshop,s.season,s.year)
 if(wine.matured.length){
  s.workshop=wine.workshop
  const total=wine.matured.reduce((n,v)=>n+v.quantity,0)
  const fine=wine.matured.filter(v=>v.fine).length
  note(s,`缸里的米酒熟了：${wine.matured.length} 口缸共出酒 ${total} 瓶${fine?`，其中 ${fine} 口火候十足`:''}，缸位空出来了。`)
 }
}
// —— 包 K：对外只暴露这一层。终章自己的 action 先分流，其余照旧交给内层，
//    成功之后再统一记一次四维（生态采样 / 银钱流水 / 道德抉择）。——
export function reduceFarm(current,action){
 if(typeof action?.type==='string'&&action.type.startsWith('finale:'))return reduceFinale(current,action)
 const next=reduceFarmInner(current,action)
 if(next.error||!next.state||next.state===current)return next
 return {state:trackFinale(current,next.state,action),error:null}
}
function reduceFarmInner(current,action){
 if(action.type==='space:switch'){const s=structuredClone(current);if(!['home','town'].includes(action.space))return {state:current,error:'空间无效。'};if(s.space===action.space)return {state:current,error:null};s.space=action.space;
  // —— 包 M4：家与镇之间隔着一条官道，来回都算赶路——耗 5 点体力，三成概率路遇奇遇。
  //    体力不足也照常走（路总要回），只是手记里要多一句「累得脚步发沉」。——
  const tired=s.stamina<TRAVEL_STAMINA
  s.stamina=Math.max(0,s.stamina-TRAVEL_STAMINA)
  s.log.unshift(action.space==='town'?`沿官道赶往上庄镇：市场、粮店和酒楼已开放。${tired?'（你累得脚步发沉）':''}`:`沿官道回到家。${tired?'（你累得脚步发沉）':''}`)
  travelEncounter(s)
  return {state:s,error:null};}
 if(action.type.startsWith('process:'))return reduceProcessing(current,action)
 if(action.type.startsWith('sales:'))return reduceSales(current,action)
 if(action.type.startsWith('story:'))return reduceStory(current,action)
 if(action.type.startsWith('book:'))return reduceVarieties(current,action)
 if(action.type.startsWith('social:'))return reduceSocial(current,action)
 if(action.type.startsWith('ending:'))return reduceEnding(current,action)
 if(action.type.startsWith('npc:'))return reduceNpc(current,action)
 if(current.workshop?.active&&action.type==='advance')return {state:current,error:'请先完成当前批次加工，再推进季节。'}
 const s=structuredClone(current);let error='';const fail=t=>{error=t;}
 const NOW=Number.isFinite(action.now)?action.now:0
 if(action.type==='tick'){
  // 时间必须由 UI 把真实时间戳传进来（engine 保持纯函数）。
  if(NOW){
   // 夏季：生长进度用 seasonAt 做基准，巡田会把这条线整体往前挪。
   if(s.season==='summer'&&!s.pending){
    if(!s.seasonAt)s.seasonAt=NOW-s.growth*DAY_MS
    const target=Math.floor((NOW-s.seasonAt)/DAY_MS)
    if(target>s.growth){const add=Math.min(target-s.growth,CATCHUP_MAX);const before=s.growth;advanceDays(s,add);s.seasonAt=NOW-s.growth*DAY_MS;if(add>1&&s.growth>before)note(s,NARR.tickLog(s.growth-before));}
   }
   // —— 包 J1：节气倒计时。termAt 是本季的自然时间起点，四季都走，且不受巡田影响。——
   if(!s.termAt)s.termAt=NOW
   const day=Math.min(TERM_DAYS+TERM_GRACE,Math.floor((NOW-s.termAt)/DAY_MS))
   if(day>(s.seasonDay||0)){s.seasonDay=day
    if(day>=TERM_DAYS&&!s.termWarned){s.termWarned=true;note(s,`${TERM_INFO[s.season].name}的农时过了——${TERM_INFO[s.season].warn}再拖下去，这一季的收成要打对折。`);}
    tickQuests(s)
   }
  }
 }else if(action.type==='detect'){
  if(s.detect&&s.detect.year===s.year&&s.detect.season===s.season)fail('本季的田情已经检测过了，等下一季再看。')
  else if(s.stamina<ECON.staminaDetect)fail(`体力不足 ${ECON.staminaDetect}，先歇一歇再检测。`)
  else{s.stamina-=ECON.staminaDetect;s.detect={year:s.year,season:s.season,at:Number.isFinite(action.at)?action.at:0};note(s,'你在田埂上取了一瓢水样，蹲下来细细看了一遍。');}
 }else if(action.type==='plant'){
  const vid=action.variety||s.riceVariety||'royal'
  const v=VARIETIES.find(x=>x.id===vid)
  const need=ECON.staminaPlant*(Number.isInteger(action.count)?action.count:0)
  if(s.season!=='spring')fail('只有春季谷雨可以插秧。')
  else if(!Number.isInteger(action.count)||action.count<1)fail('插秧亩数必须是正整数。')
  else if(!v)fail('没有这种稻种。')
  else if(action.count>seedOf(s,vid))fail(`种袋里的${v?v.name:''}只剩 ${seedOf(s,vid)} 份，不够插 ${action.count} 亩——去粮店补种，或向邻里借种。`)
  else if(action.count>10-planted(s))fail('空地不足。')
  else if(action.plot!==undefined&&(!Number.isInteger(action.plot)||action.plot<0||action.plot>=10||s.plots[action.plot]||action.count!==1))fail('请选择一亩空地。')
  else if(s.stamina<need)fail(`插秧 ${action.count} 亩要 ${need} 点体力，先歇一歇，或去镇上雇两个短工。`)
  else {s.plotVarieties??=Array(10).fill(null);let remaining=action.count;if(action.plot!==undefined){s.plots[action.plot]=true;s.plotVarieties[action.plot]=vid;}else for(let i=0;i<10&&remaining;i++)if(!s.plots[i]){s.plots[i]=true;s.plotVarieties[i]=vid;remaining--;}
    s.seedBag[vid]=Math.max(0,seedOf(s,vid)-action.count);if(s.seedBag[vid]===0)delete s.seedBag[vid]
    s.stamina-=need;s.riceVariety=vid
    // 等待期按已插秧品种里最慢的一茬算
    s.growTarget=maxGrowDays(s.plots.flatMap((p,i)=>p?[plotVarietyOf(s,i)]:[]))
    note(s,NARR.plant(action.count,v.name));}
 }else if(action.type==='seed:buy'){
  const vid=action.variety||'royal',v=VARIETIES.find(x=>x.id===vid)
  const n=Math.floor(Number(action.count)),price=seedPriceOf(vid)
  const b=s.varietyBook||{}
  if(!v)fail('没有这种稻种。')
  else if(!Number.isFinite(n)||n<1)fail('购买种子的数量必须是正整数。')
  else if(vid!=='royal'&&!(b.harvested||[]).includes(vid)&&!(b.unlocked||[]).includes(vid))fail(`粮店只有御稻米的现货，${v.name}得先在田里种出来，或收录进图鉴，粮店才会进货。`)
  else if(seedOf(s,vid)+n>ECON.seedCap)fail(`同一种稻种最多存 ${ECON.seedCap} 份。`)
  else if((s.sales?.wen||0)<n*price)fail(`买 ${n} 份${v.name}要 ${n*price} 文，还差 ${n*price-(s.sales?.wen||0)} 文。`)
  else{s.sales.wen-=n*price;s.seedBag[vid]=seedOf(s,vid)+n;note(s,NARR.buySeed(n,v.name));}
 }else if(action.type==='seed:beg'){
  const key=`${s.year}-${s.season}`
  if(s.seedBeg===key)fail('这一季已经向邻里借过种了。')
  else if(seedTotal(s)>0)fail('种袋里还有种子，先把它们种下去。')
  else if(s.season!=='spring')fail('借来的种也得等到春天才能下地。')
  else{s.seedBeg=key;for(const [k,n] of Object.entries(BEG_SEEDS))s.seedBag[k]=seedOf(s,k)+n;note(s,NARR.beg());}
 }else if(action.type==='hire'){
  if(s.stamina>=100)fail('体力是满的，不必再雇工。')
  else if((s.sales?.wen||0)>=ECON.hireCost){s.sales.wen-=ECON.hireCost;s.stamina=clamp(s.stamina+ECON.hireStamina);note(s,NARR.hire());}
  else if((s.barter||0)<ECON.barterPerSeason){
   // 逃生口：钱不够也能靠邻里换工回体力，否则「体力耗尽 + 无钱 + 事件挂着」会把整局卡死。
   s.barter=(s.barter||0)+1;s.stamina=clamp(s.stamina+ECON.hireStamina);note(s,NARR.barter())
  }
  else fail(`雇短工要 ${ECON.hireCost} 文，钱不够；本季的邻里换工也已经用过了。`)
 }else if(action.type==='inspect'){
  // 巡田改为「催一天」：把整条时间线提前一个游戏天，每季有次数上限。
  if(s.season!=='summer')fail('当前无需巡田。')
  else if(s.pending)fail('请先处理眼前的生态事件。')
  else if(s.growth>=(s.growTarget||3))fail('稻子已经长足，该进秋分了。')
  else if((s.inspectUsed||0)>=INSPECT_LIMIT)fail(`本季下田催苗已用满 ${INSPECT_LIMIT} 次，剩下的交给时间。`)
  else if(s.stamina<ECON.staminaInspect)fail(`巡田要 ${ECON.staminaInspect} 点体力，先歇一歇，或去镇上雇两个短工。`)
  else{
   s.stamina-=ECON.staminaInspect;s.inspectUsed=(s.inspectUsed||0)+1
   if(!s.seasonAt)s.seasonAt=NOW-s.growth*DAY_MS
   s.seasonAt-=DAY_MS
   advanceDays(s,1)
   note(s,NARR.inspect(s.inspectUsed))
  }
 }else if(action.type==='water'){
  const c=WATER[action.choice],omen=omenOf(s),te=techEffects(s.story?.tech)
  // —— 包 I2：水车（龙骨水车 / 筒车）能压引水工钱 ——
  const wen=Math.round((c?.wen||0)*omen.waterCostMul*te.waterCostMul)
  if(s.season!=='summer'||s.pending?.type!=='water'||!c)fail('当前没有可处理的水源事件。')
  else if((s.sales?.wen||0)<wen)fail(`引${c.name}要 ${wen} 文工钱，钱还不够。`)
  else if(s.stamina<(c.stamina||0))fail(`引${c.name}要 ${c.stamina} 点体力，先歇一歇，或去镇上雇两个短工。`)
  else{
   if(wen)s.sales.wen-=wen;s.stamina-=(c.stamina||0)
   s.water=clamp(s.water+c.quality);s.ecology=clamp(s.ecology+c.ecology);s.moisture=clamp(s.moisture+20)
   if(c.riskPest&&random(s)<c.riskPest){s.pests=clamp(s.pests+c.riskPestAdd);note(s,'河里的虫卵跟着水进了田，稻叶上很快起了虫影。');}
   s.pending=null;note(s,NARR.water[action.choice])
  }
 }else if(action.type==='pest'){
  const c=PEST[action.choice]
  if(s.season!=='summer'||s.pending?.type!=='pest'||!c)fail('当前没有可处理的虫害事件。')
  else if((s.sales?.wen||0)<(c.wen||0))fail(`${c.name}要 ${c.wen} 文，钱还不够。`)
  else if(s.stamina<(c.stamina||0))fail(`${c.name}要 ${c.stamina} 点体力，先歇一歇，或去镇上雇两个短工。`)
  else{
   if(c.wen)s.sales.wen-=c.wen;s.stamina-=(c.stamina||0)
   if(c.pests!==undefined)s.pests=clamp(c.pests)
   if(c.pestRate!==undefined)s.pests=round(clamp(s.pests*c.pestRate))
   if(c.pestsDelta)s.pests=clamp(s.pests+c.pestsDelta)
   s.ecology=clamp(s.ecology+c.ecology)
   if(c.yieldsCrabs)s.plan={...s.plan,useCrab:true}
   s.pending=null;note(s,NARR.pest[action.choice])
  }
 }else if(action.type==='omen:resolve'){
  const ev=OMEN_EVENT_MAP[s.omenEvent?.id]
  if(!ev||s.omenEvent.resolved)fail('眼下没有待处置的乡里事。')
  else if(!['pay','resist'].includes(action.choice))fail('请选择如何应对。')
  else if(action.choice==='pay'){
   const c=ev.pay||{}
   if((s.sales?.wen||0)<(c.wen||0))fail(`要出 ${c.wen} 文，还差 ${c.wen-(s.sales?.wen||0)} 文。`)
   else if(s.rice<(c.rice||0))fail(`要抵 ${c.rice} kg 稻米，仓里不够。`)
   else{
    if(c.wen)s.sales.wen-=c.wen;if(c.rice)s.rice-=c.rice
    const g=ev.gain||{};if(g.ecology)s.ecology=clamp(s.ecology+g.ecology);if(g.pests)s.pests=clamp(s.pests+g.pests)
    if(g.rice)s.rice+=g.rice
    s.omenEvent={id:ev.id,resolved:true,choice:'pay'};note(s,`${ev.name}：${NARR.omenResolve(true)}`)
   }
  }else{
   const r=ev.resist||{}
   if(r.stamina&&s.stamina<r.stamina)fail(`硬扛要 ${r.stamina} 点体力，你眼下扛不住，还是出钱吧。`)
   else{
    if(r.stamina)s.stamina=clamp(s.stamina-r.stamina);if(r.ecology)s.ecology=clamp(s.ecology-r.ecology);if(r.pests)s.pests=clamp(s.pests+r.pests)
    s.omenEvent={id:ev.id,resolved:true,choice:'resist'};note(s,`${ev.name}：${NARR.omenResolve(false)}`)
   }
  }
 }else if(action.type==='upgrade'){
  const kind=action.kind
  if(kind==='tool'){
   const cur=s.tools?.level||0
   if(cur>=TOOL_LEVELS.length-1)fail('农具已经置办到头了。')
   else{const next=TOOL_LEVELS[cur+1];if((s.sales?.wen||0)<next.cost)fail(`置办${next.name}要 ${next.cost} 文，还差 ${next.cost-(s.sales?.wen||0)} 文。`);else{s.sales.wen-=next.cost;s.tools={level:cur+1};note(s,NARR.upgrade(next.name,'tool'));}}
  }else if(kind==='land'){
   const cur=s.landLevel||0
   if(cur>=LAND_LEVELS.length-1)fail('土地已经养到顶级了。')
   else{const next=LAND_LEVELS[cur+1],cost=next.costPerAcre*10;if((s.sales?.wen||0)<cost)fail(`把十亩田改成${next.name}要 ${cost} 文，还差 ${cost-(s.sales?.wen||0)} 文。`);else{s.sales.wen-=cost;s.landLevel=cur+1;note(s,NARR.upgrade(next.name,'land'));}}
  }else if(kind==='workshop'){
   const cur=s.workshop?.rooms||1
   if(cur>=WORKSHOP_LEVELS.length)fail('作坊已经扩到最大。')
   else{const next=WORKSHOP_LEVELS[cur];if((s.sales?.wen||0)<next.cost)fail(`作坊扩到 Lv${next.level} 要 ${next.cost} 文，还差 ${next.cost-(s.sales?.wen||0)} 文。`);else{s.sales.wen-=next.cost;s.workshop={...s.workshop,rooms:next.level};note(s,NARR.upgrade('Lv'+next.level,'workshop'));}}
  }else if(kind==='house'){
   const cur=s.house?.level||0
   if(cur>=HOUSE_LEVELS.length-1)fail('老宅能改的都改完了。')
   else{const next=HOUSE_LEVELS[cur+1];if((s.sales?.wen||0)<next.cost)fail(`翻修出${next.name}要 ${next.cost} 文，还差 ${next.cost-(s.sales?.wen||0)} 文。`);else{s.sales.wen-=next.cost;s.house={level:cur+1};note(s,NARR.upgrade(next.name,'house'));}}
  }else fail('未知的升级项。')
 }else if(action.type==='harvest'){
  const te=techEffects(s.story?.tech),tool=toolOf(s),cost=Math.max(1,Math.round(ECON.staminaHarvest*tool.harvestStamina*te.staminaMul))
  if(s.season!=='autumn'||s.harvested)fail('当前无法重复收获。')
  else if(s.stamina<cost)fail(`收割要 ${cost} 点体力，先歇一歇，或去镇上雇两个短工。`)
  else{
   s.stamina-=cost
   s.result=estimate(s);s.result.varieties=[...new Set(s.plots.flatMap((p,i)=>p?[plotVarietyOf(s,i)]:[]))]
   // —— 包 K（第十四轮）：协作的两笔增益在落账之前一次算掉——
   //    试种成功 → 品质抬一档（只动品质，不动斤两；品质决定后面卖粮的价钱）；
   //    御赐犁头 → 实收多一成。两样都是取一次就用掉，不会攒着复用。——
   const coop=socialHarvestBonus(s)
   if(coop.qualityUp)s.result.quality=stepQuality(s.result.quality,coop.qualityUp)
   if(coop.yieldMul!==1)s.result.yieldKg=Math.round(s.result.yieldKg*coop.yieldMul)
   const kg=s.result.yieldKg
   // —— 包 J1：天灾减产改由随机事件系统给出（玩家限时应对，成败决定损失比例），
   //    误期惩罚也在 estimate 里一并算进 yieldKg。这里只做标记与清零，不再另掷一次骰子。——
   const loss=1-(s.result.disasterMul??1),disaster=loss>.001?Math.round(loss*100):null
   s.disasterLoss=0
   s.result.yieldKg=kg;s.result.disaster=disaster
   s.rice+=kg;if(kg>0){s.riceLots=s.riceLots||[];s.riceLots.push({kg,age:0,quality:s.result.quality});}
   // 留种按品种分别入库（每块地留自己那一茬的六成）
   const keep=s.result.keepBag||{};s.seedBag??={}
   for(const [k,n] of Object.entries(keep))if(n>0)s.seedBag[k]=Math.min(ECON.seedCap,seedOf(s,k)+n)
   if(kg>0){s.varietyBook.harvested??=[];s.varietyBook.harvested=[...new Set([...s.varietyBook.harvested,...s.result.varieties])];
    // 品种档案「种植」碎片（I1-2）：今年实收的每个品种各 roll 一次，45%~70% 概率。
    for(const id of s.result.varieties)awardShard(s,id,'plant');
   }s.harvested=true;s.previousPlots=[...s.plots];s.prevPlotVarieties=[...(s.plotVarieties||[])];s.history.unshift(s.result);s.history=s.history.slice(0,10)
   note(s,disaster?NARR.shortage():NARR.harvest())
   // —— 包 K：协作带来的那两句说明，跟在收成手记后面 ——
   for(const w of coop.words)note(s,w)
   if(s.result.lateMul<1)note(s,'这一季误了农时，节气过了才动手——谷穗落了一层，收成只剩一半。')
   // 稻田蟹：夏季投过蟹苗的，或已研成「稻田养蟹」的，秋后都能捕一篓
   if(s.plan?.useCrab||te.crabBonus){const n=planted(s);if(n>0){s.crabs+=n;note(s,NARR.crabCatch(n));}}
   // 耕织图碎片只能靠玩法掉：秋收品质不低于「良」时才有机会寻得一片。
   if(s.result.quality!=='劣'&&random(s)<.6)awardFragment(s,'plant')
  }
 }else if(action.type==='advance'){
  if(s.pending)fail('生态事件尚未处理。')
  else if(s.season==='spring'){
   if(!planted(s))fail('至少插秧 1 亩才能进入生长季。')
   else{
    const target=s.growTarget||maxGrowDays(s.plots.flatMap((p,i)=>p?[plotVarietyOf(s,i)]:[]))
    const omen=omenOf(s)
    s.growTarget=Math.min(7,Math.max(3,target+omen.growAdd))
    const waterDay=Math.max(1,Math.ceil(s.growTarget/3)),pestDay=Math.max(waterDay+1,Math.ceil(s.growTarget*2/3))
    // —— 包 I2：稻蟹共生 / 药剂除虫的分支，直接压当年虫口初值（药剂几乎清零）——
    const te=techEffects(s.story?.tech)
    s.plan={waterDay,pestDay,pestSeverity:clamp(Math.round((40+Math.floor(random(s)*31)+omen.pestAdd)*te.pestMul)-te.pestCut),waterDone:false,pestDone:false,useCrab:false}
    s.growth=0;s.inspectUsed=0;s.seasonAt=NOW
    s.latePrev=s.latePrev||missedTerm(s)
    s.season='summer';note(s,`小暑到来，${omen.name}。这一茬要长 ${s.growTarget} 天，田里的事会自己找上门。`);settleSeason(s,'spring');enterSeason(s,NOW);
   }
  }else if(s.season==='summer'){
   if(s.growth<(s.growTarget||3))fail(`稻子还差 ${(s.growTarget||3)-s.growth} 天才长足，可以下田巡一趟催一催，或者等时间过去。`)
   else{s.latePrev=s.latePrev||missedTerm(s);s.season='autumn';note(s,'秋分已至，金黄稻穗等待收割。');settleSeason(s,'summer');enterSeason(s,NOW);}
  }else if(s.season==='autumn'){
   if(!s.harvested){fail('请先收获并确认本年结算。')}
   else{s.season='winter';note(s,'冬至休耕。土地休养，种子入库。');settleSeason(s,'autumn');enterSeason(s,NOW);s.latePrev=false;}
  }else if(s.season==='winter'){
   s.year++;s.season='spring';s.plots.fill(false);s.plotVarieties=Array(10).fill(null);s.moisture=70;s.water=40;s.ecology=clamp(s.ecology+10);s.pests=0;s.growth=0;s.growTarget=0;s.seasonAt=0;s.inspectUsed=0;s.pending=null;s.plan=null;s.harvested=false;s.result=null;s.latePrev=false;s.disasterLoss=0
   rollYear(s);note(s,NARR.winter());settleSeason(s,'winter');enterSeason(s,NOW);
   // 休耕就是养回来：体力回满放在所有季末结算与遗留事件之后，免得「冬天的破事」把休耕的意义吃掉。
   s.stamina=100
  }
 }else if(action.type==='quest:fulfill'){
  const e=questFulfill(s,action.quest);if(e)fail(e)
 }else if(action.type==='quest:giveup'){
  const e=questGiveup(s,action.quest);if(e)fail(e)
 }else if(action.type==='event:choose'){
  const e=eventChoose(s,action.event,action.choice);if(e)fail(e)
 }else if(action.type==='event:accept'){
  const e=eventAccept(s,action.event);if(e)fail(e)
 }else if(action.type==='event:disaster'){
  const e=disasterResolve(s,action.event,action.hits);if(e)fail(e)
 }else if(action.type==='hotspot:touch'){
  const e=touchHotspot(s,action.id);if(e)fail(e)
 }else fail('未知农事操作。')
 return error?{state:current,error}:{state:s,error:null}
}
export function readSave(raw){
 try{const s=JSON.parse(raw);if(!s||![1,2,3,4,5,6,7,8,9,10].includes(s.version)||!TERMS[s.season]||s.land!==10) return null
 const legacy=s.version<4,legacyFinale=s.version<8;s.version=10;s.space??='home';s.ending??=null;if(!s.ui||typeof s.ui!=='object')s.ui={showNumbers:false};else if(typeof s.ui.showNumbers!=='boolean')s.ui.showNumbers=false;if(s.detect===undefined)s.detect=null
  if(!Array.isArray(s.riceLots))s.riceLots=[]
  if(!Number.isSafeInteger(s.barter)||s.barter<0||s.barter>ECON.barterPerSeason)s.barter=0
  s.riceLots=s.riceLots.filter(l=>l&&Number.isFinite(l.kg)&&l.kg>0&&Number.isFinite(l.age)&&l.age>=0).map(l=>({kg:Math.floor(l.kg),age:Math.floor(l.age),quality:QUALITY_ORDER.includes(l.quality)?l.quality:'良'}))
  if(s.settle===undefined)s.settle=null
  if(!s.tools||typeof s.tools!=='object'||!Number.isFinite(s.tools.level)||s.tools.level<0||s.tools.level>7)s.tools={level:0}
  // —— 包 B：v3 旧档的单一 seeds 数字迁移成按品种的种袋 ——
  if(!s.seedBag||typeof s.seedBag!=='object'||Array.isArray(s.seedBag)){
   if(Number.isSafeInteger(s.seeds)&&s.seeds>=0)s.seedBag={royal:Math.min(ECON.seedCap,s.seeds)};else return null
  }
  for(const [id,n] of Object.entries(s.seedBag)){if(!VARIETIES.some(v=>v.id===id)||!Number.isSafeInteger(n)||n<0||n>ECON.seedCap)return null;if(n===0)delete s.seedBag[id];}
  delete s.seeds
  if(!Number.isSafeInteger(s.landLevel)||s.landLevel<0||s.landLevel>LAND_LEVELS.length-1)s.landLevel=0
  if(!s.house||typeof s.house!=='object'||!Number.isSafeInteger(s.house.level)||s.house.level<0||s.house.level>HOUSE_LEVELS.length-1)s.house={level:0}
  if(!OMEN_KEYS.includes(s.omen))s.omen='normal'
 // —— 包 J1：声望 / 节气计时 / 限时任务 / 随机事件。v5 及以前的旧档没有这些字段，补默认值而不是丢档。——
 if(!Number.isFinite(s.reputation))s.reputation=REP_START
 s.reputation=clampRep(s.reputation)
 if(!Number.isSafeInteger(s.seasonDay)||s.seasonDay<0||s.seasonDay>TERM_DAYS+TERM_GRACE)s.seasonDay=0
 if(!Number.isFinite(s.termAt)||s.termAt<0)s.termAt=0
 if(typeof s.termWarned!=='boolean')s.termWarned=false
 if(typeof s.latePrev!=='boolean')s.latePrev=false
 if(!Number.isFinite(s.disasterLoss)||s.disasterLoss<0||s.disasterLoss>1)s.disasterLoss=0
 const jq=normalizeQuests(s.quests);if(!jq)return null;s.quests=jq
 const je=normalizeEvents(s.events);if(!je)return null;s.events=je
// —— 包 J2：场景热点。v6 及以前的档没有这张表，补一份空的（里头没记录，不影响旧档权益）。——
const jh=normalizeHotspots(s.hotspots);if(!jh)return null;s.hotspots=jh
// —— 包 K：四维终章。v7 及以前的档没有这份记录，用当前生态起一个均值样本；
//    旧档一律标 legacy，终章页里并列展示旧判定表，不夺走玩家的旧权益。——
if(s.finale===undefined)s.finale=newFinale(Number.isFinite(s.ecology)?s.ecology:50)
const jf=normalizeFinale(s.finale);if(!jf)return null;s.finale=jf
if(legacyFinale)jf.legacy=true
// —— 包 M3：镇上街坊簿。v9 及以前的档没有这份簿子，补一份空的（交情从零起）。——
const jn=normalizeNpc(s.npc);if(!jn)return null;s.npc=jn
// —— 包 A：档位卡上要显示账号名与「最近下田」时间。老档没有这份资料，补默认值，不丢档。——
if(!s.profile||typeof s.profile!=='object'||Array.isArray(s.profile))s.profile={name:'林宇的田',savedAt:0}
else{const n=typeof s.profile.name==='string'?s.profile.name.trim().slice(0,16):'';s.profile={name:n||'林宇的田',savedAt:Number.isFinite(s.profile.savedAt)&&s.profile.savedAt>0?s.profile.savedAt:0}}
  if(!Array.isArray(s.omenEvents)||s.omenEvents.some(id=>!OMEN_EVENT_MAP[id]))s.omenEvents=[]
  else s.omenEvents=[...new Set(s.omenEvents)].slice(-OMEN_EVENTS.length)
  if(s.omenEvent!==null&&(!s.omenEvent||!OMEN_EVENT_MAP[s.omenEvent.id]||typeof s.omenEvent.resolved!=='boolean'))s.omenEvent=null
  if(typeof s.riceVariety!=='string'||!YIELD_TABLE[s.riceVariety])s.riceVariety='royal'
  if(!Array.isArray(s.plotVarieties)||s.plotVarieties.length!==10||s.plotVarieties.some(id=>id!==null&&!Object.hasOwn(YIELD_TABLE,id)))s.plotVarieties=Array(10).fill(null)
  if(!Array.isArray(s.prevPlotVarieties)||s.prevPlotVarieties.length!==10||s.prevPlotVarieties.some(id=>id!==null&&!Object.hasOwn(YIELD_TABLE,id)))s.prevPlotVarieties=Array(10).fill(null)
  if(!Number.isSafeInteger(s.growTarget)||s.growTarget<0||s.growTarget>7)s.growTarget=0
  if(!Number.isFinite(s.seasonAt)||s.seasonAt<0)s.seasonAt=0
  if(!Number.isSafeInteger(s.inspectUsed)||s.inspectUsed<0||s.inspectUsed>INSPECT_LIMIT)s.inspectUsed=0
  if(typeof s.seedBeg!=='string'&&s.seedBeg!==undefined)s.seedBeg=undefined
  if(!['home','town'].includes(s.space)||!(s.ending===null||['merchant','hermit','traveler','corrupt'].includes(s.ending)))return null
  for(const k of ['year','crabs','rice','growth','rng'])if(!Number.isSafeInteger(s[k])||s[k]<0)return null
  if(s.year<1||s.growth>7||s.rng>4294967295)return null
  for(const k of ['moisture','water','ecology','pests','stamina'])if(!Number.isFinite(s[k])||s[k]<0||s[k]>100)return null
  if(![s.plots,s.previousPlots].every(a=>Array.isArray(a)&&a.length===10&&a.every(x=>typeof x==='boolean')))return null
  if(!Array.isArray(s.log)||!s.log.every(x=>typeof x==='string')||!Array.isArray(s.history)||typeof s.harvested!=='boolean')return null
  for(const h of [s.result,...s.history])if(h?.varieties!==undefined&&(!Array.isArray(h.varieties)||new Set(h.varieties).size!==h.varieties.length||h.varieties.some(id=>!Object.hasOwn(YIELD_TABLE,id))))return null
  if(s.pending!==null&&(!['water','pest'].includes(s.pending?.type)||typeof s.pending.id!=='string'))return null
  // —— 包 B：季节计划从「巡田第几次」改为「第几天」——
  if(legacy&&s.plan&&s.plan.waterTurn!==undefined){s.plan={waterDay:s.plan.waterTurn,pestDay:s.plan.pestTurn,pestSeverity:s.plan.pestSeverity,waterDone:false,pestDone:false,useCrab:!!s.plan.useCrab};}
  if(s.season==='summer'){
   if(!s.plan||![1,2,3].includes(s.plan.waterDay)||![2,3,4,5,6,7].includes(s.plan.pestDay)||s.plan.pestDay<=s.plan.waterDay||typeof s.plan.waterDone!=='boolean'||typeof s.plan.pestDone!=='boolean'||!Number.isInteger(s.plan.pestSeverity)||s.plan.pestSeverity<0||s.plan.pestSeverity>100)return null
   if(s.growTarget<3||s.growTarget>7)s.growTarget=3
   if(s.growth>s.growTarget)s.growth=s.growTarget
  }else if(s.season!=='summer'&&s.plan!==null&&s.plan!==undefined){s.plan=null}
  if(s.pending&&s.season!=='summer')return null
  if(s.season==='winter'&&!s.harvested)return null
  if(s.harvested&&(!s.result||!QUALITY_ORDER.includes(s.result.quality)||!['yieldKg','score','ecoMultiplier','reservedSeeds'].every(k=>Number.isFinite(s.result[k])&&s.result[k]>=0)))return null
  const workshop=normalizeWorkshop(s.workshop);if(!workshop)return null;const sales=normalizeSales(s.sales);if(!sales)return null;const story=normalizeStory(s.story);if(!story)return null;if(legacy&&s.varietyBook&&s.varietyBook.harvested===undefined){const records=[s.result,...s.history].filter(h=>h&&h.yieldKg>0);s.varietyBook.harvested=[...new Set(records.flatMap(h=>Array.isArray(h.varieties)?h.varieties:['royal']))].filter(id=>Object.hasOwn(YIELD_TABLE,id));}const varietyBook=normalizeVarietyBook(s.varietyBook);if(!varietyBook)return null;const social=normalizeSocial(s.social);if(!social)return null;s.workshop=workshop;s.sales=sales;s.story=story;s.varietyBook=varietyBook;s.social=social
  // —— 包 K：旧档已用旧表选过结局的，把这一选择翻成新表的三选一，
  //    免得老玩家打开终章页看见「还没交贡米」。四维读数此时已能算（varietyBook 已归一化）。——
  if(s.finale.choice===null&&['merchant','hermit','traveler','corrupt'].includes(s.ending)){
   s.finale.choice=s.ending==='hermit'?'decline':s.ending==='corrupt'?'skimp':'tribute'
   s.finale.verdict={id:s.ending,m:finaleMetrics(s)}
  }
  return s
 }catch{return null;}
}
