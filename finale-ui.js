// —— 包 K（第八轮）Q-9.13：终章界面与揭晓演出 ——
// 四维在界面上只给模糊描述；揭晓走「变暗 → 条形图 → 三十秒动态插画」三段。
// 旧 ending-engine 的判定表并列保留（v7 及以前的存档走兼容面板）。
import {
  FINALES, FINALE_CHOICES, finaleMetrics, blurWords, verseOf,
  finaleReady, missingHints,
} from './finale-engine.js'
import {ENDINGS, endingMetrics, availableEndings} from './ending-engine.js'

const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
// key 是 blurWords / verseOf 的口径（ecology…），metric 是 finaleMetrics 的口径（eco…）——
// 两套名字不一致，混用过一次：条形图读到了 undefined，四条全按 2% 兜底画出来。
const DIMS = [
  { key: 'ecology', metric: 'eco', name: '田土', icon: '田' },
  { key: 'wealth', metric: 'wealth', name: '家业', icon: '钱' },
  { key: 'culture', metric: 'culture', name: '文脉', icon: '书' },
  { key: 'moral', metric: 'moral', name: '乡评', icon: '德' },
]
const LINE_MS = 3200      // 逐行文案的节奏（8 行 ≈ 26 秒）
const REVEAL_MS = 2400    // 条形图长出来的时间，之后才开始念文案

