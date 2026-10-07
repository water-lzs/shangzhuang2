// —— 包 K（第八轮）Q-9.13：隐藏式多结局 ——
// 后台全程记四维（生态均值 / 累计净收入 / 文化收集度 / 道德值），界面上只给一句模糊描述；
// 朝廷来收贡米时三选一，按四维判四个结局。没够门槛就显「？？？」。
//
// 设计约束：
//   · 纯函数 + 可序列化，所有入口都走 normalize，坏档一律返回 null 让 readSave 挡掉。
//   · 只依赖 event-engine 的 REP_START 与 variety-engine 的常量，单向引用不成环。
//   · 判定表与旧 ending-engine.js 并列（旧表保留给 v7 及以前的存档走兼容面板）。
import {REP_START} from './event-engine.js'

// 四维满分门槛：累计净收入到这个数记满，其余三维本身就是 0~100。
export const WEALTH_FULL = 5000
export const ECO_FULL = 100

const clamp = (x, min = 0, max = 100) => Math.min(max, Math.max(min, x))
const round = x => Math.round(x)

// ================== 道德抉择表 ==================
// 数值刻意温和（一次 ±1~4），免得一桩事就把整局的品德判成恶人。
// 键取自 event-engine 的 EVENT_POOL：`${事件 id}:${选项 key}`。
export const MORAL_CHOICES = {
  'squeeze:pay': -2,        // 掏钱打发衙役
  'squeeze:resist': 3,      // 一文不给，硬顶回去
  'squeeze:relation': 1,    // 提酒托人周旋
  'fakseed:replant': 2,     // 自掏腰包补种
  'fakseed:pursue': 2,      // 追查到底，说给众人听
  'strike:raise': 4,        // 给短工一人加一百文
  'strike:replace': -4,     // 换一批人，省下这笔钱
  'extratax:pay': -2,       // 照单缴了
  'extratax:resist': 3,     // 拿旧册理论
  'theft:pursue': 1,        // 报官追查
  'theft:accept': 3,        // 自己认下，不叫邻里互相猜疑
  'olddebt:pay': 3,         // 认账还清
  'olddebt:negotiate': -1,  // 当面论理，慢慢磨
}
// 农事与差事上的抉择。雇工口径：花钱使唤人 -1，搭人情自己出力 +1。
const MORAL_ACTIONS = {
  'water:yuquan': 1,   // 肯为一道清水多花工钱
  'water:tap': -1,     // 图省力，井水硬了地力
  'pest:pesticide': -3,
  'pest:crab': 2,
  'pest:manual': 2,
  'omen:resolve:pay': -1,
  'omen:resolve:refuse': 2,
  'hire:paid': -1,
  'hire:barter': 1,
  'quest:fulfill': 1,
  'quest:giveup': -2,
}
const MORAL_REASONS = {
  'water:yuquan': '引玉泉山水入田，多花的工钱没省',
  'water:tap': '图近便打了井水，田土硬了一层',
  'pest:pesticide': '一桶药水泼下去，田埂的生气淡了',
  'pest:crab': '投了稻田蟹，压虫又养水',
  'pest:manual': '卷起裤腿自己下田捉虫',
  'omen:resolve:pay': '数了铜钱把事情了了',
  'omen:resolve:refuse': '没给这笔钱，自己多担待',
  'hire:paid': '花钱喊了短工来搭手',
  'hire:barter': '去邻家换工，搭上一份人情',
  'quest:fulfill': '把乡里托付的差事办成了',
  'quest:giveup': '把手里的差事推了',
}

