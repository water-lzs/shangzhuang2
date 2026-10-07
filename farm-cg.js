// —— 农事演出（farm-cg.js）——
// 解决什么问题：点「浇水」原本只改一个数值、日志滚一行，玩家在画面里看不到任何事发生，
// 整个田页就成了「文字游戏」。这里把每个农事动作翻译成一段实机运镜 + 场景特效：
// 面板自动收起 → 镜头飞向田中 → 演出 3~5 秒 → 面板弹回原位，随时可跳过。
//
// 与 opening-cg.js 共用同一套接管机制：演出期间 controls.enabled = false，
// app.js 的主循环把相机让给这里；结束时把机位与注视点**精确复原**，
// 否则交还 OrbitControls 的那一帧会「跳」一下 —— 比不演还难看。
//
// 田块坐标不是拍脑袋写的，与 app.js 里 cropShader 的 farmMask 分块公式严格一致：
//   列 = floor((x + 40) / 16) → 0..4，中心 x = −32 / −16 / 0 / 16 / 32
//   行 = z < −3 ? 5 : 0      → 近排 z ≈ 11，远排 z ≈ −11.5
// 改了那边的公式，这里的 W_COLS / W_ROW_Z 必须跟着改，否则水会浇在空地上。
//
// 场景参考坐标：田面 y ≈ 0，X 约 −37…31，Z 约 −20…25；水井/石磨/晾晒架/老宅门楼
// 是一排临街家什，Z ≈ 21~22，所以任何演出机位都别低于 y = 3，免得穿进地面。
import * as THREE from 'three';

const W_COLS = [-32, -16, 0, 16, 32]
const W_ROW_Z = [11, -11.5]
export const plotPos = i => [W_COLS[i % 5], i < 5 ? W_ROW_Z[0] : W_ROW_Z[1]]

const EASE = {
  linear: u => u,
  in: u => u * u,
  out: u => 1 - Math.pow(1 - u, 3),
  io: u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v
const mix = (a, b, u) => a + (b - a) * u
const mix3 = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)]

