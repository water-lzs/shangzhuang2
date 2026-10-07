// 包 M3（第十一轮）· 镇上四邻：对话、好感与人情往来
// 设计纪律：
//   ① 与 event-engine 同构 —— 状态挂在存档根（s.npc），随机一律走 rng.js 的 s.rng，
//      读档重放同一操作结果一致，绝不用 Math.random()；
//   ② 只单向依赖 rng / event-engine / variety-engine，绝不 import farm-engine（成环会白屏）；
//   ③ 好感不做数字面板 —— 界面只给「生分 / 脸熟 / 交好 / 知交」四级与一句白话，
//      具体数值只在调试开关（ui.showNumbers）下可见，与包 H1 的隐性感知一脉相承。
import { nextRandom } from './rng.js'
import { absDay, clampRep, newQuestState } from './event-engine.js'
import { awardFragment } from './variety-engine.js'

const note = (s, t) => { s.log.unshift(t); s.log = s.log.slice(0, 8) }
const clampAff = v => Math.max(0, Math.min(100, Math.round(v)))
const seasonKey = s => `${s.year}-${s.season}`

// ================== 人物表 ==================
export const NPC_ORDER = ['changsi', 'liancai', 'zhanggui', 'shuanzi']
export const NPCS = {
  changsi: { id: 'changsi', name: '常四伯', role: '老农', glyph: '耜', place: '田埂上', tag: '种田', gift: '稻种' },
  liancai: { id: 'liancai', name: '连财', role: '粮商', glyph: '斗', place: '粮店柜台', tag: '行情', gift: '减手续费' },
  zhanggui: { id: 'zhanggui', name: '王掌柜', role: '酒楼掌柜', glyph: '盏', place: '酒楼雅间', tag: '生意', gift: '席面订单' },
  shuanzi: { id: 'shuanzi', name: '栓子', role: '村里后生', glyph: '话', place: '村口老槐树下', tag: '闲谈', gift: '见闻' }
}
export const npcDef = id => NPCS[id] || null

// ================== 好感四级（界面只说这一层）==================
export const AFF_TIERS = [
  { min: 0, name: '生分', word: '见面只点点头' },
  { min: 25, name: '脸熟', word: '路上会招呼一声' },
  { min: 50, name: '交好', word: '有好事会想着你' },
  { min: 75, name: '知交', word: '能托付大事' }
]
export function affTier(v) { let t = AFF_TIERS[0]; for (const x of AFF_TIERS) if (v >= x.min) t = x; return t }
export const affOf = (s, id) => clampAff(s?.npc?.[id]?.affinity ?? 0)
export const affWord = (s, id) => affTier(affOf(s, id)).name
// 「再熟一分」的提示：把下一档还差多少翻成一句白话，不报数字
export function affHint(s, id) {
  const v = affOf(s, id)
  const next = AFF_TIERS.find(t => t.min > v)
  if (!next) return '交情已经到头了'
  const gap = next.min - v
  return gap <= 8 ? `再叙两回就${next.name}了` : `离${next.name}还早`
}

