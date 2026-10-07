import {VARIETIES,ERAS,UNLOCK_COST,HYBRID_COST,FRAGMENT_SLOT_SOURCE,FRAGMENT_SOURCE_LABEL,GENGZHI_SCENES,SHARD_KIND_LABEL,shardCount,requirementMiss,unlockReqText,houseEffects} from './variety-engine.js'
import {sfx} from './audio.js'
const SEASON_NAME={spring:'春',summer:'夏',autumn:'秋',winter:'冬'}
export function createVariety({getState,dispatch}){
 function render(message=''){
  const s=getState(),b=s.varietyBook||{era:'清代',unlocked:[],harvested:[],shards:{},unlockInfo:{},culture:0,hybrid:false,achievement:false,artFragments:[],artRestored:false}
  const dim=s.ecology<30
  const progress=b.unlocked.length/13
  const canSeed=s.season==='spring'&&!s.plots.some(Boolean)
  // 老宅增益在这页也要算进去：档案室减送档费，基因库减杂交材料（Q-9.14）
  const ef=houseEffects(s)
  const fee=Math.round(UNLOCK_COST.wen*ef.feeMul)
  const canAfford=(s.sales?.wen||0)>=fee&&s.rice>=UNLOCK_COST.rice
  const hybridWen=Math.round(HYBRID_COST.wen*ef.hybridMul),hybridRice=Math.round(HYBRID_COST.rice*ef.hybridMul)
  const cards=VARIETIES.map(v=>{
   const ok=b.unlocked.includes(v.id),grown=(b.harvested||[]).includes(v.id),available=ERAS.indexOf(v.era)<=ERAS.indexOf(b.era)
   const miss=ok?null:requirementMiss(v,b,s),req=unlockReqText(v)
   const u=b.unlockInfo?.[v.id],n=shardCount(b,v.id),full=n===3
   const locked=!available&&!b.timeTravel
   const label=ok?'已收录':locked?'时代未到':!grown?'未获种':miss?'条件未足':!canAfford?'收录资源不足':'可收录'
   const tip=ok?'':locked?`此品种尚未现世，须待${v.era}`:!grown?'需先种植并收获该品种':miss?miss:req?`收录条件：${req}`:'满足条件，可送档收录'
   const pips=['plant','process','trade'].map(k=>`<i class="${b.shards?.[v.id]?.[k]?'got':''}">${SHARD_KIND_LABEL[k]}</i>`).join('')
   return `<article class="variety-card ${ok?'unlocked':''}${ok&&dim?' dimmed':''}" ${ok&&dim?`title="生态低洼（${s.ecology}），档案暂不可查；生态回升后自动复亮。"`:''}><div class="variety-mark${ok ? '' : ' locked'}"><img src="./v-${v.id.toLowerCase()}.jpg" alt="${v.name}" loading="lazy" onerror="this.remove()">${ok ? '' : '<b class="mark-lock">？</b>'}</div><div><h2>${v.name}</h2><p>${ok?`${v.period} · ${v.origin}${u?`<br>收录于 第${u.year}年 · ${SEASON_NAME[u.season]}季`:''}`:`解锁时代：${v.era}`}</p><dl><dt>生育期</dt><dd>${v.growth}</dd><dt>亩产</dt><dd>${v.yield} kg</dd><dt>品质</dt><dd>${v.quality}</dd><dt>属性</dt><dd>${v.attr}</dd></dl><p class="shard-pips">档案碎片 ${pips}<span>（${n} / 3）</span></p>${ok&&!full?'<p class="archive-missing">档案残缺，补齐种植 / 加工 / 交易三片碎片后可读完整历史。</p>':ok&&full?`<p class="archive-full">${v.hist}</p>`:!ok&&req?`<p class="req-hint">收录条件：${req}</p>`:''}<div class="variety-actions"><button data-variety="${v.id}" ${ok||locked||!grown||miss||!canAfford?'disabled':''} title="${tip}">${label}</button><button data-seed-variety="${v.id}" ${!canSeed||locked||(v.id==='jingyue1'&&!b.hybrid)||s.riceVariety===v.id?'disabled':''} title="春季未插秧时可指定本年全田试种品种">${s.riceVariety===v.id?'本年试种':v.id==='jingyue1'&&!b.hybrid?'需杂交育种':'选作本年试种'}</button></div></div></article>`}).join('')
  const artN=b.artFragments?.length||0
  const tiles=Array.from({length:20},(_,i)=>{
   const got=b.artFragments?.includes(i),sc=GENGZHI_SCENES[i],src=FRAGMENT_SOURCE_LABEL[FRAGMENT_SLOT_SOURCE[i]]
   return `<button type="button" class="fragment-tile ${got?'found':''}" data-scene="${i}" title="${got?`第${i+1}幅「${sc.name}」· 已修复，点开重温`:`尚未寻回 · ${src}可得`}">${got?sc.name:'？'}</button>`}).join('')
  const scrollStage=b.artRestored?`<div class="scroll-stage" id="scroll-stage"><div class="scroll-paper playing"><img src="./kanzhi-tu.jpg" alt="京西稻耕织图全卷" onerror="this.remove()"><div class="scroll-fallback"><i></i><p>《京西稻耕织图》二十幅复齐全卷：自浸种至入仓，耕耘收藏尽在纸上。<br>（待补真迹：将古画图片存为 kanzhi-tu.jpg（与 index.html 同目录）即自动替换此画卷）</p></div></div><button type="button" data-scroll="replay">重看展开</button></div>`:''
  document.querySelector('#variety-root').innerHTML=`<div class="book-heading"><span>御贡图鉴 · 京西稻十三珍</span><h1>老品种活态谱系</h1><p>收集进度 ${b.unlocked.length} / 13 · 文化碎片 ${b.culture} · 当前时代 ${b.era}</p></div><div class="gengzhi-bar"><span>《京西稻耕织图》修复进度：${artN} / 20</span><div class="gengzhi-track"><i style="width:${artN/20*100}%"></i></div></div><div class="book-progress"><i style="width:${progress*100}%"></i></div><section class="era-line">${ERAS.map(e=>`<button data-era="${e}" class="${e===b.era?'active':''}" ${ERAS.indexOf(e)>ERAS.indexOf(b.era)+1?'disabled':''}>${e}</button>`).join('')}</section>  <section class="breeding-card"><h2>农科所 · 杂交育种</h2><p>投入 ${hybridWen} 文 + ${hybridRice} kg 稻米${ef.hybridMul<1?`（基因库已把材料折到 ${Math.round(ef.hybridMul*100)}%）`:''}，消耗水源三百粒与越路早生（图鉴中的越富系三）亲本，培育京越一号。</p><button data-book="hybrid" ${b.hybrid?'disabled':''}>${b.hybrid?'杂交育种已解锁':'投入资源解锁'}</button></section><section class="variety-grid">${cards}</section><p class="variety-cost-hint">收获过的品种才能收录，收录即记入档案时间（第 N 年 · 某季）。品种档案分种植 / 加工 / 交易三片碎片，靠真实玩法随机掉落，集齐三片才显示完整历史。生态低于 30 时已收录档案变灰「暂不可查」，生态回升自动复亮、记录不删。春季未插秧时可选本年试种品种；每次送档费用：${fee} 文 + ${UNLOCK_COST.rice} kg 稻米${ef.feeMul<1?`（老宅档案室已把送档费折到 ${Math.round(ef.feeMul*100)}%）`:''}（当前持有 ${(s.sales?.wen||0).toLocaleString()} 文 · ${s.rice} kg）。</p><section class="art-puzzle"><h2>《京西稻耕织图》修复</h2><p>二十幅各有名目，只能靠玩出来：种植收获、作坊加工、市场交易、社交认养、穿越剧情各掉一组，不能自己点开。已修复的可点开重温画面。</p><div class="puzzle-grid">${tiles}</div>${scrollStage||`<div class="book-achievement pending">卷轴未补全，尚缺 ${20-artN} 幅。集齐二十幅将开启「上庄镇申遗」的终章线索。</div>`}</section>${b.artRestored?'<div class="book-achievement">卷轴已补全 · 称号：京西稻文化遗产守护者 · 申遗线索已入手</div>':''}${b.achievement?'<div class="book-achievement">成就解锁：京西稻活态基因库</div>':''}<div class="book-message" role="status">${message}</div><div class="scene-overlay" id="scene-overlay" hidden><div class="scene-card"><h3 id="scene-name"></h3><div class="scene-stage playing" id="scene-stage"><div class="scene-layer sky"></div><div class="scene-layer hills"></div><div class="scene-layer field"></div><div class="scene-layer water"></div><div class="scene-layer folk"></div></div><p id="scene-story"></p><div class="scene-actions"><button type="button" data-scene="replay">重看动画</button><button type="button" data-scene="close">收起</button></div></div></div>`
  const overlay=document.querySelector('#scene-overlay')
  const openScene=i=>{const sc=GENGZHI_SCENES[i];if(!sc)return;document.querySelector('#scene-name').textContent=`第${i+1}幅 · ${sc.name}`;document.querySelector('#scene-story').textContent=sc.story;overlay.hidden=false;const st=document.querySelector('#scene-stage');st.classList.remove('playing');void st.offsetWidth;st.classList.add('playing');sfx('gengzhi');}
  document.querySelectorAll('[data-scene]').forEach(x=>x.onclick=()=>{const v=x.dataset.scene;if(v==='close')overlay.hidden=true;else if(v==='replay'){const i=(document.querySelector('#scene-name').textContent.match(/第(\d+)幅/)||[])[1];if(i)openScene(Number(i)-1);}else openScene(Number(v));});
  document.querySelectorAll('[data-scroll]').forEach(x=>x.onclick=()=>{const p=document.querySelector('.scroll-paper');if(p){p.classList.remove('playing');void p.offsetWidth;p.classList.add('playing');}sfx('gengzhi');});
  document.querySelectorAll('[data-seed-variety]').forEach(x=>x.onclick=()=>dispatch({type:'book:seed',id:x.dataset.seedVariety}));document.querySelectorAll('[data-era]').forEach(x=>x.onclick=()=>dispatch({type:'book:era',era:x.dataset.era}));document.querySelectorAll('[data-variety]').forEach(x=>x.onclick=()=>dispatch({type:'book:unlock',id:x.dataset.variety}));document.querySelector('[data-book="hybrid"]')?.addEventListener('click',()=>dispatch({type:'book:hybrid'}));
 }
 return {render};
}
