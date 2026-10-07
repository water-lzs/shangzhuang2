// 包 G（第十五轮）· 程序化贴图
// 为什么不直接给模型贴图：我们手头没有可商用、可铺满的高清素材，随手找的图分辨率不够、
// 授权也不干净。所以先由 Canvas 现场画一批「够看」的程序化贴图顶上，
// 零素材依赖、零网络请求，和 audio.js 是同一个思路。
// 真正的美术级贴图，按《包 G 美术提示词手册》去生成，再替换这里的 map 就行。
import * as THREE from 'three'

const cache = new Map()
export const TEXTURE_KINDS = ['soil', 'road']

// 固定种子的 LCG：贴图每次刷新长得一样，不会今天一套明天一套。
function rand(seed) {
  let x = seed >>> 0
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296 }
}
const hex = (r, g, b) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
// 在基准色上抖一个明度，用来画斑块与砂粒
const jitter = (base, k) => hex(base[0] + k, base[1] + k, base[2] + k)

// —— 田土：底子偏土黄，撒砂粒、点小石子、拉几道极浅的犁沟 ——
function drawSoil(g, s) {
  const r = rand(0x5eed01)
  g.fillStyle = hex(214, 206, 178); g.fillRect(0, 0, s, s)
  // 大块斑驳
  for (let i = 0; i < 260; i++) {
    const k = (r() - .5) * 34
    g.fillStyle = jitter([214, 206, 178], k)
    const w = 4 + r() * 18, h = 3 + r() * 12
    g.fillRect(r() * s, r() * s, w, h)
  }
  // 砂粒与小石子
  for (let i = 0; i < 900; i++) {
    const k = r() < .82 ? -26 - r() * 22 : 16 + r() * 14
    g.fillStyle = jitter([210, 200, 172], k)
    g.fillRect(r() * s, r() * s, r() < .9 ? 1 : 2, 1)
  }
  // 犁沟：横向的浅色细纹，间距不均，别做成整齐条纹
  for (let y = 0; y < s; y += 9 + Math.floor(r() * 7)) {
    g.strokeStyle = hex(196, 186, 156); g.lineWidth = 1
    g.beginPath(); g.moveTo(0, y + .5); g.lineTo(s, y + .5 + (r() - .5) * 3); g.stroke()
  }
}

// —— 田埂土路：中间被车辙压出两道深色，两侧车辙边有浮土 ——
function drawRoad(g, s) {
  const r = rand(0x0ad0ad)
  g.fillStyle = hex(205, 189, 152); g.fillRect(0, 0, s, s)
  for (let i = 0; i < 320; i++) {
    g.fillStyle = jitter([203, 187, 150], (r() - .5) * 30)
    g.fillRect(r() * s, r() * s, 3 + r() * 14, 2 + r() * 9)
  }
  // 两道车辙（竖着的深色带，位置略偏，不是正中对称）
  for (const cx of [s * .30, s * .68]) {
    const grd = g.createLinearGradient(cx - s * .1, 0, cx + s * .1, 0)
    grd.addColorStop(0, 'rgba(128,110,80,0)')
    grd.addColorStop(.5, 'rgba(122,104,74,.55)')
    grd.addColorStop(1, 'rgba(128,110,80,0)')
    g.fillStyle = grd; g.fillRect(cx - s * .1, 0, s * .2, s)
  }
  // 浮土与碎石
  for (let i = 0; i < 420; i++) {
    const k = r() < .5 ? -22 - r() * 18 : 18 + r() * 16
    g.fillStyle = jitter([200, 184, 148], k)
    g.fillRect(r() * s, r() * s, 1 + (r() < .2 ? 1 : 0), 1)
  }
}

const DRAW = { soil: drawSoil, road: drawRoad }

// 取一张（带缓存）：wrap 与色彩空间都配好，直接挂 material.map 就能用。
export function programTexture(kind, repeatX = 1, repeatY = repeatX) {
  const key = `${kind}@${repeatX}x${repeatY}`
  if (cache.has(key)) return cache.get(key)
  const draw = DRAW[kind] || drawSoil
  const size = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  draw(cv.getContext('2d'), size)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.colorSpace = THREE.SRGBColorSpace
  t.name = `procedural-${kind}`
  cache.set(key, t)
  return t
}
export function clearTextureCache() { cache.clear() }
