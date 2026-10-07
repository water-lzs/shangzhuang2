// —— 包 J2（第七轮）：场景隐藏热点 ——
// 家场景里能上手摸的旧物：水井 / 石磨 / 晾晒架 / 老宅门环；
// 上庄镇里能停下脚的地方：酒坛 / 石碑 / 集市木棚 / 桥上石狮。
//
// 设计口径（与指令包一致）：
//   · 每处有独立触发概率（15%~35%），**同年不重复**——探过一年就歇着，来年再看过不过。
//   · 触发后给四类结果之一：文 / 耕织图残片 / 隐藏差事 / 一句 NPC 闲谈。
//   · 没触发时给一句自然反馈（"井水照出你的影子。"），绝不出现"未触发"这种系统腔。
//   · 概率与结果全走 nextRandom(s)，读档重放同一操作结果一致。
//
// 依赖方向：rng / variety-engine / event-engine 三者都不反向引用本模块，
// 本模块也刻意不 import farm-engine —— 前几轮踩过循环依赖（浏览器白屏）的坑。
import {nextRandom,pickIndex} from './rng.js'
import {awardFragment} from './variety-engine.js'
import {absDay,QUEST_POOL,newQuestState,clampRep,repOf,repWord} from './event-engine.js'

const note=(s,t)=>{s.log=[t,...(s.log||[])].slice(0,8)}

