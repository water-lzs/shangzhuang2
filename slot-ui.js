// 包 A（第十三轮）· 档位选择 / 管理界面
// 首次进入（没有 ?demo=1 且未选过档位）时盖在场景上，选完刷新进游戏。
// 每个档位给：改名 / 导出 JSON / 导入 JSON / 删除（二次确认）。试玩局（demo）完全不经过这里。
import { SLOT_COUNT, slotSummaries, pickSlot, writeSlot, slotRaw, slotKey, currentSlot, clearSlotPick, storage } from './storage.js'
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function timeWord(ts) {
  if (!ts) return '—'
  const d = Date.now() - ts
  if (d < 60e3) return '刚刚'
  if (d < 3600e3) return Math.floor(d / 60e3) + ' 分钟前'
  if (d < 86400e3) return Math.floor(d / 3600e3) + ' 小时前'
  return Math.floor(d / 86400e3) + ' 天前'
}
const SEASON_CN = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }

export function mountSlotPicker({ parse, onPicked, closable = false }) {
  let confirmDel = 0, notice = ''
  // 再叫一次（工具栏「存档」）时先收掉上一份，免得同屏叠两张。
  document.querySelector('#slot-picker')?.remove()
  const host = document.createElement('div')
  host.id = 'slot-picker'
  document.body.append(host)
  // 给 index.html 的 boot-guard 看：页面没「起跑」是因为停在档位界面，不是文件没传全。
  window.__JINGXI_SLOT_PICKER = true
  const enter = i => { pickSlot(i); onPicked() }

  function download(i, name) {
    const raw = slotRaw(i)
    if (!raw) return
    const blob = new Blob([raw], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `京西稻存档-${name}-档位${i}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }
  function rename(i, el) {
    const card = host.querySelector(`[data-slot-card="${i}"]`)
    if (card.querySelector('.slot-rename')) return
    const cur = (parse(slotRaw(i)) || {}).profile?.name || '林宇的田'
    const row = document.createElement('div')
    row.className = 'slot-rename'
    row.innerHTML = `<input maxlength="16" value="${esc(cur)}" aria-label="新名字"><button data-do="rename-ok">改好</button><button data-do="rename-no">算了</button>`
    card.append(row)
    const input = row.querySelector('input')
    input.focus(); input.select()
    row.querySelector('[data-do="rename-ok"]').onclick = () => {
      const name = input.value.trim().slice(0, 16) || cur
      const raw = slotRaw(i)
      try {
        const s = JSON.parse(raw)
        s.profile = { ...(s.profile || {}), name }
        if (writeSlot(i, JSON.stringify(s))) { notice = `第 ${i} 号档位已改名为「${name}」。` } else notice = '改名写不进去：浏览器存储可能满了。'
      } catch { notice = '这份存档读不出来，改不了名。' }
      render()
    }
    row.querySelector('[data-do="rename-no"]').onclick = render
  }
  function importTo(i) {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = '.json,application/json'
    inp.onchange = () => {
      const f = inp.files && inp.files[0]
      if (!f) return
      const rd = new FileReader()
      rd.onload = () => {
        const s = parse(String(rd.result))
        if (!s) { notice = '这份文件不是有效的京西稻存档，没有导入。'; render(); return }
        if (writeSlot(i, String(rd.result))) notice = `导入成功：第 ${i} 号档位现在是「${(s.profile && s.profile.name) || '林宇的田'}」，第 ${s.year} 年。`
        else notice = '导入写不进去：浏览器存储可能满了。'
        render()
      }
      rd.readAsText(f)
    }
    inp.click()
  }
  function remove(i) {
    if (confirmDel !== i) { confirmDel = i; render(); return }
    const wasCurrent = currentSlot() === i
    storage.remove(slotKey(i))
    if (wasCurrent) clearSlotPick()
    confirmDel = 0
    notice = wasCurrent
      ? `第 ${i} 号档位已删除——这正是你在玩的那一档，刷新后会回到选档界面。`
      : `第 ${i} 号档位已删除，这一格空出来了。`
    render()
  }

  function render() {
    const slots = slotSummaries(parse)
    host.innerHTML = `<div class="slot-sheet">
<div class="slot-head"><span>穿越京西稻 · 存档</span><h1>谁在种这块田？</h1><p>最多四个档位，各自记各自的年景。试玩局（?demo=1）不占档位。</p></div>
${notice ? `<div class="slot-notice" role="status">${esc(notice)}</div>` : ''}
<div class="slot-grid">${slots.map(sl => {
      if (sl.empty) return `<article class="slot-card empty" data-slot-card="${sl.slot}"><header><b>第 ${sl.slot} 号档位</b><small>空</small></header><p class="slot-line">这一格还没有故事。</p><button data-do="enter" data-slot="${sl.slot}">开新档 →</button></article>`
      if (sl.damaged) return `<article class="slot-card damaged" data-slot-card="${sl.slot}"><header><b>第 ${sl.slot} 号档位</b><small>读不出</small></header><p class="slot-line">这格存档坏了。可以从别处导出的 JSON 覆盖回来，或删掉重开。</p><div class="slot-ops"><button data-do="import" data-slot="${sl.slot}">导入覆盖</button><button data-do="remove" data-slot="${sl.slot}">删除</button></div></article>`
      const busy = confirmDel === sl.slot
      const mine = currentSlot() === sl.slot
      return `<article class="slot-card" data-slot-card="${sl.slot}">
<header><b>${esc(sl.name)}</b><small>第 ${sl.slot} 号档位${mine ? ' · 正在玩' : ''}</small></header>
<dl class="slot-facts"><div><dt>年景</dt><dd>第 ${sl.year} 年 · ${SEASON_CN[sl.season] || ''}</dd></div><div><dt>生气</dt><dd>${sl.ecology} / 100</dd></div><div><dt>银钱</dt><dd>${Number(sl.wen || 0).toLocaleString()} 文</dd></div><div><dt>上次下田</dt><dd>${timeWord(sl.savedAt)}</dd></div></dl>
<button class="slot-enter" data-do="enter" data-slot="${sl.slot}">接着种 →</button>
<div class="slot-ops"><button data-do="rename" data-slot="${sl.slot}">改名</button><button data-do="export" data-slot="${sl.slot}">导出</button><button data-do="import" data-slot="${sl.slot}">导入</button><button data-do="remove" data-slot="${sl.slot}" class="${busy ? 'arming' : ''}">${busy ? (mine ? '再点一次：真的删掉这一档' : '再点一次确认删除') : '删除'}</button></div>
</article>`
    }).join('')}</div>
<p class="slot-note">导出的是一份 JSON 文件，可以拷去别的电脑再「导入」——这是纯静态页面能做到的全部同步方式。</p>
${closable ? '<div class="slot-close"><button data-do="close">先不换，回田里去</button></div>' : ''}
</div>`
    host.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.slot)
      const act = b.dataset.do
      if (act === 'enter') enter(i)
      else if (act === 'rename') rename(i, host)
      else if (act === 'export') download(i, (parse(slotRaw(i)) || {}).profile?.name || '林宇的田')
      else if (act === 'import') importTo(i)
      else if (act === 'remove') remove(i)
      else if (act === 'close') host.remove()
    })
  }
  render()
  return { host }
}
