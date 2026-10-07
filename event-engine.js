// 包 J1（第六轮）· 节气倒计时 + 限时任务 + 随机事件 + 声望
// 纯数据 + 纯函数：所有状态挂在存档根上（s.quests / s.events / s.reputation / s.seasonDay），
// 所有随机走 rng.js 的 s.rng，读档重放同一操作结果一致。
// 只依赖 variety-engine 与 rng —— 绝不 import farm-engine，否则会形成循环依赖导致白屏。
import {nextRandom} from './rng.js'
import {QUALITY_ORDER, VARIETIES, awardFragment} from './variety-engine.js'

// ================== 节气：季内 7 个游戏日 ==================
export const TERM_DAYS = 7
export const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter']
export const TERM_INFO = {
  spring: {name: '谷雨', say: '谷雨前后，种瓜点豆。', warn: '谷雨一过，秧就插不下了。'},
  summer: {name: '小暑', say: '小暑不种薯，入伏不种豆。', warn: '小暑一过，稻子灌浆就迟了。'},
  autumn: {name: '秋分', say: '秋分不露头，割了喂老牛。', warn: '秋分一过，谷粒要落在地里了。'},
  winter: {name: '冬至', say: '冬至一阳生，田闲人不闲。', warn: '冬至一过，这一年就算过去了。'}
}
export const seasonIndexOf = s => Math.max(0, SEASON_ORDER.indexOf(s))
// 本季已经过去的自然游戏日。窗口 7 天，之后还有 3 天宽限（倒计时读完为止）。
// 巡田是「催苗」不是「跳日子」，所以 seasonDay 只由真实时间推进，和生长进度无关。
export const TERM_GRACE = 3
export const dayOf = s => Math.max(0, Math.min(TERM_DAYS + TERM_GRACE, s?.seasonDay || 0))
// 绝对游戏日：跨年跨季可比，限时任务的期限用它来算，读档不会错乱
export const absDay = s => (s.year - 1) * 4 * (TERM_DAYS + TERM_GRACE) + seasonIndexOf(s.season) * (TERM_DAYS + TERM_GRACE) + dayOf(s)
export const termLeft = s => Math.max(0, TERM_DAYS - dayOf(s))
// 误了节气窗口：超过 7 天还没往下一季走，当季收成打对折。
export const missedTerm = s => (s?.seasonDay || 0) > TERM_DAYS

// ================== 声望 ==================
export const REP_MIN = 0, REP_MAX = 100, REP_START = 50
export const clampRep = v => Math.max(REP_MIN, Math.min(REP_MAX, Math.round(v)))
export const repOf = s => clampRep(s?.reputation ?? REP_START)
export const repWord = v => v >= 85 ? '乡里称善' : v >= 70 ? '口碑不错' : v >= 50 ? '不好不坏' : v >= 30 ? '闲话不少' : '人人避着走'

const note = (s, t) => { s.log.unshift(t); s.log = s.log.slice(0, 8) }
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)))
const vNameOf = id => (VARIETIES.find(v => v.id === id) || {}).name || id
// QUALITY_ORDER 是升序（劣 → 特优），所以品质达标 = 下标不小于要求的下标。
const qRank = q => QUALITY_ORDER.indexOf(q)
export const qualityAtLeast = (q, min) => qRank(q) >= qRank(min)

// 粮仓里达到某品质的稻米总量（收成按批次存，一批一个品质）
export function riceAtLeast(s, min) {
  return (s.riceLots || []).filter(l => qualityAtLeast(l.quality, min)).reduce((n, l) => n + (l.kg || 0), 0)
}
// 从粮仓扣掉 kg（优先扣最老的批次），返回是否扣够
export function takeRice(s, kg, min) {
  const lots = (s.riceLots || []).filter(l => qualityAtLeast(l.quality, min || '劣'))
  const total = lots.reduce((n, l) => n + l.kg, 0)
  if (total < kg) return false
  let left = kg
  for (const l of s.riceLots.slice().sort((a, b) => b.age - a.age)) {
    if (left <= 0) break
    if (!qualityAtLeast(l.quality, min || '劣')) continue
    const take = Math.min(l.kg, left); l.kg -= take; left -= take
  }
  s.riceLots = s.riceLots.filter(l => l.kg > 0)
  s.rice = s.riceLots.reduce((n, l) => n + l.kg, 0)
  return true
}
export function takeFood(s, key, n) {
  const foods = s.workshop?.foods
  if (!foods || (foods[key] || 0) < n) return false
  foods[key] -= n
  return true
}