// ================== 热点定义 ==================
// space 决定它出现在哪个场景（家 = 3D 场景里的一件实物；镇 = 镇图上的一处地方）。
// results 里的 w 是权重，四个结果按权重抽；text 是那一次的具体文案（各写各的，不套模板）。
export const HOTSPOTS=[
 {id:'well',space:'home',name:'水井',short:'井',chance:.30,pool:'story',
  idle:['井水照出你的影子，天光在里头晃。','辘轳绳垂着，木桶搁在井台上。','井沿磨出一道浅槽，是几辈人提水留下的印子。'],
  cool:'今年已经在井台边站过一回了，井水还是那副样子。',
  results:[
   {kind:'wen',w:3,wen:35,text:'井底沉着前些日子掉下去的几枚铜钱，你捞上来，泥水顺着指缝往下淌。'},
   {kind:'fragment',w:2,text:'井壁的砖缝里塞着一卷油纸，展开是半幅画的边角——耕织图上的一处田埂。'},
   {kind:'chat',w:3,rep:2,text:'周伯拎着桶过来，把辘轳摇得吱呀响。"今年的水甜，"他说，"你家的田有福气。"'},
   {kind:'quest',w:1,text:'井台边蹲着个生面孔，探问了几句田里的事，末了说手头有件急事想找个人搭手。'}]},

 {id:'mill',space:'home',name:'石磨',short:'磨',chance:.25,pool:'process',
  idle:['磨盘上落着一层薄米粉，风一吹就飘起来。','磨眼里的谷壳还没扫净，磨棍斜靠在墙根。','石磨的纹路磨平了半边，转起来还是稳。'],
  cool:'磨盘今年已经转过一回了，纹路里都是旧粉。',
  results:[
   {kind:'wen',w:3,wen:45,text:'磨盘底下压着个小布包，是上一家借磨留下的谢礼，里头几十文钱。'},
   {kind:'fragment',w:2,text:'磨盘背面刻着一行小字，记的竟是耕织图里"砻"那道工序，你把它描了下来。'},
   {kind:'chat',w:3,rep:2,text:'你推着磨转了两圈，米粉落在簸箕里。邻家嫂子隔着墙喊："磨完了匀我一升！"'},
   {kind:'quest',w:1,text:'你正扫磨盘，镇上的伙计捎了句话来，说铺子里有桩事等你回话。'}]},

 {id:'rack',space:'home',name:'晾晒架',short:'晒',chance:.25,pool:'plant',
  idle:['架上挂着几束没干透的稻把，风一过沙沙响。','竹竿上晒着你的旧衫，影子一格一格落在地上。','架脚的绳结松了，你顺手紧了一紧。'],
  cool:'架子今年翻检过一遍，绳结都是新换的。',
  results:[
   {kind:'wen',w:3,wen:40,text:'稻把底下掉出一小袋去岁的余粮，你顺手背到集市上卖了。'},
   {kind:'fragment',w:2,text:'稻把里夹着一张画着"耖"的旧纸，边角被虫蛀了，画却还清楚。'},
   {kind:'chat',w:3,rep:3,text:'隔壁老陈靠着架子与你说了半晌闲话，末了问你肯不肯留一束做种。'},
   {kind:'quest',w:1,text:'义学的先生从架前走过，站了半晌才开口，说今年的学米还没着落。'}]},

 {id:'doorring',space:'home',name:'老宅门环',short:'环',chance:.20,pool:'story',
  idle:['门环上的铜锈蹭了你一手。','门轴响了一声，老宅比你先认出你回来。','门板上贴着去岁没撕净的门神，颜色退成粉的。'],
  cool:'门环今年已经响过一回了，铜锈还是那层铜锈。',
  results:[
   {kind:'wen',w:2,wen:60,text:'门缝里塞着一封旧年的信，信里夹着几张早不通用的钱票，镇上有人专收这个。'},
   {kind:'fragment',w:3,text:'门框顶上的凹槽里藏着一张残画，画的正是"入仓"——耕织图最后那几幅之一。'},
   {kind:'chat',w:3,rep:2,text:'你扣了两下门环。屋里没人应，檐下的燕子倒先探出头来。'},
   {kind:'quest',w:1,text:'一个外乡人立在门口打听祖上的稻种，说愿意出重金求一斗。'}]},

 {id:'winejar',space:'town',name:'酒坛',short:'酒',chance:.35,pool:'trade',
  idle:['酒坛的封泥裂了一道，坛里透出淡淡酒气。','坛口压着块青石，坛壁上结着一层盐霜。','掌柜在柜台后头拨算盘，没抬头。'],
  cool:'酒坛今年已经翻过一回底了。',
  results:[
   {kind:'wen',w:4,wen:30,text:'你替掌柜把坛底的存货倒腾了一遍，他随手抓了把铜钱塞给你。'},
   {kind:'fragment',w:2,text:'坛底压着一张旧酒单，背面画着"簸扬"——耕织图里的一幅。'},
   {kind:'chat',w:3,rep:3,text:'掌柜给你倒了一碗酒："今年的米好，出的酒烈，喝下去嗓子眼里都是稻香。"'},
   {kind:'quest',w:1,text:'酒坊的伙计把你叫到一边，说缸已备好，只等一样东西下缸。'}]},

 {id:'stele',space:'town',name:'石碑',short:'碑',chance:.25,pool:'story',
  idle:['碑上的字被风雨啃掉了一半，剩下"京西"二字还认得出。','碑座下长着一圈青苔，踩上去发滑。','碑阴刻着捐钱人的名字，最末一个已经看不清了。'],
  cool:'碑文今年已经抄过一遍了，剩下的字还是认不全。',
  results:[
   {kind:'wen',w:2,wen:50,text:'碑座后头卡着个人家遗落的钱袋，你交到里正处，里正分出几十文谢你。'},
   {kind:'fragment',w:3,text:'你拓下碑文，纸背竟透出一幅画的轮廓——「收刈」，稻把满地，人还没走。'},
   {kind:'chat',w:3,rep:3,text:'一个遛鸟的老头凑过来，指着碑说这上头记的稻，与你田里的是同一个种。'},
   {kind:'quest',w:1,text:'里正寻到碑前，把一张单子递过来，说这事只有你牵头才压得住。'}]},

 {id:'stall',space:'town',name:'集市木棚',short:'市',chance:.30,pool:'trade',
  idle:['木棚下空着几张条凳，竹筐摞得很高。','棚顶的席子破了个洞，光柱斜斜打在地上。','地上散着几粒谷子，早被踩扁了。'],
  cool:'木棚今年已经翻过一遍了，棚底只剩碎草屑。',
  results:[
   {kind:'wen',w:4,wen:35,text:'你在棚下捡到半筐没人认领的碎米，转手卖给了一家点心铺。'},
   {kind:'fragment',w:2,text:'筐底垫着的旧纸上印着一幅小画，是耕织图里的"登场"。'},
   {kind:'chat',w:3,rep:2,text:'卖种的老汉拉住你，非要给你看看新到的一把稻种，说穗子密得能抓手。'},
   {kind:'quest',w:1,text:'棚外有人按着刀把子问价，说是替公家采买，价压得低却也量大。'}]},

 {id:'lion',space:'town',name:'桥上石狮',short:'狮',chance:.15,pool:'story',
  idle:['石狮嘴里含着的绣球被摸得发亮。','狮爪下压着一片青苔和半片落叶。','你摸过狮头，掌心全是凉意。'],
  cool:'石狮今年已经摸过一回，狮头还是那样凉。',
  results:[
   {kind:'wen',w:2,wen:80,text:'狮座底下有人藏过东西，几串铜钱用油纸包着，看年头早没人来取了。'},
   {kind:'fragment',w:3,text:'狮口里塞着一卷发脆的纸，展开是「祭神」——画上正在谢天，桌上供着新米。'},
   {kind:'chat',w:3,rep:4,text:'守桥的老汉说，他小时候这狮子就这么蹲着，蹲得比镇上谁都久。'},
   {kind:'quest',w:1,text:'桥头有人递话过来，嗓门压得很低，说下游出了事，等米下锅。'}]}
]
export const HOTSPOT_MAP=Object.fromEntries(HOTSPOTS.map(h=>[h.id,h]))
export const hotspotOf=id=>HOTSPOT_MAP[id]||null
export const HOTSPOTS_OF=space=>HOTSPOTS.filter(h=>h.space===space)
export const FOUND_LABEL={wen:'得钱',fragment:'残片',chat:'闲谈',quest:'差事'}
// 残片集齐时的兜底池：热点寻到的东西偏「旧纸堆」，按剧情→工艺→收获→交易→社交的顺序找还没集齐的池。
const POOL_ORDER=['story','process','plant','trade','social']
export function findFragment(s,prefer){
 const order=[prefer,...POOL_ORDER.filter(p=>p!==prefer)]
 for(const pool of order){const n=awardFragment(s,pool);if(n!==null&&n!==undefined)return {n,pool}}
 return null
}

