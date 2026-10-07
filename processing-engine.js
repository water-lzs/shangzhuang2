import {ECON,WORKSHOP_LEVELS} from './economy.js'
import {awardFragment,awardShard} from './variety-engine.js'
import {nextRandom,pickIndex} from './rng.js'

// —— 包 M2：作坊四工艺 ——
// 四件器具各管一条工艺线，全部共用同一套节拍判定（tick / tap / completion），
// 只在「拍数、辅料、产出周期」上分化，不另写第二套判定逻辑。
export const VAT_SEASONS=2
export const SEASON_ORDER=['spring','summer','autumn','winter']
export const STATIONS={
 mill:{name:'石磨',glyph:'磨',line:'磨粉揭皮',desc:'磨粉、揭皮；出料快，照旧十二拍。'},
 mold:{name:'米糕模具',glyph:'糕',line:'三下敲击定品相',desc:'三下敲击定品相：三拍全中即出「上品」，售价 ×1.5。'},
 stove:{name:'灶台',glyph:'灶',line:'翻锅拉丝',desc:'翻锅、拉丝；要按配方添蛋或米浆。'},
 vat:{name:'酿酒缸',glyph:'酿',line:'下曲陈酿',desc:'拌曲后入缸，静候两季成酒；一口缸一批，占满就得等。'}
}
export const STATION_ORDER=['mill','mold','stove','vat']
// 辅料：作坊里可以托人从镇上捎带，按市价入库。
export const SUNDRIES={egg:{name:'蛋',glyph:'蛋',unit:'个',price:8},riceMilk:{name:'米浆',glyph:'浆',unit:'份',price:5}}
export const RECIPES={
 riceball:{name:'饭团',glyph:'团',rice:2,base:12,unit:'份',cost:1,requires:[],step:'塑形',station:'mold',notes:3},
 flour:{name:'米粉',glyph:'粉',rice:3,base:18,unit:'份',cost:1,requires:[],step:'磨粉',station:'mill'},
 friedrice:{name:'蛋炒饭',glyph:'炒',rice:3,base:15,unit:'份',cost:1,requires:['riceball'],step:'翻锅',station:'stove',extra:{egg:1}},
 noodle:{name:'米线',glyph:'线',rice:4,base:20,unit:'份',cost:1,requires:['flour'],step:'拉丝',station:'stove',extra:{riceMilk:1}},
 roll:{name:'肠粉',glyph:'卷',rice:4,base:20,unit:'份',cost:1,requires:['flour'],step:'揭皮',station:'mill'},
 cake:{name:'米糕',glyph:'糕',rice:5,base:24,unit:'份',cost:1,requires:['riceball'],step:'捣米',station:'mold',notes:3,premium:true},
 wine:{name:'酿酒',product:'米酒',glyph:'酿',rice:8,base:12,unit:'瓶',cost:2,requires:['cake'],step:'拌曲',station:'vat',seasons:VAT_SEASONS}
}
export const ROUTES={industrial:{name:'现代工业路线',output:1.2,perfect:90,good:210,interval:650,description:'产量 +20%；节奏更快，精准判定 ±90ms'},traditional:{name:'生态古法路线',output:1,perfect:140,good:280,interval:850,description:'节奏更舒缓；精准判定 ±140ms，更易高完成度'}}
export const NOTE_COUNT=12
// 拍数由配方定：米糕模具三拍，其余十二拍。判定公式只认 a.hits 的长度，因此一套逻辑通吃。
export const noteCountOf=recipe=>RECIPES[recipe]?.notes||NOTE_COUNT
export const stationOf=recipe=>RECIPES[recipe]?.station||'mill'
export const sundriesOf=recipe=>Object.entries(RECIPES[recipe]?.extra||{})
// 缸位：作坊 Lv1 起两口缸，每扩建一级多一口，最多六口。
export const vatSlotsOf=w=>Math.max(2,Math.min(WORKSHOP_LEVELS.length+1,(w?.rooms||1)+1))
export const emptyCounts=()=>Object.fromEntries(Object.keys(RECIPES).map(k=>[k,0]))
export function newWorkshop(){return {route:null,rooms:1,points:2,learned:[],foods:emptyCounts(),serial:0,completed:0,active:null,last:null,tutorialSeen:false,pantry:{egg:0,riceMilk:0},premium:emptyCounts(),vats:[],vintSerial:0,stats:{riceUsed:0,foodMade:0,completionTotal:0,batches:0,legacy:false}};}
export function normalizeWorkshop(w){
 if(w===undefined)return newWorkshop()
 w=structuredClone(w)
 if(!w||!(w.route===null||ROUTES[w.route])||!Number.isSafeInteger(w.points)||w.points<0||!Array.isArray(w.learned)||w.learned.some(k=>!RECIPES[k])||new Set(w.learned).size!==w.learned.length)return null
 if(!['serial','completed'].every(k=>Number.isSafeInteger(w[k])&&w[k]>=0)||w.completed>w.serial)return null
 if(!w.foods||Object.keys(RECIPES).some(k=>!Number.isSafeInteger(w.foods[k])||w.foods[k]<0))return null
 if(w.last!==null&&(!w.last||!RECIPES[w.last.recipe]||!Number.isFinite(w.last.completion)||!Number.isSafeInteger(w.last.quantity)||w.last.quantity<0||typeof w.last.unit!=='string'))return null
 const a=w.active
 if(a){
  if(!ROUTES[w.route]||!RECIPES[a.recipe]||!w.learned.includes(a.recipe)||!Number.isSafeInteger(a.id)||a.id!==w.serial||!['ready','running','paused'].includes(a.phase))return null
  if(!Array.isArray(a.hits)||a.hits.length!==noteCountOf(a.recipe)||a.hits.some(x=>![null,0,.65,1].includes(x)))return null
  if(!Number.isFinite(a.elapsed)||a.elapsed<0||a.elapsed>duration(w)||!Number.isSafeInteger(a.strays)||a.strays<0||!Number.isFinite(a.lastTap))return null
  // A refreshed/backgrounded page resumes a paid batch; it never pays for it again.
  if(a.phase==='running')a.phase='paused'
 }
 if(w.tutorialSeen===undefined)w.tutorialSeen=w.completed>0
 if(typeof w.tutorialSeen!=='boolean')return null
 // 包 B：作坊扩建等级（Lv1~Lv5）。旧档缺这个字段一律按 Lv1 处理，不因此判存档无效。
 if(!Number.isSafeInteger(w.rooms)||w.rooms<1||w.rooms>WORKSHOP_LEVELS.length)w.rooms=1
 if(w.stats===undefined)w.stats={riceUsed:a?RECIPES[a.recipe].rice:0,foodMade:0,completionTotal:0,batches:0,legacy:w.completed>0}
 const t=w.stats;if(!t||!['riceUsed','foodMade','completionTotal','batches'].every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)||typeof t.legacy!=='boolean'||t.batches>w.completed||t.completionTotal>t.batches*100||(!t.batches&&(t.foodMade||t.completionTotal)))return null
 // —— 包 M2：辅料库 / 上品计数 / 发酵缸。旧档一律补空，不因缺字段拒档；数值坏了才拒。——
 if(w.pantry===undefined)w.pantry={egg:0,riceMilk:0}
 if(!w.pantry||typeof w.pantry!=='object'||Object.keys(SUNDRIES).some(k=>!Number.isSafeInteger(w.pantry[k])||w.pantry[k]<0))return null
 if(w.premium===undefined)w.premium=emptyCounts()
 if(!w.premium||typeof w.premium!=='object'||Object.keys(RECIPES).some(k=>!Number.isSafeInteger(w.premium[k])||w.premium[k]<0))return null
 // 上品份数只是「这批库存里有多少是上品」，卖了货自然不该比库存还多——超了就压回来，不拒档。
 Object.keys(RECIPES).forEach(k=>{if(w.premium[k]>w.foods[k])w.premium[k]=w.foods[k]})
 if(w.vintSerial===undefined)w.vintSerial=0
 if(!Number.isSafeInteger(w.vintSerial)||w.vintSerial<0)return null
 if(w.vats===undefined)w.vats=[]
 if(!Array.isArray(w.vats))return null
 const badVat=v=>!v||!Number.isSafeInteger(v.id)||v.id<1||v.id>w.vintSerial||!SEASON_ORDER.includes(v.putSeason)||!SEASON_ORDER.includes(v.readySeason)||!Number.isSafeInteger(v.putYear)||v.putYear<1||!Number.isSafeInteger(v.readyYear)||v.readyYear<1||!Number.isSafeInteger(v.completion)||v.completion<0||v.completion>100||!Number.isSafeInteger(v.quantity)||v.quantity<1||typeof v.fine!=='boolean'
 if(w.vats.some(badVat)||new Set(w.vats.map(v=>v.id)).size!==w.vats.length)return null
 // 缸位不够（例如坏档把 rooms 归了 1）时按投入先后保留先投的，绝不整档拒。
 if(w.vats.length>vatSlotsOf(w))w.vats=[...w.vats].sort((x,y)=>x.id-y.id).slice(0,vatSlotsOf(w))
 return w
}
export const targetTime=(w,i)=>1600+i*ROUTES[w.route].interval
export const duration=w=>{const n=noteCountOf(w?.active?.recipe);return targetTime(w,n-1)+ROUTES[w.route].good+650}
// 完成度只认 hits 数组长度，所以三拍与十二拍共用同一个公式。
export function completion(a){return Math.max(0,Math.min(1,a.hits.reduce((n,h)=>n+(h||0),0)/a.hits.length-a.strays*.025));}
// 包 O：加工损耗随技能等级下降——一个配方没学时 30%，每多学一个降 2.5%，最低 10%。
// 包 B / Q-9.14：作坊本身扩建（rooms 等级）也能再压一道损耗。
export const processLoss=w=>{const n=w?.learned?.length||0;const rooms=WORKSHOP_LEVELS[Math.max(0,Math.min(WORKSHOP_LEVELS.length-1,(w?.rooms||1)-1))].lossBonus;return Math.max(ECON.lossMin,Math.min(ECON.lossMax,ECON.lossMax-n*ECON.lossStep-rooms));}
export function processEstimate(w,recipe,score){const r=RECIPES[recipe]||{};const route=ROUTES[w.route]||ROUTES.traditional;return Math.max(1,Math.floor((r.base||0)*(.5+score)*route.output*(1-processLoss(w))));}
// 包 M2：上品条件——配方标了 premium，且三/十二拍全精准、一次空击都没有。
export const isPremium=(a,r=RECIPES[a?.recipe])=>!!(r&&r.premium&&Array.isArray(a?.hits))&&a.hits.length>0&&a.strays===0&&a.hits.every(h=>h===1)
export const seasonRank=(season,year)=>(year||1)*4+Math.max(0,SEASON_ORDER.indexOf(season))
export const readyAt=(season,year,seasons)=>{const i=seasonRank(season,year)+seasons;return {season:SEASON_ORDER[i%4],year:Math.floor(i/4)}}
export const seasonLeft=(v,season,year)=>Math.max(0,seasonRank(v.readySeason,v.readyYear)-seasonRank(season,year))
const seasonName={spring:'春',summer:'夏',autumn:'秋',winter:'冬'}
export const seasonLabel=(season,year)=>`第${year}年${seasonName[season]||''}`
function tick(w,elapsed){const a=w.active,n=a.hits.length;a.elapsed=Math.max(a.elapsed,Math.min(duration(w),elapsed));for(let i=0;i<n;i++)if(a.hits[i]===null&&a.elapsed>targetTime(w,i)+ROUTES[w.route].good)a.hits[i]=0;}
export const missingSundries=(w,recipe)=>sundriesOf(recipe).filter(([k,n])=>(w.pantry?.[k]||0)<n).map(([k])=>k)
export const sundryText=(w,recipe)=>sundriesOf(recipe).map(([k,n])=>`${SUNDRIES[k].name} ${w.pantry?.[k]||0}/${n}`).join(' · ')
// 包 M2：换季时把到期的缸取出来。回的是新 workshop 与这一季成熟的批次。
export function matureVats(workshop,season,year){
 const w=structuredClone(workshop),at=seasonRank(season,year),matured=[]
 w.vats=(w.vats||[]).filter(v=>{if(seasonRank(v.readySeason,v.readyYear)<=at){matured.push(v);return false}return true})
 for(const v of matured){w.foods.wine+=v.quantity;if(v.fine)w.premium.wine+=v.quantity}
 return {workshop:w,matured}
}
export function reduceProcessing(current,action){
 const s=structuredClone(current);s.workshop??=newWorkshop();const w=normalizeWorkshop(s.workshop);if(!w)return {state:current,error:'作坊存档无效。'};if(s.workshop.active?.phase==='running')w.active.phase='running';s.workshop=w;let error=null
 const fail=t=>{error=t;};const a=w.active
 switch(action.type){
 case 'process:tutorial':w.tutorialSeen=true;break
 case 'process:route':if(a||w.serial>0)fail('首批加工开始后，本局科技路线固定。');else if(!ROUTES[action.route])fail('请选择有效路线。');else w.route=action.route;break
 case 'process:buy':{
  const k=action.sundry,p=SUNDRIES[k],n=Math.max(1,Math.min(20,Math.floor(Number(action.count)||1)))
  if(!p)fail('作坊里没有这种辅料。')
  else{const cost=p.price*n
   if((s.sales?.wen||0)<cost)fail(`买 ${n} ${p.unit}${p.name}要 ${cost} 文，银钱不够（现有 ${(s.sales?.wen||0).toLocaleString()} 文）。`)
   else{s.sales.wen-=cost;w.pantry[k]=(w.pantry[k]||0)+n;s.log.unshift(`托人从镇上捎带 ${n} ${p.unit}${p.name}，花去 ${cost} 文。`);s.log=s.log.slice(0,8)}
  }break
 }
 case 'process:learn':{const r=RECIPES[action.recipe];if(a)fail('请先完成当前加工。');else if(!w.route)fail('请先选择科技路线。');else if(!r)fail('配方不存在。');else if(w.learned.includes(action.recipe))fail('已学习该技能。');else if(r.requires.some(k=>!w.learned.includes(k)))fail('请先学习前置技能。');else if(w.points<r.cost)fail('技艺点不足；完成度达到 50% 的加工可获得 1 点。');else{w.points-=r.cost;w.learned.push(action.recipe);}break;}
 case 'process:start':{const r=RECIPES[action.recipe];const miss=missingSundries(w,action.recipe)
  if(a)fail('已有一批加工，请继续完成。')
  else if(!w.route)fail('请先选择科技路线。')
  else if(!r||!w.learned.includes(action.recipe))fail('请先学习配方。')
  else if(r.station==='vat'&&w.vats.length>=vatSlotsOf(w))fail(`缸位都占着（${w.vats.length}/${vatSlotsOf(w)} 口），等一出酒再来。`)
  else if(s.rice<r.rice)fail('稻米不足，请先在御田完成秋收。')
  else if(miss.length)fail(`灶上还差${miss.map(k=>SUNDRIES[k].name).join('、')}；先托人从镇上捎带。`)
  else{s.rice-=r.rice;w.stats.riceUsed+=r.rice;for(const [k,n] of sundriesOf(action.recipe))w.pantry[k]-=n;w.serial++;w.active={id:w.serial,recipe:action.recipe,phase:'ready',elapsed:0,hits:Array(noteCountOf(action.recipe)).fill(null),strays:0,lastTap:-1000};}break;}
 case 'process:resume':if(!a||a.phase==='running')fail('当前没有暂停的加工。');else a.phase='running';break
 case 'process:tick':case 'process:pause':case 'process:tap':{
  if(!a||a.phase!=='running')fail('请先开始或继续节奏。');else if(!Number.isFinite(action.elapsed)||action.elapsed<0)fail('无效计时。');else{
   tick(w,action.elapsed)
   if(action.type==='process:pause')a.phase='paused'
   if(action.type==='process:tap'&&a.elapsed-a.lastTap>=110){
    a.lastTap=a.elapsed;let best=-1,delta=Infinity;const n=a.hits.length;for(let i=0;i<n;i++)if(a.hits[i]===null){const d=Math.abs(a.elapsed-targetTime(w,i));if(d<delta){best=i;delta=d;}}
    if(best>=0&&delta<=ROUTES[w.route].good)a.hits[best]=delta<=ROUTES[w.route].perfect?1:.65;else a.strays++
   }
  }break
 }
 case 'process:finish':
  if(!a||a.elapsed<duration(w))fail('请先完成全部节拍。')
  else{const score=completion(a),r=RECIPES[a.recipe],quantity=processEstimate(w,a.recipe,score),fine=isPremium(a,r);w.completed++;const point=score>=.5?1:0;w.points+=point;w.stats.foodMade+=quantity;w.stats.completionTotal+=Math.round(score*100);w.stats.batches++;w.tutorialSeen=true
   w.last={id:a.id,recipe:a.recipe,name:r.product||r.name,completion:Math.round(score*100),quantity,unit:r.unit,rice:r.rice,route:w.route,point,perfect:a.hits.filter(x=>x===1).length,good:a.hits.filter(x=>x===.65).length,miss:a.hits.filter(x=>!x).length,strays:a.strays,fine,station:r.station,cured:!!r.seasons}
   if(r.seasons){
    // 长周期工艺：拌曲这一程入缸，占一口缸，等 r.seasons 个季节才成酒。
    const due=readyAt(s.season,s.year,r.seasons)
    w.vintSerial++;w.vats.push({id:w.vintSerial,batch:a.id,putSeason:s.season,putYear:s.year,readySeason:due.season,readyYear:due.year,completion:Math.round(score*100),quantity,fine})
    s.log.unshift(`第 ${a.id} 批米酒拌曲入缸，占一口缸（${w.vats.length}/${vatSlotsOf(w)}），要到${seasonLabel(due.season,due.year)}才出酒。`)
   }else{
    w.foods[a.recipe]+=quantity
    if(fine)w.premium[a.recipe]+=quantity
    s.log.unshift(`加工${r.product||r.name}：完成度 ${w.last.completion}%，入库 ${quantity}${r.unit}${fine?'（上品）':''}，消耗 ${r.rice}kg 稻米。`)
   }
   s.log=s.log.slice(0,8);w.active=null
   // 耕织图碎片：作坊每完成一批就有机会从旧纸堆里翻出一片
   if(nextRandom(s)<.35)awardFragment(s,'process')
   // 品种档案「加工」碎片（I1-2）：作坊暂不区分投料品种，从已收获品种里随机补一片。
   const hvs=s.varietyBook?.harvested||[];if(hvs.length)awardShard(s,hvs[pickIndex(s,hvs.length)],'process')
  }break
 default:fail('未知加工操作。')
 }
 return error?{state:current,error}:{state:s,error:null}
}