// ================== 资源代价：需求与代价共用一套描述 ==================
// 统一表达：{wen, rice:{kg,quality}, crab, food:{key,name,n}, stamina, rep}
export const costText = c => {
  if (!c) return '不花钱'
  const out = []
  if (c.wen) out.push(`${c.wen} 文`)
  if (c.rice) out.push(`${c.rice.kg} kg ${c.rice.quality || ''}米`)
  if (c.crab) out.push(`稻田蟹 ${c.crab} 只`)
  if (c.food) out.push(`${c.food.name || c.food.key} ${c.food.n} 份`)
  if (c.stamina) out.push(`体力 ${c.stamina}`)
  if (c.rep) out.push(`声望 ${c.rep > 0 ? '+' : ''}${c.rep}`)
  return out.join(' · ') || '不花钱'
}
export function canPay(s, c) {
  if (!c) return true
  if (c.wen && (s.sales?.wen || 0) < c.wen) return false
  if (c.stamina && (s.stamina || 0) < c.stamina) return false
  if (c.crab && (s.crabs || 0) < c.crab) return false
  if (c.rice && riceAtLeast(s, c.rice.quality || '劣') < c.rice.kg) return false
  if (c.food && ((s.workshop?.foods || {})[c.food.key] || 0) < c.food.n) return false
  return true
}
export function pay(s, c) {
  if (!c) return true
  if (!canPay(s, c)) return false
  if (c.wen) s.sales.wen -= c.wen
  if (c.stamina) s.stamina = clamp(s.stamina - c.stamina)
  if (c.crab) s.crabs -= c.crab
  if (c.rice) takeRice(s, c.rice.kg, c.rice.quality || '劣')
  if (c.food) takeFood(s, c.food.key, c.food.n)
  return true
}
// 收益：{wen, rice:{kg,quality}, crab, rep, ecology, water, stamina, seed:{id,n}, fragment}
export function grant(s, g) {
  if (!g) return ''
  const out = []
  if (g.wen) { s.sales ??= {wen: 0}; s.sales.wen = (s.sales.wen || 0) + g.wen; out.push(`${g.wen} 文`) }
  if (g.rice) {
    s.riceLots = s.riceLots || []
    s.riceLots.push({kg: Math.floor(g.rice.kg), age: 0, quality: g.rice.quality || '良'})
    s.rice = (s.rice || 0) + Math.floor(g.rice.kg); out.push(`${g.rice.kg} kg 稻米`)
  }
  if (g.crab) { s.crabs = (s.crabs || 0) + g.crab; out.push(`稻田蟹 ${g.crab} 只`) }
  if (g.stamina) { s.stamina = clamp((s.stamina || 0) + g.stamina); out.push(`体力 +${g.stamina}`) }
  if (g.ecology) { s.ecology = clamp((s.ecology || 0) + g.ecology); out.push(`生态 ${g.ecology > 0 ? '+' : ''}${g.ecology}`) }
  if (g.water) { s.water = clamp((s.water || 0) + g.water); out.push(`水质 ${g.water > 0 ? '+' : ''}${g.water}`) }
  if (g.rep) { s.reputation = clampRep(repOf(s) + g.rep); out.push(`声望 ${g.rep > 0 ? '+' : ''}${g.rep}（${repWord(s.reputation)}）`) }
  if (g.seed) {
    const {id, n} = g.seed; s.seedBag ??= {}
    s.seedBag[id] = Math.min(99, (s.seedBag[id] || 0) + n)
    out.push(`${vNameOf(id)}稻种 ×${n}`)
  }
  // 碎片统一走图鉴的耕织图池（20 幅主线），池子已满时折算成一点剧情碎片
  if (g.fragment) {
    let got = 0
    for (let i = 0; i < g.fragment; i++) if (awardFragment(s, 'story')) got++
    if (got < g.fragment) { s.story ??= {}; s.story.fragments = (s.story.fragments || 0) + (g.fragment - got) }
    out.push(`耕织图残片 ×${g.fragment}`)
  }
  return out.join(' · ')
}