// —— 演出表 ——
// cam：关键帧（第一帧由 play() 用「玩家当前机位」补上，末帧自动补回原位）
// line：字幕 [起, 收, 文字]
// cue：音效时间点 [秒, 键]
// fx：特效名
const SHOWS = {
  water: {
    name: '引水入田', dur: 4.8, cue: [[.2, 'choice'], [2.2, 'reward']],
    cam: [
      { t: 1.1, p: [10, 15, 27], l: [-6, 0, 4], e: 'io' },
      { t: 3.0, p: [-1, 9.5, 21], l: [-9, 0, 5], e: 'io' },
      { t: 4.2, p: [2, 8, 24], l: [-4, 0, 3], e: 'out' }
    ],
    line: [[.3, 2.4, '闸口提起来，水顺着旧渠往东淌'], [2.6, 4.4, '水面一垄一垄亮过来 —— 田，喝上水了']],
    fx: 'water'
  },
  plant: {
    name: '下田插秧', dur: 4.6, cue: [[.2, 'plant'], [2.4, 'reward']],
    cam: [
      { t: 1.1, p: [6, 4.8, 20.5], l: [-2, .5, 4], e: 'io' },
      { t: 3.0, p: [-5, 3.9, 17], l: [-4, .4, 2], e: 'io' },
      { t: 4.1, p: [0, 5.2, 20], l: [-1, .5, 5], e: 'out' }
    ],
    line: [[.3, 2.3, '退步插秧 —— 一行行青秧在脚边立起来'], [2.5, 4.2, '秧脚站稳，莫只顾齐整']],
    fx: 'plant'
  },
  inspect: {
    name: '下田巡看', dur: 4.2, cue: [[.2, 'inspect']],
    cam: [
      { t: 1.0, p: [-15, 3.4, 13], l: [-2, 1, -6], e: 'io' },
      { t: 3.0, p: [13, 3.4, 13], l: [26, 1, -6], e: 'linear' },
      { t: 3.8, p: [6, 6, 22], l: [2, 1, 6], e: 'out' }
    ],
    line: [[.3, 2.0, '卷起裤腿，沿田埂走一趟'], [2.2, 3.9, '手过处，稻子还在长']],
    fx: 'inspect'
  },
  harvest: {
    name: '秋分开镰', dur: 5.0, cue: [[.2, 'harvest'], [2.8, 'reward']],
    cam: [
      { t: 1.2, p: [0, 13, 21], l: [0, 0, 0], e: 'io' },
      { t: 3.2, p: [11, 8.5, 17], l: [7, 1.5, 13], e: 'io' },
      { t: 4.5, p: [8, 7, 22], l: [3, 1.5, 10], e: 'out' }
    ],
    line: [[.3, 2.2, '镰刀划过稻秆，声音短而密'], [2.4, 4.6, '新谷进仓 —— 今年的成色，开仓才见分晓']],
    fx: 'harvest'
  },
  detect: {
    name: '检测田情', dur: 3.8, cue: [[.2, 'detect']],
    cam: [
      { t: 1.0, p: [0, 19, 25], l: [0, 0, -2], e: 'io' },
      { t: 3.2, p: [0, 15, 21], l: [0, .5, -5], e: 'io' },
      { t: 3.5, p: [0, 16, 24], l: [0, 1, -3], e: 'out' }
    ],
    line: [[.3, 2.0, '取一瓢田水 —— 看水色、看叶背'], [2.2, 3.5, '这一瓢水看明白了']],
    fx: 'detect'
  },
  pesticide: {
    name: '施药除虫', dur: 4.2, cue: [[.2, 'inspect']],
    cam: [
      { t: 1.0, p: [9, 9, 19], l: [-2, .8, 2], e: 'io' },
      { t: 3.2, p: [-7, 7, 17], l: [-7, .8, 0], e: 'io' }
    ],
    line: [[.3, 2.2, '药雾压下去，虫是没了'], [2.4, 4.0, '只是这一片田，也得跟着缓些日子']],
    fx: 'mist'
  },
  crab: {
    name: '投蟹入田', dur: 4.4, cue: [[.2, 'plant'], [2.4, 'reward']],
    cam: [
      { t: 1.0, p: [7, 7.6, 20], l: [-2, .5, 3], e: 'io' },
      { t: 3.3, p: [-5, 5.6, 18], l: [-4, .5, 2], e: 'io' }
    ],
    line: [[.3, 2.2, '背上竹篓，把稻田蟹一只只放进田里'], [2.4, 4.2, '虫少了，田也活了 —— 入秋还多一笔蟹']],
    fx: 'crab'
  },
  manual: {
    name: '下田捉虫', dur: 4.2, cue: [[.2, 'inspect']],
    cam: [
      { t: 1.0, p: [-4, 4.4, 15], l: [0, .5, -2], e: 'io' },
      { t: 3.2, p: [6, 4.4, 15], l: [14, .5, -2], e: 'linear' }
    ],
    line: [[.3, 2.2, '弯腰翻叶背，一只一只捏下来'], [2.4, 4.0, '最费力气的一手，也最不伤田']],
    fx: 'inspect'
  },
  buy: {
    name: '补种入袋', dur: 3.4, cue: [[.2, 'reward']],
    cam: [
      { t: .9, p: [5, 5.4, 26], l: [10, 1.2, 20], e: 'io' },
      { t: 2.6, p: [3, 5, 27], l: [8, 1.2, 20], e: 'io' }
    ],
    line: [[.3, 1.8, '粮店的稻种过了秤，一份一亩'], [2.0, 3.2, '种袋又鼓起来些']],
    fx: 'seed'
  },
  hire: {
    name: '雇工帮忙', dur: 3.4, cue: [[.2, 'reward']],
    cam: [
      { t: .9, p: [-6, 5.6, 28], l: [-8, 1, 21], e: 'io' },
      { t: 2.6, p: [-4, 5, 27], l: [-8, 1, 21], e: 'io' }
    ],
    line: [[.3, 1.8, '短工进了院门，先歇一口水'], [2.0, 3.2, '有帮手，这一季的活能松口气']],
    fx: 'dust'
  },
  upgrade: {
    name: '家业升级', dur: 3.2, cue: [[.2, 'reward']],
    cam: [{ t: 1.0, p: [0, 6.4, 29], l: [0, 1.6, 22.5], e: 'io' }, { t: 2.5, p: [0, 6, 29.5], l: [0, 1.6, 22.5], e: 'io' }],
    line: [[.3, 2.8, '新添的家什搬进院里，落定了']],
    fx: 'dust'
  }
}
export const showKinds = () => Object.keys(SHOWS)
export const showName = k => SHOWS[k]?.name || ''