export function newHotspotState(){return {year:1,seq:0,total:0,coolSeq:0,seen:{},last:null}}
export function normalizeHotspots(h){
 if(h===undefined)return newHotspotState()
 if(!h||typeof h!=='object'||Array.isArray(h))return null
 h=structuredClone(h)
 if(!Number.isSafeInteger(h.year)||h.year<1)h.year=1
 if(!Number.isSafeInteger(h.seq)||h.seq<0)h.seq=0
 if(!Number.isSafeInteger(h.coolSeq)||h.coolSeq<0)h.coolSeq=0
 if(!Number.isSafeInteger(h.total)||h.total<0)h.total=0
 if(!h.seen||typeof h.seen!=='object'||Array.isArray(h.seen))h.seen={}
 for(const [id,v] of Object.entries(h.seen)){
  if(!Object.hasOwn(HOTSPOT_MAP,id)){delete h.seen[id];continue}
  if(!v||typeof v!=='object'||!Number.isSafeInteger(v.year)||v.year<1)delete h.seen[id]
 }
 const L=h.last
 if(L&&(typeof L!=='object'||!Object.hasOwn(HOTSPOT_MAP,L.id||'')||typeof L.text!=='string'))h.last=null
 return h
}
// 这一处今年探过没有（UI 想在悬停提示里用得上）
export const exploredThisYear=(s,id)=>{const h=s?.hotspots;if(!h)return false;const v=h.seen?.[id];return !!v&&v.year===s.year}
export const exploredCount=s=>Object.values(s?.hotspots?.seen||{}).filter(v=>v&&v.year===s.year).length

