import {pickIndex,nextRandom} from './rng.js'
// 品质序定义在这里（economy.js 反向 re-export 本常量）：economy 需要 VARIETIES 生成 YIELD_TABLE，
// 若这里再 import economy 会形成真循环依赖（浏览器加载顺序下 VARIETIES 尚未初始化就被访问）。
export const QUALITY_ORDER=['劣','良','优','特优'];
export const VARIETIES=[
 {id:'royal',name:'御稻米',era:'清代',period:'康熙—乾隆',origin:'京西御稻田',growth:'中熟',yield:50,quality:'特优',attr:'御贡米·香糯',hist:'康熙帝在丰泽园田间偶见早熟异穗，逐年选育而成，赐名御稻米，曾南推广作双季稻。'},
 {id:'purple',name:'紫金箍',era:'清代',period:'乾隆年间',origin:'京西山麓',growth:'中熟',yield:46,quality:'优',attr:'紫穗·耐寒',hist:'穗颈泛紫如箍，故得名。京西山麓冷泉田的老住户，耐寒而不择地，米质紧实。'},
 {id:'bigPurple',name:'大粒紫金箍',era:'清代',period:'乾隆年间',origin:'京西稻区',growth:'中晚熟',yield:53,quality:'优',attr:'大粒·高淀粉',hist:'紫金箍的穗选后代，粒重比原种高出一成，山前暖带的农户拿它换过不少粮。'},
 {id:'mingMang',name:'大明芒',era:'清代',period:'清初承袭明制',origin:'华北稻作区',growth:'晚熟',yield:49,quality:'优',attr:'长芒·抗倒伏',hist:'芒长过穗，风里像一片乱麻。承明制留种至今，抗倒伏的本事是几场大风里筛出来的。'},
 {id:'bigRed',name:'大红芒',era:'清代',period:'清代地方志',origin:'京畿水田',growth:'晚熟',yield:48,quality:'优',attr:'红芒·观赏',hist:'红芒映日，县志里写作「赤芒稻」。产量平平，却在秋收前先把田染成一遍红。'},
 {id:'smallRed',name:'小红芒',era:'民国',period:'民国农事档案',origin:'京郊农场',growth:'中熟',yield:88,quality:'优',attr:'早返青',hist:'民国农场档案里登记过的改良种，返青早三五天，正是这三五天救过倒春寒的年成。'},
 {id:'silver',name:'银坊',era:'民国',period:'民国二十年代',origin:'银坊试验田',growth:'中熟',yield:95,quality:'优',attr:'银白穗·高产',hist:'穗白如银，出自银坊试验田。当年亩产冠绝京郊，是第一批按科学方法系统选育的稻种。'},
 {id:'water300',name:'水源三百粒',era:'建国初期',period:'1950年代',origin:'水源农场',growth:'中晚熟',yield:130,quality:'良',attr:'丰产·杂交亲本',hist:'水源农场选育，一穗稳着三百粒而得名。丰产亲本，后来许多品种的族谱里都有它。'},
 {id:'jingyue1',name:'京越一号',era:'建国初期',period:'1970年代育成',origin:'京西农科所',growth:'中熟',yield:160,quality:'特优',attr:'杂交·优质',hist:'以水源三百粒与越富系三杂交育成，抗病又优质，是京西稻复壮路上的关键一代。',unlockReq:{hybrid:true}},
 {id:'yuefu3',name:'越富系三',era:'建国初期',period:'1970年代',origin:'华北育种站',growth:'早熟',yield:150,quality:'优',attr:'早熟·耐旱',hist:'自日本「越富」系选而来，早熟耐旱，曾在京郊大面积铺开，也是杂交育种的另一头亲本。'},
 {id:'jindao305',name:'津稻三零五',era:'现代',period:'1990年代',origin:'津冀联合育种',growth:'中熟',yield:200,quality:'特优',attr:'高产·抗病',hist:'津冀联合育成的高产抗病种。要想收它，先得把田种出「优」以上的成色——它挑地方。',unlockReq:{bestQuality:'优'}},
 {id:'shangxiang1',name:'上香一号',era:'现代',period:'21世纪初',origin:'京西香稻项目',growth:'中熟',yield:200,quality:'特优',attr:'浓香·优质',hist:'京西香稻项目的招牌，饭香能飘过一条街。生态差的地块养不出它的香气。',unlockReq:{ecology:70}},
 {id:'jingxi3',name:'京西稻三号',era:'现代',period:'现代保种计划',origin:'京西稻活态基因库',growth:'中熟',yield:205,quality:'特优',attr:'基因库·复壮',hist:'活态基因库复壮出的当代主力种。只有生态真正养起来的田，才有资格领它的种。',unlockReq:{ecology:80,bestQuality:'优'}}
];
export const ERAS=['清代','民国','建国初期','现代'];
// —— 包 B：每个品种有自己的生长天数（游戏内天，1 天 = 现实 20 秒）。按熟期派生，晚熟更久。——
const GROW_BY_CLASS={早熟:3,中熟:4,中晚熟:5,晚熟:6};
const GROW_OVERRIDE={jingxi3:7,shangxiang1:5};
export const GROW_DAYS=Object.fromEntries(VARIETIES.map(v=>[v.id,GROW_OVERRIDE[v.id]??GROW_BY_CLASS[v.growth]??4]));
export const growDaysOf=id=>GROW_DAYS[id]||4;
// 一个季节里同时种多个品种时，等待期按最慢的那一茬算。
export const maxGrowDays=ids=>Math.max(3,...(ids||[]).filter(Boolean).map(growDaysOf));
// —— 包 I1/Q-9.8：品种收录的前置条件统一挂在 VARIETIES.unlockReq 上，不在 UI 里散判。字段缺省即不要求。——
export const VARIETY_REQUIREMENTS=Object.fromEntries(VARIETIES.map(v=>[v.id,v.unlockReq||{}]));
// —— Q-9.5：耕织图名分化。20 片编号沿用包 P 的 FRAGMENT_POOLS，每一片对应《耕织图》一个具体场景。——
export const GENGZHI_SCENES=[
 {name:'浸种',story:'谷雨前后，选种浸于清水，浮者去之，沉者留之。'},
 {name:'耕',story:'二月惊蛰，牛引铁犁破土，宿草根下埋着一年生计。'},
 {name:'耙耨',story:'犁后以耙碎土，耙后以耢平之，田面如镜始可等水。'},
 {name:'耖',story:'田水初平，执耖细梳泥面，高处推平，低处补泥。'},
 {name:'布秧',story:'密播于秧田，上覆草木灰，夜防春寒，日引暖水。'},
 {name:'初秧',story:'秧针初立，青翠一线。农人立埂数苗，心里算着今年的天。'},
 {name:'淤荫',story:'以河泥与草秽壅根，谓之淤荫。苗得肥而色转浓。'},
 {name:'拔秧',story:'秧满三十日，连根拔起，洗净泥，束成把，挑往大田。'},
 {name:'插秧',story:'农人列于田中，退步而行，一行行青秧随之立起。'},
 {name:'一耘',story:'秧立七日初耘，以手薅草，足践泥根，让苗扎得稳。'},
 {name:'二耘',story:'再耘去稗。稗草最似稻，认得出稗的是老把式。'},
 {name:'三耘',story:'三耘毕，田间再无杂穗，稻始分蘖，风过声如细雨。'},
 {name:'灌溉',story:'引玉泉水灌田，筒车咿呀转，水尾分作七垄。'},
 {name:'收刈',story:'秋分前后，镰刀下田，稻担一担担压弯了田埂。'},
 {name:'登场',story:'稻担上场，摊晒数日，粒粒晒得发脆才可入囤。'},
 {name:'持穗',story:'连枷起落，穗上谷粒应声而落，尘土里都是米香。'},
 {name:'舂碓',story:'石碓舂米，去糠留白。碓声半夜不歇，是村里最踏实的声音。'},
 {name:'簸扬',story:'木锨扬向风口，糠皮随风去，饱满的籽粒落成一座小山。'},
 {name:'砻',story:'以砻磨谷，脱壳而不伤米，力道全在手腕的一收一放。'},
 {name:'入仓',story:'新米入仓，仓门贴上红纸。到这一步，一年才算真正落了袋。'}
];
// —— 包 P：碎片不再是「20 个按钮随便点」——
// 20 片碎片按来源分成五组，只能靠对应玩法随机掉出来；集齐后才显影成完整卷轴。
export const FRAGMENT_POOLS={
 plant:[0,1,2,3,4,5],      // 秋收（品质良以上）
 process:[6,7,8,9],        // 作坊完成一批加工
 trade:[10,11,12,13],      // 市场交易达成
 social:[14,15,16],        // 社交认养与寄米
 story:[17,18,19]          // 穿越任务结算
};
export const FRAGMENT_SOURCE_LABEL={plant:'种植收获',process:'作坊加工',trade:'市场交易',social:'社交认养',story:'穿越剧情'};
export const FRAGMENT_SLOT_SOURCE=(()=>{const m={};for(const [k,list] of Object.entries(FRAGMENT_POOLS))for(const n of list)m[n]=k;return m;})();
// 品种收录的档案成本：不再是「点一下就收录」，需要送档案整理费并留出比对用的稻米。
export const UNLOCK_COST={wen:20,rice:30};
// 杂交育种的基准材料（老宅建起基因库后按 houseEffects 打折）
export const HYBRID_COST={wen:120,rice:300};
// —— 包 B / Q-9.14：老宅改建（档案室 / 基因库 / 文化博物馆）对图鉴侧的减免 ——
// 数值集中在这里定义，不在流程里散写；等级判定只认 state.house.level。
export const HOUSE_EFFECT={archiveFeeMul:.7,hybridMul:.5,culturePerUnlock:1,seedReward:3,seedCap:99};
export function houseEffects(s){const lv=s?.house?.level||0;return {feeMul:lv>=1?HOUSE_EFFECT.archiveFeeMul:1,hybridMul:lv>=2?HOUSE_EFFECT.hybridMul:1,cultureGain:lv>=3?1+HOUSE_EFFECT.culturePerUnlock:1};}
// —— 包 I1：品种档案碎片。每个稻种 3 片（种植/加工/交易），45%~70% 概率掉落，集齐 3 片才显示完整历史。——
export const SHARD_KIND_LABEL={plant:'种植',process:'加工',trade:'交易'};
const qRank=q=>Math.max(0,QUALITY_ORDER.indexOf(q));
export function bestQualityOf(s){let best=0;for(const h of [s?.result,...(s?.history||[])])if(h?.quality)best=Math.max(best,qRank(h.quality));return QUALITY_ORDER[best]||null;}
export function shardCount(b,id){const sh=b?.shards?.[id];return sh?((sh.plant?1:0)+(sh.process?1:0)+(sh.trade?1:0)):0;}
// 按玩法来源随机掉一片品种档案碎片。rng 走 state.rng，保证读档重放一致。返回是否新获得。
export function awardShard(s,id,kind){
 const b=s.varietyBook;if(!b||!VARIETIES.some(v=>v.id===id)||!SHARD_KIND_LABEL[kind])return false;
 b.shards??={};const sh=b.shards[id]??={plant:false,process:false,trade:false};
 if(sh[kind])return false;
 const chance=.45+nextRandom(s)*.25;
 if(nextRandom(s)>=chance)return false;
 sh[kind]=true;
 const v=VARIETIES.find(x=>x.id===id),n=shardCount(b,id);
 s.log.unshift(n===3?`「${v.name}」的${SHARD_KIND_LABEL[kind]}碎片入手，档案补全（3 / 3）。`:`「${v.name}」的${SHARD_KIND_LABEL[kind]}碎片入手（${n} / 3）。`);
 s.log=s.log.slice(0,8);
 return true;
}
// 前置条件的具体缺失提示（I1-1：检查不全时给具体文案，如「需水质 ≥60 且已收获过该品种」）。
export function requirementMiss(v,b,s){
 const r=v.unlockReq||{},miss=[];
 if(r.hybrid&&!b.hybrid)miss.push('需先在农科所完成杂交育种');
 if(r.ecology&&(s?.ecology||0)<r.ecology)miss.push(`需生态值 ≥${r.ecology}`);
 if(r.bestQuality&&qRank(bestQualityOf(s))<qRank(r.bestQuality))miss.push(`需先收获过「${r.bestQuality}」以上品质的稻米`);
 return miss.length?`收录条件未满足：${miss.join('，且')}。`:null;
}
export function unlockReqText(v){
 const r=v.unlockReq||{},list=[];
 if(r.hybrid)list.push('需完成杂交育种');
 if(r.ecology)list.push(`需生态值 ≥${r.ecology}`);
 if(r.bestQuality)list.push(`需收获过「${r.bestQuality}」以上稻米`);
 return list.join('，');
}
// 按玩法来源随机掉一片耕织图碎片。rng 走 state.rng，保证读档重放一致。返回新编号或 null。
export function awardFragment(s,pool){
 const b=s.varietyBook;if(!b)return null;
 const owned=new Set(b.artFragments||[]);
 const free=(FRAGMENT_POOLS[pool]||[]).filter(n=>!owned.has(n));
 if(!free.length)return null;
 const n=free[pickIndex(s,free.length)];
 b.artFragments=[...(b.artFragments||[]),n].sort((a,c)=>a-c);
 // 申遗主线接口：artRestored 即「二十幅全部修复」，第 8 轮隐藏结局与「上庄镇申遗」最终任务以此为条件之一。
 if(b.artFragments.length===20){b.artRestored=true;b.title=true;s.log.unshift('《京西稻耕织图》二十幅终于补齐，卷轴在灯下慢慢显影——上庄镇的申遗故事，从这里开始。');}
 else s.log.unshift(`《京西稻耕织图》${GENGZHI_SCENES[n].name}一幅从${FRAGMENT_SOURCE_LABEL[pool]||'旧纸堆'}里寻回（${b.artFragments.length} / 20）。`);
 s.log=s.log.slice(0,8);
 return n;
}
export function newVarietyBook(){return {era:'清代',unlocked:[],harvested:[],shards:{},unlockInfo:{},timeTravel:false,culture:0,hybrid:false,achievement:false,artFragments:[],artRestored:false,title:false};}
export function normalizeVarietyBook(b){
 if(b===undefined)return newVarietyBook();if(!b)return null;b=structuredClone(b);
 b.harvested??=[];b.shards??={};b.unlockInfo??={};b.timeTravel??=false;
 if(!Array.isArray(b.harvested)||new Set(b.harvested).size!==b.harvested.length||b.harvested.some(id=>!VARIETIES.some(v=>v.id===id)))return null;
 if(typeof b.shards!=='object'||Array.isArray(b.shards)||Object.entries(b.shards).some(([id,sh])=>!VARIETIES.some(v=>v.id===id)||!sh||Object.keys(sh).length!==3||!['plant','process','trade'].every(k=>typeof sh[k]==='boolean')))return null;
 if(typeof b.unlockInfo!=='object'||Array.isArray(b.unlockInfo)||Object.entries(b.unlockInfo).some(([id,u])=>!VARIETIES.some(v=>v.id===id)||!u||!Number.isSafeInteger(u.year)||u.year<1||!['spring','summer','autumn','winter'].includes(u.season)))return null;
 if(typeof b.timeTravel!=='boolean')return null;
 b.artFragments??=[];b.artRestored??=false;b.title??=false;
 if(!ERAS.includes(b.era)||!Array.isArray(b.unlocked)||b.unlocked.some(id=>!VARIETIES.find(v=>v.id===id))||new Set(b.unlocked).size!==b.unlocked.length||!Number.isSafeInteger(b.culture)||b.culture<b.unlocked.length||typeof b.hybrid!=='boolean'||typeof b.achievement!=='boolean'||!Array.isArray(b.artFragments)||b.artFragments.some(n=>!Number.isInteger(n)||n<0||n>19)||typeof b.artRestored!=='boolean'||typeof b.title!=='boolean')return null;
 return b;}