// ================== 四维的模糊描述 ==================
// UI 只显示这一句，不露数字（Q-9.13 第 1 条）。
const WORDS = {
  ecology: [[85, '田埂一入夜都是蛙声'], [70, '水色清亮，地气是活的'], [50, '田还撑得住'], [30, '稻草发黄，渠里没了小鱼'], [0, '风一过，田里连虫都不剩']],
  wealth: [[85, '铜钱在袋里叮当响'], [65, '钱袋压手了些'], [45, '日子过得去'], [25, '数着铜板下种'], [0, '种袋比钱袋鼓']],
  culture: [[85, '你认得每一种稻的名字'], [65, '账本上抄了不少旧闻'], [45, '图鉴收了几页'], [25, '只叫得出御稻米一种'], [0, '别人的稻名，你听着都陌生']],
  moral: [[80, '乡里都说你心善'], [65, '周伯肯把第一束秧递给你'], [50, '见了面，点头的居多'], [35, '有人背后嘀咕两句'], [20, '借个斗都要绕半条街'], [0, '族里已不与你同桌']],
}
function wordOf(kind, v) {
  for (const [at, w] of WORDS[kind]) if (v >= at) return w
  return WORDS[kind][WORDS.kind.length - 1][1]
}
// 文言短评（揭晓面板里配在条形图右侧）
const COMMENTS = {
  ecology: [[70, '水木清华，地力未竭。'], [45, '田尚可耕，生气渐薄。'], [0, '土脉已伤，非一岁可复。']],
  wealth: [[70, '仓廩既实，囊有余钱。'], [45, '出入相抵，仅足温饱。'], [0, '岁入不敷，常在窘中。']],
  culture: [[70, '稻名田渠，皆在册中。'], [45, '略识其名，未尽其详。'], [0, '册页零落，名多遗失。']],
  moral: [[70, '邻里称善，乡评无亏。'], [45, '不褒不贬，寻常乡人。'], [0, '众口啧啧，其名不齿。']],
}
function commentOf(kind, v) {
  for (const [at, w] of COMMENTS[kind]) if (v >= at) return w
  return COMMENTS[kind][COMMENTS.kind.length - 1][1]
}

// ================== 初始化 / 归一化 ==================
export function newFinale(seed) {
  return {
    ecoSum: Number.isFinite(seed) ? seed : 50,
    ecoCount: 1,
    wealthIn: 0,
    wealthOut: 0,
    moralShift: 0,
    moralLog: [],
    choice: null,
    verdict: null,
    revealed: false,
    legacy: false,
  }
}
export function normalizeFinale(f) {
  if (f === undefined) return newFinale()
  if (!f || typeof f !== 'object') return null
  f = structuredClone(f)
  for (const k of ['ecoSum', 'ecoCount', 'wealthIn', 'wealthOut']) if (!Number.isFinite(f[k]) || f[k] < 0) return null
  if (!Number.isFinite(f.moralShift) || Math.abs(f.moralShift) > 500) return null
  if (!Array.isArray(f.moralLog)) return null
  f.moralLog = f.moralLog.filter(x => x && typeof x === 'object' && typeof x.why === 'string' && Number.isFinite(x.d)).slice(0, 12)
  if (f.choice !== null && !FINALE_CHOICES.some(c => c.key === f.choice)) return null
  if (f.verdict !== null) {
    if (!f.verdict || typeof f.verdict !== 'object') return null
    if (f.verdict.id !== null && !Object.hasOwn(FINALES, f.verdict.id)) return null
    if (!f.verdict.m || typeof f.verdict.m !== 'object') return null
  }
  if (typeof f.revealed !== 'boolean' || typeof f.legacy !== 'boolean') return null
  if (f.ecoCount < 1) f.ecoCount = 1
  return f
}