// ================== 触发 ==================
// 返回 null 表示动作被接受（成功或「什么也没发生」都算接受，细节都写进 s.hotspots.last）；
// 返回字符串表示这个动作本身不合法（UI 会当成错误提示）。
export function touchHotspot(s,id){
 const def=HOTSPOT_MAP[id]
 if(!def)return '眼前没有这么一处地方。'
 const h=s.hotspots??=newHotspotState()
 // 「同年不重复」按游戏年算：跨年清一次表，去年的旧账不带进今年。
 if(h.year!==s.year){h.year=s.year;h.seen={}}
 if(h.seen[id]&&h.seen[id].year===s.year){
  const text=def.cool||def.idle[0]
  h.coolSeq=(h.coolSeq||0)+1
  h.last={seq:'c'+h.coolSeq,id,name:def.name,space:def.space,kind:'cool',origin:'cool',title:def.name,text,gains:[]}
  return null
 }
 h.seen[id]={year:s.year,kind:'idle'}
 h.seq=(h.seq||0)+1
 // 先掷一次触发：没中就给一句自然反馈——玩家看到的只是"看了看它"，不该感到被系统拒绝。
 if(nextRandom(s)>=def.chance){
  const text=def.idle[pickIndex(s,def.idle.length)]
  h.last={seq:h.seq,id,name:def.name,space:def.space,kind:'idle',origin:'idle',title:def.name,text,gains:[]}
  return null
 }
 const res=pickResult(s,def)
 const gains=[]
 let kind=res.kind,text=res.text
 if(kind==='wen'){
  s.sales??={};s.sales.wen=(s.sales.wen||0)+res.wen
  gains.push(`${res.wen} 文`)
  note(s,`${def.name}：${res.text}`)
 }else if(kind==='fragment'){
  const got=findFragment(s,def.pool)
  if(got)gains.push(`耕织图残片（${got.n+1} / 20）`)
  else{ // 二十幅早已补齐——总不能白跑一趟，折算成实打实的银钱。
   kind='wen';const wen=60;s.sales.wen=(s.sales.wen||0)+wen;gains.push(`${wen} 文`)
   text='旧纸上的画你早已收齐，倒是夹在纸里的一叠钱票还能兑出去。'
   note(s,`${def.name}：寻到的旧纸早已收全，兑出铜钱若干。`)
  }
 }else if(kind==='chat'){
  const rep=clampRep(repOf(s)+(res.rep||2));const diff=Math.round(rep-repOf(s))
  s.reputation=rep
  if(diff)gains.push(`声望 +${diff}（${repWord(rep)}）`)
  note(s,`${def.name}：${res.text}`)
 }else{
  const q=s.quests??=newQuestState()
  const busy=[...q.active,...q.done.slice(-4),...q.failed.slice(-2)].map(x=>x.id)
  const pool=QUEST_POOL.filter(x=>!busy.includes(x.id))
  if(!pool.length){ // 差事板太满就换成实钱，不让热点空转
   kind='wen';const wen=50;s.sales.wen=(s.sales.wen||0)+wen;gains.push(`${wen} 文`)
   text='你本想应下这事，手头却已经排满，对方留了几十文当跑腿钱。'
   note(s,`${def.name}：事情没接，收下几十文车马钱。`)
  }else{
   const tpl=pool[pickIndex(s,pool.length)]
   q.active.push({id:tpl.id,dueAbs:absDay(s)+tpl.days,givenAbs:absDay(s)})
   q.active=q.active.slice(-4)
   gains.push(`新差事「${tpl.title}」· ${tpl.days} 日内`)
   note(s,`${def.name}引出一桩差事：「${tpl.title}」——${tpl.days} 日内交齐。`)
  }
 }
 h.seen[id]={year:s.year,kind}
 h.total=(h.total||0)+1
 // origin 记住「本来摸到的是哪一类」：残片集齐后折算成钱时，kind 会被改写成 wen，
 // 但发现卡与测试都还需要知道原本是拾到了一张残画。
 h.last={seq:h.seq,id,name:def.name,space:def.space,kind,origin:res.kind,title:def.name,text,gains}
 return null
}
// 一次点击固定吃两个随机数：先判触发的那一掷，再判落在哪一类结果。
// 必须先掷触发再掷结果——反过来会让「没中」的那一局也把结果摇出来，读档重放就对不上。
function pickResult(s,def){
 const list=def.results,total=list.reduce((n,r)=>n+(r.w||1),0)
 let roll=nextRandom(s)*total
 for(const r of list){roll-=(r.w||1);if(roll<0)return r}
 return list[list.length-1]
}
