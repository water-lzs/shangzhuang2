// 包 I2 / Q-9.9：天工开物从「花钱立即解锁」改为「立项研发」。
// 每项科技：文 + 稻米 + 1~4 季研发时间 + 30% 失败率（失败损失全部投入，但分支选择保留）。
// 二选一分支同时影响生态值与后续科技的解锁条件（拖拉机需生态 ≥ 50，走化肥/药剂路线的得先把地养回来）。
import {nextRandom} from './rng.js'
export const SEASON_ORDER=['spring','summer','autumn','winter']
export const SEASON_NAME={spring:'春',summer:'夏',autumn:'秋',winter:'冬'}
// —— 科技表：after = 前置科技；needEco = 立项时的生态门槛；branches = 二选一，一经选定不可更改 ——
// 分支效果字段：yieldMul 产量系数 / staminaMul 收割体力系数 / waterCostMul 引水工钱系数 /
//   eco 研发成功一次性生态 / ecoPerSeason 每季生态 / pestMul 虫害初值系数 / pestCut 虫害初值额外扣减 /
//   crabBonus 秋后捕蟹
export const TECHS={
 plow:{name:'曲辕犁',tier:1,after:[],desc:'改一改犁具，翻土深浅由人，田里的活计松快些。',cost:{wen:200,rice:150},seasons:1,failRate:.3,
  branches:{
   deep:{name:'深耕犁',desc:'犁头入土深，根扎得牢、穗子更实，可也费力气、耗地力。',note:'犁头吃进三寸土，翻起来的泥块都是黑的。',yieldMul:1.08,staminaMul:1.1,eco:-2},
   light:{name:'轻便犁',desc:'木身轻，一人一牛就拉得动，收割时省下不少力气。',note:'新犁轻得能拎起来，走在田埂上不陷脚。',yieldMul:1.02,staminaMul:.78,eco:0}}},
 compost:{name:'堆肥',tier:1,after:[],desc:'秸秆河泥沤成肥，喂田也喂稻。',cost:{wen:300,rice:250},seasons:2,failRate:.3,
  branches:{
   chemical:{name:'化肥',desc:'肥效来得猛，产量涨得快，可田土一年年板结，水生也一年年寡淡。',note:'白花花的肥撒下去，稻子三天就窜了一截。',yieldMul:1.15,ecoPerSeason:-5,eco:-6},
   organic:{name:'有机肥',desc:'沤得慢、肥力温和，田里的生气反而更足。',note:'肥堆底下的蚯蚓比往年多了一倍。',yieldMul:1.05,ecoPerSeason:3,eco:2}}},
 waterwheel:{name:'水车',tier:2,after:['plow'],desc:'架上水车，引水不必再全凭人力挑。',cost:{wen:500,rice:400},seasons:2,failRate:.3,
  branches:{
   dragon:{name:'龙骨水车',desc:'连斗提水，快且省工钱，只是要用上好木料。',note:'水从斗里一级级翻上来，渠口的泥都被冲开了。',waterCostMul:.5,eco:-1},
   sweep:{name:'筒车',desc:'借水力自转，慢一些，却与河渠相安。',note:'筒车夜里也不停，水声比人挑水时匀。',waterCostMul:.75,ecoPerSeason:2}}},
 crab:{name:'稻蟹共生',tier:2,after:['compost'],desc:'蟹压虫、粪肥田，田里多养一样活物。',cost:{wen:600,rice:500},seasons:2,failRate:.3,
  branches:{
   pesticide:{name:'药剂除虫',desc:'一喷即净，虫口立时清零，田埂的生气也跟着淡了。',note:'药水泼过，田里静得听不见一声虫鸣。',pestMul:.25,pestCut:12,ecoPerSeason:-3},
   crabfarm:{name:'稻田养蟹',desc:'蟹苗下田要等，压虫慢，可秋后能捕一篓蟹换钱。',note:'蟹苗下了田，水渠里多了窸窣的动静。',pestMul:.6,ecoPerSeason:4,crabBonus:true}}},
 tractor:{name:'拖拉机',tier:3,after:['plow','waterwheel'],needEco:50,desc:'铁牛下田，翻地收割一气呵成。铁器费地，得先把水土养住才敢动工。',cost:{wen:3000,rice:2000},seasons:4,failRate:.3,
  branches:{
   big:{name:'大型农机',desc:'一昼夜翻完十亩，可油耗与地力损耗都不小。',note:'铁牛吼着走完十亩，泥香里混着柴油味。',yieldMul:1.25,staminaMul:.55,ecoPerSeason:-8},
   small:{name:'精细农机',desc:'走窄行、护田埂，稳当耐用，田里的活计也轻。',note:'小铁牛贴着田埂走，水渠一点没塌。',yieldMul:1.12,staminaMul:.65,ecoPerSeason:-2}}}
}
export const TECH_IDS=Object.keys(TECHS)
export const techById=id=>Object.hasOwn(TECHS,id)?TECHS[id]:null
export const branchOf=(id,b)=>techById(id)?.branches?.[b]||null
export const techStateOf=(tech,id)=>tech?.[id]?.state||'idle'
export const techDone=(tech,id)=>techStateOf(tech,id)==='done'
export const techBranchOf=(tech,id)=>tech?.[id]?.branch||null
export const idleTech=()=>({state:'idle',branch:null,progress:0,startedYear:0,startedSeason:null,doneYear:0,failed:0,invested:null})
export const newTechState=()=>Object.fromEntries(TECH_IDS.map(id=>[id,idleTech()]))
const clamp=(x,min=0,max=100)=>Math.min(max,Math.max(min,x))
// —— 旧档迁移：v4 之前是 {plow:false} 的买断结构，true 记为「已完成」并补上默认分支，不让玩家白白损失 ——
export function normalizeTech(tech){
 if(!tech||typeof tech!=='object'||Array.isArray(tech))return null
 const out={}
 for(const id of TECH_IDS){
  const def=TECHS[id],raw=tech[id]
  if(raw===undefined){out[id]=idleTech();continue}
  if(typeof raw==='boolean'){const b=Object.keys(def.branches)[0];out[id]={...idleTech(),state:raw?'done':'idle',branch:raw?b:null,progress:raw?def.seasons:0,doneYear:0,legacy:raw};continue}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
  if(!['idle','researching','done'].includes(raw.state))return null
  const branch=raw.branch??null
  if(branch!==null&&!def.branches[branch])return null
  if(raw.state==='researching'&&!branch)return null
  let progress=Number.isInteger(raw.progress)&&raw.progress>=0&&raw.progress<=def.seasons?raw.progress:0
  if(raw.state==='done')progress=def.seasons
  if(raw.state==='idle')progress=0
  out[id]={state:raw.state,branch,progress,startedYear:Number.isSafeInteger(raw.startedYear)&&raw.startedYear>=0?raw.startedYear:0,startedSeason:SEASON_ORDER.includes(raw.startedSeason)?raw.startedSeason:null,doneYear:Number.isSafeInteger(raw.doneYear)&&raw.doneYear>=0?raw.doneYear:0,failed:Number.isSafeInteger(raw.failed)&&raw.failed>=0?raw.failed:0,invested:raw.invested&&typeof raw.invested==='object'?{wen:Math.max(0,Math.floor(Number(raw.invested.wen)||0)),rice:Math.max(0,Math.floor(Number(raw.invested.rice)||0))}:null,legacy:raw.legacy===true}
 }
 return out
}
// —— 汇总所有已完成科技的分支效果（estimate / harvest / water / settleSeason 都要用，保持 O(5)）——
export function techEffects(tech){
 const e={yieldMul:1,staminaMul:1,waterCostMul:1,ecoPerSeason:0,pestMul:1,pestCut:0,crabBonus:false,picked:{}}
 if(!tech)return e
 for(const id of TECH_IDS){
  const st=tech[id]
  if(!st||st.state!=='done'||!st.branch)continue
  const b=TECHS[id].branches[st.branch]
  if(!b)continue
  e.picked[id]=st.branch
  if(b.yieldMul)e.yieldMul*=b.yieldMul
  if(b.staminaMul)e.staminaMul*=b.staminaMul
  if(b.waterCostMul)e.waterCostMul*=b.waterCostMul
  if(b.ecoPerSeason)e.ecoPerSeason+=b.ecoPerSeason
  if(b.pestMul)e.pestMul*=b.pestMul
  if(b.pestCut)e.pestCut+=b.pestCut
  if(b.crabBonus)e.crabBonus=true
 }
 for(const k of ['yieldMul','staminaMul','waterCostMul','pestMul'])e[k]=Math.round(e[k]*1000)/1000
 return e
}
// 三项数值系数的快捷读取（farm-engine 用）
export const techYieldMul=s=>techEffects(s?.story?.tech).yieldMul
export const techStaminaMul=s=>techEffects(s?.story?.tech).staminaMul
export const techWaterCostMul=s=>techEffects(s?.story?.tech).waterCostMul
export const techEcoPerSeason=s=>techEffects(s?.story?.tech).ecoPerSeason
export function techProgressText(st,def){return st.state==='researching'?`${def.name}·${def.branches[st.branch].name} 研至第 ${st.progress} / ${def.seasons} 季`:st.state==='done'?`${def.name}·${def.branches[st.branch]?.name||''} 已成`:`${def.name} 未立项`}
// 当前进行中的项目（UI 用）
export function techOngoing(tech){for(const id of TECH_IDS)if(techStateOf(tech,id)==='researching')return {id,st:tech[id],def:TECHS[id]};return null}
// 立项前的门槛检查：返回具体原因（无则为 null）
export function techReqMiss(s,id){
 const def=techById(id)
 if(!def)return '没有这项科技。'
 const t=s?.story?.tech
 if(!t)return '叙事存档无效。'
 const miss=(def.after||[]).filter(k=>!techDone(t,k)).map(k=>TECHS[k].name)
 if(miss.length)return `须先做成${miss.join('、')}，才谈得上${def.name}。`
 if(def.needEco&&(s.ecology||0)<def.needEco)return `${def.name}要水土养得住了才敢动工：眼下生态 ${Math.round(s.ecology)}，需到 ${def.needEco}。先把地养回来（引玉泉、人工捉虫、渡冬休耕都能回）。`
 return null
}
// —— 立项：扣材料、记分支、开始计时。s 是即将落库的 state（引擎内已 clone）——
export function techStart(s,id,branch){
 const def=techById(id),t=s?.story?.tech
 if(!def||!t)return '没有这项科技。'
 const st=t[id]
 if(!st)return '没有这项科技。'
 if(st.state==='researching')return `${def.name}已在研发中，等着便是。`
 if(st.state==='done')return `${def.name}已经成了。`
 const b=branchOf(id,branch)
 if(!b)return '请先选定一条路子。'
 const miss=techReqMiss(s,id)
 if(miss)return miss
 const wen=def.cost.wen||0,rice=def.cost.rice||0
 if((s.sales?.wen||0)<wen)return `立项要 ${wen} 文，还差 ${wen-(s.sales?.wen||0)} 文。`
 if(s.rice<rice)return `试制要耗 ${rice} kg 稻米，仓里还有 ${Math.floor(s.rice)} kg。`
 s.sales.wen-=wen;s.rice-=rice
 st.state='researching';st.branch=branch;st.progress=0;st.startedYear=s.year;st.startedSeason=s.season;st.invested={wen,rice}
 s.log.unshift(`天工开物：立下「${def.name}·${b.name}」的项目，投入 ${wen} 文、${rice} kg 稻米，约需 ${def.seasons} 季，成败难料。`)
 return null
}
// —— 季末结算：研发进度 +1；满期即 roll 成败（走 state.rng，读档重放一致）——
// 失败：损失全部投入（材料不退），但分支选择保留，可直接重投。
// 成功：记年份、给一次性生态变化。
export function tickResearch(s){
 const t=s?.story?.tech
 if(!t)return false
 let touched=false
 for(const id of TECH_IDS){
  const st=t[id],def=TECHS[id]
  if(!st||st.state!=='researching')continue
  touched=true
  st.progress=(st.progress||0)+1
  if(st.progress<def.seasons){s.log.unshift(`天工开物：${def.name}研到第 ${st.progress} / ${def.seasons} 季。`);continue}
  const blew=nextRandom(s)<(def.failRate||0)
  if(blew){
   st.state='idle';st.progress=0;st.invested=null;st.failed=(st.failed||0)+1
   s.log.unshift(`天工开物：${def.name}这一炉走了火，试试的工夫与材料全废了——好在路子已经摸清，原样重投就是。`)
  }else{
   const b=def.branches[st.branch]
   st.state='done';st.progress=def.seasons;st.doneYear=s.year;st.doneSeason=s.season;st.invested=null
   if(b?.eco)s.ecology=clamp(s.ecology+b.eco)
   s.log.unshift(`天工开物：${def.name}·${b?.name||''}成了。${b?.note||''}`)
  }
 }
 if(touched)s.log=s.log.slice(0,8)
 return touched
}
// 研发是否被「已投材料」卡住（重开提示用）
export function techNoticeText(legacyIds){
 const names=legacyIds.map(id=>TECHS[id]?.name).filter(Boolean)
 return `天工开物已经改作「立项研发」：要投材料、要等季数，还可能失手。${names.length?`旧账里已经买断的 ${names.join('、')} 按「已完成」记着，没有白费。`:''}若想从新规矩从头走一遍，可以重开新局。`
}
