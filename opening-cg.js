// —— 开场 CG（字幕融入视频版）——
// 结构：标题屏（点击进入）→ 30 秒 AI 成片全屏播放，穿越背景字幕直接叠加在画面上
//       （电影片头式，随 video.currentTime 浮现）→ 系统绑定面板叠在画面中段 →
//       视频收尾落位到四季场景（相机交还 OrbitControls）。
// 视频：网页轻量版 720p `cg-opening-30s.mp4`（约 7MB，H.264 + faststart，可直接上 GitHub Pages）。
// 六镜：浸种(0-5s)→插秧(5-10s)→灌溉(10-15s)→三耘(15-20s)→收刈(20-25s)→入仓(25-30s)，
// 字幕与换镜节奏对齐，观感是「穿越叙事长在画面上」。
// 视频无音轨且 muted 播放（顺带躲过自动播放策略），氛围音效走 audio.js 合成音（CUES）。
// 只在第一次进来时播；标记写 localStorage（key 用 v2，与引擎版 v1 分开，老玩家也能看到新片头）。
//
// 落位说明：终点必须精确落在 alignment.json 的相机位上（现在由 app.js 从 SEASONS.<season> 传进来），
// 差一点点，交还 OrbitControls 的那一帧就会跳一下。
const KEY = 'jingxi-opening-v2'
const VIDEO_SRC = './cg-opening-30s.mp4'

const T_SYS = 16        // 系统绑定面板出现（视频中段，三耘镜）
const T_SYS_OFF = 19.5  // 面板收起

export function openingSeen() { try { return localStorage.getItem(KEY) === 'seen' } catch { return false } }
export function clearOpening() { try { localStorage.removeItem(KEY) } catch {} }

// 引导卡要等 CG 收尾再弹，靠这个标记在两个模块之间打招呼（opening-cg 与 immersive 是同一个模块实例）。
let pending = false
export function openingPending() { return pending }
export function markOpeningPending() { pending = true }

// —— 字幕：直接叠加在 CG 画面上（t 是 video.currentTime）——
// 前半段讲穿越背景，后半段落在御田本身，与画面内容呼应。
const LINES = [
  { t0: 0.6, t1: 2.6, txt: '2026 年 · 深夜 · 北京' },
  { t0: 3.0, t1: 4.4, txt: '文档最后一次保存的时候，屏幕上跳出了一行字。' },
  { t0: 5.4, t1: 8.4, txt: '「京西稻贡米系统 · 等待宿主确认」' },
  { t0: 9.2, t1: 11.4, txt: '再睁眼，脚下不是地板。' },
  { t0: 12.2, t1: 15.6, txt: '是一片水田。十亩，一望到边。' },
  { t0: 20.0, t1: 23.2, txt: '这是我祖上那块地——京西稻，御田。' },
  { t0: 24.2, t1: 27.0, txt: '风从稻田上过去，整片田都在响。' },
  { t0: 28.2, t1: 30.0, txt: '第 1 年 · 春。田，交给你了。' }
]

// 音效只在关键节点给，密了反而像在放提示音。6 镜每 5 秒一切，cue 大致压在换镜前后。
const CUES = [
  { t: 0.5, k: 'detect' },
  { t: 5.4, k: 'inspect' },
  { t: 16.0, k: 'choice' },
  { t: 28.0, k: 'reward' }
]

const CSS = `#cg-root{position:fixed;inset:0;z-index:60;overflow:hidden;pointer-events:auto;font-family:KaiTi,'Microsoft YaHei',serif;-webkit-user-select:none;user-select:none}
#cg-root.out{opacity:0;transition:opacity .85s ease}
#cg-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;opacity:0;transition:opacity .5s ease}
#cg-root.started #cg-video{opacity:1}
#cg-black{position:absolute;inset:0;z-index:1;background:#070b09;opacity:0;transition:opacity .34s ease}
#cg-caption{position:absolute;left:50%;bottom:14%;transform:translateX(-50%);width:min(820px,88vw);text-align:center;color:#f7ebc9;font-size:clamp(18px,2.4vw,26px);line-height:1.85;letter-spacing:.08em;text-shadow:0 2px 18px #000e,0 0 4px #000a,0 0 1px #000c;opacity:0;z-index:2;pointer-events:none}
#cg-vignette{position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,transparent 42%,#050906 120%);opacity:.8}
#cg-wait{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);color:#8fa08a;font:13px 'Microsoft YaHei';letter-spacing:.14em;opacity:0;transition:opacity .5s ease;z-index:3}
#cg-root.waiting #cg-wait{opacity:.85}
#cg-sys{position:absolute;inset:0;z-index:3;display:grid;place-items:center;opacity:0;transition:opacity .6s ease;pointer-events:none}
#cg-root.sys #cg-sys{opacity:1}
.cg-sys-box{width:min(520px,84vw);padding:20px 24px;border:1px solid #e8b95666;background:rgba(12,22,16,.86);color:#e9dcb6;font:14px 'Microsoft YaHei';letter-spacing:.04em;box-shadow:0 24px 70px #000b,inset 0 0 60px #e8b9560f}
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
#cg-root.sys .cg-sys-bar i{animation:cg-fill 2.8s ease-out .3s forwards}
@keyframes cg-fill{to{width:100%}}
.cg-sys-foot{padding-top:12px;border-top:1px solid #e8b95633;color:#f0cd76;letter-spacing:.1em;opacity:0}
#cg-root.sys .cg-sys-foot{animation:cg-line .6s ease 2.6s forwards}
#cg-title{position:absolute;inset:0;z-index:4;display:grid;place-content:center;justify-items:center;gap:0;background:#070b09;text-align:center;transition:opacity .8s ease}
#cg-root.started #cg-title{opacity:0;pointer-events:none}
.cg-brand{display:flex;align-items:center;gap:16px;margin-bottom:24px}
.cg-seal{width:52px;height:52px;display:grid;place-items:center;border-radius:4px;background:#b8402f;color:#ffeccf;font:20px/1.05 KaiTi,serif}
.cg-brand h1{margin:0;color:#f7ebc9;font:600 clamp(26px,4vw,40px)/1.2 KaiTi,'Microsoft YaHei',serif;letter-spacing:.1em}
.cg-brand p{margin:5px 0 0;color:#93a48d;font-size:12px;letter-spacing:.34em}
.cg-lead{margin:0 0 30px;color:#c9d2bd;font-size:15px;letter-spacing:.08em}
#cg-enter{padding:12px 40px;border:1px solid #e8b956aa;border-radius:3px;background:#e8b9560f;color:#f7ebc9;font:16px KaiTi,serif;letter-spacing:.3em;cursor:pointer;transition:background .25s,border-color .25s,box-shadow .25s}
#cg-enter:hover,#cg-enter:focus-visible{background:#e8b95626;border-color:#ffd98a;box-shadow:0 0 26px #e8b95644;outline:none}
.cg-tip{margin:16px 0 0;color:#75836f;font-size:12px;letter-spacing:.08em}
#cg-skip{position:absolute;top:18px;right:20px;z-index:5;padding:7px 16px;border:1px solid #ffffff2e;border-radius:999px;background:#00000059;color:#dfe6d8;font:13px 'Microsoft YaHei';letter-spacing:.1em;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .5s ease,background .2s,border-color .2s}
#cg-root.started #cg-skip{opacity:.7;pointer-events:auto}
#cg-skip:hover,#cg-skip:focus-visible{opacity:1;background:#000000a6;border-color:#e8b956aa;color:#ffe8ac;outline:none}
body.cg-running .topbar,body.cg-running #activity-tabs,body.cg-running footer,body.cg-running #system-panel,body.cg-running #world-shell,body.cg-running #asset-notice,body.cg-running .season-side{visibility:hidden!important}
@media(prefers-reduced-motion:reduce){.cg-dot{animation:none}}`