export function createFinale({getState, dispatch}) {
  let timer = null, lineTimer = null, stage = 'idle'   // idle | dim | bars | story | done
  const root = () => document.querySelector('#ending-root')
  const host = () => document.querySelector('#finale-reveal')
  const clearTimers = () => { clearTimeout(timer); clearInterval(lineTimer); timer = lineTimer = null }

  // ---------- 终章页 ----------
  function render(message = '') {
    const s = getState()
    const f = s.finale || {}
    const m = finaleMetrics(s)
    const words = blurWords(s)
    const ready = finaleReady(s)
    const el = root()
    if (!el) return
    el.innerHTML = `
<div class="ending-heading"><span>四时终章 · 御贡命运</span><h1>京西稻的结局</h1><p>四时已过。朝廷的船停在桥下，等一个交代。</p></div>
<section class="fin-dims" aria-label="四时心印">
  ${DIMS.map(d => `<div class="fin-dim"><span class="fin-seal">${d.icon}</span><small>${d.name}</small><p>${esc(words[d.key])}</p></div>`).join('')}
</section>
${bodyHTML(s, f, m, ready)}
<div class="fin-message" role="status">${esc(message)}</div>
${f.legacy ? legacyHTML(s) : ''}`
    bind(el)
  }
  function bodyHTML(s, f, m, ready) {
    if (f.verdict) {
      const e = FINALES[f.verdict.id || 'unknown']
      return `<section class="fin-verdict tone-${e.tone}">
  <span class="fin-tag">${e.tag}</span>
  <h2>${e.name}</h2>
  <p class="fin-verse">「${e.verse}」</p>
  <p class="fin-brief">${e.brief}</p>
  ${f.revealed ? '<p class="fin-seen">这一幕已看过。想再看一遍，随时可以。</p>' : ''}
  <div class="fin-actions">
    <button class="farm-primary" data-fin="reveal">${f.revealed ? '再看一遍终章' : '揭晓终章'}</button>
  </div>
</section>`
    }
    if (!ready) {
      const miss = missingHints(s, null)
      return `<section class="fin-wait">
  <h2>朝廷还未派人来</h2>
  <p>贡册上还缺些东西——要么把《京西稻耕织图》二十幅补齐，要么种出一季「上香一号」。</p>
  <ul class="fin-miss">${miss.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
  <p class="fin-quiet">田还得接着种，账还得接着记。四时轮过，终章自然会来。</p>
</section>`
    }
    const miss = missingHints(s, null)
    return `<section class="fin-ask">
  <span class="fin-tag">最终抉择</span>
  <h2>朝廷来收贡米，你打算怎么办？</h2>
  <p>仓里那批稻子，是这一季种出来的全部收成。船在桥下等，人也在门口等。</p>
  <div class="fin-choices">
    ${FINALE_CHOICES.map(c => `<button data-fin="choose" data-choice="${c.key}"><b>${c.label}</b><span>${c.desc}</span><small>「${c.verse}」</small></button>`).join('')}
  </div>
  <p class="fin-quiet">选定了就改不回来。四时的账，早在这之前就记满了。</p>
  ${miss.length ? `<ul class="fin-miss">${miss.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
</section>`
  }
  // 旧判定表（兼容 v7 及以前的存档）
  function legacyHTML(s) {
    const m = endingMetrics(s), a = availableEndings(s)
    return `<details class="fin-legacy"><summary>旧时 rumor · 村里人嘴里传的判法</summary>
<table><thead><tr><th>结局</th><th>村里人的说法</th><th>状态</th></tr></thead><tbody>
${Object.entries(ENDINGS).map(([id, e]) => `<tr><td>${e.name}</td><td>${e.rule}</td><td>${a[id] ? '已达成' : '未达成'}</td></tr>`).join('')}
</tbody></table>
<p>生态 ${m.ecology} · 财富 ${m.wealth} 文 · 稻种 ${m.varieties}/13 · 碎片 ${m.fragments}/20</p></details>`
  }

  function bind(el) {
    el.querySelectorAll('[data-fin]').forEach(b => b.onclick = () => {
      const a = b.dataset.fin
      if (a === 'choose') { if (dispatch({type: 'finale:decide', choice: b.dataset.choice})) render(); return }
      if (a === 'reveal') { if (dispatch({type: 'finale:reveal'})) { render(); open(); } return }
    })
  }

  // ---------- 揭晓演出 ----------
  function open() {
    const s = getState()
    const v = s.finale?.verdict
    if (!v) return
    const e = FINALES[v.id || 'unknown']
    const words = blurWords(s)
    let el = host()
    if (!el) { el = document.createElement('div'); el.id = 'finale-reveal'; document.body.append(el) }
    document.body.classList.add('finale-open')
    el.innerHTML = `
<div class="fr-dim" aria-hidden="true"></div>
<div class="fr-panel tone-${e.tone}" role="dialog" aria-label="四时终章">
  <div class="fr-head"><span>四时终章 · ${e.tag}</span><h2>${e.name}</h2><p class="fr-verse">「${e.verse}」</p></div>
  <div class="fr-dims">
    ${DIMS.map(d => `<div class="fr-dim-row"><small>${d.name}</small><div class="fr-bar"><i data-w="${v.m?.[d.metric] ?? 0}" style="width:0%"></i></div><p><b>${esc(words[d.key])}</b><span>${verseOf(d.key, v.m?.[d.metric] ?? 0)}</span></p></div>`).join('')}
  </div>
  <div class="fr-stage">
    <div class="fr-scene" aria-hidden="true">
      <span class="fs-sky"></span><span class="fs-sun"></span>
      <span class="fs-hill far"></span><span class="fs-hill near"></span>
      <span class="fs-field"></span>
      <i class="fs-rice" style="--i:0"></i><i class="fs-rice" style="--i:1"></i><i class="fs-rice" style="--i:2"></i><i class="fs-rice" style="--i:3"></i><i class="fs-rice" style="--i:4"></i><i class="fs-rice" style="--i:5"></i><i class="fs-rice" style="--i:6"></i><i class="fs-rice" style="--i:7"></i><i class="fs-rice" style="--i:8"></i><i class="fs-rice" style="--i:9"></i><i class="fs-rice" style="--i:10"></i><i class="fs-rice" style="--i:11"></i>
      <span class="fs-actor"></span>
    </div>
    <ol class="fr-lines" aria-live="polite"></ol>
  </div>
  <div class="fr-foot"><button data-fr="skip">跳过演出</button><button data-fr="close">收下这一结局</button></div>
</div>`
    el.querySelector('[data-fr="skip"]').onclick = () => finish()
    el.querySelector('[data-fr="close"]').onclick = () => close()
    clearTimers()
    stage = 'dim'
    el.classList.add('show')
    // ① 变暗 → 条形图长出
    requestAnimationFrame(() => {
      el.querySelectorAll('.fr-bar i').forEach((b, i) => {
        setTimeout(() => { b.style.width = Math.max(2, Number(b.dataset.w) || 0) + '%' }, 120 * i)
      })
    })
    // ② 逐行念文案
    const lines = e.lines || []
    const ol = el.querySelector('.fr-lines')
    const startLines = () => {
      if (stage === 'done') return
      stage = 'story'
      let i = 0
      const put = () => {
        if (i >= lines.length) { clearInterval(lineTimer); lineTimer = null; stage = 'done'; return }
        const li = document.createElement('li')
        li.textContent = lines[i++]
        li.className = 'in'
        ol.append(li)
        if (ol.children.length > 4) ol.firstElementChild.remove()
      }
      put()
      lineTimer = setInterval(put, LINE_MS)
    }
    timer = setTimeout(startLines, REVEAL_MS)
  }
  // 跳过：文案一次性铺满，停在最后一屏
  function finish() {
    const s = getState(), v = s.finale?.verdict
    if (!v) return close()
    const e = FINALES[v.id || 'unknown'], el = host()
    clearTimers(); stage = 'done'
    el.querySelectorAll('.fr-bar i').forEach(b => { b.style.width = Math.max(2, Number(b.dataset.w) || 0) + '%' })
    const ol = el.querySelector('.fr-lines')
    ol.innerHTML = (e.lines || []).slice(-4).map(t => `<li class="in">${esc(t)}</li>`).join('')
  }
  function close() {
    clearTimers(); stage = 'idle'
    const el = host()
    if (el) { el.classList.remove('show'); el.innerHTML = '' }
    document.body.classList.remove('finale-open')
  }
  // 切走页面 / 开面板时收掉演出，免得盖住别的界面
  function dismiss() { if (stage !== 'idle') close() }

  return {render, dismiss, get stage() { return stage }}
}