// ================== 四维记账 ==================
// 由 farm-engine 在每次成功的 reduce 之后统一调用（出口收口，免得散落在各处漏记）。
export function trackFinale(before, after, action) {
  const f = after.finale
  if (!f) return after
  // ① 累计净收入：拿前后银钱差做账，季末欠款（付不动被 clamp 掉的那部分）另计负债。
  const d = (after.sales?.wen || 0) - (before.sales?.wen || 0)
  if (d > 0) f.wealthIn += d
  else if (d < 0) f.wealthOut += -d
  const s0 = before.settle?.short || 0, s1 = after.settle?.short || 0
  if (s1 > s0) f.wealthOut += s1 - s0
  // ② 生态均值：每翻一季（或翻年）采一次样，免得狂点插秧把均值拉偏。
  if (after.season !== before.season || after.year !== before.year) {
    f.ecoSum += Number.isFinite(after.ecology) ? after.ecology : 50
    f.ecoCount += 1
  }
  // ③ 道德值：可解释地记下每一次抉择，揭晓时能逐条念给玩家听。
  const hit = moralDeltaOf(action, before, after)
  if (hit) {
    f.moralShift = clamp(f.moralShift + hit.d, -50, 50)
    f.moralLog.unshift({ y: after.year, s: after.season, d: hit.d, why: hit.why })
    f.moralLog = f.moralLog.slice(0, 12)
  }
  return after
}
export function moralDeltaOf(action, before, after) {
  const t = action?.type || ''
  if (t === 'event:choose') {
    const d = MORAL_CHOICES[`${action.event}:${action.choice}`]
    return d ? { d, why: choiceReason(action.event, action.choice) } : null
  }
  if (t === 'hire') {
    // 真扣了钱就是花钱雇工，否则走的是「邻里换工」——两者口碑不同。
    const key = (after.sales?.wen || 0) < (before.sales?.wen || 0) ? 'hire:paid' : 'hire:barter'
    return { d: MORAL_ACTIONS[key], why: MORAL_REASONS[key] }
  }
  if (t === 'water') { const k = `water:${action.choice}`; return MORAL_ACTIONS[k] ? { d: MORAL_ACTIONS[k], why: MORAL_REASONS[k] } : null }
  if (t === 'pest') { const k = `pest:${action.choice}`; return MORAL_ACTIONS[k] ? { d: MORAL_ACTIONS[k], why: MORAL_REASONS[k] } : null }
  if (t === 'omen:resolve') {
    const k = `omen:resolve:${action.choice === 'pay' ? 'pay' : 'refuse'}`
    return { d: MORAL_ACTIONS[k], why: MORAL_REASONS[k] }
  }
  if (t === 'quest:fulfill' || t === 'quest:giveup') return { d: MORAL_ACTIONS[t], why: MORAL_REASONS[t] }
  return null
}
function choiceReason(eventId, key) {
  const map = {
    'squeeze:pay': '掏钱把差役打发走了', 'squeeze:resist': '一文不给，把人硬顶回去', 'squeeze:relation': '提两壶酒去镇上托人',
    'fakseed:replant': '把假种挑净，自己掏钱补上', 'fakseed:pursue': '追到码头，把这事说给众人听',
    'strike:raise': '给短工一人加了一百文', 'strike:replace': '把罢工的短工全换了',
    'extratax:pay': '照新单子把杂税缴了', 'extratax:resist': '翻出旧册，当面理论',
    'theft:pursue': '报官追查失窃的谷子', 'theft:accept': '自己认下失窃，没叫邻里互相猜疑',
    'olddebt:pay': '把原主欠下的旧账还清了', 'olddebt:negotiate': '拿着字据与讨账的人磨了半日',
  }
  return map[`${eventId}:${key}`] || '做了一桩抉择'
}

// ================== 四维读数 ==================
export function cultureScore(s) {
  const b = s?.varietyBook || {}
  const frag = clamp((b.artFragments?.length || 0) / 20, 0, 1)
  const book = clamp((b.unlocked?.length || 0) / 13, 0, 1)
  const arc = clamp((s?.story?.questsDone || 0) / 4, 0, 1)
  const tt = b.timeTravel ? 1 : 0
  return round((frag * 0.4 + book * 0.3 + arc * 0.2 + tt * 0.1) * 100)
}
export function moralScore(s) {
  const f = s?.finale
  const own = REP_START + (f?.moralShift || 0)              // 自己的抉择
  const rep = Number.isFinite(s?.reputation) ? s.reputation : REP_START // 乡里的口碑
  return round(clamp(own * 0.6 + rep * 0.4))
}
export function wealthNetOf(s) {
  const f = s?.finale
  if (!f) return 0
  return round((f.wealthIn || 0) - (f.wealthOut || 0))
}
export function finaleMetrics(s) {
  const f = normalizeFinale(s?.finale) || newFinale()
  const eco = round(clamp(f.ecoCount > 0 ? f.ecoSum / f.ecoCount : (s?.ecology ?? 50)))
  const net = round((f.wealthIn || 0) - (f.wealthOut || 0))
  const b = s?.varietyBook || {}
  return {
    eco,
    wealth: round(clamp(net / WEALTH_FULL * 100)),
    culture: cultureScore(s),
    moral: moralScore(s),
    wealthNet: net,
    varieties: b.unlocked?.length || 0,
    harvested: b.harvested?.length || 0,
    fragments: b.artFragments?.length || 0,
    questsDone: s?.story?.questsDone || 0,
    shifts: (f.moralLog || []).length,
  }
}
// UI 只该拿这个：一句模糊话，不带数字。
export function blurWords(s) {
  const m = finaleMetrics(s)
  return {
    ecology: wordOf('ecology', m.eco),
    wealth: wordOf('wealth', m.wealth),
    culture: wordOf('culture', m.culture),
    moral: wordOf('moral', m.moral),
  }
}
export const verseOf = (kind, v) => commentOf(kind, v)

