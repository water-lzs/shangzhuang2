// —— 开场 CG（引擎内运镜，零新增美术资产）——
// 为什么不做成视频文件：视频要进包（+10~20MB，首屏跟着变重）、画风和实时场景对不上、
// 手机上还常被自动播放策略挡下来。用相机脚本把「已有的四季场景」演一遍，成本几乎为零，
// 而且随时能改分镜 —— 改的就是下面这张关键帧表。
//
// 改机位前必读（都是会一眼看出破绽的地方）：
//  1. 终点必须精确落在 alignments 里的相机位上（现在由 app.js 从 SEASONS.<season> 传进来）。
//     差一点点，交还 OrbitControls 的那一帧就会跳一下 —— 比不做 CG 还难看。
//  2. CG 期间整层盖在视口上方并吃掉指针事件：既挡住 UI，也顺手防住「拖镜头/点按」误触田间热点。
//  3. 只在第一次进来时播。标记写 localStorage，不写进存档 —— 存档链有 readSave 硬校验，
//     为个「看没看过片头」加字段就要动 v10→v11 迁移，不值当。重开一局清掉标记即可重播。
//  4. 场景坐标参考：田面 y≈0，X 约 -37…31，Z 约 -20…25；水井/石磨/晾晒架/老宅门楼
//     是一排临街家什，Z≈21~22。相机远平面 240、春季雾密度 0.012 —— 起点故意放在 y=150，
//     坠落时会先穿过浓雾再慢慢散开，这层雾本身就是「穿越」的过渡，不用另做黑场蒙太奇。
const KEY = 'jingxi-opening-v1'
const TITLE_HOLD = 4.5   // 黑幕字幕段：同时给春季 GLB 留加载时间
const T_SYS = 26.5       // 系统绑定面板出现
const T_SYS_OFF = 31.5   // 面板收起，开始落位
const T_END = 36         // 全片时长

export function openingSeen() { try { return localStorage.getItem(KEY) === 'seen' } catch { return false } }
export function clearOpening() { try { localStorage.removeItem(KEY) } catch {} }

// 引导卡要等 CG 收尾再弹，靠这个标记在两个模块之间打招呼（opening-cg 与 immersive 是同一个模块实例）。
let pending = false
export function openingPending() { return pending }
export function markOpeningPending() { pending = true }

// 关键帧：t 秒 → 机位 / 注视点。e 是「走到这一帧」用的缓动。
const SHOTS = [
  { t: 0, p: [0, 150, 70], l: [0, 0, 0] },
  { t: TITLE_HOLD, p: [0, 150, 70], l: [0, 0, 0] },          // 黑幕期间机位不动
  { t: 11.5, p: [0, 30, 60], l: [0, 1, -2], e: 'in' },        // 坠落：加速下坠，easeIn 才有失重感
  { t: 19.5, p: [0, 16, 52], l: [0, 4, -8], e: 'io' },        // 俯瞰推近
  { t: T_SYS, p: [0, 5, 44], l: [0, 6, -34], e: 'io' },       // 掠田：贴地看向远处
  { t: T_SYS_OFF, p: [0, 4.4, 41], l: [0, 7.4, -52], e: 'io' },
]

const LINES = [
  { t0: 0.6, t1: 2.6, txt: '2026 年 · 深夜 · 北京' },
  { t0: 3.0, t1: 4.4, txt: '文档最后一次保存的时候，屏幕上跳出了一行字。' },
  { t0: 5.4, t1: 8.4, txt: '「京西稻贡米系统 · 等待宿主确认」' },
  { t0: 9.2, t1: 11.4, txt: '再睁眼，脚下不是地板。' },
  { t0: 12.2, t1: 15.6, txt: '是一片水田。十亩，一望到边。' },
  { t0: 16.6, t1: 19.4, txt: '这是我祖上那块地——京西稻，御田。' },
  { t0: 20.4, t1: 23.6, txt: '风从稻田上过去，整片田都在响。' },
  { t0: 24.4, t1: 26.4, txt: '土是熟的，田埂是旧的，只是没人种了。' },
  { t0: 32.4, t1: 35.6, txt: '第 1 年 · 春。田，交给你了。' }
]

// 音效只在关键节点给，密了反而像在放提示音。基调沿用 audio.js 里那套合成音。
const CUES = [
  { t: TITLE_HOLD, k: 'detect' },
  { t: 9.0, k: 'inspect' },
  { t: T_SYS, k: 'choice' },
  { t: 31.8, k: 'reward' }
]

