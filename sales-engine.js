import {ECON,JIN_PER_STONE,RICE_BASE_PRICE,QUALITY_RATE,ricePricePerStone} from './economy.js'
import {awardFragment,awardShard} from './variety-engine.js'
import {nextRandom,pickIndex} from './rng.js'
// 包 M3：粮商连财的交情能抹手续费，掌柜的御贡米专线能让酒楼收稻米。
// npc-engine 只单向依赖 event/rng/variety，从这里引进来不会成环。
import {feeCutOf,tributeOpen} from './npc-engine.js'
// 加工品价格（包 O·经济平衡）：渠道基准 3 / 2 / 5 文/份，即原价压缩到约 30%。
// 各产品保留原有相对价差（米酒最贵，米糕/饭团最便宜），实际值见下表。
// 例：饭团原市场价 12 文 → 现 3 文；米酒原 28 文 → 现 7 文。
export const SALES_PRODUCTS={
 riceball:{name:'饭团',kind:'food',unit:'份',price:{market:3,store:2,restaurant:5}},
 flour:{name:'米粉',kind:'food',unit:'份',price:{market:3,store:2,restaurant:5}},
 friedrice:{name:'蛋炒饭',kind:'food',unit:'份',price:{market:4,store:3,restaurant:7}},
 noodle:{name:'米线',kind:'food',unit:'份',price:{market:4,store:3,restaurant:7}},
 roll:{name:'肠粉',kind:'food',unit:'份',price:{market:4,store:3,restaurant:7}},
 cake:{name:'米糕',kind:'food',unit:'份',price:{market:3,store:2,restaurant:5}},
 wine:{name:'米酒',kind:'food',unit:'瓶',price:{market:7,store:5,restaurant:12}},
 // 稻田蟹是「投放稻田蟹」的副产品：不再是只进不出的死资源，可卖钱，也可留作来年蟹苗。
 crab:{name:'稻田蟹',kind:'good',unit:'只',price:{market:6,store:5,restaurant:12}},
 rice:{name:'稻米',kind:'rice',unit:'kg',price:{market:300,store:200,restaurant:500}}
}
export const CHANNELS={
 market:{name:'市场',fee:5,mult:1.0,description:'每季食物最多 1000 份、稻米最多 5 石（250 kg）；手续费 5 文/笔。'},
 store:{name:'粮店',fee:3,mult:0.9,description:'不限量，大宗价；手续费 3 文/笔。'},
 restaurant:{name:'酒楼',fee:5,mult:1.35,description:'不限量，高端价；只收优等以上；手续费 5 文/笔。'}
}
export const RICE_PER_STONE=50
// 御贡米专线：掌柜交心之后，酒楼开始收稻米，按高端价再上浮五成。
export const TRIBUTE_RATE=1.5
// 实际手续费 = 渠道基准 − 粮商的人情（0/1/2 文），最低 0。
export function feeOf(state,channel){const c=CHANNELS[channel];if(!c)return 0;return Math.max(0,c.fee-feeCutOf(state))}
export function feeNote(state,channel){const cut=feeCutOf(state);return cut?`手续费 ${feeOf(state,channel)} 文/笔（连财抹去 ${cut} 文）`:`手续费 ${CHANNELS[channel].fee} 文/笔`}
export function newSales(){return {wen:0,season:'spring',foodSold:0,riceSoldKg:0,seasonIncome:0,history:[]};}
export function normalizeSales(s){
 if(s===undefined)return newSales()
 s=structuredClone(s)
 if(!s||!Number.isSafeInteger(s.wen)||s.wen<0||!['spring','summer','autumn','winter'].includes(s.season)||!Number.isSafeInteger(s.foodSold)||s.foodSold<0||!Number.isSafeInteger(s.riceSoldKg)||s.riceSoldKg<0||!Array.isArray(s.history))return null
 s.seasonIncome=Number.isSafeInteger(s.seasonIncome)&&s.seasonIncome>=0?s.seasonIncome:0
 return s
}
export function productQuantity(state,id){if(id==='rice')return state.rice;if(id==='crab')return state.crabs||0;return state.workshop?.foods?.[id]||0;}
export function saleLimit(s,channel,id){const p=SALES_PRODUCTS[id];if(!p||!CHANNELS[channel])return 0;if(channel==='restaurant'&&p.kind==='rice'&&(!tributeOpen(s)||!restaurantAccepts(qualityForSale(s))))return 0;if(channel==='restaurant'&&p.kind==='food'&&!restaurantAccepts(qualityForSale(s)))return 0;const stock=Math.max(0,Math.floor(productQuantity(s,id)/(p.kind==='rice'?RICE_PER_STONE:1))),cap=channel!=='market'?Infinity:p.kind==='rice'?Math.floor((5*RICE_PER_STONE-(s.sales?.riceSoldKg||0))/RICE_PER_STONE):p.kind==='food'?1000-(s.sales?.foodSold||0):Infinity;return Math.max(0,Math.min(stock,cap));}
export function qualityForSale(state){return state.result?.quality||state.history?.[0]?.quality||'良';}
export function restaurantAccepts(quality){return quality==='优'||quality==='特优';}
// 包 M2：作坊的「上品」（米糕模具三拍全中）按 1.5 倍价走。上品份数存在 workshop.premium 里，
// 卖货时先出手上品，quote 里按实际份数加权。
export const PREMIUM_RATE=1.5
export function premiumOf(state,id){return Math.max(0,Math.min(state.workshop?.foods?.[id]||0,state.workshop?.premium?.[id]||0));}
// 陈化比例：按入库先后（FIFO）从最老的批次取，超过 agedSeasons 季的那部分算陈米
export function riceAgedRatio(state,quantityKg){const lots=state.riceLots||[];if(!lots.length||!quantityKg)return 0;let left=quantityKg,aged=0;for(const lot of lots){if(left<=0)break;const take=Math.min(lot.kg||0,left);if((lot.age||0)>ECON.agedSeasons)aged+=take;left-=take;}return Math.min(1,aged/quantityKg);}
export function saleQuote(state,channel,id,quantity){
 const p=SALES_PRODUCTS[id],c=CHANNELS[channel];if(!p||!c)return null
 // 酒楼只收优质加工食品与稻田蟹：稻米在酒楼没有销路（除非掌柜把御贡米专线搭上了）。
 // 这里直接返回 null，让 UI 的「可售/不可售」判定与 reduceSales 的校验共用同一套规则
 // （否则按钮会显示可售但一点就报错）。
 const tribute=channel==='restaurant'&&p.kind==='rice'
 const q=Math.max(0,Math.floor(quantity||0));const quality=qualityForSale(state)
 // 御贡米专线是高端通道，同样只认优等以上的米。
 if(tribute&&(!tributeOpen(state)||!restaurantAccepts(quality)))return null
 let agedRatio=0,unitPrice,gross=0,fineQty=0
 if(p.kind==='rice'){
  const rate=QUALITY_RATE[quality]||1,fresh=ricePricePerStone(channel,quality,false),old=ricePricePerStone(channel,quality,true)
  agedRatio=riceAgedRatio(state,q*RICE_PER_STONE)
  unitPrice=Math.round(fresh*(1-agedRatio)+old*agedRatio)
  gross=unitPrice*q
  if(tribute&&q>0){gross=Math.round(gross*TRIBUTE_RATE);unitPrice=Math.round(gross/q)}
 }else{
  unitPrice=p.price[channel]
  gross=unitPrice*q
  // 上品只出现在加工食品上；稻米与稻田蟹照原价。
  if(p.kind==='food'){fineQty=Math.min(premiumOf(state,id),q);if(fineQty>0){gross=Math.round(unitPrice*(q+(PREMIUM_RATE-1)*fineQty));unitPrice=Math.round(gross/q)}}
 }
 if(unitPrice===undefined)return null
 const feeBase=c.fee,feeCut=feeCutOf(state),fee=Math.min(feeOf(state,channel),gross)
 return {channel,id,quantity:q,unitPrice,gross,fee,feeBase,feeCut,net:gross-fee,quality,unit:p.unit,agedRatio:Math.round(agedRatio*100)/100,fineQty,premium:fineQty>0,tribute:!!tribute,perJin:Math.round(RICE_BASE_PRICE[channel]*(QUALITY_RATE[quality]||1)*100)/100}
}
export function reduceSales(current,action){
 const s=structuredClone(current);s.sales??=newSales();const x=s.sales;let error=null;const fail=t=>{error=t;}
 if(action.type==='sales:sell'){
  const p=SALES_PRODUCTS[action.product],c=CHANNELS[action.channel],q=action.quantity
  if(!p||!c)fail('请选择有效的销售渠道和商品。')
  else if(!Number.isSafeInteger(q)||q<1)fail('出售数量必须是正整数。')
  else if(action.channel==='restaurant'&&p.kind==='rice'&&(!tributeOpen(s)||!restaurantAccepts(qualityForSale(s))))fail(tributeOpen(s)?'御贡米专线只收优等以上的稻米。':'酒楼只收优质加工食品与稻田蟹。')
  else if(action.channel==='restaurant'&&p.kind==='food'&&!restaurantAccepts(qualityForSale(s)))fail('酒楼只收优等（优/特优）的产品。')
  else if(action.channel==='market'&&p.kind==='food'&&x.foodSold+q>1000)fail(`本季市场食物额度还剩 ${1000-x.foodSold} 份。`)
  else if(action.channel==='market'&&p.kind==='rice'&&x.riceSoldKg+q*RICE_PER_STONE>5*RICE_PER_STONE)fail('本季市场稻米额度为 5 石（250 kg）。')
  else if(productQuantity(s,action.product)<q*(p.kind==='rice'?RICE_PER_STONE:1))fail(`${p.name}库存不足。`)
  else{const quote=saleQuote(s,action.channel,action.product,q)
   if(p.kind==='rice'){const kg=q*RICE_PER_STONE;s.rice-=kg;x.riceSoldKg+=kg;let left=kg;s.riceLots=(s.riceLots||[]).filter(l=>{if(left<=0)return true;const take=Math.min(l.kg||0,left);l.kg-=take;left-=take;return l.kg>0;});}
   else if(p.kind==='good'){s.crabs-=q;}
   else{s.workshop.foods[action.product]-=q;if(quote.fineQty>0&&s.workshop.premium)s.workshop.premium[action.product]=Math.max(0,(s.workshop.premium[action.product]||0)-quote.fineQty);x.foodSold+=q;}
   x.wen+=quote.net;x.seasonIncome=(x.seasonIncome||0)+quote.net;x.history.unshift({...quote,season:x.season,year:s.year});x.history=x.history.slice(0,20)
   s.log.unshift(`${c.name}收去${p.name} ${q}${p.kind==='rice'?`石（${q*RICE_PER_STONE} kg）`:p.unit}，净得 ${quote.net} 文${quote.tribute?'（走御贡米专线，按高端价上浮五成）':''}${quote.agedRatio>0?'（其中有陈米，折了价）':''}${quote.premium?`（含上品 ${quote.fineQty} ${p.unit}，按 1.5 倍作价）`:''}。`);s.log=s.log.slice(0,8)
   // 耕织图碎片：成笔的买卖谈成时，账房先生翻账本夹出一片旧纸
   if(q>=5&&nextRandom(s)<.3)awardFragment(s,'trade');
   // 品种档案「交易」碎片（I1-2）：稻米或加工品成交后，从已收获品种里随机补一片。
   if(p.kind==='rice'||p.kind==='food'){const hvs=s.varietyBook?.harvested||[];if(hvs.length)awardShard(s,hvs[pickIndex(s,hvs.length)],'trade');}}
 } else fail('未知销售操作。')
 return error?{state:current,error}:{state:s,error:null}
}