// ================== 限时任务池 ==================
// need 只支持：rice{kg,quality} / wen / crab / food{key,name,n}
export const QUEST_POOL = [
  {id: 'tribute', title: '太监催贡', text: '宫里来的太监坐在田埂上不肯走，说三日内要五十石特优米验看，迟一日就要参一本。', days: 3, need: {rice: {kg: 250, quality: '优'}}, cost: {stamina: 8}, reward: {wen: 500}, penalty: {rep: 20}},
  {id: 'army', title: '军营采买', text: '绿营的采买官按着刀把子问价，说军中等着开锅，有多少收多少，只是价压得低。', days: 4, need: {rice: {kg: 150, quality: '良'}}, reward: {wen: 320}, penalty: {rep: 10}},
  {id: 'seedgift', title: '官府发种', text: '县里清仓换新种，旧种折价发卖，说是惠农，其实要先交一笔“纸笔钱”。', days: 3, need: {wen: 120}, reward: {seed: {id: 'jingyue1', n: 2}}, penalty: {rep: 8}},
  {id: 'craborder', title: '酒楼订蟹', text: '镇上酒楼的掌柜寻到田边，说秋后要办席，先定下几篓稻田蟹。', days: 4, need: {crab: 6}, reward: {wen: 260}, penalty: {rep: 10}},
  {id: 'cakeorder', title: '点心铺订糕', text: '庙会将近，点心铺要备米糕，先来问作坊能不能按时出货。', days: 4, need: {food: {key: 'cake', name: '米糕', n: 12}}, reward: {wen: 240}, penalty: {rep: 10}},
  {id: 'ditch', title: '乡里修渠', text: '里正挨家挨户凑钱修那条断渠，说下游几户的田全指着它。', days: 5, need: {wen: 200}, reward: {rep: 16}, penalty: {rep: 12}},
  {id: 'ward', title: '里正托付', text: '里正把一包封好的米塞给你，说要送去给新到的学政看看成色——他只信得过你。', days: 3, need: {rice: {kg: 100, quality: '特优'}}, reward: {fragment: 1}, penalty: {rep: 15}},
  {id: 'winejar', title: '酒坊求米', text: '酒坊的曲已经拌好，就等上好的新米下缸，晚了下缸就要酸。', days: 4, need: {rice: {kg: 200, quality: '良'}}, reward: {wen: 380}, penalty: {rep: 8}},
  {id: 'school', title: '义学捐米', text: '村里的义学断炊了，先生不好意思开口，只在门口站了半晌。', days: 5, need: {rice: {kg: 120, quality: '良'}}, reward: {wen: 60, rep: 15}, penalty: {rep: 12}},
  {id: 'relief', title: '急调赈灾米', text: '上游决了口，灾民往下走。县衙贴出告示，急调米粮，两日内到仓。', days: 2, need: {rice: {kg: 300, quality: '良'}}, reward: {wen: 600, rep: 10}, penalty: {rep: 22}},
  // —— 包 M3：掌柜的席面单。带 from 标记，不进随机池，只由 npc-engine 的对话派发。——
  {id: 'banquet', from: 'zhanggui', title: '席面订米糕', text: '王掌柜说镇上要办寿席，米糕要现做的，晚了塌了面子。', days: 4, need: {food: {key: 'cake', name: '米糕', n: 20}}, reward: {wen: 420, rep: 6}, penalty: {rep: 10}},
  {id: 'cellar', from: 'zhanggui', title: '席面订陈酿', text: '王掌柜说楼上存的那批米酒见了底，让你务必赶在席前送十瓶过去。', days: 4, need: {food: {key: 'wine', name: '米酒', n: 10}}, reward: {wen: 520, rep: 8}, penalty: {rep: 10}},
  {id: 'courtyard', from: 'zhanggui', title: '雅间备好米', text: '王掌柜留了雅间给京里来的客人，说要一百五十公斤上等稻米，成色不能含糊。', days: 4, need: {rice: {kg: 150, quality: '优'}}, reward: {wen: 480, rep: 10}, penalty: {rep: 12}}
]
export const QUEST_MAP = Object.fromEntries(QUEST_POOL.map(q => [q.id, q]))
export const QUEST_CHANCE = .3