const EASE = {
  linear: u => u,
  in: u => u * u * u,
  out: u => 1 - Math.pow(1 - u, 3),
  io: u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v
const mix = (a, b, u) => a + (b - a) * u
const mix3 = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)]

const CSS = `#cg-root{position:fixed;inset:0;z-index:60;overflow:hidden;pointer-events:auto;font-family:KaiTi,'Microsoft YaHei',serif;-webkit-user-select:none;user-select:none}
#cg-root.out{opacity:0;transition:opacity .85s ease}
#cg-black{position:absolute;inset:0;background:#070b09;opacity:1;transition:opacity 1.4s ease}
#cg-root.lit #cg-black{opacity:0}
#cg-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,transparent 42%,#050906 120%);opacity:.85}
#cg-caption{position:absolute;left:50%;bottom:15%;transform:translateX(-50%);width:min(780px,86vw);text-align:center;color:#f7ebc9;font-size:clamp(17px,2.3vw,25px);line-height:1.9;letter-spacing:.07em;text-shadow:0 2px 20px #000d,0 0 3px #000a;opacity:0}
#cg-wait{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);color:#8fa08a;font:13px 'Microsoft YaHei';letter-spacing:.14em;opacity:0;transition:opacity .5s ease}
#cg-root.waiting #cg-wait{opacity:.85}
#cg-sys{position:absolute;inset:0;display:grid;place-items:center;opacity:0;transition:opacity .75s ease;pointer-events:none}
#cg-root.sys #cg-sys{opacity:1}
.cg-sys-box{width:min(520px,84vw);padding:20px 24px;border:1px solid #e8b95666;background:#0c1610ee;color:#e9dcb6;font:14px 'Microsoft YaHei';letter-spacing:.04em;box-shadow:0 24px 70px #000a,inset 0 0 60px #e8b9560f}
.cg-sys-head{display:flex;align-items:center;gap:8px;padding-bottom:12px;border-bottom:1px solid #e8b95633;color:#f0cd76;font-size:15px;letter-spacing:.16em}
.cg-dot{width:7px;height:7px;border-radius:50%;background:#e8b956;box-shadow:0 0 10px #e8b956;animation:cg-blink 1.1s steps(2,end) infinite}
@keyframes cg-blink{50%{opacity:.2}}
.cg-sys-body{display:grid;gap:9px;padding:14px 0 6px}
.cg-sys-body p{margin:0;opacity:0;transform:translateX(-6px)}
.cg-sys-body b{color:#ffe8ac;font-weight:600}
#cg-root.sys .cg-sys-body p{animation:cg-line .5s ease forwards}
#cg-root.sys .cg-sys-body p:nth-child(1){animation-delay:.35s}
#cg-root.sys .cg-sys-body p:nth-child(2){animation-delay:.9s}
#cg-root.sys .cg-sys-body p:nth-child(3){animation-delay:1.45s}
#cg-root.sys .cg-sys-body p:nth-child(4){animation-delay:2s}
@keyframes cg-line{to{opacity:1;transform:none}}
.cg-sys-bar{height:3px;background:#e8b95622;overflow:hidden;margin-top:8px}
.cg-sys-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#e8b956,#ffe8ac)}
#cg-root.sys .cg-sys-bar i{animation:cg-fill 3.2s ease-out .3s forwards}
@keyframes cg-fill{to{width:100%}}
.cg-sys-foot{padding-top:12px;border-top:1px solid #e8b95633;color:#f0cd76;letter-spacing:.1em;opacity:0}
#cg-root.sys .cg-sys-foot{animation:cg-line .6s ease 3s forwards}
#cg-title{position:absolute;inset:0;z-index:2;display:grid;place-content:center;justify-items:center;gap:0;background:#070b09;text-align:center;transition:opacity .8s ease}
#cg-root.started #cg-title{opacity:0;pointer-events:none}
.cg-brand{display:flex;align-items:center;gap:16px;margin-bottom:24px}
.cg-seal{width:52px;height:52px;display:grid;place-items:center;border-radius:4px;background:#b8402f;color:#ffeccf;font:20px/1.05 KaiTi,serif}
.cg-brand h1{margin:0;color:#f7ebc9;font:600 clamp(26px,4vw,40px)/1.2 KaiTi,'Microsoft YaHei',serif;letter-spacing:.1em}
.cg-brand p{margin:5px 0 0;color:#93a48d;font-size:12px;letter-spacing:.34em}
.cg-lead{margin:0 0 30px;color:#c9d2bd;font-size:15px;letter-spacing:.08em}
#cg-enter{padding:12px 40px;border:1px solid #e8b956aa;border-radius:3px;background:#e8b9560f;color:#f7ebc9;font:16px KaiTi,serif;letter-spacing:.3em;cursor:pointer;transition:background .25s,border-color .25s,box-shadow .25s}
#cg-enter:hover,#cg-enter:focus-visible{background:#e8b95626;border-color:#ffd98a;box-shadow:0 0 26px #e8b95644;outline:none}
.cg-tip{margin:16px 0 0;color:#75836f;font-size:12px;letter-spacing:.08em}
#cg-skip{position:absolute;top:18px;right:20px;z-index:3;padding:7px 16px;border:1px solid #ffffff2e;border-radius:999px;background:#00000059;color:#dfe6d8;font:13px 'Microsoft YaHei';letter-spacing:.1em;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .5s ease,background .2s,border-color .2s}
#cg-root.started #cg-skip{opacity:.7;pointer-events:auto}
#cg-skip:hover,#cg-skip:focus-visible{opacity:1;background:#000000a6;border-color:#e8b956aa;color:#ffe8ac;outline:none}
body.cg-running .topbar,body.cg-running #activity-tabs,body.cg-running footer,body.cg-running #system-panel,body.cg-running #world-shell,body.cg-running #asset-notice,body.cg-running .season-side{visibility:hidden!important}
@media(prefers-reduced-motion:reduce){#cg-black{transition:none}.cg-dot{animation:none}}`