export function createOpening({ camera, controls, scene, landPos, landLook, isModelReady = () => true, sfx = () => {}, unlock = () => {}, onFinish } = {}) {
  landPos = (landPos || [0, 4.1, 39]).slice()
  landLook = (landLook || [0, 8, -60]).slice()
  // FogExp2 按视线距离衰减：记住进场时的密度，落地后复原。
  const fogBase = scene && scene.fog ? scene.fog.density : null

  // 上一个实例还在（重开一局）就先拆掉，避免两层遮罩叠着
  document.getElementById('cg-root')?.remove()
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style)

  const root = document.createElement('div'); root.id = 'cg-root'
  root.innerHTML = `<video id="cg-video" src="${VIDEO_SRC}" preload="auto" muted playsinline webkit-playsinline></video>
<div id="cg-black"></div>
<div id="cg-caption"></div>
<div id="cg-vignette"></div>
<div id="cg-wait">正在落位 · 载入京西御田…</div>
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

  const video = root.querySelector('#cg-video'), cap = root.querySelector('#cg-caption')
  const enter = root.querySelector('#cg-enter'), skipBtn = root.querySelector('#cg-skip')

  let started = false, done = false, videoEnded = false, waiting = false, waitAt = 0
  let curTxt = '', curOp = -1, sysOn = false, cueAt = -1

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v
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
    done = true
    pending = false
    try { localStorage.setItem(KEY, 'seen') } catch {}
    try { video.pause() } catch {}
    if (!skipped) return land()
    // 跳过时先压黑一下再落位 —— 从片尾画面直接切到地面视角会「闪」得很难受。
    const black = root.querySelector('#cg-black')
    black.style.opacity = '1'
    setTimeout(land, 400)
  }

  function tick(now) {
    if (done) return
    if (!started) return  // 标题屏阶段主循环不用管
    const t = video.currentTime || 0
    // 字幕直接叠在 CG 画面上（电影片头式）
    syncCaption(t)
    // 音效按视频进度触发
    for (let i = cueAt + 1; i < CUES.length; i++) { if (t >= CUES[i].t) { cueAt = i; try { sfx(CUES[i].k) } catch {} } }
    // 系统绑定面板叠在画面中段
    const wantSys = t >= T_SYS && t < T_SYS_OFF
    if (wantSys !== sysOn) { sysOn = wantSys; root.classList.toggle('sys', sysOn) }
    if (!videoEnded) return

    // 视频播完收尾：模型没就位就冻在片尾干等 —— 宁可多等两秒，也别让玩家看见一片空场。
    if (isModelReady()) { finish(false); return }
    if (!waiting) { waiting = true; waitAt = now; root.classList.add('waiting') }
    else if (now - waitAt > 25000) { waiting = false; root.classList.remove('waiting'); finish(false) }  // 兜底：加载失败也让它走完
  }

  function begin() {
    if (started) return
    started = true
    try { unlock() } catch {}          // 这一下点击也是音频解锁的那一步（自动播放策略）
    root.classList.add('started')
    document.body.classList.add('cg-running')
    controls.enabled = false
    // muted 自动播放不受策略拦截；视频 30 秒正好把春季 GLB 的加载时间藏掉
    video.play().catch(() => { videoEnded = true })  // 加载/播放失败不卡死，走正常收尾
  }

  video.addEventListener('ended', () => { videoEnded = true })
  video.addEventListener('error', () => { videoEnded = true })
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
    destroy: () => { _cleanup(); done = true; pending = false; try { video.pause() } catch {}; document.body.classList.remove('cg-running'); root.remove(); style.remove() }
  }
}