// ================== 随机事件池（18 条：天灾 6 / 人祸 6 / 奇遇 6）==================
export const EVENT_POOL = [
  // —— 天灾：限时点击应对，3 秒内点到阈值即减损 ——
  {id: 'locust', kind: 'disaster', name: '蝗灾', text: '天边起了一片灰黄的云，落地才知是蝗虫。它们啃叶子的声音像下雨。', need: 14, winLoss: .12, loseLoss: .42, act: '扑打蝗蝻'},
  {id: 'storm', kind: 'disaster', name: '暴雨', text: '雨从午后就没停，田水漫过田埂，眼看要冲走刚灌浆的穗子。', need: 13, winLoss: .10, loseLoss: .40, act: '疏通田缺'},
  {id: 'drought', kind: 'disaster', name: '干旱', text: '一连十几天不下雨，田土裂出细纹，脚踩上去发白。', need: 15, winLoss: .14, loseLoss: .45, act: '挑水灌田'},
  {id: 'coldsnap', kind: 'disaster', name: '倒春寒', text: '夜里忽然落霜，刚立住的秧苗叶尖开始发黑。', need: 12, winLoss: .10, loseLoss: .36, act: '熏烟护苗'},
  {id: 'flood', kind: 'disaster', name: '河水漫堤', text: '河上游开了口子，黄水顺着渠槽推下来，田里泛起浑沫。', need: 16, winLoss: .15, loseLoss: .48, act: '打桩挡水'},
  {id: 'blight', kind: 'disaster', name: '稻瘟', text: '叶子上起了灰白斑点，一株挨着一株，风一过就传遍半块田。', need: 13, winLoss: .11, loseLoss: .38, act: '摘叶烧毁'},

  // —— 人祸：三选一，各有代价 ——
  {id: 'squeeze', kind: 'choice', name: '衙役敲门', text: '例钱之外，差役又来了一趟，说河堤要修，让乡里“随个份子”。', options: [
    {key: 'pay', label: '掏钱了事', desc: '破财免灾，往后他少来两趟。', cost: {wen: 180}, gain: {rep: 3}, log: '你把钱封好递出去，差役捏了捏分量，笑着走了。'},
    {key: 'resist', label: '硬顶回去', desc: '一文不给——话传出去，名声会难听，可腰是直的。', gain: {rep: -12}, log: '你把手一摊说没有。差役临走回头看了你一眼。'},
    {key: 'relation', label: '托人周旋', desc: '提两壶酒去找镇上的熟人，事由他去说。', cost: {wen: 120, stamina: 8}, gain: {rep: 5}, log: '你提着酒去了镇上，回来只说了一句：“往后他绕着你的田走。”'}
  ]},
  {id: 'fakseed', kind: 'choice', name: '假种子', text: '春上从游商手里买的种，泡开一看，一半是空壳，粒色也不对。', options: [
    {key: 'replant', label: '赶紧补种', desc: '把空壳挑出来，自己掏钱重买一批填上。', cost: {wen: 160, stamina: 12}, gain: {}, log: '你连着两天下田补种，腰直不起来，好歹补上了大半。'},
    {key: 'pursue', label: '追查到底', desc: '去镇上找那游商，能不能追回看运气。', gain: {rep: 6}, log: '你追到码头，人早走了，倒是在茶馆里把这事说给了七八个人听。'}
  ]},
  {id: 'strike', kind: 'choice', name: '短工罢工', text: '雇来的短工把手里的秧一扔，说工钱不够吃饭，不涨就不干了。', options: [
    {key: 'raise', label: '一人加一百文', desc: '钱花出去，活能接着干。', cost: {wen: 100, stamina: 6}, gain: {rep: 4}, log: '你把工钱加到每人一百文，短工们重新卷起裤腿。'},
    {key: 'replace', label: '换一批人', desc: '省钱，但换手要耽误工夫，农时等不起。', gain: {rep: -6, ecology: -2}, log: '你把碗一收换人。新来的人生手，秧行歪歪斜斜。'}
  ]},
  {id: 'extratax', kind: 'choice', name: '加派杂税', text: '册书带着新填的税单上门，说上头要“均摊”，数目比去年多了三成。', options: [
    {key: 'pay', label: '照单缴了', desc: '日子照过，袋子薄一层。', cost: {wen: 220}, log: '你数着铜钱递过去，册书蘸了墨在单子上打了个勾。'},
    {key: 'resist', label: '拿着旧册理论', desc: '把往年的单子翻出来对质——未必有用，但话得说。', gain: {rep: -8, wen: 0}, log: '你把旧单子摊在桌上。册书脸色不好看，临走撂下一句“你看着办”。'}
  ]},
  {id: 'theft', kind: 'choice', name: '粮仓失窃', text: '仓门上的锁被撬了，靠门那一圈谷子少了一截，地上留着两道草鞋印。', options: [
    {key: 'pursue', label: '报官追查', desc: '惊动衙门要花钱，但也许能追回来。', cost: {wen: 80}, gain: {rep: 5}, log: '差役来看了一圈，说“查查”，然后就没了下文。'},
    {key: 'accept', label: '自己认下', desc: '声张出去，邻里互相猜疑，倒不如认了。', gain: {rep: -4}, log: '你把仓门重新钉上，什么也没说。当晚有户人家门口放下半袋谷子。'}
  ]},
  {id: 'olddebt', kind: 'choice', name: '旧债上门', text: '原主的旧账有人拿着字据来讨，说去年借的两石米，连本带利。', options: [
    {key: 'pay', label: '认账还清', desc: '旧账清了，往后走路抬得起头。', cost: {rice: {kg: 100, quality: '劣'}}, gain: {rep: 8}, log: '你把米装好送上门，那人愣了愣，把字据撕了。'},
    {key: 'negotiate', label: '当面论理', desc: '这笔账根本不该算在你头上，账慢慢说。', gain: {rep: -6}, log: '你在茶馆里和他磨了两个时辰，最后各让一步。'}
  ]},

  // —— 奇遇：直接收下 ——
  {id: 'ancientseed', kind: 'fortune', name: '古稻种', text: '老宅山墙塌了一角，墙缝里滚出一只陶罐，罐底沉着半把发黑的稻粒。', gain: {fragment: 1, rep: 2}, log: '你把稻粒小心收进绢袋——这大概是哪一辈人埋在墙里的东西。'},
  {id: 'hermit', kind: 'fortune', name: '隐居老农', text: '林子里的小屋住着个老汉，听你说了“按最省工的法子”，他只是摇头。', gain: {seed: {id: 'shangxiang1', n: 1}, rep: 3}, log: '老汉从梁上取下一小包种递给你：“这个不听话，但不怕涝。”'},
  {id: 'jade', kind: 'fortune', name: '田里捡到玉件', text: '翻地时锄头磕出一块青白玉，磨去泥，上头刻着半朵莲。', gain: {wen: 240, rep: 1}, log: '镇上铺子收下了这块玉，给了二百四十文。'},
  {id: 'crane', kind: 'fortune', name: '白鹤落田', text: '一队白鹤落在田里歇脚，踩过的地方泥翻得松，虫影也少了。', gain: {ecology: 6, rep: 2}, log: '白鹤歇了半日才走。周伯说：鹤肯落的地方，地气是活的。'},
  {id: 'scroll', kind: 'fortune', name: '破庙残卷', text: '破庙里压着半卷农书，纸已发脆，上头画着水车的样子。', gain: {fragment: 1, rep: 1}, log: '你把残卷仔细摊平，拓下那幅水车图。'},
  {id: 'spring', kind: 'fortune', name: '田边涌泉', text: '一场雨后，田埂根上冒出一股清水，用手一捧是凉的、甜的。', gain: {water: 8, ecology: 3}, log: '新泉眼的水清亮，引一渠进田，往后这季省了不少工夫。'}
]
export const EVENT_MAP = Object.fromEntries(EVENT_POOL.map(e => [e.id, e]))

