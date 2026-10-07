// 包 A（第十三轮）· 存档适配层与多档位
// GitHub Pages 纯静态：数据只存 localStorage。把「存哪、怎么取」收进这一层，
// 以后要换云端（真·跨设备账号），只改下面四个方法，游戏代码一行不动。
const NS = 'jingxi-farm-v3-slot'
export const SLOT_COUNT = 4
// 「当前选了哪一档」故意不带 jingxi-farm 前缀：存档扫描（含我自己的测试脚本）都靠
// 「键名以 jingxi-farm 开头」来找存档本体，这个游标混进去会被当成一份存档去 JSON.parse。
export const CUR_KEY = 'jingxi-slot-cur'
export const LEGACY_KEYS = ['jingxi-farm-v3', 'jingxi-farm-v2', 'jingxi-farm-v1']
export const storage = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v); return true } catch { return false } },
  remove(k) { try { localStorage.removeItem(k); return true } catch { return false } },
  list() { try { return Object.keys(localStorage).filter(k => k.startsWith(NS)) } catch { return [] } }
}
export const slotKey = i => NS + i
export const currentSlot = () => { const v = storage.get(CUR_KEY); const i = Number(v); return Number.isInteger(i) && i >= 1 && i <= SLOT_COUNT ? i : null }
export const pickSlot = i => storage.set(CUR_KEY, String(i))
export const clearSlotPick = () => storage.remove(CUR_KEY)
export const slotRaw = i => storage.get(slotKey(i))
export const writeSlot = (i, raw) => storage.set(slotKey(i), raw)
// ?slot=3 直接进第 3 档：既是给玩家记链接用的，也让自动化测试能绕过档位界面。
export function forcedSlot() {
  try {
    const v = Number(new URLSearchParams(location.search).get('slot'))
    return Number.isInteger(v) && v >= 1 && v <= SLOT_COUNT ? v : null
  } catch { return null }
}
// 旧版单档迁移：jingxi-farm-v3（含更早的 v2/v1）→ slot1。旧键保留不删，回滚有路。
export function migrateLegacySlots() {
  if (slotRaw(1)) return false
  for (const k of LEGACY_KEYS) {
    const raw = storage.get(k)
    if (raw) { writeSlot(1, raw); return true }
  }
  return false
}
// 各槽摘要（给档位选择界面用）：坏槽只标 damaged，绝不让一个坏槽挡住整个界面。
// parse 由调用方注入（farm-engine 的 readSave），这层不 import 游戏引擎，保持干净。
export function slotSummaries(parse) {
  return Array.from({ length: SLOT_COUNT }, (_, idx) => {
    const i = idx + 1, raw = slotRaw(i)
    if (!raw) return { slot: i, empty: true }
    const s = parse(raw)
    if (!s) return { slot: i, damaged: true }
    return {
      slot: i, empty: false, damaged: false,
      name: (s.profile && s.profile.name) || '林宇的田',
      year: s.year, season: s.season, ecology: s.ecology, wen: (s.sales && s.sales.wen) || 0,
      savedAt: (s.profile && s.profile.savedAt) || 0, space: s.space
    }
  })
}
