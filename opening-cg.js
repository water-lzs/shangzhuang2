// —— 开场 CG（AI 视频版）——
// 30 秒 AI 渲染成片（Seedance，六镜：浸种→插秧→灌溉→三耘→收刈→入仓），
// 网页轻量版 720p `cg-opening-30s.mp4`（约 7MB，H.264 + faststart，可直接上 GitHub Pages）。
// 结构：标题屏（黑幕 + 点击进入）→ 全屏播放视频 → 落位到四季场景（相机交还 OrbitControls）。
// 视频本身无音轨，氛围音效走 audio.js 的合成音在关键节点触发（CUES）。
// 只在第一次进来时播；标记写 localStorage（key 用 v2，与引擎版 v1 分开，老玩家也能看到新片头）。
//
// 为什么引擎版换成视频版：Seedance 成片的写实画面是 Blender 走位 + AI 渲染出来的，
// 运镜/光影/稻田质感都比实时场景演出强一个量级，答辩演示更能镇场；代价是 7MB 进包，
// 首屏多一次视频缓冲 —— 标题屏停留期间 preload 正好把加载时间藏掉。
//
// 落位说明：终点必须精确落在 alignment.json 的相机位上（现在由 app.js 从 SEASONS.<season> 传进来），
// 差一点点，交还 OrbitControls 的那一帧就会跳一下。
const KEY = 'jingxi-opening-v2'
const VIDEO_SRC = './cg-opening-30s.mp4'

export function openingSeen() { try { return localStorage.getItem(KEY) === 'seen' } catch { return false } }
export function clearOpening() { try { localStorage.removeItem(KEY) } catch {} }

// 引导卡要等 CG 收尾再弹，靠这个标记在两个模块之间打招呼（opening-cg 与 immersive 是同一个模块实例）。
let pending = false
export function openingPending() { return pending }
export function markOpeningPending() { pending = true }

// 音效只在关键节点给，密了反而像在放提示音。视频 6 镜每 5 秒一切，cue 大致压在换镜前后。
const CUES = [
  { t: 0.5, k: 'detect' },
  { t: 9.0, k: 'inspect' },
  { t: 16.0, k: 'choice' },
  { t: 26.0, k: 'reward' }
]

const CSS = `#cg-root{position:fixed;inset:0;z-index:60;overflow:hidden;pointer-events:auto;font-family:KaiTi,'Microsoft YaHei',serif;-webkit-user-select:none;user-select:none}
#cg-root.out{opacity:0;transition:opacity .85s ease}
#cg-black{position:absolute;inset:0;z-index:1;background:#070b09;opacity:1;transition:opacity 1.4s ease}
#cg-root.started #cg-black{opacity:0}
#cg-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;opacity:0;transition:opacity .5s ease}
#cg-root.started #cg-video{opacity:1}
#cg-vignette{position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,transparent 42%,#050906 120%);opacity:.85}
#cg-wait{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);color:#8fa08a;font:13px 'Microsoft YaHei';letter-spacing:.14em;opacity:0;transition:opacity .5s ease;z-index:3}
#cg-root.waiting #cg-wait{opacity:.85}
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
@media(prefers-reduced-motion:reduce){#cg-black{transition:none}}`

export function createOpening({ camera, controls, scene, landPos, landLook, isModelReady = () => true, sfx = () => {}, unlock = () => {}, onFinish } = {}) {
  landPos = (landPos || [0, 4.1, 39]).slice()
  landLook = (landLook || [0, 8, -60]).slice()
  // FogExp2 按视线距离衰减：记住进场时的密度，落地后复原。
  const fogBase = scene && scene.fog ? scene.fog.density : null

  // 上一个实例还在（重开一局）就先拆掉，避免两层遮罩叠着
  document.getElementById('cg-root')?.remove()
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style)

  const root = document.createElement('div'); root.id = 'cg-root'
  root.innerHTML = `<video id="cg-video" src="${VIDEO_SRC}" preload="auto" playsinline webkit-playsinline></video>
<div id="cg-black"></div>
<div id="cg-vignette"></div>
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

  const video = root.querySelector('#cg-video')
  const enter = root.querySelector('#cg-enter'), skipBtn = root.querySelector('#cg-skip')

  let started = false, done = false, videoEnded = false, waiting = false, waitAt = 0
  let cueAt = -1

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
    black.style.transition = 'opacity .34s ease'
    black.style.opacity = '1'
    setTimeout(land, 400)
  }

  function tick(now) {
    if (done) return
    if (!started) return  // 标题屏阶段主循环不用管
    // 音效按视频进度触发
    const t = video.currentTime || 0
    for (let i = cueAt + 1; i < CUES.length; i++) { if (t >= CUES[i].t) { cueAt = i; try { sfx(CUES[i].k) } catch {} } }
    // 视频播完收尾：模型没就位就冻在片尾干等 —— 宁可多等两秒，也别让玩家看见一片空场。
    if (!videoEnded) return
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