// ================== 包 M4：赶路 ==================
// 家与上庄镇之间隔着一条官道。来回都算赶路：耗 5 点体力，三成概率撞上一件乡野奇遇。
// 奇遇直接复用事件池里的 fortune 类，当场结清、只进手记，不弹窗不排队——赶路是过场，不该打断人。
export const TRAVEL_STAMINA = 5
export const ENCOUNTER_CHANCE = .3
export function travelEncounter(s) {
  if (nextRandom(s) >= ENCOUNTER_CHANCE) return null
  const pool = EVENT_POOL.filter(e => e.kind === 'fortune')
  const ev = pool[Math.floor(nextRandom(s) * pool.length) % pool.length]
  const got = grant(s, ev.gain)
  const tail = got ? ` ${ev.log || ''}（得 ${got}）` : ''
  note(s, `路上：${ev.name}——${ev.text}${tail}`)
  return ev.id
}
export const EVENT_CHANCE = .3
export const EVENT_MAX = 2

// ================== 初始化 / 归一化 ==================
export function newQuestState() {
  return {active: [], done: [], failed: []}
}
export function newEventState() {
  return {pending: null, queue: [], history: []}
}
export function normalizeQuests(q) {
  if (q === undefined) return newQuestState()
  if (!q || typeof q !== 'object') return null
  q = structuredClone(q)
  for (const k of ['active', 'done', 'failed']) if (!Array.isArray(q[k])) return null
  const okOne = x => x && typeof x.id === 'string' && Object.hasOwn(QUEST_MAP, x.id) && Number.isSafeInteger(x.dueAbs) && x.dueAbs >= 0
  if (q.active.some(x => !okOne(x))) return null
  if (q.done.some(x => !okOne(x))) return null
  if (q.failed.some(x => !okOne(x))) return null
  q.done = q.done.slice(-20); q.failed = q.failed.slice(-20)
  return q
}
export function normalizeEvents(e) {
  if (e === undefined) return newEventState()
  if (!e || typeof e !== 'object') return null
  e = structuredClone(e)
  if (!Array.isArray(e.history) || !Array.isArray(e.queue)) return null
  if (e.pending !== null && !(e.pending && typeof e.pending.id === 'string' && Object.hasOwn(EVENT_MAP, e.pending.id))) return null
  if (e.queue.some(id => typeof id !== 'string' || !Object.hasOwn(EVENT_MAP, id))) return null
  if (e.history.some(h => !h || typeof h.id !== 'string' || !Object.hasOwn(EVENT_MAP, h.id))) return null
  e.history = e.history.slice(-24)
  return e
}

