import {CHAPTERS,chapterLimit} from './story-engine.js'
import {TECH_IDS} from './tech-engine.js'
import {seedTotal,omenOf,reputationOf,termInfoOf,termLeftOf,activeQuests,hotspotList,hotspotSeen,hotspotLast,finaleWordsOf,finaleReadyOf,readSave} from './farm-engine.js'
import {mountSlotPicker} from './slot-ui.js'
const $=s=>document.querySelector(s);
export function mountImmersive(game){
 document.body.classList.add('immersive');
 const shell=document.createElement('div');shell.id='world-shell';
 shell.innerHTML=`<div id="town-map" hidden><div id="town-art"><img id="town-img" src="./town-map.jpg" alt="上庄镇俯视地图"></div><div id="town-fallback" hidden>小镇地图未能加载：请确认 town-map.jpg 与 index.html 在同一目录。</div></div><div id="world-status"></div><div id="world-points"></div><div id="world-toolbar"><button data-world="travel">去镇上 →</button><button data-world="variety">御贡图鉴</button><button data-world="system">天工开物</button><button data-world="ending">四时终章</button><button data-world="guide">新手引导</button><button data-world="audio">音效</button><button data-world="slot">存档</button></div><button id="close-panel" hidden>收起面板 ×</button><div id="world-hint"></div><section id="discover-card" hidden aria-live="polite"></section><section id="guide-card" hidden aria-label="新手引导"><small id="guide-step"></small><h2 id="guide-title"></h2><p id="guide-copy"></p><button id="guide-do">开始</button><button id="guide-skip">稍后再看</button></section>`;
 $('#app').append(shell);
 (()=>{const img=$('#town-img');if(!img)return;const fail=()=>{const f=$('#town-fallback');if(f)f.hidden=false;};if(img.complete&&img.naturalWidth===0)fail();img.addEventListener('error',fail);})();
 const close=()=>{document.body.classList.remove('panel-open','system-open');$('#close-panel').hidden=true;};
 function open(activity){close();if(activity==='system')document.body.classList.add('system-open');else{game.setActivity(activity);document.body.classList.add('panel-open');}$('#close-panel').hidden=false;}
 function travel(space){close();game.switchSpace(space);}
 $('#close-panel').onclick=close;
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(guideActive)finish(false);else close();}});
 const points={home:[['十亩御田','farm',49,58],['老宅 · 系统','system',23,38]],town:[['老宅 · 回家','home',26,27],['御米作坊','processing',23,69],['集市 · 销售','sales',51,46],['酒楼 · 高端交易','restaurant',76,33],['社交驿站','social',67,76]]};
 function pickChannel(id){
  // 首选走 farm-ui 暴露的 setSaleChannel：直接设渠道并刷新，不依赖「找到按钮再 click」。
  // 按钮在品质不够（酒楼只收优等）时是 disabled 的，click 会静默失败 —— 那正是上一版
  // 「点了酒楼还停在市场」的第二个原因。旧的重试逻辑保留为兜底。
  if(game.setSaleChannel&&game.setSaleChannel(id))return;
  let tries=0;
  const go=()=>{const btn=document.querySelector(`[data-sale-channel="${id}"]`);if(btn&&!btn.disabled){btn.click();return;}if(++tries<8)requestAnimationFrame(go);};
  go();
 }
 let lastSpace,lastWen;
 // —— 包 J2：镇上四处可停下脚的地方（酒坛/石碑/集市木棚/桥上石狮）——
 // 位置按镇图上的地标手调；徽标比 world-point 小一圈，不抢主入口的视线。
 const SPOT_POS={winejar:[14,60],stele:[40,17],stall:[62,57],lion:[85,76]};
 // 包 M4：「上庄镇界」石碑的历史简介（150 字内，讲京西稻的地理与贡米来历）。
 const TOWN_STELE_TEXT='上庄镇，京西水田的心口。玉泉山诸泉汇成玉河，绕镇而过，泉水凉而清，养出的稻米粒色如玉。清康熙年间，康熙帝南巡带回早熟稻种，在玉泉山下试种得成，赐名「御稻米」，自此京西稻田岁岁纳贡。镇中集米街、工坊、老宅三片皆因稻而兴；乾隆年间又引紫金箍等良种，御田的米香一直传到今天。';
 function buildTownSpots(){
  const host=$('#town-art');if(!host||document.getElementById('town-spots'))return;
  const wrap=document.createElement('div');wrap.id='town-spots';
  for(const def of hotspotList('town')){
   const p=SPOT_POS[def.id];if(!p)continue;
   const b=document.createElement('button');b.className='hs-tag';b.dataset.spot=def.id;b.dataset.done='0';
   b.style.left=p[0]+'%';b.style.top=p[1]+'%';b.innerHTML=`<i></i>${esc(def.name)}`;
   b.title=def.name+' · 停下来看看';
   b.onclick=()=>{if(!game.dispatch||!game.dispatch({type:'hotspot:touch',id:def.id}))toastText('这里眼下没什么可看的。');};
   wrap.append(b);
  }
  // —— 包 M4：官道两端。回家路牌直接动身；「上庄镇界」石碑讲一段京西稻的来历。——
  const road=document.createElement('button');road.className='hs-tag road-tag';road.style.left='9%';road.style.top='33%';
  road.innerHTML='<i></i>回家路牌 · 官道';road.title='沿着官道回家（赶路要费 5 点体力）';
  road.onclick=()=>travel('home');
  wrap.append(road);
  const boundary=document.createElement('button');boundary.className='hs-tag road-tag';boundary.style.left='92%';boundary.style.top='11%';
  boundary.innerHTML='<i></i>上庄镇界';boundary.title='镇口的界碑 · 讲讲京西稻的来历';
  boundary.onclick=()=>showDiscover({kind:'history',name:'上庄镇界',text:TOWN_STELE_TEXT,gains:['再点一下路牌就能回家']});
  wrap.append(boundary);
  host.append(wrap);
 }
 // 「今年探过了」只把徽标压淡，不消失——消失会让玩家以为自己记错了地方。
 function syncTownSpots(s){const wrap=document.getElementById('town-spots');if(!wrap)return;for(const b of wrap.querySelectorAll('.hs-tag'))b.dataset.done=hotspotSeen(s,b.dataset.spot)?'1':'0';}
 // 基准值在挂载时定一次：读档带进来的那条旧记录不该弹卡，但玩家进来之后点的第一下必须弹。
 // （写成「第一次遇到非空 last 才记基准」的话，进来时 last 本来就是空的，第一下会被当成旧记录吞掉。）
 let lastSpotKey='';
 (()=>{const L=hotspotLast(game.getState());lastSpotKey=L?String(L.seq):'';})();
 function checkDiscover(s){
  const L=hotspotLast(s);if(!L)return;
  const key=String(L.seq);
  if(key===lastSpotKey)return;lastSpotKey=key;
  // 这一次没收获（只是看了看 / 今年看过了）：先收起上一张卡，再给一句轻提示。
  // 否则屏幕上会挂着上一次的「得手」，玩家会以为刚才那一下也捞到了东西。
  if(L.kind==='idle'||L.kind==='cool'){hideDiscover();toastText(L.text);return;}
  showDiscover(L);
 }
 function hideDiscover(){const card=$('#discover-card');if(!card)return;clearTimeout(showDiscover.timer);card.classList.remove('show');card.hidden=true;}
 function showDiscover(L){
  const card=$('#discover-card');if(!card)return;
  const kick={wen:'得手',fragment:'拾得残画',chat:'乡里闲谈',quest:'有人上门',history:'官道石碑'}[L.kind]||'一桩小事';
  const seal={wen:'钱',fragment:'画',chat:'谈',quest:'差',history:'碑'}[L.kind]||'事';
  card.innerHTML=`<span class="dc-seal">${seal}</span><div class="dc-body"><small class="dc-kicker">${esc(kick)} · ${esc(L.name)}</small><p class="dc-text">${esc(L.text)}</p>${L.gains&&L.gains.length?`<p class="dc-gains">${L.gains.map(esc).join('　·　')}</p>`:''}</div><button class="dc-close" aria-label="收起">收起 ×</button>`;
  card.hidden=false;card.classList.add('show');
  clearTimeout(showDiscover.timer);
  showDiscover.timer=setTimeout(hideDiscover,11000);
  card.querySelector('.dc-close').onclick=hideDiscover;
 }
 const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 function sync(){const s=game.getState();buildTownSpots();syncTownSpots(s);checkDiscover(s);document.body.dataset.space=s.space;$('#town-map').hidden=s.space!=='town';
 const wen=s.sales?.wen||0,artN=s.varietyBook?.artFragments?.length||0;
 const unread=CHAPTERS.some((c,i)=>i<=chapterLimit(s)&&(s.story?.archive?.pages[i]||0)<c.paragraphs.length),researching=TECH_IDS.some(id=>s.story?.tech?.[id]?.state==='researching');$('[data-world="system"]').textContent=unread?'四时档案 · 待阅':researching?'天工 · 研发中':'档案 · 天工开物';
 const rep=reputationOf(s),tLeft=termLeftOf(s),qN=activeQuests(s).length;
 $('#world-status').innerHTML=`<span class="ws-line">${s.space==='town'?'上庄镇 · 烟火人间':'家 · 四时御田'}　｜　第 ${s.year} 年 · ${{spring:'春',summer:'夏',autumn:'秋',winter:'冬'}[s.season]}　｜　年景 ${omenOf(s).name}　｜　耕织图 <b>${artN} / 20</b></span><span class="ws-line">节气 <b>${termInfoOf(s).name}</b>${tLeft>0?`（剩 ${tLeft} 日）`:'（已误期）'}　｜　声望 <b>${rep}</b> / 100${qN?`　｜　差事 <b>${qN}</b> 件`:''}</span><span class="ws-line">稻米 <b>${s.rice.toLocaleString()}</b> kg　｜　体力 <b>${s.stamina}</b>　｜　种子 <b>${seedTotal(s)}</b> 份</span><span class="ws-line ws-wallet">银钱 <b id="wallet-wen">${wen.toLocaleString()}</b> 文</span><span class="ws-line ws-whisper">四时心印　｜　${esc(finaleWordsOf(s).ecology)}　｜　${esc(finaleWordsOf(s).moral)}${finaleReadyOf(s)&&!s.finale?.choice?'　｜　<b class="ws-call">朝廷来收贡米</b>':''}</span>`;
 const wallet=$('#wallet-wen');if(wallet&&lastWen!==undefined&&lastWen!==wen){wallet.classList.add('flash');setTimeout(()=>wallet.classList.remove('flash'),900);}
 lastWen=wen;
 $('#world-hint').textContent=s.space==='town'?'拖动地图 · 滚轮缩放 · 点击地图上的标签进入玩法 · 镇上的旧物件也可以停下来看看':'拖动环视 · 滚轮缩放 · 点击画面上的「十亩御田」标签进入种植 · 田边与老宅的旧物件也可以点一点';
 $('[data-world="travel"]').textContent=s.space==='town'?'← 回家':'去镇上 →';
 if(lastSpace===s.space)return;lastSpace=s.space;
 const target=s.space==='town'?$('#town-art'):$('#world-points');$('#town-art').querySelectorAll('button.world-point').forEach(b=>b.remove());$('#world-points').replaceChildren();
 for(const [name,action,x,y] of points[s.space]||points.home){const b=document.createElement('button');b.className='world-point';b.dataset.point=action;b.style.left=x+'%';b.style.top=y+'%';b.textContent=name;b.onclick=()=>{if(action==='home')travel('home');else{open(action==='restaurant'?'sales':action);if(action==='restaurant')pickChannel('restaurant');}};target.append(b);}
 }
 $('#world-toolbar').onclick=e=>{const a=e.target.dataset.world;if(!a)return;if(a==='travel')travel(game.getState().space==='town'?'home':'town');else if(a==='guide'){showGuide(0);}else if(a==='audio'){const on=window.jingxiAudio?.toggle();e.target.textContent='音效 '+(on===false?'✕':'✓');toastText(on===false?'音效已关闭':'音效已开启（流水、鸟鸣、风声）');}else if(a==='slot'){openSlotSheet();}else open(a);};
 // —— 包 A：玩到一半想换个人/换个档位，从工具栏这里叫出档位界面（选完刷新进游戏）——
 function openSlotSheet(){mountSlotPicker({parse:readSave,closable:true,onPicked:()=>location.reload()});}
 function toastText(t){const el=document.querySelector('#toast');if(!el)return;el.textContent=t;el.classList.add('show');clearTimeout(toastText.t);toastText.t=setTimeout(()=>el.classList.remove('show'),2600);}
 (()=>{let off=false;try{off=localStorage.getItem('jingxi-audio-on')==='off';}catch{}const b=document.querySelector('[data-world="audio"]');if(b&&off)b.textContent='音效 ✕';})();
 const observer=new MutationObserver(()=>{sync();if(guideActive)scheduleGuide();});observer.observe($('#farm-root'),{attributes:true,attributeFilter:['data-state']});
 let scale=1,x=0,y=0,drag=null;const map=$('#town-map'),art=$('#town-art');const transform=()=>art.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
 map.onwheel=e=>{e.preventDefault();scale=Math.max(1,Math.min(2.4,scale-e.deltaY*.001));const r=map.getBoundingClientRect();x=Math.max(-Math.max(0,(art.offsetWidth*scale-r.width)/2),Math.min(Math.max(0,(art.offsetWidth*scale-r.width)/2),x));y=Math.max(-Math.max(0,(art.offsetHeight*scale-r.height)/2),Math.min(Math.max(0,(art.offsetHeight*scale-r.height)/2),y));transform();};
 map.onpointerdown=e=>{if(e.target.closest('button'))return;drag=[e.clientX-x,e.clientY-y];map.setPointerCapture(e.pointerId);};
 map.onpointermove=e=>{if(!drag)return;const r=map.getBoundingClientRect();x=Math.max(-Math.max(0,(art.offsetWidth*scale-r.width)/2),Math.min(Math.max(0,(art.offsetWidth*scale-r.width)/2),e.clientX-drag[0]));y=Math.max(-Math.max(0,(art.offsetHeight*scale-r.height)/2),Math.min(Math.max(0,(art.offsetHeight*scale-r.height)/2),e.clientY-drag[1]));transform();};map.onpointerup=map.onpointercancel=()=>drag=null;
 const guideKey='jingxi-world-guide-v2',card=$('#guide-card'),ring=document.createElement('div');ring.id='guide-ring';ring.hidden=true;ring.setAttribute('aria-hidden','true');document.body.append(ring)
 const style=document.createElement('style');style.textContent=`#guide-card[hidden],#guide-ring[hidden]{display:none!important}#guide-card{position:fixed;inset:auto 12px 12px!important;margin:0 auto;width:min(780px,calc(100% - 24px))!important;max-height:44dvh;overflow:auto;padding:12px 16px!important;z-index:40}#guide-card h2{font-size:20px;margin:4px 0}#guide-card p{margin:4px 0}#guide-card button{padding:7px 10px}#guide-card details{font-size:12px;line-height:1.7}#guide-card details p{white-space:pre-line}#guide-ring{position:fixed;box-sizing:border-box;border:3px solid #e8b956;border-radius:7px;box-shadow:0 0 0 3px #273d34aa;z-index:35;pointer-events:none;transition:top .12s,left .12s,width .12s,height .12s}.guide-running.immersive.panel-open #app>section:not([hidden]),.guide-running.immersive.system-open #system-panel{bottom:calc(var(--guide-height,180px) + 28px)!important}.guide-running #world-toolbar{visibility:hidden}.guide-running #world-hint{display:none}.guide-example{border:1px dashed #957d49;padding:12px;margin:12px 0;color:#344b3b;background:#fff5d9;font-size:13px;line-height:1.8}.guide-example strong{display:block}.guide-demo-lane{height:34px;position:relative;border:1px solid #a78d51;overflow:hidden}.guide-demo-lane:before{content:'';position:absolute;left:50%;height:100%;border-left:3px solid #846826}.guide-demo-lane i{position:absolute;top:10px;width:12px;height:12px;border-radius:50%;background:#ad8228;animation:guide-note 2s linear infinite}@keyframes guide-note{from{left:100%}to{left:0}}@media(prefers-reduced-motion:reduce){#guide-ring{transition:none}.guide-demo-lane i{animation:none;left:50%}}`;document.head.append(style)
 // —— 包 J2：镇上旧物的徽标与「发现卡」的样式（与沉浸层其它浮层同一套金/墨配色）——
 const spotStyle=document.createElement('style');spotStyle.textContent=`#town-spots{position:absolute;inset:0;pointer-events:none}.hs-tag{position:absolute;transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border:1px solid #d9bd7d99;border-radius:999px;background:#243026cc;color:#f2e3bb;font:12px 'Microsoft YaHei';cursor:pointer;pointer-events:auto;transition:border-color .18s,box-shadow .18s,background .18s,opacity .18s}.hs-tag i{width:6px;height:6px;border-radius:50%;background:#d9bd7d;display:block}.hs-tag:hover,.hs-tag:focus-visible{border-color:#f0cd76;background:#3b2f1ce8;box-shadow:0 0 0 2px #e8b95655,0 0 16px #e8b95644;color:#fff4d5;outline:none}.hs-tag:hover i{background:#ffd98a;box-shadow:0 0 8px #ffd98a}.hs-tag[data-done="1"]{opacity:.5}#discover-card[hidden]{display:none!important}#discover-card{position:absolute;left:50%;bottom:104px;transform:translateX(-50%) translateY(12px);width:min(460px,calc(100% - 32px));box-sizing:border-box;display:flex;gap:12px;align-items:flex-start;padding:14px 16px;background:#fffae9f7;border:1px solid #bf9c58;border-radius:10px;box-shadow:0 14px 46px #14301f66;z-index:26;opacity:0;transition:opacity .3s,transform .3s;pointer-events:none}#discover-card.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}.dc-seal{flex:0 0 auto;width:34px;height:34px;border-radius:4px;background:#9c3a2c;color:#fff3d8;font:20px/34px KaiTi,serif;text-align:center;box-shadow:inset 0 0 0 1px #ffffff44}.dc-body{flex:1 1 auto;min-width:0}.dc-kicker{color:#8a6c34;font:11px 'Microsoft YaHei';letter-spacing:.5px}.dc-text{margin:4px 0 0;color:#33483a;font:14px/1.85 KaiTi,'Microsoft YaHei',serif}.dc-gains{margin:6px 0 0;color:#a8752b;font:12px 'Microsoft YaHei'}.dc-close{flex:0 0 auto;background:transparent;border:1px solid #c3ac79;color:#6c6146;border-radius:5px;padding:4px 8px;font-size:11px;cursor:pointer}@media(max-width:700px){#discover-card{bottom:96px;padding:12px}}`;document.head.append(spotStyle)
 card.innerHTML='<small id="guide-step"></small><h2 id="guide-title" tabindex="-1"></h2><p id="guide-copy"></p><details id="guide-detail"><summary>展开操作说明</summary><p></p></details><small id="guide-context" role="status"></small><div><button id="guide-back">上一步</button><button id="guide-do">继续</button><button id="guide-skip">稍后再看</button></div>'
 const farm=()=>{travel('home');open('farm');},go=i=>()=>showGuide(i)
 const steps=[
 {title:'认清家底',copy:'种子供播种，体力供劳作，稻米可加工出售；文是买种、雇工与解锁的银钱。',button:'学插秧',enter:()=>{travel('home');close();},target:'#world-status',action:go(1)},
 {title:'一亩一份',copy:'春季点标着“空地”的田块插秧：1份种子＝1亩地，每亩另耗3点体力。',button:'学巡田引水',enter:farm,target:'.farm-plots',detail:'点一块空地种一亩；也可在“本次插秧亩数”输入数量后确认。至少种一亩才能进入夏季。非春季只能查看，等来春再种。引导按钮只带路，实际插秧请点击田块。',action:go(2)},
 {title:'巡田引水',copy:'夏季巡田三回。玉泉清但费钱，河水省钱有虫卵风险，井水省力却伤生态。',button:'学除虫',enter:farm,target:()=>$('.farm-event[aria-label="水源选择"]')||$('[data-action="inspect"]'),host:'.journal-card',example:'夏季操作预览：点击“下田巡一趟”，遇到水源事件后先选水，再继续巡田。当前没有水源按钮时，这里仅作示意。',detail:'每回巡田耗7体力，湿度下降8。玉泉：15文、8体力，水质+60、生态+10；河水：4体力，水质+25，三成概率虫害+20；井水：2体力，水质+10、生态−8。引水均使湿度+20，数值限制在0—100。事件出现后必须处理，不能继续巡田。',action:go(3)},
 {title:'虫与田共处',copy:'农药除净虫却伤生态；投蟹花钱、养田且秋后得蟹；手捉不花钱但最费力。',button:'看秋收',enter:farm,target:'.farm-event[aria-label="虫害应对"]',host:'.journal-card',example:'虫害操作预览：夏季巡田遇虫后，从农药、稻田蟹、人工捉虫中选一项。示意不替你作选择，也不扣资源。',detail:'农药：8文、4体力，虫害归零、生态−30；投蟹：20文、10体力，虫害剩两成、生态+20，秋后每已种亩得1只蟹；手捉：30体力，虫害−50、生态+10。钱或体力不足会禁用选项，可用“雇短工”；无钱时每季可邻里换工一次。',action:go(4)},
 {title:'开仓看成色',copy:'秋收后点“开仓看看”，核对公斤数、品质和留种；品质由水、湿度、虫害、生态合算。',button:'识御贡图鉴',enter:()=>{farm();if(game.getState().harvested&&!$('.granary-now'))$('[data-action="granary"]')?.click();},target:()=>$('.granary-now')||$('[data-action="harvest"]'),host:'.journal-card',example:'秋收结算预览：先“收割并结算”，再“开仓看看”。公斤数是入库产量，品质色块可查看优劣；季末收入减开销是银钱净收益。未到秋季不会代你收割。',detail:'适湿分＝max(0,100−距60—80%湿度区间的差值×2)。品质分＝水质×40%＋适湿分×25%＋(100−虫害)×20%＋生态×15%，四舍五入到1位小数。先判特优：分≥90、水≥80、虫≤10、生态≥70；再判优：分≥78、水≥60、虫≤25、生态≥50；其后分≥58为良，其余劣。留种为亩数×60%四舍五入，非空田至少2份（库存有上限）。天灾可减产，品质不因此重算；净收益不是仓库公斤数。',action:go(5)},
 {title:'给稻留名字',copy:'收获过的品种才能收录。图鉴保留十三种稻的谱系，集残图也为终章留下线索。',button:'去镇上认路',enter:()=>open('variety'),target:'.variety-cost-hint',detail:'送档每种耗20文和30kg稻米。春季未播种时可在图鉴选本年试种品种，仍共用种子库存；时代未到的品种不能试种。京越一号需先完成杂交育种。二十片耕织图分别来自秋收、加工、交易、社交和剧情。',action:go(6)},
 {title:'上庄四处',copy:'作坊加工稻米，集市卖粮换文，酒楼做高端交易，社交驿站办认养与寄米。',button:'学作坊节奏',enter:()=>{travel('town');scale=1;x=0;y=0;transform();},target:()=>$('#town-art [data-point="processing"]'),detail:'可点地图标签进入对应玩法。酒楼有品质门槛，请看销售面板提示；社交驿站为本机模拟，不连接其他玩家。图上金框标出作坊入口。',action:go(7)},
 {title:'十二拍米香',copy:'先选路线、学配方、投米；亮点到金线时点制作或按空格，共12拍，别连点。',button:'看天工开物',enter:()=>open('processing'),target:'.rhythm-game',host:'.craft-card',example:'节奏示意（不扣米、不计分）：先学会配方，投米后点“开始节奏”。暂停或刷新可续做原批次。<div class="guide-demo-lane" aria-hidden="true"><i></i></div>',detail:'精准1分、合拍0.65分、漏拍0分；完成度＝命中分÷12，每次空击再扣2.5个百分点，最低0。完成度越高，成品越多，达到50%得1技艺点。生态古法节拍慢、判定宽；现代工业产量系数1.2、节拍快。第一次正式加工前路线可改，之后本局固定。此引导不会自动投米或开始节奏。',action:go(8)},
 {title:'天工留法',copy:'天工开物讲究投料慢研：立一个项目，投文与稻米，等上几季，七成成算——研成了才有器具下田。',button:'探终章',enter:()=>open('system'),target:'.tech-tree',detail:'每项科技两条路，择一而终，选定便不可反悔。分支会改亩产、收割体力、引水工钱与每季地力，也决定往后的门槛（拖拉机要地力 ≥ 50）。研发期间每过一季推进一格；失手则材料尽付东流，路子还在，可重整旗鼓再投。研成后田边会立起配套器具。档案按四季开放，每章归档奖励只领一次。',action:go(9)},
 {title:'把日子过下去',copy:'结局靠经营与收藏逐渐探索；终章只能确认已达成的道路，按钮不能越过条件。',button:'回田自由探索',enter:()=>open('ending'),target:'#ending-root',detail:'生态、财富、品种收录与耕织图记录共同影响可见道路；归隐还需确认拒绝进贡。未满足条件时，继续种田、交易、访人和整理档案。引导随时可从底部工具栏重开。',action:()=>{finish(true);farm();}}
 ]
 let step=0,guideActive=false,guideFrame=0,guideFocus=null,scrollNext=false
 function targetGuide(){const a=steps[step];let el=typeof a.target==='function'?a.target():$(a.target);if(el?.getClientRects().length)return el;if(!a.host)return null;const host=$(a.host);if(!host)return null;el=host.querySelector('.guide-example');if(!el){el=document.createElement('div');el.className='guide-example';el.innerHTML='<strong>操作预览 · 不改变存档</strong>'+a.example;host.prepend(el);}return el;}
 function positionGuide(){guideFrame=0;if(!guideActive)return;document.body.style.setProperty('--guide-height',Math.ceil(card.getBoundingClientRect().height)+'px');const el=targetGuide();if(!el){ring.hidden=true;$('#guide-context').textContent='当前入口暂不可见，可继续或返回上一步。';return;}if(scrollNext){el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});scrollNext=false;}let r=el.getBoundingClientRect(),l=Math.max(4,r.left),t=Math.max(4,r.top),b=Math.min(card.getBoundingClientRect().top-8,r.bottom),right=Math.min(innerWidth-4,r.right);for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const c=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(c.overflow+c.overflowY+c.overflowX)){const q=p.getBoundingClientRect();l=Math.max(l,q.left);right=Math.min(right,q.right);t=Math.max(t,q.top);b=Math.min(b,q.bottom);}}ring.hidden=right<=l||b<=t;if(!ring.hidden)Object.assign(ring.style,{left:l+'px',top:t+'px',width:(right-l)+'px',height:(b-t)+'px'});$('#guide-context').textContent=el.classList.contains('guide-example')?'当前步骤使用预览；正式操作以季节与资源为准。':ring.hidden?'目标在面板内，可滚动查看。':'金框标出本步界面，可直接操作。';}
 function scheduleGuide(){if(guideActive&&!guideFrame)guideFrame=requestAnimationFrame(positionGuide);}
 function showGuide(i=step){if(!guideActive)guideFocus=document.activeElement;guideActive=true;step=i;document.querySelectorAll('.guide-example').forEach(e=>e.remove());document.body.classList.add('guide-running');card.hidden=false;const a=steps[step];$('#guide-step').textContent=`初入京西 · ${step+1} / ${steps.length}`;$('#guide-title').textContent=a.title;$('#guide-copy').textContent=a.copy;$('#guide-do').textContent=a.button;$('#guide-back').disabled=step===0;$('#guide-detail').hidden=!a.detail;$('#guide-detail').open=false;$('#guide-detail p').textContent=a.detail||'';$('#guide-context').textContent='';a.enter();scrollNext=true;scheduleGuide();$('#guide-title').focus({preventScroll:true});try{localStorage.setItem(guideKey,JSON.stringify({step,done:false}));}catch{}}
 function finish(done=false){guideActive=false;card.hidden=true;ring.hidden=true;cancelAnimationFrame(guideFrame);guideFrame=0;document.body.classList.remove('guide-running');document.body.style.removeProperty('--guide-height');document.querySelectorAll('.guide-example').forEach(e=>e.remove());try{localStorage.setItem(guideKey,JSON.stringify({step,done,paused:!done}));}catch{}if(guideFocus?.isConnected)guideFocus.focus({preventScroll:true});}
 $('#guide-do').onclick=()=>steps[step].action();$('#guide-back').onclick=()=>{if(step)showGuide(step-1);};$('#guide-skip').onclick=()=>finish(false);$('#guide-detail').ontoggle=scheduleGuide
 addEventListener('resize',scheduleGuide);document.addEventListener('scroll',scheduleGuide,true);const guideResize=new ResizeObserver(scheduleGuide);guideResize.observe(card)
 close();sync();let saved=null;try{saved=JSON.parse(localStorage.getItem(guideKey));}catch{}if(!saved||(!saved.done&&!saved.paused)){showGuide(saved&&Number.isInteger(saved.step)&&saved.step>=0&&saved.step<steps.length?saved.step:0);}
 // 深链接直开面板：?view=social 这类地址启动时，farm-ui 已把 activity 定好，
 // 但面板的显隐挂在 body.panel-open 上（.immersive 里 section 默认 display:none）。
 // 不补这一下，直链进来就是一块漆黑的世界视图，面板藏在后面点都点不出来。
 try{const v=new URLSearchParams(location.search).get('view');if(v){const st=game.getState();const townOnly=['processing','sales','npc','social'].includes(v)&&st.space==='town';const anywhere=['variety','ending'].includes(v);if(townOnly||anywhere){document.body.classList.add('panel-open');$('#close-panel').hidden=false;}}}catch{}
 // 调试钩子：?debug=1 时把发现卡暴露出去，方便对联调时直接看四种结果的样子
 if(new URLSearchParams(location.search).has('debug'))window.__discover=showDiscover;
 return {open,close};
}