export function createOpening({ camera, controls, scene, landPos, landLook, isModelReady = () => true, sfx = () => {}, unlock = () => {}, onFinish } = {}) {
  landPos = (landPos || [0, 4.1, 39]).slice()
  landLook = (landLook || [0, 8, -60]).slice()
  // FogExp2 按视线距离衰减：机位在 y=80 时到地面隔着 80 多个单位，雾密度不降的话
  // 整个俯瞰段就是一层雾色糊在屏幕上。记住进场时的密度，高空抽稀、落地复原。
  const fogBase = scene && scene.fog ? scene.fog.density : null

  // 上一个实例还在（重开一局）就先拆掉，避免两层遮罩叠着
  document.getElementById('cg-root')?.remove()
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style)

  const root = document.createElement('div'); root.id = 'cg-root'
  root.innerHTML = `<div id="cg-black"></div>
<div id="cg-vignette"></div>
<div id="cg-caption"></div>
<div id="cg-sys"><div class="cg-sys-box">
  <div class="cg-sys-head"><span class="cg-dot"></span>京西稻贡米系统</div>
  <div class="cg-sys-body">
    <p>扫描宿主 … <b>林宇</b></p>
    <p>校准坐标 … <b>京西 · 上庄 · 十亩御田</b></p>
    <p>载入四时 … <b>春 · 夏 · 秋 · 冬</b></p>
    <p>下达任务 … <b>让这片御田，再活一千年</b></p>
    <div class="cg-sys-bar"><i></i></div>
  </div>
  <div class="cg-sys-foot">绑定完成 · 宿主已确认</div>
</div></div>
<div id="cg-wait">正在落位 · 载入京西御田…</div>
<button id="cg-skip" type="button">跳过 ▸</button>
<div id="cg-title">
  <div class="cg-brand"><span class="cg-seal">御<br>稻</span><div><h1>穿越京西稻</h1><p>四时有序 · 一稻千年</p></div></div>
  <p class="cg-lead">一觉醒来，你站在祖上那块御田里。</p>
  <button id="cg-enter" type="button">点击进入</button>
  <p class="cg-tip">建议开着声音 · 约半分钟，随时可跳过</p>
</div>`
  document.body.append(root)
  // 从挂上这一刻就接管界面：标题屏也是片头的一部分，底下的页签/工具栏不该露出来。
  document.body.classList.add('cg-running')

  const black = root.querySelector('#cg-black'), cap = root.querySelector('#cg-caption')
  const enter = root.querySelector('#cg-enter'), skipBtn = root.querySelector('#cg-skip')

  let clock = 0, last = 0, started = false, playing = false, done = false
  let curTxt = '', curOp = -1, lit = false, sysOn = false, waiting = false, waitAt = 0
  let cueAt = -1

  function sample(t) {
    let i = 1
    while (i < SHOTS.length - 1 && t > SHOTS[i].t) i++
    const a = SHOTS[i - 1], b = SHOTS[i]
    const u = EASE[b.e || 'io'](clamp01((t - a.t) / Math.max(1e-6, b.t - a.t)))
    const p = mix3(a.p, b.p, u), l = mix3(a.l, b.l, u)
    // 坠落段的横向抖动 —— 纯线性下坠看着像在坐电梯，加点抖才有失重感。
    if (b.e === 'in') { const k = Math.max(0, 1 - u) * .85; p[0] += Math.sin(t * 7.1) * k; p[1] += Math.cos(t * 5.3) * k * .45 }
    return { p, l }
  }

  function syncCaption(t) {
    let txt = '', op = 0
    for (const L of LINES) {
      if (t < L.t0 || t > L.t1) continue
      op = Math.min(clamp01((t - L.t0) / .45), clamp01((L.t1 - t) / .45))
      txt = L.txt; break
    }
    if (txt !== curTxt) { curTxt = txt; cap.textContent = txt }
    // 只在变化明显时写样式 —— 每帧无条件写会白白触发几百次样式重算
    if (Math.abs(op - curOp) > .02) { curOp = op; cap.style.opacity = op.toFixed(2) }
  }

  function land() {
    document.body.classList.remove('cg-running')
    if (scene && fogBase != null && scene.fog) scene.fog.density = fogBase
    camera.position.set(landPos[0], landPos[1], landPos[2])
    controls.target.set(landLook[0], landLook[1], landLook[2])
    controls.enabled = true; controls.enableDamping = true; controls.update()
    root.classList.add('out')
    setTimeout(() => {
      root.remove(); style.remove()
      window.dispatchEvent(new Event('jingxi-opening-done'))
      if (onFinish) onFinish()
    }, 950)
  }

  function finish(skipped) {
    if (done) return
    done = true; playing = false
    pending = false
    try { localStorage.setItem(KEY, 'seen') } catch {}
    root.classList.remove('sys')
    if (!skipped) return land()
    // 跳过时先压黑一下再落位 —— 从高空直接切到地面视角会「闪」得很难受。
    black.style.transition = 'opacity .34s ease'
    black.style.opacity = '1'
    setTimeout(land, 400)
  }

  function tick(now) {
    if (done) return
    if (!last) { last = now; return }
    const dt = Math.min(.05, (now - last) / 1000); last = now
    // 模型没到位就冻在黑幕末尾干等 —— 宁可多等两秒，也别让玩家看见一片空场。
    if (clock < TITLE_HOLD || isModelReady()) {
      if (waiting) { waiting = false; root.classList.remove('waiting') }
      clock += dt
    } else {
      clock = TITLE_HOLD
      if (!waiting) { waiting = true; waitAt = now; root.classList.add('waiting') }
      else if (now - waitAt > 25000) { waiting = false; root.classList.remove('waiting'); clock += 0 }  // 兜底：加载失败也让它走完
    }

    if (!lit && clock >= TITLE_HOLD) { lit = true; root.classList.add('lit') }
    const wantSys = clock >= T_SYS && clock < T_SYS_OFF
    if (wantSys !== sysOn) { sysOn = wantSys; root.classList.toggle('sys', sysOn) }
    for (let i = cueAt + 1; i < CUES.length; i++) { if (clock >= CUES[i].t) { cueAt = i; try { sfx(CUES[i].k) } catch {} } }

    const { p, l } = sample(clock)
    camera.position.set(p[0], p[1], p[2])
    camera.lookAt(l[0], l[1], l[2])
    // 雾随高度抽稀：y=8 以下全额，y=58 以上只剩一成半
    if (fogBase != null && scene.fog) {
      const k = clamp01((camera.position.y - 8) / 50)
      scene.fog.density = fogBase * (1 - k * .85)
    }
    syncCaption(clock)
    if (clock >= T_END) finish(false)
  }

  function begin() {
    if (started) return
    started = true
    try { unlock() } catch {}          // 这一下点击也是音频解锁的那一步（自动播放策略）
    root.classList.add('started')
    document.body.classList.add('cg-running')
    controls.enabled = false
    playing = true; last = 0
  }

  enter.onclick = begin
  skipBtn.onclick = () => finish(true)
  const onKey = e => { if (e.key === 'Escape') finish(true); else if (!started && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); begin() } }
  addEventListener('keydown', onKey)
  // 进游戏前已经点过页面（选了档位）—— 那一下不算「开始」，这里再要一次明确的手势。
  const _cleanup = () => removeEventListener('keydown', onKey)

  return {
    active: () => !done,
    tick,
    // 标题屏由玩家自己点「进入」；探针/联调可以直接掀开
    begin,
    skip: () => finish(true),
    destroy: () => { _cleanup(); done = true; playing = false; pending = false; document.body.classList.remove('cg-running'); root.remove(); style.remove() }
  }
}
