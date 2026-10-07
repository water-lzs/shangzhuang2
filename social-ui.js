// 包 K（第十四轮）· 社交协作页
// 三块新玩法（协作任务 / 稻田 PK / 跨时空粮仓）＋ 原有「认养 + 海报 + 寄米」。
// 硬约束：不 fetch、不 WebSocket、不引第三方 SDK。所有「和别人一起」都靠
// ① 可复制的分享码  ② 同一个浏览器里的档位共用一份粮仓账。
import {TASK_TYPES, TASK_IDS, REDEEMABLES, TOOL_KINDS, pkCode} from './social-engine.js'
import {granaryView} from './granary.js'
import {currentSlot} from './storage.js'

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const SEASON_CN = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }

export function createSocial({ getState, dispatch }) {
  let copied = ''

  function render(message = '') {
    const s = getState()
    const x = s.social || { poster: null, adoptions: [], waterBonus: 0, shipments: 0, coopPoints: 0, tasks: [], tools: [], pk: null }
    const season = SEASON_CN[s.season] + '季'
    const slot = currentSlot() ?? 1
    const g = granaryView(slot)
    const money = (s.sales && s.sales.wen) || 0

    /* —— 协作任务：每张卡一位认养好友 —— */
    const friendCards = x.adoptions.length ? x.adoptions.map(a => {
      const running = x.tasks.find(t => t.friend === a.friend && t.status === 'running')
      return `<div class="coop-friend">
<b>${esc(a.friend)}</b><small>认养 ${esc(a.variety)} · 浇水 ${a.watered} 次</small>
${running
          ? `<span class="coop-busy">手上压着「${TASK_TYPES[running.type] ? TASK_TYPES[running.type].name : ''}」，等这季做完</span>`
          : `<span class="coop-acts">${TASK_IDS.map(id => `<button data-task="${id}" data-friend="${esc(a.friend)}" title="${esc(TASK_TYPES[id].word)}">${TASK_TYPES[id].name}</button>`).join('')}</span>`}
</div>`
    }).join('') : '<p class="coop-empty">还没有认养好友。先在下面「好友认养」里添一位，才谈得上请人搭把手。</p>'

    const taskRows = x.tasks.length ? x.tasks.slice().reverse().map(t => {
      const def = TASK_TYPES[t.type] || { name: t.type }
      const word = t.status === 'running' ? '在办' : t.status === 'failed' ? '没成' : '已结'
      return `<div class="coop-row ${t.status === 'running' ? 'running' : t.status === 'failed' ? 'failed' : 'done'}"><b>${esc(def.name)}</b><span>${esc(t.friend)}</span><em>第 ${t.year} 年${SEASON_CN[t.season] || ''}派 · ${word}</em></div>`
    }).join('') : '<p class="coop-empty">还没派过活。</p>'

    const redeems = REDEEMABLES.map(r => `<button data-redeem="${r.id}" ${x.coopPoints < r.cost ? 'disabled' : ''} title="${esc(r.word)}">${esc(r.name)}<small>${r.cost} 分</small></button>`).join('')

    /* —— 稻田 PK —— */
    const minePk = x.pk && x.pk.metrics ? x.pk.metrics : null
    const pkResult = x.pk && x.pk.result ? `
<div class="pk-lines">${x.pk.result.lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>
<p class="pk-verdict ${x.pk.result.win ? 'win' : x.pk.result.tie ? 'tie' : 'lose'}">${x.pk.result.win ? `你赢了这一场（${x.pk.result.score[0]} : ${x.pk.result.score[1]}）` : x.pk.result.tie ? `打平（${x.pk.result.score[0]} : ${x.pk.result.score[1]}）` : `这一场输了（${x.pk.result.score[0]} : ${x.pk.result.score[1]}），下季再来`}</p>` : '<p class="pk-hint">还没比过。把自己这串码发给朋友，再把他的码贴进来。</p>'

    const tools = x.tools.length ? x.tools.map(t => {
      const k = TOOL_KINDS[t.kind] || { name: t.kind, word: '' }
      return `<div class="tool-row${t.armed ? ' armed' : ''}"><b>${esc(k.name)}</b><small>${esc(k.word)}</small><button data-tool="${esc(t.id)}">${t.armed ? '已挂在犁上' : k.when === 'now' ? '使这一回' : '挂上犁'}</button></div>`
    }).join('') : '<p class="pk-hint">赢了 PK 就会得一件御赐农具，一件只能用一回。</p>'

    /* —— 跨时空粮仓 —— */
    const pct = g.next ? Math.min(100, Math.round(g.total / g.next.kg * 100)) : 100
    const tiers = g.tiers.map(t => `<div class="gran-tier${t.unlocked ? ' on' : ''}"><b>${esc(t.name)}</b><span>${t.kg.toLocaleString()} kg</span><small>${esc(t.word)}${t.unlocked ? '（已解锁）' : `　还差 ${t.left.toLocaleString()} kg`}</small></div>`).join('')

    document.querySelector('#social-root').innerHTML = `
<div class="social-heading"><span>社交协作 · 时空相助</span><h1>与朋友一起种京西稻</h1><p>当前背景：${season} · 好友认养 1 平米，每日浇水提供现代水源加成；四人共用一个跨时空粮仓</p></div>
<section class="coop-card">
 <header class="card-head"><h2>协作任务 · 请好友搭把手</h2><span class="coop-points">协作积分 <b>${x.coopPoints}</b></span></header>
 <div class="coop-grid">${friendCards}</div>
 <div class="coop-list">${taskRows}</div>
 <div class="coop-redeem"><span>积分兑换</span>${redeems}</div>
</section>
<section class="pk-card">
 <h2>稻田 PK · 一季一场</h2>
 <div class="pk-layout">
  <div class="pk-mine">
   <p class="pk-label">本机年景（第 ${minePk ? minePk.n : s.year} 年）</p>
   <div class="pk-metrics">${minePk ? `<div><b>${minePk.e}</b><small>生态值</small></div><div><b>${minePk.y}</b><small>上季实收 kg</small></div><div><b>${esc(minePk.q)}</b><small>上季品质</small></div>` : '<p class="pk-hint">先收一季，才有数可比。</p>'}</div>
   <div class="pk-code"><code>${x.pk && x.pk.code ? esc(x.pk.code) : '（还没生成）'}</code></div>
   <div class="pk-btns"><button data-social="pk-code">${x.pk && x.pk.code ? '重新封码' : '生成我的分享码'}</button><button data-social="pk-copy" ${x.pk && x.pk.code ? '' : 'disabled'}>复制</button></div>
   <p class="pk-hint">${copied ? esc(copied) : '这串码里只有年景三个数，没有别的。'}</p>
  </div>
  <div class="pk-foe">
   <label>把对方的码贴在这里<input id="pk-input" placeholder="JXPK-……" value="${esc(copied && copied.startsWith('JXPK-') ? copied : '')}"></label>
   <button class="pk-go" data-social="pk-import">比一场</button>
   ${pkResult}
  </div>
 </div>
 <div class="pk-tools"><span>御赐农具</span>${tools}</div>
</section>
<section class="granary-card">
 <header class="card-head"><h2>跨时空粮仓</h2><span class="gran-total">仓里共 <b>${g.total.toLocaleString()}</b> kg</span></header>
 <p class="gran-mine">第 ${slot} 档倒进去 <b>${g.mine.toLocaleString()}</b> kg，占全仓 <b>${g.share}%</b>${g.contributors > 1 ? `　（另有 ${g.contributors - 1} 个档位出过谷子）` : ''}</p>
 <div class="gran-bar"><i style="width:${pct}%"></i><span>${g.next ? `下一档 ${g.next.name} · ${g.next.kg.toLocaleString()} kg（还差 ${(g.next.kg - g.total).toLocaleString()} kg）` : '三档全开'}</span></div>
 <div class="gran-tiers">${tiers}</div>
 <div class="gran-give"><label>倒谷子进仓<input id="granary-kg" type="number" min="1" step="1" placeholder="kg" value=""></label><button data-social="contribute" ${s.rice > 0 ? '' : 'disabled'}>倒进粮仓</button><small>仓里现有稻米 ${Math.floor(s.rice || 0).toLocaleString()} kg</small></div>
</section>
<section class="poster-card">
 <div class="poster-art"><b>京西稻贡米系统</b><strong>我在${season}等你认养一平米</strong><small>扫码加入 · 秋收寄出真实京西稻米</small></div>
 <div><h2>时空求助海报</h2><p>${x.poster ? `海报编号：${esc(x.poster.code)}` : '生成一张带当前季节背景的求助海报'}</p><button data-social="poster">${x.poster ? '重新生成海报' : '生成时空求助海报'}</button></div>
</section>
<section class="adopt-card">
 <h2>好友认养</h2>
 <label>好友昵称<input id="friend-name" placeholder="例如：小满"></label>
 <label>认养品种<input id="adopt-variety" value="御稻米"></label>
 <button data-social="adopt">确认认养 1 平米</button>
 <div class="adopt-list">${x.adoptions.length ? x.adoptions.map(a => `<div><b>${esc(a.friend)}</b> · ${esc(a.variety)} · 浇水 ${a.watered} 次 <button data-water="${esc(a.friend)}">今日浇水</button></div>`).join('') : '暂无好友认养'}</div>
 <p>现代水源加成：${x.waterBonus} · 已寄出真实稻米：${x.shipments} 份 · 身上银钱 ${money.toLocaleString()} 文</p>
 <button data-social="ship" ${!s.harvested ? 'disabled' : ''}>秋收后寄出京西稻米</button>
</section>
<div class="social-message" role="status">${esc(message)}</div>`

    bind(x, slot)
  }

  function bind(x, slot) {
    const root = document.querySelector('#social-root')
    const q = sel => root.querySelector(sel)
    const qa = sel => [...root.querySelectorAll(sel)]

    qa('[data-task]').forEach(b => b.onclick = () => dispatch({ type: 'social:task', friend: b.dataset.friend, task: b.dataset.task }))
    qa('[data-redeem]').forEach(b => b.onclick = () => dispatch({ type: 'social:redeem', what: b.dataset.redeem }))
    qa('[data-tool]').forEach(b => b.onclick = () => dispatch({ type: 'social:tool', tool: b.dataset.tool }))
    qa('[data-social="poster"]').forEach(b => b.onclick = () => dispatch({ type: 'social:poster' }))
    qa('[data-social="adopt"]').forEach(b => b.onclick = () => dispatch({ type: 'social:adopt', friend: q('#friend-name').value, variety: q('#adopt-variety').value }))
    qa('[data-water]').forEach(b => b.onclick = () => dispatch({ type: 'social:water', friend: b.dataset.water }))
    qa('[data-social="ship"]').forEach(b => b.onclick = () => dispatch({ type: 'social:ship' }))
    qa('[data-social="pk-code"]').forEach(b => b.onclick = () => dispatch({ type: 'social:pk-code' }))
    qa('[data-social="pk-import"]').forEach(b => b.onclick = () => dispatch({ type: 'social:pk-import', code: q('#pk-input').value }))
    qa('[data-social="contribute"]').forEach(b => b.onclick = () => dispatch({ type: 'social:contribute', kg: Number(q('#granary-kg').value) }))

    // 复制分享码：优先用剪贴板 API；不行就退回「选中让你自己按 Ctrl+C」。
    qa('[data-social="pk-copy"]').forEach(b => b.onclick = () => {
      const code = (x.pk && x.pk.code) || ''
      if (!code) return
      copied = code
      const done = () => { copied = `已复制：${code}`; render() }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { copied = `复制失败，请手动选中：${code}`; render() })
      else { copied = `请手动选中这段：${code}`; render() }
    })
  }

  return { render, code: () => pkCode(getState()) }
}