const CSS = `#fx-stage{position:fixed;inset:0;z-index:52;pointer-events:none;opacity:0;transition:opacity .45s ease;font-family:KaiTi,'Microsoft YaHei',serif;-webkit-user-select:none;user-select:none}
#fx-stage.show{opacity:1}
#fx-bars{position:absolute;inset:0;background:linear-gradient(0deg,rgba(8,14,11,.62),transparent 26%,transparent 74%,rgba(8,14,11,.42));opacity:.9;transition:opacity .5s ease}
#fx-stage.plain #fx-bars{opacity:0}
#fx-head{position:absolute;top:82px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:8px 18px;border:1px solid #e8b9565c;border-radius:999px;background:#12201ae0;color:#f2e3bb;font-size:14px;letter-spacing:.16em;box-shadow:0 10px 34px #0000004d}
#fx-head:before{content:'';width:6px;height:6px;border-radius:50%;background:#e8b956;box-shadow:0 0 9px #e8b956;animation:fx-blink 1.1s steps(2,end) infinite}
@keyframes fx-blink{50%{opacity:.25}}
#fx-cap{position:absolute;left:50%;bottom:13%;transform:translateX(-50%);width:min(760px,86vw);text-align:center;color:#fdf2d4;font-size:clamp(16px,2.2vw,23px);line-height:1.85;letter-spacing:.06em;text-shadow:0 2px 20px #000e,0 0 3px #000b;opacity:0}
#fx-skip{position:absolute;top:20px;right:22px;z-index:3;padding:7px 16px;border:1px solid #ffffff2e;border-radius:999px;background:#00000059;color:#dfe6d8;font:13px 'Microsoft YaHei';letter-spacing:.1em;cursor:pointer;pointer-events:auto;transition:background .2s,border-color .2s,color .2s}
#fx-skip:hover,#fx-skip:focus-visible{background:#000000a6;border-color:#e8b956aa;color:#ffe8ac;outline:none}
body.fx-running{--fx:1}
body.fx-running #world-toolbar,body.fx-running #world-status,body.fx-running #world-points,body.fx-running #world-hint,body.fx-running #close-panel{opacity:0!important;pointer-events:none!important;transition:opacity .35s ease}
body.fx-running #guide-card,body.fx-running #guide-ring,body.fx-running #discover-card{opacity:0!important;pointer-events:none!important;transition:opacity .3s ease}
@media(prefers-reduced-motion:reduce){#fx-head:before{animation:none}}`