// ================== 限时任务 ==================
// 每季 30% 概率来 1~2 件差事；同一条任务不在同一轮里重复派。
export function rollQuests(s) {
  const q = s.quests ??= newQuestState()
  if (nextRandom(s) >= QUEST_CHANCE) return []
  const n = nextRandom(s) < .3 ? 2 : 1
  const busy = [...q.active, ...q.done.slice(-4), ...q.failed.slice(-2)].map(x => x.id)
  const pool = QUEST_POOL.filter(x => !x.from && !busy.includes(x.id))
  const out = []
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(nextRandom(s) * pool.length) % pool.length
    const tpl = pool.splice(idx, 1)[0]
    const ins = {id: tpl.id, dueAbs: absDay(s) + tpl.days, givenAbs: absDay(s)}
    q.active.push(ins); out.push(tpl.id)
    note(s, `有差事上门：「${tpl.title}」——${tpl.days} 日内交齐。`)
  }
  q.active = q.active.slice(-4)
  return out
}
export const questTpl = q => QUEST_MAP[q?.id]
export const questLeft = (s, q) => Math.max(0, (q?.dueAbs || 0) - absDay(s))
// 交差：先验货，再扣东西，最后给赏。
export function questFulfill(s, id) {
  const q = s.quests?.active?.find(x => x.id === id), tpl = QUEST_MAP[id]
  if (!q || !tpl) return '没有这件差事。'
  if (questLeft(s, q) <= 0) return '这件差事已经误期了。'
  const need = tpl.need || {}
  const c = {}
  if (need.rice) c.rice = need.rice
  if (need.wen) c.wen = need.wen
  if (need.crab) c.crab = need.crab
  if (need.food) c.food = need.food
  if (tpl.cost) Object.assign(c, tpl.cost)
  if (!canPay(s, c)) return '东西还没备齐，交不了差。'
  pay(s, c)
  const got = grant(s, tpl.reward)
  s.quests.active = s.quests.active.filter(x => x !== q)
  s.quests.done.push({...q, doneAbs: absDay(s)})
  note(s, `「${tpl.title}」交差完毕，得 ${got || '一句谢'}。`)
  return null
}
// 放弃算失败，扣分减半 —— 至少比误期好看些。
export function questGiveup(s, id) {
  const q = s.quests?.active?.find(x => x.id === id), tpl = QUEST_MAP[id]
  if (!q || !tpl) return '没有这件差事。'
  const loss = Math.max(1, Math.round((tpl.penalty?.rep || 8) / 2))
  s.quests.active = s.quests.active.filter(x => x !== q)
  s.quests.failed.push({...q, failedAbs: absDay(s), reason: '自认'})
  s.reputation = clampRep(repOf(s) - loss)
  note(s, `你回绝了「${tpl.title}」，话虽说得客气，闲话还是有了（声望 −${loss}）。`)
  return null
}
// 超期判定：每个游戏日结算一次，由 tick 调用。
export function tickQuests(s) {
  const q = s.quests
  if (!q || !Array.isArray(q.active) || !q.active.length) return 0
  const now = absDay(s); let n = 0; const rest = []
  for (const x of q.active) {
    const tpl = QUEST_MAP[x.id]
    if (now > x.dueAbs) {
      const loss = tpl?.penalty?.rep || 10
      s.reputation = clampRep(repOf(s) - loss)
      q.failed.push({...x, failedAbs: now, reason: '逾期'})
      note(s, `「${tpl?.title || '差事'}」误期了，乡里的议论压不住（声望 −${loss}）。`)
      n++
    } else rest.push(x)
  }
  q.active = rest; q.failed = q.failed.slice(-20)
  return n
}

