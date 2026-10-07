// 包 M3（第十一轮）· 镇上街坊页
// 界面的纪律：交情只给「生分 / 脸熟 / 交好 / 知交」四级与一句白话，
// 不出现任何好感数值；人情带来的实际好处（手续费、专线、席面单）才写明白——
// 那些是玩法数值，藏起来玩家反而不懂自己在攒什么。
import { NPC_ORDER, NPCS, affOf, affWord, affHint, AFF_TIERS, canTalk, talkedToday, feeCutOf, tributeOpen, readyCount } from './npc-engine.js'
import { QUEST_MAP } from './event-engine.js'
import { feeOf, CHANNELS } from './sales-engine.js'
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function createNpc({ getState, dispatch, goHome }) {
  const root = document.querySelector('#npc-root')
  let message = ''
  // 四格点阵表示交情档位，不写数字：还没交情时全灭，起步后点亮到当前档
  const pips = v => AFF_TIERS.map(t => `<i class="${v > 0 && t.min <= v ? 'on' : ''}" data-tier="${t.name}"></i>`).join('')
  function card(s, id) {
    const d = NPCS[id], v = affOf(s, id), t = AFF_TIERS.filter(x => x.min <= v).pop()
    const today = talkedToday(s, id)
    const line = s.npc?.[id]?.lastLine || ''
    return `<article class="npc-card${today ? ' talked' : ''}">
  <div class="npc-portrait"><b>${d.glyph}</b><span class="npc-pips">${pips(v)}</span></div>
  <header><h2>${d.name}</h2><small>${d.role} · ${d.place}</small></header>
  <p class="npc-tier"><b>${t.name}</b><span>${t.word}</span></p>
  <p class="npc-say">${line ? `“${esc(line)}”` : `<em>（${d.name}今日还没见着你）</em>`}</p>
  <p class="npc-hint">${today ? '今日已经叙过话了，明日再来' : affHint(s, id)}</p>
  <button data-npc="${id}" ${today ? 'disabled' : ''}>${today ? '明日再来' : '上前叙话'}</button>
</article>`
  }
  function favors(s) {
    const cut = feeCutOf(s), tribute = tributeOpen(s)
    const pending = (s.quests?.active || []).filter(q => q.from === 'zhanggui')
    return [
      cut
        ? `连财念着交情，替你把手续费抹去 ${cut} 文——市场现为 ${feeOf(s, 'market')} 文、粮店 ${feeOf(s, 'store')} 文一笔（原 ${CHANNELS.market.fee} / ${CHANNELS.store.fee} 文）。`
        : '连财还没跟你熟到肯抹零头。多往粮店走动，交情到「交好」他自会开口。',
      tribute
        ? '王掌柜把御贡米专线搭上了：上等（优/特优）稻米可直送酒楼，按高端价再上浮五成收。'
        : '与王掌柜处到「知交」，他会替你搭上御贡米专线，酒楼上等稻米按高端价上浮五成收。',
      pending.length
        ? `手上还压着 ${pending.length} 张席面单：${pending.map(q => QUEST_MAP[q.id]?.title || q.id).join('、')}——在田页的差事板上交差。`
        : '手上没有掌柜的席面单。与王掌柜交好（交情到「交好」）之后，他每季会给你留一张。',
      '常四伯处到「交好」，每季塞一份稻种给你；栓子闲聊时会翻出旧纸（耕织图残片），或替你在乡里说句好话。'
    ]
  }
  function render(msg = '') {
    const s = getState()
    if (msg) message = msg
    const ready = readyCount(s)
    const cut = feeCutOf(s), tribute = tributeOpen(s)
    const pending = (s.quests?.active || []).filter(q => q.from === 'zhanggui')
    root.innerHTML = `<div class="npc-heading"><span>上庄镇 · 街坊四邻</span><h1>今日串门</h1>
<button class="space-switch" data-npc-home>← 回田里</button>
<p>第 ${s.year} 年 · 四邻是活人，不是面板：每个游戏日可叙话一次，交情攒在日子里，急不来。</p></div>
<section class="npc-stats">
<div><span>今日可叙话</span><strong>${ready} / ${NPC_ORDER.length}</strong><small>${ready ? '过一日才能再见' : '今日都见过了'}</small></div>
<div><span>市场手续费</span><strong>${feeOf(s, 'market')} 文</strong><small>${cut ? `连财抹去 ${cut} 文` : `原 ${CHANNELS.market.fee} 文一笔`}</small></div>
<div><span>御贡米专线</span><strong>${tribute ? '已通' : '未通'}</strong><small>${tribute ? '酒楼上等稻米上浮五成' : '与王掌柜交心后可通'}</small></div>
<div><span>掌柜席面单</span><strong>${pending.length} 张</strong><small>${pending.length ? pending.map(q => QUEST_MAP[q.id]?.title || q.id).join('、') : '眼下没有'}</small></div>
</section>
<div class="npc-actions"><button class="npc-primary" data-npc-all ${ready ? '' : 'disabled'}>${ready ? '今日挨家走一趟' : '今日已走遍四邻'}</button><small>挨家走一趟＝把今天还没见的街坊一次串完，省得来回点。</small></div>
<div class="npc-grid">${NPC_ORDER.map(id => card(s, id)).join('')}</div>
<section class="npc-favors"><h2>人情往来</h2><ul>${favors(s).map(t => `<li>${t}</li>`).join('')}</ul></section>
<div class="npc-message" role="status">${esc(message)}</div>`
    root.querySelectorAll('[data-npc]').forEach(b => b.onclick = () => dispatch({ type: 'npc:talk', npc: b.dataset.npc }))
    root.querySelector('[data-npc-all]')?.addEventListener('click', () => dispatch({ type: 'npc:talk-all' }))
    root.querySelector('[data-npc-home]')?.addEventListener('click', () => goHome?.())
  }
  return { render }
}