// ================== 台词池 ==================
// 每人三档（年份索引）：初识 / 熟络 / 交心。每档四条，合计十二句。
export const NPC_LINES = {
  changsi: [
    { until: 2, lines: [
      '秧插下去头三天最要紧，水别断。水一断，根就浮起来，往后怎么补都补不回来。',
      '看稻叶尖——叶尖挂露，是田里有水气；叶尖发焦，那是渴了。',
      '今年虫比往年密，翻翻叶背。早两天动手，能省一半力气。',
      '田埂上的草别铲得太干净，留些给青蛙躲。青蛙多的地方，虫子少。'
    ] },
    { until: 4, lines: [
      '你这几年的田有起色了。土色发暗、踩下去松，这是好田的样子。',
      '京西的水硬。别处的稻种挪到这儿，头一年总得先认认水土。',
      '紫金箍那号品种皮实，就是挑水。水一浑，它就掉粒。',
      '老辈人说：御田十年，田养人，人也养田。你记着这句。'
    ] },
    { until: 99, lines: [
      '我把话跟你说明白：玉泉山那渠水，是京西稻的命根子。当年康熙爷尝了新米，才把这地方圈成御田。',
      '你要走远路，我这儿还留着祖上的种。拿去种种看，别让它断在我手里。',
      '种田三十年，我就信一句——地不欺人。',
      '水稻这东西，你哄它一季，它哄你一年。'
    ] }
  ],
  liancai: [
    { until: 2, lines: [
      '新米上市价最低。你要是压到冬天再出手，粮店能多给你两成。',
      '市场那边每季有额度的。想大出货就来我这儿，价压一点，但能一次清干净。',
      '米分三等，酒楼只认上等。你要走那条路，得先把品质提上去。',
      '陈米掉价。仓里放超过三季的，我都按半价收。'
    ] },
    { until: 4, lines: [
      '你我打个商量：你出货勤，我这手续费给你抹个零头。',
      '别把货全押一家店——鸡蛋不放一个篮子里。这话我年轻时也不爱听。',
      '今年水路通畅，粮价平稳。上游要是涨水，我头一个告诉你。',
      '粮店走的是量，你别嫌价低。量大的人，最后算下来反而赚。'
    ] },
    { until: 99, lines: [
      '我在上庄镇做三十年粮食生意，什么人没见过。你账上干净，这比什么都值钱。',
      '往后你的货到，我这边先给你过秤，手续费照最低的算。',
      '别急着攒钱。钱是死的，田是活的。',
      '你要真有上好的米，留着，别急着出。好米等得起价。'
    ] }
  ],
  zhanggui: [
    { until: 2, lines: [
      '酒楼做的是席面，客人挑嘴。米不好，我这招牌就砸了。',
      '我这儿只收上等货。优字以下的，你送去粮店，我不看。',
      '米酒你有多少我要多少。京西的水酿出来的酒，别处没这个味。',
      '稻花鱼、稻田蟹，到了秋天记得给我留。'
    ] },
    { until: 4, lines: [
      '上回那批米不错。席上客人问是哪儿的，我说京西御田，脸上有光。',
      '我这两张席面的单子，你备得齐，我另给你加赏。',
      '做买卖讲究一个「准」字。到时候到不了，往后再好的货我也不敢订。',
      '店里最近来了南边的客人，说想吃北边的稻米饭。你看着备些上好的。'
    ] },
    { until: 99, lines: [
      '我托你个事：往后你的特优米，先紧着我这边。价钱好商量。',
      '御贡的专线我给你搭上了。往后你那稻米走我这条路，价钱按高的一档算。',
      '你这田里的东西，我信得过。',
      '酒楼开了二十年，我学会一件事——好东西自己会说话。'
    ] }
  ],
  shuanzi: [
    { until: 2, lines: [
      '听说你这京西稻是打老辈子传下来的种？给我讲讲呗。',
      '村口那棵老槐树，我爷爷的爷爷就在底下乘过凉。',
      '城里人现在稀罕粗粮，说吃细了不消化——你信不信？',
      '我家那口子说，今年雨水好，稻子该长得旺。'
    ] },
    { until: 4, lines: [
      '去年社戏你看了没？演的《打渔杀家》，唱到半夜。',
      '我二舅在衙门里当差。他说今年要修渠，银子还没批下来。',
      '你得闲帮我看看我家那二分地呗，我总觉得庄稼长得不对。',
      '镇东头王掌柜家的酒，我尝过一回，好喝得很。'
    ] },
    { until: 99, lines: [
      '你那个御稻的法子，我听我爷爷说过类似的——老辈都传，京西这地方的水不一样。',
      '村里人都说你是能人。你要做什么，招呼一声就行。',
      '我这儿有张老图，是我爷爷留下的，上头画着玉泉山的水道。你要不要看看？',
      '我算是看明白了：你这人种地，跟别人不一样。'
    ] }
  ]
}
export function linesOf(s, id) {
  const pool = NPC_LINES[id] || []
  const seg = pool.find(x => (s?.year || 1) <= x.until) || pool[pool.length - 1]
  return seg ? seg.lines : ['……']
}
// 同一天同一人只说同一句（用绝对游戏日 + 好感档做索引），免得每次重绘都换词。
export function npcLine(s, id) {
  const L = linesOf(s, id)
  return L[Math.abs(absDay(s) + affOf(s, id)) % L.length]
}