export function reduceVarieties(current,action){const s=structuredClone(current);s.varietyBook??=newVarietyBook();const b=s.varietyBook;let error=null;const fail=t=>error=t;const idx=ERAS.indexOf(b.era);
 if(action.type==='book:era'){if(!ERAS.includes(action.era))fail('时代无效。');else if(ERAS.indexOf(action.era)>idx+1)fail('请按时间线逐时代推进。');else b.era=action.era;}
 else if(action.type==='book:timetravel'){ // 预留：穿越任务解锁后打开的时间线开关（Q-9.10 接入时启用入口）
  b.timeTravel=!b.timeTravel;s.log.unshift(b.timeTravel?'时空档案松动：时代之门为你多开了一条缝。':'时空档案复位：时代之门重新合拢。');
 }
 else if(action.type==='book:unlock'){
  const v=VARIETIES.find(x=>x.id===action.id);
  if(!v)fail('品种不存在。');
  else if(!b.timeTravel&&ERAS.indexOf(v.era)>ERAS.indexOf(b.era))fail(`此品种尚未现世，须待${v.era}。`);
  else if(b.unlocked.includes(v.id))fail('该品种已在图鉴中。');
  else if(!(b.harvested||[]).includes(v.id))fail('需先种植并收获该品种，才有实物可送档比对。');
  else{
   const miss=requirementMiss(v,b,s),ef=houseEffects(s)
   const fee=Math.round(UNLOCK_COST.wen*ef.feeMul)
   if(miss)fail(miss);
   else if((s.sales?.wen||0)<fee)fail(`送档案房比对要 ${fee} 文，钱不够。`);
   else if(s.rice<UNLOCK_COST.rice)fail(`比对要留出 ${UNLOCK_COST.rice} kg 稻米，仓里不够。`);
   else{s.sales.wen-=fee;s.rice-=UNLOCK_COST.rice;b.unlocked.push(v.id);b.culture+=ef.cultureGain;b.unlockInfo[v.id]={year:s.year,season:s.season};if(b.unlocked.length===13)b.achievement=true;
    // 种子来源（b）：首次收录某品种，奖励该品种种子 ×3，来年可以直接种。
    s.seedBag??={};s.seedBag[v.id]=Math.min(HOUSE_EFFECT.seedCap,(s.seedBag[v.id]||0)+HOUSE_EFFECT.seedReward)
    s.log.unshift(`御贡图鉴：花 ${fee} 文、耗 ${UNLOCK_COST.rice} kg 稻米比对档案，收录${v.name}，并领回该品种稻种 ×${HOUSE_EFFECT.seedReward}。`);}
  }
 }
 else if(action.type==='book:seed'){const v=VARIETIES.find(v=>v.id===action.id);if(!v)fail('品种不存在。');else if(s.season!=='spring'||s.plots.some(Boolean))fail('请在春季尚未插秧时选择本年试种品种。');else if(!b.timeTravel&&ERAS.indexOf(v.era)>idx)fail('请先推进到对应时代。');else if(v.id==='jingyue1'&&!b.hybrid)fail('请先在农科所完成杂交育种。');else{s.riceVariety=v.id;if(s.plotVarieties)s.plotVarieties.fill(null);s.log.unshift(`本年试种${v.name}，春播仍按一份种子一亩地。`);s.log=s.log.slice(0,8);}}
 else if(action.type==='book:hybrid'){const ef=houseEffects(s),need={wen:Math.round(HYBRID_COST.wen*ef.hybridMul),rice:Math.round(HYBRID_COST.rice*ef.hybridMul)};if(b.hybrid)fail('杂交育种已解锁。');else if(!b.unlocked.includes('water300')||!b.unlocked.includes('yuefu3'))fail('请先收集水源三百粒与越路早生亲本（图鉴中的越富系三）。');else if((s.sales?.wen||0)<need.wen||s.rice<need.rice)fail(`农科所需要 ${need.wen} 文与 ${need.rice} kg 稻米。`);else{s.sales.wen-=need.wen;s.rice-=need.rice;b.hybrid=true;s.log.unshift('农科所：以水源三百粒 × 越路早生培育京越一号。');}}
 else fail('未知图鉴操作。');return error?{state:current,error}:{state:s,error:null};}