export function createFarmCG({ scene, camera, controls, getState, sfx = () => {}, cropUniforms } = {}) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style)
  const stage = document.createElement('div'); stage.id = 'fx-stage'
  stage.innerHTML = `<div id="fx-bars"></div><div id="fx-head"></div><div id="fx-cap"></div><button id="fx-skip" type="button">跳过 ▸</button>`
  document.body.append(stage)
  const head = stage.querySelector('#fx-head'), cap = stage.querySelector('#fx-cap'), skipBtn = stage.querySelector('#fx-skip')

  let cur = null, last = 0, panelHidden = false, cueAt = -1

  function hidePanel() {
    if (!document.body.classList.contains('panel-open')) return false
    document.body.classList.remove('panel-open')
    const cb = document.getElementById('close-panel'); if (cb) cb.hidden = true
    return true
  }
  function restorePanel() {
    if (!panelHidden) return
    panelHidden = false
    document.body.classList.add('panel-open')
    const cb = document.getElementById('close-panel'); if (cb) cb.hidden = false
  }

  // ---- 特效 ----
  // 每个 fx 返回 { update(t, k), dispose() }。t 是演出已过的秒数，k 是总进度 0~1。
  const FX = {
    // 引水：田面浮起一层水膜，按「西边先来水」的顺序逐垄亮过去，配涟漪与溅起的水星
    water(g, ctx) {
      const blocks = [], ripples = [], drops = []
      const bgeo = new THREE.PlaneGeometry(15.2, 13.2)
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(bgeo, new THREE.MeshStandardMaterial({ color: 0x8fc8d8, roughness: .06, metalness: .12, transparent: true, opacity: 0, depthWrite: false, envMapIntensity: 1.1 }))
        m.rotation.x = -Math.PI / 2
        const [x, z] = plotPos(i); m.position.set(x, .04, z)
        m.userData.delay = (x + 40) / 80 * 1.6   // 西侧先见水
        g.add(m); blocks.push(m)
      }
      const rgeo = new THREE.RingGeometry(.5, .68, 26)
      for (let i = 0; i < 5; i++) {
        const r = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({ color: 0xdcefff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
        r.rotation.x = -Math.PI / 2
        r.position.set(-30 + i * 15, .09, i % 2 ? 11 : -11.5)
        r.userData.t0 = .5 + i * .28
        g.add(r); ripples.push(r)
      }
      const dgeo = new THREE.SphereGeometry(.1, 5, 4)
      for (let i = 0; i < 34; i++) {
        const d = new THREE.Mesh(dgeo, new THREE.MeshBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0 }))
        const [x, z] = plotPos(i % 10)
        d.position.set(x + (Math.random() - .5) * 13, .1, z + (Math.random() - .5) * 11)
        d.userData = { t0: .3 + Math.random() * 2.4, vy: .9 + Math.random() * 1.5, life: .75 }
        g.add(d); drops.push(d)
      }
      // 水头：一道亮带从西向东推过去 —— 「水来了」这件事要能看见它在走
      const sweep = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 27), new THREE.MeshBasicMaterial({ color: 0xcfeefe, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
      sweep.rotation.x = -Math.PI / 2; sweep.position.set(-38, .07, 0)
      g.add(sweep)
      return {
        update(t) {
          const su = clamp01(t / 3.2)
          sweep.position.x = mix(-38, 34, EASE.io(su))
          sweep.material.opacity = t > .2 && t < 3.4 ? Math.sin(Math.min(1, su) * Math.PI) * .5 : 0
          blocks.forEach((m, i) => {
            const u = clamp01((t - m.userData.delay) / 1.5)
            m.material.opacity = u * .58
            m.position.y = .04 + Math.sin(t * 2.1 + i) * .014
          })
          ripples.forEach(r => {
            const u = clamp01((t - r.userData.t0) / 1.9)
            r.scale.setScalar(.4 + u * 5.5); r.material.opacity = u > 0 && u < 1 ? (1 - u) * .5 : 0
          })
          drops.forEach((d, i) => {
            const p = t - d.userData.t0
            if (p < 0 || p > d.userData.life) { d.material.opacity = 0; return }
            d.position.y = .1 + Math.sin(p / d.userData.life * Math.PI) * d.userData.vy * .6
            d.material.opacity = (1 - p / d.userData.life) * .85
          })
        },
        dispose() { bgeo.dispose(); rgeo.dispose(); dgeo.dispose(); sweep.geometry.dispose() }
      }
    },
    // 插秧：每块已插秧的田里，一束束秧苗按行序弹出来。粒子要做大（0.78m 高），
    // 否则春季稻子本来就矮、田面全是水，演出从镜头里几乎什么都看不见。
    plant(g, ctx) {
      const tufts = []
      const geo = new THREE.ConeGeometry(.115, .78, 4)
      const leafGeo = new THREE.PlaneGeometry(.32, .52)
      const plots = ctx.after?.plots || ctx.before?.plots || []
      const used = plots.map((p, i) => p ? i : -1).filter(i => i >= 0)
      const list = used.length ? used : [...Array(10).keys()]
      for (const i of list) {
        const [x, z] = plotPos(i)
        for (let n = 0; n < 44; n++) {
          const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: n % 4 ? 0x76ad45 : 0x96c95e, roughness: .8, transparent: true, opacity: .96 }))
          m.position.set(x + (Math.random() - .5) * 13.2, 0, z + (Math.random() - .5) * 11.2)
          m.rotation.z = (Math.random() - .5) * .3
          m.userData = { t0: .5 + Math.random() * 1.8, h: .8 + Math.random() * .55, cone: true }
          g.add(m); tufts.push(m)
        }
        // 每块田再配几片交叉的叶面，远处看才有「一丛丛」的体量
        for (let n = 0; n < 8; n++) {
          const lf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x8fc45c, roughness: .8, transparent: true, opacity: 0, side: THREE.DoubleSide }))
          lf.position.set(x + (Math.random() - .5) * 13, .2, z + (Math.random() - .5) * 11)
          lf.rotation.set(Math.PI / 2 * .86, 0, Math.random() * Math.PI)
          lf.userData = { t0: .7 + Math.random() * 1.8, cone: false }
          g.add(lf); tufts.push(lf)
        }
      }
      const g0 = ctx.growthBase
      return {
        update(t, k) {
          tufts.forEach(o => {
            const u = clamp01((t - o.userData.t0) / .55)
            const e = 1 - Math.pow(1 - u, 3)
            if (o.userData.cone) {
              o.scale.set(1, Math.max(.001, e * o.userData.h), 1)
              o.rotation.z += Math.sin(t * 2.3 + o.position.x) * .0016
            } else o.scale.setScalar(Math.max(.001, e))
            o.material.opacity = e * .92
          })
          // 真稻子也从「矮」往「该有的高度」推一把，屏幕上的秧苗才连得上
          if (g0 != null) cropUniforms.farmGrowth.value = mix(g0 * .82, g0, clamp01(t / 1.9))
        },
        dispose() { geo.dispose(); leafGeo.dispose(); if (g0 != null) cropUniforms.farmGrowth.value = g0 }
      }
    },
    // 巡田 / 手捉：稻浪被风压过去，脚边带起细碎的露水
    inspect(g, ctx) {
      const drops = [], geo = new THREE.SphereGeometry(.07, 5, 4)
      for (let i = 0; i < 40; i++) {
        const d = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xdff3ff, transparent: true, opacity: 0 }))
        d.position.set((Math.random() - .5) * 60, .3 + Math.random() * .8, (Math.random() - .5) * 26)
        d.userData = { t0: Math.random() * 2.6, life: .9 }
        g.add(d); drops.push(d)
      }
      return {
        update(t) {
          drops.forEach(d => {
            const p = t - d.userData.t0
            if (p < 0 || p > d.userData.life) { d.material.opacity = 0; return }
            d.position.y += .035
            d.material.opacity = Math.sin(p / d.userData.life * Math.PI) * .7
          })
        },
        dispose() { geo.dispose() }
      }
    },
    // 收割：金色谷粒从田里成片扬起、往家门方向飘走，稻子被割短一截
    harvest(g, ctx) {
      const grains = [], geo = new THREE.SphereGeometry(.11, 5, 4)
      const plots = ctx.after?.plots || ctx.before?.plots || []
      const src = plots.some(Boolean) ? plots.map((p, i) => p ? i : -1).filter(i => i >= 0) : [...Array(10).keys()]
      for (let i = 0; i < 130; i++) {
        const [x, z] = plotPos(src[i % src.length])
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i % 4 ? 0xf2c46a : 0xffe9a8, transparent: true, opacity: 0 }))
        m.position.set(x + (Math.random() - .5) * 13, .15, z + (Math.random() - .5) * 11)
        m.userData = { t0: .6 + Math.random() * 2.2, life: 1.5, vx: (Math.random() - .5) * .5, vy: 1.5 + Math.random() * 1.7, vz: .55 + Math.random() * .7 }
        g.add(m); grains.push(m)
      }
      const g0 = ctx.growthBase
      return {
        update(t) {
          grains.forEach(m => {
            const p = t - m.userData.t0
            if (p < 0) { m.material.opacity = 0; return }
            if (p > m.userData.life) { m.material.opacity = 0; return }
            const u = p / m.userData.life
            m.position.x += m.userData.vx * .016
            m.position.z += m.userData.vz * .016
            m.position.y += (m.userData.vy - u * 2.2) * .016
            m.material.opacity = Math.sin(Math.min(1, u) * Math.PI) * .95
          })
          // 割过的地方矮下去，收完再抬回来一点（留茬）
          if (g0 != null) {
            const k = clamp01((t - .5) / 2.2)
            cropUniforms.farmGrowth.value = mix(g0, g0 * .55, k) + (k >= 1 ? 0 : 0)
          }
        },
        dispose() { geo.dispose(); if (g0 != null) cropUniforms.farmGrowth.value = g0 }
      }
    },
    // 检测：一道金色扫描光带自远而近推过田面
    detect(g, ctx) {
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(78, 2.6), new THREE.MeshBasicMaterial({ color: 0xffe6a4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
      beam.rotation.x = -Math.PI / 2; beam.position.set(-3, .16, 24)
      g.add(beam)
      const marks = [], geo = new THREE.RingGeometry(.34, .46, 20)
      for (let i = 0; i < 26; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe6a4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
        m.rotation.x = -Math.PI / 2
        m.position.set((Math.random() - .5) * 66, .14, -20 + Math.random() * 44)
        m.userData.t0 = .3 + Math.random() * 2.4
        g.add(m); marks.push(m)
      }
      return {
        update(t) {
          const u = clamp01(t / 3.0)
          beam.position.z = mix(25, -21, EASE.io(u))
          beam.material.opacity = Math.sin(Math.min(1, t / 3.0) * Math.PI) * .55
          marks.forEach(m => {
            const p = t - m.userData.t0
            if (p < 0 || p > .9) { m.material.opacity = 0; return }
            m.scale.setScalar(.6 + p * 1.9)
            m.material.opacity = (1 - p / .9) * .6
          })
        },
        dispose() { beam.geometry.dispose(); geo.dispose() }
      }
    },
    // 施药：低垂的白色药雾自西向东漫过田面
    mist(g) {
      const puffs = [], geo = new THREE.SphereGeometry(1.5, 6, 5)
      for (let i = 0; i < 26; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe8eef0, transparent: true, opacity: 0, depthWrite: false }))
        m.position.set(-34 + Math.random() * 8, .9 + Math.random() * .8, -16 + Math.random() * 36)
        m.scale.setScalar(.7 + Math.random() * .9)
        m.userData = { vx: .55 + Math.random() * .5, t0: Math.random() * 1.4 }
        g.add(m); puffs.push(m)
      }
      return {
        update(t) {
          puffs.forEach(m => {
            const p = t - m.userData.t0
            if (p < 0) { m.material.opacity = 0; return }
            m.position.x += m.userData.vx * .016
            m.material.opacity = Math.sin(clamp01(p / 3.4) * Math.PI) * .3
          })
        },
        dispose() { geo.dispose() }
      }
    },
    // 投蟹：绿色小点四散爬开
    crab(g) {
      const crabs = [], geo = new THREE.SphereGeometry(.16, 6, 5)
      for (let i = 0; i < 30; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4d7c3a, roughness: .85, transparent: true, opacity: 0 }))
        const [x, z] = plotPos(i % 10)
        m.position.set(x, .12, z)
        m.scale.set(1, .55, 1)
        m.userData = { t0: .5 + Math.random() * 2.0, vx: (Math.random() - .5) * .8, vz: (Math.random() - .5) * .8 }
        g.add(m); crabs.push(m)
      }
      return {
        update(t) {
          crabs.forEach(m => {
            const p = t - m.userData.t0
            if (p < 0) { m.material.opacity = 0; return }
            m.position.x += m.userData.vx * .016
            m.position.z += m.userData.vz * .016
            m.position.y = .12 + Math.abs(Math.sin(p * 9)) * .05
            m.material.opacity = Math.min(1, p * 4) * .95
          })
        },
        dispose() { geo.dispose() }
      }
    },
    // 种袋 / 雇工：门口扬起一小阵尘土
    dust(g) {
      const ps = [], geo = new THREE.SphereGeometry(.14, 5, 4)
      for (let i = 0; i < 22; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe0d3ae, transparent: true, opacity: 0, depthWrite: false }))
        m.position.set(-4 + Math.random() * 10, .2, 20 + Math.random() * 4)
        m.userData = { t0: Math.random() * .8, vy: .5 + Math.random() * .5 }
        g.add(m); ps.push(m)
      }
      return {
        update(t) {
          ps.forEach(m => {
            const p = t - m.userData.t0
            if (p < 0 || p > 1.4) { m.material.opacity = 0; return }
            m.position.y += m.userData.vy * .016
            m.material.opacity = (1 - p / 1.4) * .5
          })
        },
        dispose() { geo.dispose() }
      }
    },
    // 稻种：一袋种子落进种袋时的金屑
    seed(g) {
      const ps = [], geo = new THREE.SphereGeometry(.09, 5, 4)
      for (let i = 0; i < 26; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i % 3 ? 0xe8cf8a : 0xfff0c0, transparent: true, opacity: 0 }))
        m.position.set(9 + (Math.random() - .5) * 2.4, 1.4 + Math.random() * .6, 20 + (Math.random() - .5) * 2)
        m.userData = { t0: Math.random() * .9, vy: .3 + Math.random() * .4 }
        g.add(m); ps.push(m)
      }
      return {
        update(t) {
          ps.forEach(m => {
            const p = t - m.userData.t0
            if (p < 0 || p > 1.2) { m.material.opacity = 0; return }
            m.position.y += (m.userData.vy - p * .9) * .016
            m.position.x += Math.sin(p * 7) * .004
            m.material.opacity = (1 - p / 1.2) * .9
          })
        },
        dispose() { geo.dispose() }
      }
    }
  }

  function sample(frames, t) {
    let i = 1
    while (i < frames.length - 1 && t > frames[i].t) i++
    const a = frames[i - 1], b = frames[i]
    const u = EASE[b.e || 'io'](clamp01((t - a.t) / Math.max(1e-6, b.t - a.t)))
    return { p: mix3(a.p, b.p, u), l: mix3(a.l, b.l, u) }
  }

  function syncCaption(t) {
    const lines = cur?.def.line || []
    let txt = '', op = 0
    for (const [t0, t1, s] of lines) {
      if (t < t0 || t > t1) continue
      op = Math.min(clamp01((t - t0) / .4), clamp01((t1 - t) / .4))
      txt = s; break
    }
    if (txt !== cur?.txt) { cur.txt = txt; cap.textContent = txt }
    if (Math.abs(op - (cur?.op ?? 0)) > .02) { cur.op = op; cap.style.opacity = op.toFixed(2) }
  }

  // plain = 「轻反馈」：买种、雇工这类日常动作不该把玩家从面板里拽出来。
  // 相机一步都不动（连阻尼都不碰），只在场边放一小簇粒子、给一声响 —— 玩家余光能瞥见田里有动静，
  // 但手上的面板、滚动位置、输入框全都不受影响。
  function play(kind, ctx = {}) {
    const def = SHOWS[kind]
    if (!def || cur) return false
    const plain = !!ctx.plain
    const dur = plain ? (def.pulse ?? 2.0) : def.dur
    const from = { p: camera.position.toArray(), l: controls.target.toArray() }
    const frames = plain ? null : [{ t: 0, p: from.p, l: from.l }, ...def.cam, { t: def.dur, p: from.p, l: from.l }]
    const g = new THREE.Group(); g.name = 'FarmFX'; if (ctx.at) g.position.set(ctx.at[0], ctx.at[1], ctx.at[2]); scene.add(g)
    const fx = def.fx && FX[def.fx] ? FX[def.fx](g, { ...ctx, before: ctx.before, after: ctx.after, growthBase: cropUniforms.farmGrowth.value }) : null
    cur = { kind, def, frames, dur, plain, g, fx, t: 0, txt: null, op: 0, from }
    last = 0; cueAt = -1
    if (!plain) {
      head.textContent = def.name
      stage.classList.add('show')
      panelHidden = hidePanel()
      controls.enabled = false
      // 演出期间把 OrbitControls 的阻尼先关掉，回位那一下才不会有残余惯性
      controls.enableDamping = false
      document.body.classList.add('fx-running')
      try { sfx('choice') } catch { }
    }
    return true
  }

  function finish() {
    if (!cur) return
    const c = cur; cur = null
    if (!c.plain) {
      camera.position.set(c.from.p[0], c.from.p[1], c.from.p[2])
      controls.target.set(c.from.l[0], c.from.l[1], c.from.l[2])
      controls.enabled = true; controls.enableDamping = true; controls.update()
      stage.classList.remove('show')
      document.body.classList.remove('fx-running')
      restorePanel()
    }
    try { c.fx?.dispose() } catch { }
    c.g.traverse(o => { if (o.isMesh) { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m?.dispose?.() } })
    scene.remove(c.g)
    window.dispatchEvent(new Event('jingxi-fx-done'))
  }

  function tick(now) {
    if (!cur) return
    if (!last) { last = now; return }
    const dt = Math.min(.05, (now - last) / 1000); last = now
    cur.t += dt
    const t = cur.t, k = clamp01(t / cur.dur)
    if (!cur.plain) {
      const { p, l } = sample(cur.frames, t)
      camera.position.set(p[0], p[1], p[2])
      camera.lookAt(l[0], l[1], l[2])
      for (let i = cueAt + 1; i < (cur.def.cue || []).length; i++) if (t >= cur.def.cue[i][0]) { cueAt = i; try { sfx(cur.def.cue[i][1]) } catch { } }
      syncCaption(t)
    } else if (cueAt < 0 && t >= .1) {
      cueAt = 0; try { sfx(cur.def.cue?.[0]?.[1] || 'reward') } catch { }
    }
    try { cur.fx?.update(t, k) } catch { }
    if (t >= cur.dur) finish()
  }

  skipBtn.addEventListener('click', () => { if (cur) finish() })
  const onKey = e => { if (e.key === 'Escape' && cur) { e.stopPropagation(); finish() } }
  addEventListener('keydown', onKey, true)

  return {
    play,
    tick,
    active: () => !!cur,
    kind: () => cur?.kind || null,
    skip: finish,
    has: k => !!SHOWS[k],
    destroy: () => { finish(); removeEventListener('keydown', onKey, true); stage.remove(); style.remove() }
  }
}