// ================== 情报（每次叙话附一句见闻，写进手记）==================
export const INTEL = {
  changsi: ['田埂边听人讲：今年开春雨水匀，插秧不必抢。', '常四伯说：水位稳的时候，别急着排，让田里养养气。', '常四伯念叨：虫怕的是旱，涝一场反倒少些。', '常四伯提起：往东那块地沙性大，浇水要勤一点。'],
  liancai: ['连财透了口风：这季粮店收量大，价钱压得住，出手要早。', '连财说：陈米压仓不划算，过了三季就掉一半价。', '连财提醒：酒楼那边最近缺上等米，价出得比市面高。', '连财说：市场每季就那么点额度，出大货得走粮店。'],
  zhanggui: ['王掌柜透露：近来席面上讲究稻米饭，米色白净的更好卖。', '王掌柜说：米酒越陈越香，但缸位有限，别都占了。', '王掌柜提到：稻田蟹秋天价最好，早卖吃亏。', '王掌柜讲：酒楼只认优等，次一等的宁可不要。'],
  shuanzi: ['栓子说：镇上老人都传，京西的水过了玉泉山才带甜味。', '栓子听见的闲话：今年县里要修渠，尚未动工。', '栓子讲：村里有新媳妇从南边来，说没见过稻子这样种。', '栓子提到：镇上庙会快到了，点心铺要备货。']
}
export function intelOf(s, id) {
  const L = INTEL[id] || ['……']
  return L[Math.abs(absDay(s) * 3 + affOf(s, id)) % L.length]
}

// ================== 状态 ==================
export function newNpcState() {
  return Object.fromEntries(NPC_ORDER.map(id => [id, { affinity: 0, lastTalkDay: -99, lastGiftSeason: '', lastOrderSeason: '', tribute: false, lastLine: '' }]))
}
export function normalizeNpc(x) {
  if (x === undefined) return newNpcState()
  if (!x || typeof x !== 'object') return null
  const out = newNpcState()
  for (const id of NPC_ORDER) {
    const v = x[id]
    if (v === undefined) continue
    if (!v || typeof v !== 'object') return null
    const a = v.affinity ?? 0, d = v.lastTalkDay ?? -99
    if (!Number.isSafeInteger(a) || a < 0 || a > 100 || !Number.isSafeInteger(d)) return null
    out[id] = {
      affinity: a, lastTalkDay: d,
      lastGiftSeason: typeof v.lastGiftSeason === 'string' ? v.lastGiftSeason : '',
      lastOrderSeason: typeof v.lastOrderSeason === 'string' ? v.lastOrderSeason : '',
      tribute: v.tribute === true,
      // 上一回他说的那句留在簿子上，刷新页面还看得见。
      lastLine: typeof v.lastLine === 'string' ? v.lastLine.slice(0, 160) : ''
    }
  }
  return out
}

// ================== 对话 ==================
export const talkedToday = (s, id) => (s?.npc?.[id]?.lastTalkDay ?? -99) >= absDay(s)
export const canTalk = (s, id) => !!NPCS[id] && !!s?.npc?.[id] && !talkedToday(s, id)
export const readyCount = s => NPC_ORDER.filter(id => canTalk(s, id)).length

// 交情到「交好」以后，粮商给的手续费减免（0 / 1 / 2 文）
export function feeCutOf(s) {
  const a = affOf(s, 'liancai')
  return a >= 65 ? 2 : a >= 30 ? 1 : 0
}
// 交心之后掌柜搭上的御贡米专线
export const tributeOpen = s => !!s?.npc?.zhanggui?.tribute

// 掌柜的三张席面单（模板在 event-engine 的 QUEST_POOL 里，带 from:'zhanggui' 标记）
export const ORDER_IDS = ['banquet', 'cellar', 'courtyard']

