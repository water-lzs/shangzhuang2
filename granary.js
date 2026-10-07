// 包 K（第十四轮）· 跨时空粮仓
// 一句话：四个档位共用一个「虚拟粮仓」，谁往里头倒谷子，全档位都能看见进度、分到好处。
// 这是纯静态页面能做到的「多人协作」——没有服务器，共用的是同一台浏览器里的一个 localStorage 键。
// 三个阈值 500 / 2000 / 5000 kg，分别解锁 共用种子库 / 共享图鉴情报 / 御赐匾额。
import { storage } from './storage.js'

export const GRANARY_KEY = 'jingxi-granary-v1'
// 阈值就是这一份表的顺序，UI 与结算都从它派生，不在别处硬写数字。
export const GRANARY_TIERS = [
  { kg: 500, id: 'seedbank', name: '共用种子库', word: '解锁后，每一季开局都能从公中领 2 份御稻米稻种。', lasting: true },
  { kg: 2000, id: 'archive', name: '共享图鉴情报', word: '跨过这一档时，出货的那一档得 3 片耕织图碎片。', lasting: false },
  { kg: 5000, id: 'plaque', name: '御赐匾额', word: '跨过这一档时，出货的那一档声望 +20。', lasting: false },
]
const TIER_BY_ID = Object.fromEntries(GRANARY_TIERS.map(t => [t.id, t]))

export function emptyGranary() { return { v: 1, total: 0, slots: {}, unlocked: {} } }

// 坏数据一律降级成空粮仓，绝不因为一个键坏了就让人进不去游戏。
export function normalizeGranary(g) {
  const out = emptyGranary()
  if (!g || typeof g !== 'object') return out
  if (Number.isFinite(g.total) && g.total >= 0) out.total = Math.floor(g.total)
  if (g.slots && typeof g.slots === 'object') {
    for (const [k, v] of Object.entries(g.slots)) {
      if (!/^[1-4]$/.test(k) || !Number.isFinite(v) || v < 0) continue
      out.slots[k] = Math.floor(v)
    }
  }
  if (g.unlocked && typeof g.unlocked === 'object') {
    for (const t of GRANARY_TIERS) if (g.unlocked[t.id] === true) out.unlocked[t.id] = true
  }
  // 总账以分账为准：分账加不出总账说明这份数据被改过手脚，以分账重算。
  const sum = Object.values(out.slots).reduce((n, v) => n + v, 0)
  if (sum !== out.total) out.total = sum
  // 已经过了的阈值必须记着（防止 unlocked 被写丢后重复发奖）
  for (const t of GRANARY_TIERS) if (out.total >= t.kg) out.unlocked[t.id] = true
  return out
}

// 纯函数：往粮仓里倒 kg，返回新的粮仓与「这一下正好跨过的那几档」。
// 已经解锁过的不再算 crossed，所以奖励天然只发一次。
export function depositTo(g, slot, kg) {
  const next = normalizeGranary(g)
  const n = Math.floor(Number(kg))
  if (!Number.isInteger(n) || n <= 0) return { granary: next, crossed: [] }
  const key = String(slot)
  next.slots[key] = (next.slots[key] || 0) + n
  next.total += n
  const crossed = []
  for (const t of GRANARY_TIERS) {
    if (next.total >= t.kg && !next.unlocked[t.id]) { next.unlocked[t.id] = true; crossed.push(t) }
  }
  return { granary: next, crossed }
}

export function readGranary() {
  try { return normalizeGranary(JSON.parse(storage.get(GRANARY_KEY) || 'null')) } catch { return emptyGranary() }
}
export function saveGranary(g) { return storage.set(GRANARY_KEY, JSON.stringify(g)) }
export function resetGranary() { return storage.remove(GRANARY_KEY) }

// 给 UI 用的一张视图：总进度、各档贡献、还差多少、哪几档已开。
export function granaryView(slot) {
  const g = readGranary()
  const total = g.total
  const mine = g.slots[String(slot)] || 0
  return {
    total, mine, share: total > 0 ? Math.round(mine / total * 100) : 0,
    slots: g.slots,
    contributors: Object.keys(g.slots).length,
    tiers: GRANARY_TIERS.map(t => ({ ...t, reached: total >= t.kg, unlocked: !!g.unlocked[t.id], left: Math.max(0, t.kg - total) })),
    next: GRANARY_TIERS.find(t => total < t.kg) || null,
  }
}

// —— 给引擎用的一条：共用种子库开了没有。每季开局 +2 份稻种就靠它。——
export function granarySeedBonus() { return readGranary().unlocked.seedbank ? 2 : 0 }
export function tierOf(id) { return TIER_BY_ID[id] || null }