// ================== 最终任务的触发 ==================
// 需求里两条「最终任务」：集齐《耕织图》20 幅，或种出「上香一号」。
export function finaleReady(s) {
  const b = s?.varietyBook || {}
  if ((b.artFragments?.length || 0) >= 20 || b.artRestored) return 'art'
  const seen = new Set([...(b.harvested || []), ...(s?.history || []).flatMap(h => (h?.varieties || [])), ...(s?.result?.varieties || [])])
  if (seen.has('shangxiang1')) return 'seed'
  return null
}
export const FINALE_CHOICES = [
  { key: 'tribute', label: '照数进贡', desc: '宗人府的名册上，总要有这一笔。', verse: '稻入官仓，名入贡册。' },
  { key: 'decline', label: '留种婉拒', desc: '把最好的一斗留下来——来年还得靠它。', verse: '留种者，为后来人留田也。' },
  { key: 'skimp', label: '以次充好', desc: '上等米换个袋，账上仍旧写足数。', verse: '仓廩既实，其名已腐。' },
]

// ================== 四个结局 ==================
export const FINALES = {
  merchant: {
    id: 'merchant', name: '御贡米商', tag: '御贡结局', tone: 'gold',
    verse: '稻入官仓，名入贡册。',
    brief: '你交够了贡额，也交上了自己的名字。上庄的稻进了官仓，账册一年比一年厚。',
    lines: [
      '车辙压在石板上，一行向城门去。',
      '你数着装车的口袋，一袋比一袋实。',
      '名字上了贡册，刻成木牌，挂在仓门上。',
      '周伯来看过一回，站在门口没进来。',
      '田还是那十亩，水还是那道渠。',
      '只是春天的第一斗种，是从别处买的。',
      '有人问你京西稻怎么种，你说：照册子上的规矩。',
      '册子很厚，稻名很少。',
    ],
  },
  hermit: {
    id: 'hermit', name: '归隐田园', tag: '生态结局', tone: 'jade',
    verse: '不献其稻，而献其田。',
    brief: '你把贡额推了回去，把最好的稻种留在了田里。渠水还在，蛙声还在，名字也还在。',
    lines: [
      '你把最后一批谷子摊在场上，天色很慢。',
      '官差的船在桥下等了半日，走了。',
      '田埂上重新长了野草，你没舍得拔。',
      '阿禾送来一袋种，说是她祖母留下的。',
      '你们数着稻名，一个一个念出来。',
      '有些名字，连册子上都没有。',
      '第二年春天，渠里的水自己流到了田里。',
      '你听见蛙声，就醒了。',
    ],
  },
  traveler: {
    id: 'traveler', name: '时空归客', tag: '现代结局', tone: 'silver',
    verse: '图成二十幅，稻名十三种。',
    brief: '十三种稻、二十幅耕织图，你一样没落下。归返的光标终于停下——停在你亲手写下名字的那一栏。',
    lines: [
      '图鉴合上的那一刻，光从纸缝里漏出来。',
      '十三个稻名排成一列，像有人在点名。',
      '耕织图二十幅全了，卷轴慢慢显影。',
      '你看见自己插过的每一亩田。',
      '看见周伯的竹竿，阿禾的蟹篓。',
      '看见后来的机器在同样的田里转弯。',
      '档案上写着：上庄京西稻，申遗成功。',
      '而你的名字，写在「留种人」那一栏。',
    ],
  },
  corrupt: {
    id: 'corrupt', name: '贪腐之路', tag: '黑暗结局', tone: 'ink',
    verse: '仓有余粟，乡无余望。',
    brief: '贡额是凑齐的，账做得干净。查抄的队伍秋后到——那一年，京西稻少了一个稻名。',
    lines: [
      '账做得漂亮，仓里却空了一角。',
      '你把上等米换了个袋，封口压得很平。',
      '查抄的队伍是秋后到的。',
      '他们掀开仓板，谷壳扬起来，落在肩头。',
      '祠堂前站了很多人，没有一个是来看你的。',
      '周伯没说话，把斗量了一遍又一遍。',
      '田埂上的草长到齐腰，没人再拔。',
      '这一年，京西稻少了一个稻名。',
    ],
  },
  unknown: {
    id: null, name: '？？？', tag: '未达成', tone: 'plain',
    verse: '事未竟，名未立。',
    brief: '船在桥下等了三日，你还是没拿定主意该往哪头走。故事停在半途——四维里还差着几样。',
    lines: [
      '朝廷的船在桥下等了三日。',
      '你翻了翻仓里的账，又看了看田。',
      '有些事还没做完。',
      '名字没有被写下来。',
      '档案合上，什么也没留下。',
      '——这个故事，还没有走到头。',
    ],
  },
}