// 与一位街坊叙话：每天一次，加交情、给见闻，交情深了另有人情。
export function talkNpc(s, id) {
  const def = NPCS[id], n = s?.npc?.[id]
  if (!def || !n) return { error: '镇上没有这个人。' }
  const today = absDay(s)
  if (n.lastTalkDay >= today) return { error: `${def.name}今日已经叙过话了，明天再来。` }
  n.lastTalkDay = today
  // 交情涨得慢：一季七次叙话约涨两成。到「交好」要大半年，到「知交」要一年多，
  // 御贡米专线（掌柜 85）更是两年上下的长线投入——这样它才像人情，不像打卡奖励。
  const delta = 2 + Math.floor(nextRandom(s) * 4)
  n.affinity = clampAff(n.affinity + delta)
  const out = { id, name: def.name, line: npcLine(s, id), intel: intelOf(s, id), delta, affinity: n.affinity, gains: [], order: null }
  n.lastLine = out.line

  if (id === 'changsi') {
    // 老农：交情到「交好」后，每季塞一份稻种
    if (n.affinity >= 50 && n.lastGiftSeason !== seasonKey(s)) {
      n.lastGiftSeason = seasonKey(s)
      const vid = s.riceVariety || Object.keys(s.seedBag || {})[0] || 'royal'
      s.seedBag ??= {}
      s.seedBag[vid] = (s.seedBag[vid] || 0) + 1
      out.gains.push(`常四伯塞给你 1 份稻种（${vid === 'royal' ? '御稻米' : vid}）`)
    }
  } else if (id === 'zhanggui') {
    // 掌柜：交情到「交好」后，每季最多派一张席面单
    if (n.affinity >= 40 && n.lastOrderSeason !== seasonKey(s)) {
      const taken = ORDER_IDS.filter(x => (s.quests?.active || []).some(q => q.id === x))
      const pool = ORDER_IDS.filter(x => !taken.includes(x))
      // 手上积着的席面单最多两张：掌柜不会把活压给一个接不完的人。
      const pending = (s.quests?.active || []).filter(q => q.from === 'zhanggui').length
      if (pool.length && pending < 2 && nextRandom(s) < .7) {
        const pick = pool[Math.floor(nextRandom(s) * pool.length) % pool.length]
        const days = 4
        s.quests ??= newQuestState()
        s.quests.active.push({ id: pick, dueAbs: today + days, givenAbs: today, from: 'zhanggui' })
        n.lastOrderSeason = seasonKey(s)
        out.order = pick
        out.gains.push('王掌柜给你留了一张席面单子')
      }
    }
    // 交心之后搭上御贡米专线：酒楼开始收稻米，价按高的一档
    if (n.affinity >= 85 && !n.tribute) {
      n.tribute = true
      out.gains.push('王掌柜把御贡米专线搭上了：往后酒楼也收稻米')
    }
  } else if (id === 'shuanzi') {
    // 村民：闲谈要么翻出一片旧纸，要么替你在乡里添句好话
    if (nextRandom(s) < .5) { awardFragment(s, 'social'); out.gains.push('栓子翻出一片旧纸给你') }
    else { s.reputation = clampRep((s.reputation ?? 50) + 2); out.gains.push('栓子在乡里替你说好话') }
  }

  // 台词本身以句号收尾，后续奖励另起一截，免得连成一串逗号。
  const tail = out.gains.length ? ` ${out.gains.join('，')}。` : ''
  note(s, `与${def.name}叙话。${out.line}${tail}`)
  return out
}

// 一次把今天还能叙话的都叙了（省点手劲，也让「每天一次」不至于变成打卡负担）
export function talkAll(s) {
  const out = []
  for (const id of NPC_ORDER) {
    if (!canTalk(s, id)) continue
    const r = talkNpc(s, id)
    if (!r.error) out.push(r)
  }
  return out
}

// ================== reducer ==================
export function reduceNpc(current, action) {
  const s = structuredClone(current)
  const fixed = normalizeNpc(s.npc)
  if (!fixed) return { state: current, error: '街坊簿记坏了，这一趟走不成。' }
  s.npc = fixed
  let error = null
  if (action.type === 'npc:talk') {
    const r = talkNpc(s, action.npc)
    if (r.error) error = r.error
  } else if (action.type === 'npc:talk-all') {
    if (!talkAll(s).length) error = '今日该见的街坊都见过了，明天再来。'
  } else {
    error = '未知的街坊操作。'
  }
  return error ? { state: current, error } : { state: s, error: null }
}