// ================== 随机事件 ==================
export function rollEvents(s) {
  const st = s.events ??= newEventState()
  st.queue = st.queue || []
  if (nextRandom(s) >= EVENT_CHANCE) return []
  const bad = (s.omen && s.omen !== 'normal') || false
  const recent = st.history.slice(-3).map(h => h.id)
  const pool = EVENT_POOL.filter(e => !recent.includes(e.id))
  const out = []
  const n = nextRandom(s) < .3 ? EVENT_MAX : 1
  for (let i = 0; i < n && pool.length; i++) {
    let idx = Math.floor(nextRandom(s) * pool.length) % pool.length
    let ev = pool[idx]
    // 年景不好时，奇遇有一半机会被换成天灾 —— 荒年没有白捡的便宜。
    if (bad && ev.kind === 'fortune' && nextRandom(s) < .5) {
      const disasters = pool.filter(e => e.kind === 'disaster')
      if (disasters.length) ev = disasters[Math.floor(nextRandom(s) * disasters.length) % disasters.length]
    }
    pool.splice(pool.indexOf(ev), 1)
    out.push(ev.id)
  }
  if (out.length) {
    st.queue = [...(st.queue || []), ...out]
    if (!st.pending) st.pending = {id: st.queue.shift()}
    note(s, `这一季不太平：${out.map(id => EVENT_MAP[id].name).join('、')}。`)
  }
  return out
}
// 把当前事件收尾，并把队列里的下一条顶上
export function closeEvent(s, id, outcome) {
  const st = s.events; if (!st) return
  st.history = [...(st.history || []), {id, abs: absDay(s), outcome: outcome || ''}].slice(-24)
  st.pending = st.queue?.length ? {id: st.queue.shift()} : null
}
// 天灾：限时连点。点到阈值算守住，否则按比例减产。损失累加到 s.disasterLoss，秋收时一次性扣。
export function disasterResolve(s, id, hits) {
  const ev = EVENT_MAP[id]
  if (!ev || ev.kind !== 'disaster') return '这不是天灾。'
  const ok = Math.max(0, Math.floor(hits || 0)) >= ev.need
  const loss = ok ? ev.winLoss : ev.loseLoss
  s.disasterLoss = Math.max(s.disasterLoss || 0, loss)
  s.stamina = clamp((s.stamina || 0) - (ok ? 6 : 10))
  note(s, ok
    ? `${ev.name}被你抢在前头挡下了，田里只伤了三分（预计减产 ${Math.round(loss * 100)}%）。`
    : `${ev.name}来得太急，你没能挡住，田里伤得厉害（预计减产 ${Math.round(loss * 100)}%）。`)
  closeEvent(s, id, ok ? 'win' : 'lose')
  return null
}
// 人祸：三选一
export function eventChoose(s, id, choice) {
  const ev = EVENT_MAP[id]
  if (!ev || ev.kind !== 'choice') return '这不是要抉择的事。'
  const opt = (ev.options || []).find(o => o.key === choice)
  if (!opt) return '没有这个选项。'
  if (!canPay(s, opt.cost)) return '眼下的家底办不到这一条。'
  pay(s, opt.cost)
  const got = grant(s, opt.gain)
  note(s, opt.log || `${ev.name}：你选了「${opt.label}」。`)
  closeEvent(s, id, choice)
  return null
}
// 奇遇：直接收下
export function eventAccept(s, id) {
  const ev = EVENT_MAP[id]
  if (!ev || ev.kind !== 'fortune') return '这不是能收下的东西。'
  const got = grant(s, ev.gain)
  note(s, ev.log || `${ev.name}：${got}。`)
  closeEvent(s, id, 'accept')
  return null
}
// 一直不处理的事件：推进季节时按最保守的方式收尾，不让它永远挂着。
// 兜底口径是「最小代价」而不是「第一个选项」——玩家没顾上，不该按最贵的方式罚他。
export function autoResolvePending(s) {
  const st = s.events
  if (!st?.pending) return
  let guard = 0
  while (st.pending && guard++ < 6) {
    const ev = EVENT_MAP[st.pending.id]
    if (ev.kind === 'disaster') {
      s.disasterLoss = Math.max(s.disasterLoss || 0, ev.loseLoss)
      note(s, `${ev.name}没人应对，田里伤得不轻（减产 ${Math.round(ev.loseLoss * 100)}%）。`)
      closeEvent(s, st.pending.id, 'auto-lose')
    } else if (ev.kind === 'choice') {
      const opts = ev.options || []
      const free = opts.filter(o => !o.cost)
      const opt = free.find(o => !(o.gain?.rep > 0)) || free[0]
        || opts.filter(o => canPay(s, o.cost)).sort((a, b) => (a.cost.wen || 0) - (b.cost.wen || 0))[0]
        || opts[0]
      const paid = !opt.cost || pay(s, opt.cost)
      grant(s, opt.gain)
      note(s, paid
        ? `${ev.name}你没顾上，事情自己有了个结果。`
        : `${ev.name}你没顾上，一时也拿不出东西来平事，只好先记在账上。`)
      closeEvent(s, st.pending.id, 'auto')
    } else {
      grant(s, ev.gain)
      note(s, `${ev.name}：你把东西收下了。`)
      closeEvent(s, st.pending.id, 'auto')
    }
  }
}