// ================== 判定 ==================
// 四维 + 三选一 → 结局 id（不够门槛就 null，界面显 ???）。
// 时空归客是隐藏结局：不看选择，只看「十三种稻 + 二十幅图 + 文化满」。
export function judgeFinale(s, choice) {
  const m = finaleMetrics(s)
  const b = s?.varietyBook || {}
  const full = (b.unlocked?.length || 0) >= 13 && (b.artFragments?.length || 0) >= 20
  if (full && m.culture >= 85) return { id: 'traveler', m }
  if (choice === 'skimp') return { id: 'corrupt', m }
  // 兜底：口碑坏到根上、钱又赚够了，交不交足数都一个下场——必须排在两个选择之前，
  // 否则「照数进贡」那条分支会提前 return，让这条永远走不到。
  if (m.moral <= 28 && m.wealth >= 60) return { id: 'corrupt', m }
  if (choice === 'tribute') return m.wealth >= 55 && m.culture >= 45 ? { id: 'merchant', m } : { id: null, m }
  if (choice === 'decline') return m.eco >= 65 && m.moral >= 55 ? { id: 'hermit', m } : { id: null, m }
  return { id: null, m }
}
// 差在哪儿（未达成时给玩家的提示，仍不报数字）
export function missingHints(s, choice) {
  const m = finaleMetrics(s), out = []
  if (choice === 'tribute') {
    if (m.wealth < 55) out.push('仓里的谷子还不够装满进贡的车——再多种几季、多卖几回。')
    if (m.culture < 45) out.push('账本和稻谱都还空着，贡册要的不只是米。')
  } else if (choice === 'decline') {
    if (m.eco < 65) out.push('田里的生气还薄，留种未必留得住。')
    if (m.moral < 55) out.push('乡里对你的说法还没定下来。')
  }
  if (m.varieties < 13) out.push(`御贡图鉴还差 ${13 - m.varieties} 种稻。`)
  if (m.fragments < 20) out.push(`《京西稻耕织图》还差 ${20 - m.fragments} 幅。`)
  return out
}

// ================== reduce ==================
export function reduceFinale(current, action) {
  const s = structuredClone(current)
  const f = normalizeFinale(s.finale)
  if (!f) return { state: current, error: '终章存档无效。' }
  s.finale = f
  let error = null
  const fail = t => { error = t }
  if (action.type === 'finale:decide') {
    if (f.choice) fail('贡米已经交出去了，这一局的结局定下了。')
    else if (!FINALE_CHOICES.some(c => c.key === action.choice)) fail('请选择如何处置这批贡米。')
    else if (!finaleReady(s)) fail('朝廷还没有来收贡米——先把耕织图补齐，或种出一季「上香一号」。')
    else {
      const v = judgeFinale(s, action.choice)
      f.choice = action.choice
      f.verdict = { id: v.id, m: v.m }
      f.revealed = false
      s.ending = v.id                       // 同步旧 ending 字段，旧面板也能读
      s.log ??= []
      s.log.unshift(v.id ? `朝廷来收贡米，你选了「${FINALE_CHOICES.find(c => c.key === action.choice).label}」。四时终章已定：${FINALES[v.id].name}。` : '朝廷来收贡米，你选了「' + FINALE_CHOICES.find(c => c.key === action.choice).label + '」。只是账上还差着些东西——终章未成。')
      s.log = s.log.slice(0, 8)
    }
  } else if (action.type === 'finale:reveal') {
    if (!f.verdict) fail('还没有可揭晓的终章。')
    else f.revealed = true
  } else if (action.type === 'finale:ack') {
    if (typeof action.legacy !== 'boolean') fail('未知的终章操作。')
    else f.legacy = action.legacy
  } else fail('未知的终章操作。')
  return error ? { state: current, error } : { state: s, error: null }
}
