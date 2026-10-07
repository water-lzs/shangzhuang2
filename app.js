import {mountImmersive} from './immersive.js';
import {unlock as audioUnlock,setScene as audioScene,sfx as audioSfx,isOn as audioOn,toggle as audioToggle} from './audio.js';
import {mountFarm} from './farm-ui.js';
import * as THREE from 'three';
import {OrbitControls} from './OrbitControls.js';
import {GLTFLoader} from './GLTFLoader.js';
import {RoomEnvironment} from './RoomEnvironment.js';
import {mergeGeometries} from './BufferGeometryUtils.js';
import {TOOL_LEVELS,LAND_LEVELS} from './economy.js';
import {programTexture} from './textures.js';
import {readSave} from './farm-engine.js';
import {migrateLegacySlots,currentSlot,pickSlot,forcedSlot} from './storage.js';
import {mountSlotPicker} from './slot-ui.js';

// 能执行到这里，说明 three 与全部模块都解析成功了 —— 用于部署自检（见 index.html 的 #boot-guard）。
window.__JINGXI_MODULE_LOADED=true;
const ALIGN=await (await fetch('./alignment.json',{cache:'no-store'})).json();
const $=s=>document.querySelector(s);
// —— 包 G（第十五轮）：四季氛围表。除了天空/雾/太阳，再补三样，把「京西稻」的地域感定住 ——
//   ambient  天光（半球光的天空色）：春返青偏青绿、夏溽热偏白蓝、秋高燥偏暖金、冬清冽偏冷灰；
//   ground   地光（半球光的地面反射色）：跟着田土与干草走，不是灰色；
//   terrain  场外大地的底色：春夏是田埂草色，秋是收割后的土黄，冬是落霜的灰绿。
//   色值刻意避开「通用四季色」（那些一眼就是模板），往玉泉山—西山—稻作的实际光感上靠。
const SEASONS={
 spring:{num:'壹',note:'春生 · 万物有时',label:'谷雨插秧',file:'JingXi_Spring.glb',sky:['#93bdcc','#e6d6cf','#fff4d1'],fog:'#d9e5dc',density:.007,sun:0xffe0b2,power:2.0,sunPos:[-24,15,10],target:[0,3,0],camera:[29,29,42],ambient:'#e9f3e4',ground:'#b7b58c',terrain:'#b4bf99'},
 summer:{num:'贰',note:'夏长 · 稻香渐浓',label:'小暑生长',file:'JingXi_Summer.glb',sky:['#469dd4','#9ddded','#f2f5cc'],fog:'#cee2d8',density:.004,sun:0xfff2d2,power:2.6,sunPos:[-15,35,10],target:[-3,.4,5],camera:[23,25,32],ambient:'#dff0f7',ground:'#a8a877',terrain:'#97a973'},
 autumn:{num:'叁',note:'秋收 · 满仓金粟',label:'秋分收割',file:'JingXi_Autumn.glb',sky:['#dd9a63','#f1c688','#f8e3b1'],fog:'#e5d0aa',density:.006,sun:0xffd49c,power:2.3,sunPos:[-25,18,12],target:[-2,2.8,-7],camera:[24,23,24],ambient:'#ffeed2',ground:'#c4a976',terrain:'#c6b07a'},
 winter:{num:'肆',note:'冬藏 · 静候来年',label:'冬至休耕',file:'JingXi_Winter.glb',sky:['#809dad','#bdcbd1','#e8efeb'],fog:'#cbd9de',density:.012,sun:0xdeebff,power:1.5,sunPos:[-20,25,12],target:[0,2,0],camera:[28,30,42],ambient:'#dfeaf4',ground:'#a9a9a2',terrain:'#c6d2cc'}
};
for(const [s,c]of Object.entries(SEASONS)){c.file='JingXi_Aligned_'+s[0].toUpperCase()+s.slice(1)+'.glb';Object.assign(c,ALIGN.seasons[s]);}
let renderer,scene,camera,controls,sun,hemi,pmrem,environment;
let activeModel=null,activeSeason='spring',loadToken=0,frameStart=performance.now(),frameCount=0,fps=0,assets=[],errorMessage='';
const cache=new Map();const loader=new GLTFLoader();
let farmState=null,requestedSeason=null,requestedSpace=null,techEffects=null,techAnim=0;
let waterMats=[],riceMats=[],tintMats=[],ecoGroup=null,ecoAnim=0,prevFarm=null;
const cropUniforms={farmMask:{value:new Float32Array(10)},farmGrowth:{value:1},farmStage:{value:0},farmTime:{value:0}};
function syncFarm(state){
 const changed=farmState&&farmState.space!==state.space;farmState=state;document.title='穿越京西稻 · '+(state.activity==='processing'?'御米作坊':state.activity==='sales'?'时空交易行':state.activity==='variety'?'御贡图鉴':SEASONS[state.season].label);const mask=state.activity==='processing'||state.activity==='sales'||state.activity==='variety'?Array(10).fill(true):state.season==='winter'?state.previousPlots:state.harvested?Array(10).fill(false):state.plots;
 if(changed){const el=document.querySelector('#space-transition');el?.classList.add('show');setTimeout(()=>el?.classList.remove('show'),2000);}
 cropUniforms.farmMask.value.set(mask.map(Number));
 // —— 包 G：farmGrowth 还是原来那个「株高」数值（两端与旧版一致），另给一个 farmStage
 //    告诉着色器「现在长到哪一阶段」：0 分蘖、1 拔节、2 抽穗、3 成熟。穗头下垂只认它。——
 const gt=Math.max(1,state.growTarget||3),t=state.season==='summer'?Math.max(0,Math.min(1,state.growth/gt)):1;
 cropUniforms.farmGrowth.value=state.season==='summer'?.55+.45*t:1;
 cropUniforms.farmStage.value=state.season==='summer'?t*3:(state.season==='spring'?0:3);
 if(requestedSeason!==state.season||requestedSpace!==state.space){requestedSeason=state.season;requestedSpace=state.space;changeSeason(state.season);}
 applyTechEffects(state.story?.tech||{});
 syncHotspots(state);
 applyUpgrades(state);
 syncSurface(state);syncAudio(state);
}
// 「隐性感知」：把 engine 里的数值翻译成看得见的画面——水色、稻色、生气、天光。
function syncSurface(state){
 if(!scene)return;
 const w=Math.max(0,Math.min(1,state.water/100)),p=Math.max(0,Math.min(1,state.pests/100)),e=Math.max(0,Math.min(1,state.ecology/100));
 const clear=new THREE.Color(0x8fd0e3),murk=new THREE.Color(0x6d6144);
 for(const m of waterMats)m.color.copy(murk).lerp(clear,w);
 const healthy=new THREE.Color(0xa9c46c),pale=new THREE.Color(0x8b9a72),sick=new THREE.Color(0x9c9756);
 for(const m of riceMats){
  if(m.userData.grain)continue;   // 穗粒不吃生态滤镜：金黄归金黄，不然整片田一起发灰
  m.color.copy(healthy).lerp(pale,1-w).lerp(sick,p*.85);
 }
 const gray=1-e,cfg=SEASONS[activeSeason];
 if(scene.fog){scene.fog.color.set(cfg.fog).lerp(new THREE.Color(0x9a9c97),gray*.72);scene.fog.density=cfg.density*(1+gray*.55);}
 if(hemi)hemi.intensity=ALIGN.ambientIntensity*(1-gray*.22);
 if(sun)sun.intensity=cfg.power*(1-gray*.18);
 scene.environmentIntensity=.32*(1-gray*.45);
 for(const m of tintMats){if(!m.userData.baseTint)m.userData.baseTint=m.color.clone();m.color.copy(m.userData.baseTint).lerp(new THREE.Color(0x8f918a),gray*.5);}
 syncCreatures(e);
}
function syncCreatures(e){
 if(!scene)return;
 if(!ecoGroup)buildCreatures();
 const frog=e>=.7,dragon=e>=.4,egret=e>=.7;
 for(const o of ecoGroup.children){const k=o.userData.kind;o.visible=(k==='frog'&&frog)||(k==='dragonfly'&&dragon)||(k==='egret'&&egret);}
}
function buildCreatures(){
 ecoGroup=new THREE.Group();ecoGroup.name='EcoCreatures';
 const frogMat=new THREE.MeshStandardMaterial({color:0x4f7a3b,roughness:.85});
 const wingMat=new THREE.MeshStandardMaterial({color:0xc8b780,roughness:.6,transparent:true,opacity:.8,side:THREE.DoubleSide});
 const birdMat=new THREE.MeshStandardMaterial({color:0xf0f2ea,roughness:.75});
 for(let i=0;i<4;i++){const f=new THREE.Group();const body=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),frogMat);body.scale.set(1.25,.8,1);f.add(body);f.position.set(-8+i*5.2,.02,-9.4+(i%2)*18.6);f.userData={kind:'frog',baseY:.02,phase:i*1.7};ecoGroup.add(f);}
 for(let i=0;i<6;i++){const d=new THREE.Group();const b=new THREE.Mesh(new THREE.CapsuleGeometry(.02,.22,3,6),wingMat);b.rotation.z=Math.PI/2;const l=new THREE.Mesh(new THREE.PlaneGeometry(.34,.09),wingMat),r=l.clone();l.position.x=-.16;r.position.x=.16;d.add(b,l,r);const bx=-10+i*4,by=.9+((i*37)%10)/14,bz=-8+(i%3)*7;d.position.set(bx,by,bz);d.userData={kind:'dragonfly',baseX:bx,baseY:by,baseZ:bz,phase:i*.9};ecoGroup.add(d);}
 for(let i=0;i<2;i++){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),birdMat);body.scale.set(1.5,.75,.9);const neck=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.42,6),birdMat);neck.position.set(.16,.26,0);const head=new THREE.Mesh(new THREE.SphereGeometry(.07,7,5),birdMat);head.position.set(.2,.48,0);g.add(body,neck,head);const bx=-14+i*11;g.position.set(bx,.2,10.5-i*3);g.userData={kind:'egret',baseX:bx,phase:i*2.2};ecoGroup.add(g);}
 scene.add(ecoGroup);
 const t0=performance.now();
 (function step(){
  const t=performance.now()-t0;
  ecoGroup.children.forEach(o=>{const k=o.userData.kind,ph=o.userData.phase||0;
   if(k==='frog')o.position.y=o.userData.baseY+Math.abs(Math.sin(t*.0016+ph))*.11;
   else if(k==='dragonfly'){o.position.x=o.userData.baseX+Math.sin(t*.0009+ph)*1.7;o.position.z=o.userData.baseZ+Math.sin(t*.0018+ph)*.9;o.position.y=o.userData.baseY+Math.sin(t*.0032+ph)*.14;}
   else o.position.x=o.userData.baseX+Math.sin(t*.00021+ph)*3.2;
  });
  ecoAnim=requestAnimationFrame(step);
 })();
}
// 声音反馈：水质好有流水与鸟鸣，生态差几乎只剩风声。
function syncAudio(state){
 if(!audioOn()){prevFarm=state;return;}
 if(prevFarm){
  if(state.rice>prevFarm.rice)audioSfx('harvest');
  else if(state.stamina<prevFarm.stamina)audioSfx(state.season==='spring'?'plant':'inspect');
  else if(state.season!==prevFarm.season)audioSfx('reward');
 }
 prevFarm=state;audioScene({water:state.water,ecology:state.ecology});
}
// —— 包 I2：科技研成后的场景器具。旧版按 boolean 解锁，现按 {state:'done'} 判断，并按分支换形态。——
// 接口留白：模型精修前用低多边形占位；包 G 出正式模型后，只改 build 段（换成 GLTF 载入），
// 坐标与调度逻辑都不用动 —— TECH_ANCHORS 就是每项科技的固定锚点。
let techSig='';
const TECH_ANCHORS={plow:[-12,.05,-2],compost:[7,0,-8],crab:[0,0,7],waterwheel:[11.5,0,-7.5],tractor:[-6.5,.02,9]};
function applyTechEffects(tech){
 if(!scene||!renderer)return;
 // 状态签名没变就不重建（避免每次 syncFarm 都拆一遍模型、粒子乱跳）
 const sig=Object.entries(tech||{}).map(([k,v])=>k+':'+(v?.state||'')+':'+(v?.branch||'')).join('|');
 if(sig===techSig&&techEffects)return;
 techSig=sig;
 if(techAnim){cancelAnimationFrame(techAnim);techAnim=0;}
 if(!techEffects){techEffects=new THREE.Group();techEffects.name='SystemTechEffects';scene.add(techEffects);}
 while(techEffects.children.length){const o=techEffects.children.pop();o.traverse(c=>{c.geometry?.dispose();c.material?.dispose();});}
 const done=id=>tech?.[id]?.state==='done',pickOf=id=>tech?.[id]?.branch||null;
 const glowMat=()=>{const m=new THREE.MeshBasicMaterial({color:0xffd98a,transparent:true,opacity:0});m.userData.glow=true;return m;};
 const tinted=o=>new THREE.MeshStandardMaterial({color:o,roughness:.8,transparent:true,opacity:0});
 const wood=tinted(0x6f4d2e),iron=new THREE.MeshStandardMaterial({color:0x7d766b,roughness:.5,metalness:.35,transparent:true,opacity:0,userData:{}}),soil=tinted(0x5a4632),shell=tinted(0x8f4534);
 const box=(w,h,d,m)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
 const cyl=(r,h,m,seg=10)=>new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg),m);
 const statics=[wood,iron,soil,shell];
 const place=(g,id)=>{const a=TECH_ANCHORS[id]||[0,0,0];g.position.set(a[0],a[1],a[2]);g.traverse(o=>{if(o.isMesh){o.castShadow=true;if(o.material&&o.material.transparent&&!o.userData.rise&&!o.material.userData?.glow&&!statics.includes(o.material))statics.push(o.material);}});techEffects.add(g);return g;};
 // 曲辕犁：深耕犁更宽更沉，轻便犁更细挑
 if(done('plow')){
  const sc=pickOf('plow')==='deep'?1.16:.86;
  const plow=new THREE.Group(),beam=box(2.3*sc,.13,.13,wood),handle=box(.13,1.05,.13,wood),base=box(.2,.55,.5,wood),share=box(.55*sc,.28,.66,iron);
  beam.position.set(-.2,1.05,0);beam.rotation.z=.16;handle.position.set(.85,.55,0);handle.rotation.z=-.35;base.position.set(-.55,.5,0);share.position.set(-.95,.16,0);share.rotation.z=.55;
  plow.add(beam,handle,base,share);place(plow,'plow').rotation.y=.6;
 }
 // 堆肥：化肥是白肥堆，有机肥是黑肥堆配绿光点
 if(done('compost')){
  const chem=pickOf('compost')==='chemical';
  const heapMat=chem?new THREE.MeshStandardMaterial({color:0xd9d3c4,roughness:.9,transparent:true,opacity:0}):soil;
  const g=new THREE.Group(),heap=box(1.7,.24,1.7,heapMat);heap.position.y=.12;heap.castShadow=true;g.add(heap);
  for(let i=0;i<14;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(.07,6,4),glowMat());p.position.set(((i*37)%100/100-.5)*1.5,.35+((i*53)%100/100)*1.3,((i*71)%100/100-.5)*1.5);p.userData={rise:.0035+(i%5)*.0008,phase:i*.9};g.add(p);}
  place(g,'compost');
 }
 // 治虫：养蟹分支是一田蟹，药剂分支是药罐配药雾
 if(done('crab')){
  const g=new THREE.Group();
  if(pickOf('crab')==='crabfarm'){
   for(let i=0;i<3;i++){const c=new THREE.Group(),body=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),shell);body.scale.set(1.5,.6,1);const cl=box(.1,.07,.14,shell),cr=box(.1,.07,.14,shell);cl.position.set(.26,0,.12);cr.position.set(.26,0,-.12);c.add(body,cl,cr);c.position.set(-1.1+i*1.1,.09,(i-1)*.55);c.userData={drift:i%2?1:-1,speed:.005+.002*i,baseX:c.position.x};c.rotation.y=c.userData.drift>0?0:Math.PI;g.add(c);}
  }else{
   const jar=new THREE.Mesh(new THREE.CylinderGeometry(.3,.24,.62,10),tinted(0x6d6552));jar.position.y=.31;g.add(jar);
   const lid=cyl(.32,.1,tinted(0x4f4a3c),10);lid.position.y=.66;g.add(lid);
   for(let i=0;i<10;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(.06,6,4),glowMat());p.position.set(((i*41)%100/100-.5)*.9,.9+((i*29)%100/100)*.9,((i*67)%100/100-.5)*.9);p.userData={rise:.004,phase:i*.8};g.add(p);}
  }
  place(g,'crab');
 }
 // 水车：龙骨水车转得快，筒车转得慢
 if(done('waterwheel')){
  const dragon=pickOf('waterwheel')==='dragon',g=new THREE.Group(),wheel=new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.05,.09,6,18),wood));
  for(let i=0;i<8;i++){const sp=box(.08,2.0,.08,wood);sp.rotation.z=i*Math.PI/8;wheel.add(sp);}
  for(let i=0;i<8;i++){const a=i*Math.PI/4,pad=box(.24,.1,.5,wood);pad.position.set(Math.cos(a),Math.sin(a),0);pad.rotation.z=a;wheel.add(pad);}
  wheel.position.y=1.25;wheel.userData.spin=dragon?.022:.011;g.add(wheel);
  const p1=box(.16,1.3,.16,wood),p2=box(.16,1.3,.16,wood);p1.position.set(0,.65,.62);p2.position.set(0,.65,-.62);g.add(p1,p2);
  const trough=box(2.4,.16,.5,wood);trough.position.y=.28;g.add(trough);
  place(g,'waterwheel').rotation.y=-.5;
 }
 // 拖拉机：大型农机更壮，精细农机更矮小；轮子一并在占位里做出来
 if(done('tractor')){
  const big=pickOf('tractor')==='big',sc=big?1.15:.9;
  const body=new THREE.MeshStandardMaterial({color:big?0x8c3b2f:0x466b4a,roughness:.55,metalness:.2,transparent:true,opacity:0}),tyre=tinted(0x2b2b2b);
  const g=new THREE.Group(),hull=box(1.5*sc,.62,1.0*sc,body);hull.position.y=.72;g.add(hull);
  const cab=box(.72*sc,.55,.82*sc,body);cab.position.set(-.34,1.3,0);g.add(cab);
  const pipe=cyl(.06,.62,iron,6);pipe.position.set(.56,1.18,0);g.add(pipe);
  const wheelAt=(r,w,x,z)=>{const t=cyl(r,w,tyre,14);t.rotation.x=Math.PI/2;t.position.set(x,r,z);return t;};
  g.add(wheelAt(.55*sc,.32,.5,.62),wheelAt(.55*sc,.32,.5,-.62),wheelAt(.3*sc,.24,.66,.42),wheelAt(.3*sc,.24,.66,-.42));
  place(g,'tractor').rotation.y=.35;
 }
 renderer.shadowMap.needsUpdate=true;
 const t0=performance.now();
 (function step(){
  const k=Math.min(1,(performance.now()-t0)/700),now=performance.now();
  statics.forEach(m=>m.opacity=.95*k);
  techEffects.traverse(o=>{
   if(o.userData?.spin)o.rotation.z-=o.userData.spin;
   if(o.isMesh&&o.userData.rise){o.position.y+=o.userData.rise;if(o.position.y>1.85)o.position.y=.3;o.material.opacity=k*(.85-.45*(o.position.y-.3)/1.55)*(.8+.2*Math.sin(now*.004+o.userData.phase));}
   if(o.userData?.drift){o.position.x+=o.userData.drift*o.userData.speed;if(Math.abs(o.position.x-o.userData.baseX)>.7){o.userData.drift*=-1;o.rotation.y=o.userData.drift>0?0:Math.PI;}}
  });
  techAnim=requestAnimationFrame(step);
 })();
}
// —— 包 J2（第七轮）：家场景里可以上手摸的四件旧物 —— 水井 · 石磨 · 晾晒架 · 老宅门环。
// 与包 I2 的 TECH_ANCHORS 同一套路：正式模型出来前用低模占位，坐标是固定锚点，
// 换模型时只改 build 段，拾取、悬停与点击调度一个字都不用动。
// 家什都立在家门口的空地上（z 20~22 的院前带，不在田里；位置用屏幕投影实测校准）：
// 水井 · 石磨 · 晾晒架 · 老宅门环 · 官道路牌（路牌立在官道进田的路口）。
const HOTSPOT_ANCHORS={well:[-10,0,19.9],mill:[-3.5,0,21.5],rack:[3.5,0,20.6],doorring:[9.5,0,20.6],roadsign:[14,0,16]};
const HOT_GOLD=0xe8b956;
let hotspotGroup=null,hotspotHover=null;
function buildHotspots(){
 if(hotspotGroup)return;
 hotspotGroup=new THREE.Group();hotspotGroup.name='SystemHotspots';scene.add(hotspotGroup);
 // 每种材质都要独立实例：悬停时按组改 emissive，共用材质会把别的物件一起点亮。
 const stone=()=>new THREE.MeshStandardMaterial({color:0x9a958a,roughness:.95});
 const wood=()=>new THREE.MeshStandardMaterial({color:0x6f4d2e,roughness:.85});
 const brass=()=>new THREE.MeshStandardMaterial({color:0xa8842f,roughness:.45,metalness:.55});
 const straw=()=>new THREE.MeshStandardMaterial({color:0xc9b06a,roughness:.9});
 const dark=()=>new THREE.MeshStandardMaterial({color:0x3b3a36,roughness:1});
 const box=(w,h,d,m)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
 const cyl=(rt,rb,h,m,seg=12)=>new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),m);
 const add=(id,build)=>{
  const g=new THREE.Group(),mats=[];
  build(g,f=>{const m=f();mats.push(m);return m});
  // 淡金描边用贴地光环实现：比给每个零件描一遍边省得多，看起来也更像「这里能上手」。
  const glow=new THREE.Mesh(new THREE.RingGeometry(1.15,1.55,30),new THREE.MeshBasicMaterial({color:HOT_GOLD,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
  glow.rotation.x=-Math.PI/2;glow.position.y=.035;glow.name='SpotGlow';g.add(glow);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const a=HOTSPOT_ANCHORS[id]||[0,0,0];g.position.set(a[0],a[1],a[2]);
  g.userData={hotspot:id,mats,glow};
  hotspotGroup.add(g);
 };
 // 水井：方井台 · 石井圈 · 辘轳架（带斜撑）· 吊桶——石色做旧，别像根白柱子杵在院里
 add('well',(g,mat)=>{
  const base=box(2.3,.22,2.3,mat(stone));base.position.y=.11;g.add(base);
  const ring=cyl(1.05,1.15,.4,mat(stone),16);ring.position.y=.42;g.add(ring);
  const hole=cyl(.52,.52,.42,mat(dark),14);hole.position.y=.45;g.add(hole);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.62,.16,8,20),mat(stone));rim.rotation.x=Math.PI/2;rim.position.y=.66;g.add(rim);
  for(const x of[-.72,.72]){
   const p=box(.17,1.6,.17,mat(wood));p.position.set(x,1.28,0);g.add(p);
   const s=box(.1,.1,1.0,mat(wood));s.position.set(x,.5,.36);s.rotation.x=.55;g.add(s);
  }
  const beam=box(1.9,.15,.15,mat(wood));beam.position.y=2.1;g.add(beam);
  const roll=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,1.5,10),mat(wood));roll.rotation.z=Math.PI/2;roll.position.y=1.92;g.add(roll);
  const crank=box(.08,.08,.5,mat(wood));crank.position.set(.85,1.92,.28);g.add(crank);
  const rope=box(.04,.86,.04,mat(dark));rope.position.set(0,1.4,0);g.add(rope);
  const bucket=cyl(.2,.14,.3,mat(wood),10);bucket.position.set(0,.86,0);g.add(bucket);
 });
 // —— 包 M4：官道路牌。立在家门口的土路边，点它就动身去上庄镇（走 space:switch，费体力、可能路遇）——
 add('roadsign',(g,mat)=>{
  const pole=box(.2,2.5,.2,mat(wood));pole.position.y=1.25;g.add(pole);
  const board=box(1.8,.6,.12,mat(wood));board.position.set(0,2.15,.12);board.rotation.y=-.3;g.add(board);
  const cap=box(2,.13,.32,mat(dark));cap.position.set(0,2.5,.12);cap.rotation.y=-.3;g.add(cap);
  const label=UP_TEXT('官道 · 上庄镇',2.4);label.material.opacity=.97;label.position.set(0,3.05,.2);g.add(label);
 });
 // 石磨：底座 · 上下磨盘 · 磨眼 · 磨棍
 add('mill',(g,mat)=>{
  const base=cyl(.95,1.05,.22,mat(stone),16);base.position.y=.11;g.add(base);
  const lower=cyl(.78,.82,.26,mat(stone),16);lower.position.y=.35;g.add(lower);
  const upper=cyl(.72,.76,.24,mat(stone),16);upper.position.y=.6;g.add(upper);
  const eye=cyl(.11,.11,.27,mat(dark),10);eye.position.y=.61;g.add(eye);
  const handle=box(.1,.1,1.5,mat(wood));handle.position.set(0,.73,.78);g.add(handle);
  const post=box(.12,1.05,.12,mat(wood));post.position.set(1.02,.52,-.24);g.add(post);
 });
 // 晾晒架：粗立柱带斜撑 · 两道横杆 · 四束倒挂稻把（束口带箍，别远看像条黄布）
 add('rack',(g,mat)=>{
  for(const x of[-1.25,1.25]){
   const p=box(.19,2.2,.19,mat(wood));p.position.set(x,1.1,0);g.add(p);
   const s=box(.11,.11,1.2,mat(wood));s.position.set(x,.4,.5);s.rotation.x=.5;g.add(s);
  }
  for(const y of[1.32,2.02]){const bar=box(3.0,.13,.13,mat(wood));bar.position.set(0,y,0);g.add(bar);}
  for(let i=0;i<4;i++){
   const x=-1.05+i*.7;
   const b=cyl(.2,.09,.66,mat(straw),8);b.position.set(x,1.62,0);g.add(b);
   const tie=box(.26,.06,.26,mat(dark));tie.position.set(x,1.9,0);g.add(tie);
  }
 });
 // 老宅门环：门楣门柱 · 两扇门板 · 中缝 · 一对铜环 · 阶石
 add('doorring',(g,mat)=>{
  const lintel=box(2.72,.22,.32,mat(wood));lintel.position.y=2.28;g.add(lintel);
  for(const x of[-1.24,1.24]){const p=box(.24,2.3,.32,mat(wood));p.position.set(x,1.15,0);g.add(p);}
  for(const x of[-.58,.58]){const b=box(1.12,2.0,.1,mat(wood));b.position.set(x,1.0,0);g.add(b);}
  const seam=box(.06,2.0,.12,mat(dark));seam.position.set(0,1.0,0);g.add(seam);
  for(const x of[-.3,.3]){const r=new THREE.Mesh(new THREE.TorusGeometry(.14,.035,6,14),mat(brass));r.position.set(x,1.06,.07);g.add(r);}
  const step=box(3.0,.18,1.0,mat(stone));step.position.set(0,.09,.62);g.add(step);
 });
 window.__hotspots=hotspotGroup;
}
// 家什只在「家」这一侧出现：到了镇上就收起来，免得田边一口井、镇口又一口井。
function syncHotspots(state){
 if(!scene)return;
 if(!hotspotGroup)buildHotspots();
 buildRoad();
 const show=state?.space!=='town';
 if(!show&&hotspotHover)setHover(null);
 hotspotGroup.visible=show;
 roadGroup.visible=show;
}
const hotspotRay=new THREE.Raycaster();const hotspotNDC=new THREE.Vector2();
function buildRoad(){
 // —— 包 M4：官道。从家门外斜穿稻田直抵镇口的田间主路（铺设时沿路留了空带，不压一垄稻）。——
 if(roadGroup||!scene)return;
 roadGroup=new THREE.Group();roadGroup.name='HomeRoad';scene.add(roadGroup);
 const mat=new THREE.MeshStandardMaterial({color:0xb3a078,roughness:.96,map:programTexture('road',1,3)});
 const pts=[[15,20],[10,6],[4,-6],[-2,-18],[-4,-27]];
 for(let i=0;i<pts.length-1;i++){
  const [x0,z0]=pts[i],[x1,z1]=pts[i+1];
  const dx=x1-x0,dz=z1-z0,len=Math.hypot(dx,dz);
  const m=new THREE.Mesh(new THREE.BoxGeometry(3.6,.05,len+1),mat);
  m.position.set((x0+x1)/2,.028,(z0+z1)/2);
  m.rotation.y=Math.atan2(dx,dz);
  m.receiveShadow=true;roadGroup.add(m);
 }
 const rut=new THREE.MeshStandardMaterial({color:0x8f7d59,roughness:.98});
 for(const off of[-.55,.55])for(let i=1;i<3;i++){
  const [x0,z0]=pts[i],[x1,z1]=pts[i+1];
  const dx=x1-x0,dz=z1-z0,len=Math.hypot(dx,dz);
  const m=new THREE.Mesh(new THREE.BoxGeometry(.16,.06,len+1),rut);
  m.position.set((x0+x1)/2+dz/len*off,.05,(z0+z1)/2-dx/len*off);
  m.rotation.y=Math.atan2(dx,dz);
  m.receiveShadow=true;roadGroup.add(m);
 }
}
let roadGroup=null;
function pickHotspot(clientX,clientY){
 if(!hotspotGroup||!hotspotGroup.visible)return null;
 const r=renderer.domElement.getBoundingClientRect();
 hotspotNDC.set((clientX-r.left)/r.width*2-1,-((clientY-r.top)/r.height*2-1));
 hotspotRay.setFromCamera(hotspotNDC,camera);
 for(const hit of hotspotRay.intersectObjects(hotspotGroup.children,true)){let o=hit.object;while(o&&!o.userData.hotspot)o=o.parent;if(o)return o;}
 return null;
}
function setHover(spot){
 if(hotspotHover===spot)return;
 if(hotspotHover){
  hotspotHover.userData.glow.material.opacity=0;
  for(const m of hotspotHover.userData.mats)if(m.emissive)m.emissiveIntensity=0;
 }
 hotspotHover=spot;
 if(renderer?.domElement)renderer.domElement.style.cursor=spot?'pointer':'';
 if(spot)for(const m of spot.userData.mats)if(m.emissive){m.emissive.setHex(HOT_GOLD);m.emissiveIntensity=.22;}
}
function updateHotspots(t){
 if(!hotspotGroup)return;
 for(const g of hotspotGroup.children){
  const glow=g.userData.glow;if(!glow)continue;
  if(g===hotspotHover)glow.material.opacity=.42+.22*Math.sin(t*.006);
  else if(glow.material.opacity!==0)glow.material.opacity=0;
 }
}
let gameAPI=null;
function touchSpot(id){
 if(!gameAPI||!gameAPI.dispatch)return;
 // —— 包 M4：路牌不是「旧物件」，点它就是赶路——走 space:switch，费 5 点体力、三成概率路遇奇遇。
 if(id==='roadsign'){if(gameAPI.dispatch({type:'space:switch',space:'town'}))toast('顺着官道，往上庄镇去……');return;}
 if(!gameAPI.dispatch({type:'hotspot:touch',id}))toast('这里眼下没什么可看的。');
}
// 拖拽旋转与「摸一下」必须分得开，否则转个镜头就顺手触发了局内事件。
function bindHotspotPointer(){
 const el=renderer.domElement;let down=null;
 el.addEventListener('pointermove',e=>{if(!hotspotGroup||!hotspotGroup.visible)return;setHover(pickHotspot(e.clientX,e.clientY));});
 el.addEventListener('pointerleave',()=>setHover(null));
 el.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,at:performance.now()};});
 el.addEventListener('pointerup',e=>{
  if(!down)return;
  const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y),held=performance.now()-down.at;
  down=null;
  if(moved>6||held>600)return;
  const spot=pickHotspot(e.clientX,e.clientY);
  if(spot)touchSpot(spot.userData.hotspot);
 });
}
// —— 包 O 尾（第 9 轮）：家业升级链在场景里落地 ——
// 农具七级 / 土地三级 / 作坊五级 / 老宅四档，每上一级院里就多一件实物。
// 与 TECH_ANCHORS / HOTSPOT_ANCHORS 同一套路：先低模占位，包 G 出正式模型后只改 build 段。
// 锚点立在家门口空地第二排（z≈22~23，与热点前后错落），位置按屏幕投影实测校准。
const UP_ANCHORS={tool:[-6.5,0,22.5],land:[.5,0,23],workshop:[3.2,0,22.6],house:[7.8,0,22.2]};
let upgradeGroup=null,upBuilt={},upTweens=[],upSpin=[],upFx=[];
const UM=(color,op=.95,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85,metalness:.05,transparent:true,opacity:0,...extra});m.userData.op=op;return m;};
const UP_CN=['','壹','贰','叁','肆','伍','陆','柒'];
// 名牌 / 匾额：canvas 画楷字贴到 sprite 上，不用引字体文件
function UP_TEXT(text,w=2.6){
 const c=document.createElement('canvas');c.width=256;c.height=80;const x=c.getContext('2d');
 x.fillStyle='#f6f1e0';x.fillRect(0,0,256,80);
 x.strokeStyle='#a33b2e';x.lineWidth=5;x.strokeRect(5,5,246,70);
 x.fillStyle='#2f2a22';x.font='700 '+(text.length>5?34:42)+'px KaiTi,STKaiti,serif';x.textAlign='center';x.textBaseline='middle';
 x.fillText(text,128,42);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
 const m=new THREE.SpriteMaterial({map:tex,transparent:true,opacity:0});m.userData.op=.97;m.userData.text=text;
 const s=new THREE.Sprite(m);s.scale.set(w,w*80/256,1);return s;
}
const upBox=(w,h,d,m)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
const upCyl=(rt,rb,h,m,seg=12)=>new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),m);
function clearSlot(g){
 upSpin=upSpin.filter(s=>s.slot!==g);
 while(g.children.length){
  const o=g.children.pop();
  o.traverse(c=>{c.geometry?.dispose();const ms=Array.isArray(c.material)?c.material:[c.material];for(const m of ms){m?.map?.dispose();m?.dispose();}});
 }
}
function popIn(g,pop){
 const mats=[];
 g.traverse(o=>{const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)if(m&&'opacity'in m)mats.push(m);});
 upTweens.push({mats,g,s0:pop?.5:1,t0:performance.now(),dur:700});
}
// 升级落成的一把金屑——只在新买的级上撒，开场铺档不撒
function celebrate(g){
 for(let i=0;i<10;i++){
  const m=new THREE.Mesh(new THREE.SphereGeometry(.07,6,4),new THREE.MeshBasicMaterial({color:0xffd98a,transparent:true,opacity:.9}));
  m.position.set(((i*37)%100/100-.5)*2.4,.5+((i*53)%100/100)*1.1,((i*71)%100/100-.5)*1.6);
  g.add(m);upFx.push({mesh:m,t0:performance.now(),dur:1500,v:.011+(i%4)*.003});
 }
}
const UP_BUILD={
 // 农具陈列：木架 + 本级名牌 + 本级农具实物（换一级换一件）
 tool(g,lv){
  const wood=UM(0x6f4d2e),iron=UM(0x7d766b,.92,{metalness:.4,roughness:.5}),dark=UM(0x3b3a36,1);
  for(const x of[-1.5,1.5]){const p=upBox(.14,2.2,.14,wood);p.position.set(x,1.1,-.6);g.add(p);}
  const bar=upBox(3.2,.12,.12,wood);bar.position.set(0,2.2,-.6);g.add(bar);
  const name=UP_TEXT(TOOL_LEVELS[lv]?.name||'农具');name.position.set(0,2.78,.1);g.add(name);
  if(lv===1){ // 曲辕犁
   const beam=upBox(2.1,.12,.12,wood);beam.position.set(-.3,1.2,.2);beam.rotation.z=.14;g.add(beam);
   const handle=upBox(.12,1.0,.12,wood);handle.position.set(.72,.68,.2);handle.rotation.z=-.4;g.add(handle);
   const base=upBox(.2,.5,.44,wood);base.position.set(-.55,.55,.2);g.add(base);
   const share=upBox(.5,.24,.6,iron);share.position.set(-.98,.15,.2);share.rotation.z=.5;g.add(share);
  }else if(lv===2){ // 龙骨水车：轮转 + 水槽
   const wheel=new THREE.Group();
   wheel.add(new THREE.Mesh(new THREE.TorusGeometry(.92,.08,6,16),wood));
   for(let i=0;i<6;i++){const sp=upBox(.07,1.76,.07,wood);sp.rotation.z=i*Math.PI/6;wheel.add(sp);}
   for(let i=0;i<6;i++){const a=i*Math.PI/3,pad=upBox(.2,.08,.4,wood);pad.position.set(Math.cos(a)*.92,Math.sin(a)*.92,0);pad.rotation.z=a;wheel.add(pad);}
   wheel.position.set(-.7,1.12,.15);g.add(wheel);upSpin.push({slot:g,o:wheel,axis:'z',v:.02});
   const trough=upBox(1.7,.14,.44,wood);trough.position.set(1.05,.52,.15);g.add(trough);
   for(const z of[-.5,.5]){const leg=upBox(.12,.5,.12,wood);leg.position.set(1.05,.26,.15+z);g.add(leg);}
  }else if(lv===3){ // 牛耕：一头牛拉一张犁
   const hide=UM(0x4a3b2c),horn=UM(0xd9cdb0);
   const ox=new THREE.Group();
   const body=upBox(1.7,.72,.8,hide);body.position.y=.95;ox.add(body);
   const head=upBox(.55,.5,.5,hide);head.position.set(1.05,1.15,0);ox.add(head);
   for(const s of[-1,1]){const h=upBox(.32,.08,.08,horn);h.position.set(1.12,1.44,.18*s);h.rotation.y=.5*s;ox.add(h);}
   for(const lx of[-.55,.55])for(const lz of[-.26,.26]){const leg=upBox(.16,.62,.16,hide);leg.position.set(lx,.31,lz);ox.add(leg);}
   const tail=upBox(.08,.5,.08,dark);tail.position.set(-.9,.9,0);tail.rotation.z=.35;ox.add(tail);
   ox.position.set(-.55,0,.2);g.add(ox);
   const beam=upBox(1.9,.1,.1,wood);beam.position.set(.7,.75,.2);beam.rotation.z=.1;g.add(beam);
   const share=upBox(.5,.22,.58,iron);share.position.set(-.35,.14,.2);share.rotation.z=.5;g.add(share);
   const stub=upBox(.14,.9,.14,wood);stub.position.set(.05,.6,.2);stub.rotation.z=-.35;g.add(stub);
  }else if(lv===4){ // 脚踏打谷机：木箱 + 滚筒（转）+ 踏板
   const bin=upBox(1.9,.9,1.1,wood);bin.position.set(0,.55,.1);g.add(bin);
   const drum=new THREE.Group();
   const roll=upCyl(.34,.34,1.6,iron);roll.rotation.z=Math.PI/2;drum.add(roll);
   for(let i=0;i<6;i++){const t=upBox(.2,.05,.05,iron);t.position.set(-.7+i*.28,.42,0);drum.add(t);}
   drum.position.set(0,1.3,-.05);g.add(drum);upSpin.push({slot:g,o:drum,axis:'x',v:.05});
   const pedal=upBox(.9,.08,.4,wood);pedal.position.set(0,.2,.85);pedal.rotation.x=.2;g.add(pedal);
  }else if(lv===5){ // 小型拖拉机
   const paint=UM(0x8c3b2f,.95,{roughness:.5,metalness:.15}),tyre=UM(0x2b2b2b,1);
   const hull=upBox(1.7,.62,1.05,paint);hull.position.y=.78;g.add(hull);
   const cab=upBox(.72,.58,.9,paint);cab.position.set(-.35,1.38,0);g.add(cab);
   const pipe=upCyl(.06,.06,.55,iron,6);pipe.position.set(.55,1.2,0);g.add(pipe);
   const wheels=new THREE.Group();
   const at=(r,w,x,z)=>{const t=upCyl(r,r,w,tyre,14);t.rotation.x=Math.PI/2;t.position.set(x,r,z);wheels.add(t);};
   at(.5,.3,.55,.6);at(.5,.3,.55,-.6);at(.28,.22,-.6,.45);at(.28,.22,-.6,-.45);
   g.add(wheels);upSpin.push({slot:g,o:wheels,axis:'x',v:0}); // 静置陈列，不转
  }else if(lv===6){ // 联合收割机：割台 + 拨禾轮（转）+ 粮筒
   const paint=UM(0x466b4a,.95,{roughness:.5,metalness:.15}),tyre=UM(0x2b2b2b,1),grain=UM(0xd9b25f,.95,{metalness:.4,roughness:.4});
   const hull=upBox(2.4,.85,1.25,paint);hull.position.y=.95;g.add(hull);
   const cab=upBox(.85,.7,1.05,paint);cab.position.set(-.6,1.72,0);g.add(cab);
   const reel=new THREE.Group();
   reel.add(new THREE.Mesh(new THREE.TorusGeometry(.42,.06,6,14),iron));
   for(let i=0;i<5;i++){const t=upBox(.05,.05,.9,iron);t.rotation.x=i*Math.PI/5*.0;t.position.y=0;reel.add(t);}
   reel.position.set(1.45,1.15,0);g.add(reel);upSpin.push({slot:g,o:reel,axis:'z',v:.04});
   const table=upBox(.7,.14,1.5,iron);table.position.set(1.4,.5,0);table.rotation.z=.35;g.add(table);
   const tank=upCyl(.3,.3,.7,grain,10);tank.position.set(-.3,1.85,.0);g.add(tank);
   for(const z of[-.55,.55]){const t=upCyl(.42,.42,.26,tyre,14);t.rotation.x=Math.PI/2;t.position.set(.55,.42,z);g.add(t);}
  }else if(lv===7){ // 智能无人机：悬空 + 四旋翼（转）+ 航拍蓝光
   const shell=UM(0x37474f,.95,{metalness:.45,roughness:.35}),blade=UM(0x90a4ae,.9);
   const drone=new THREE.Group();
   drone.add(upBox(.9,.26,.9,shell));
   for(const [x,z] of[[.62,.62],[.62,-.62],[-.62,.62],[-.62,-.62]]){
    const arm=upBox(.7,.07,.07,shell);arm.position.set(x*.55,.05,z*.55);arm.rotation.y=Math.atan2(z,x);drone.add(arm);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.3,.03,6,14),blade);ring.rotation.x=Math.PI/2;ring.position.set(x,.16,z);drone.add(ring);
    const rot=new THREE.Group();
    for(let i=0;i<2;i++){const b=upBox(.56,.02,.06,blade);b.rotation.y=i*Math.PI/2;rot.add(b);}
    rot.position.set(x,.2,z);drone.add(rot);upSpin.push({slot:g,o:rot,axis:'y',v:1.6});
   }
   const eye=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),UM(0x64d8cb,.85,{roughness:.2}));eye.position.set(0,-.18,0);drone.add(eye);
   drone.position.set(0,2.1,.2);g.add(drone);
   upSpin.push({slot:g,o:drone,axis:'y',v:0,bob:true,base:2.1,amp:.09});
  }
 },
 // 田契界碑 + 石砌田埂：中级地一道埂，高级地加埂加水口
 land(g,lv){
  const stone=UM(0x9a958a),red=UM(0x8f3b2e);
  const base=upBox(1.2,.3,1.2,stone);base.position.y=.15;g.add(base);
  const h=1.5+lv*.25,stele=upBox(.9,h,.5,stone);stele.position.y=.3+h/2;g.add(stele);
  const cap=upBox(1.05,.18,.62,stone);cap.position.set(0,.3+h+.09,0);cap.rotation.x=.06;g.add(cap);
  const plate=upBox(.62,.5,.06,red);plate.position.set(0,.3+h*.55,.26);g.add(plate);
  for(let i=0;i<lv;i++){
   const row=upBox(3.4,.34,.5,stone);row.position.set(i?1.0:-1.0,.17,1.7+i*1.5);row.rotation.y=i?-.08:.05;g.add(row);
  }
  if(lv>=2){const sluice=upBox(.5,.5,.7,UM(0x7d766b));sluice.position.set(2.7,.25,2.6);g.add(sluice);}
  const name=UP_TEXT((LAND_LEVELS[lv]?.name||'田')+' · 地契');name.position.set(0,.3+h+.75,0);g.add(name);
 },
 // 作坊家什越添越多：米缸 → 竹匾 → 蒸甑 → 石臼炭棚 → 扇车
 workshop(g,r){
  const wood=UM(0x6f4d2e),clay=UM(0x9c6b4a),dark=UM(0x3b3a36,1),straw=UM(0xc9b06a),stone=UM(0x9a958a);
  for(let i=0;i<3;i++){
   const jar=upCyl(.42,.34,.8,clay);jar.position.set(-1.6+i*.85,.4,.5);g.add(jar);
   const lid=upCyl(.46,.46,.1,wood);lid.position.set(-1.6+i*.85,.85,.5);g.add(lid);
  }
  const rack=new THREE.Group();
  for(const x of[-.95,.95]){const p=upBox(.12,1.5,.12,wood);p.position.set(x,.75,0);rack.add(p);}
  for(const y of[.55,1.1,1.45]){const b=upBox(2.1,.08,.5,wood);b.position.set(0,y,0);rack.add(b);}
  if(r>=3)for(let i=0;i<3;i++){const t=upCyl(.34,.3,.1, straw,14);t.position.set(-.6+i*.6,1.2+(i===1?.28:0),0);rack.add(t);}
  rack.position.set(.8,0,-.4);g.add(rack);
  if(r>=3){
   const z=upCyl(.5,.44,.7,wood);z.position.set(1.9,.35,.3);g.add(z);
   const zl=upCyl(.54,.54,.12,dark);zl.position.set(1.9,.76,.3);g.add(zl);
  }
  if(r>=4){
   const mortar=upCyl(.34,.28,.5,stone,10);mortar.position.set(-1.9,.25,-.7);g.add(mortar);
   const pestle=upCyl(.06,.06,1.1,wood,8);pestle.position.set(-1.66,.55,-.55);pestle.rotation.z=.7;g.add(pestle);
   const shed=upBox(1.7,.12,1.15,straw);shed.position.set(-.55,1.52,-.9);shed.rotation.z=.16;g.add(shed);
   for(const x of[-1.3,.15]){const p=upBox(.1,1.5,.1,wood);p.position.set(x,.75,-.9);g.add(p);}
  }
  if(r>=5){
   const f=new THREE.Group();
   const housing=upCyl(.5,.5,.4,wood);housing.rotation.z=Math.PI/2;f.add(housing);
   const fan=new THREE.Group();
   for(let i=0;i<4;i++){const bl=upBox(.06,.8,.16,wood);bl.rotation.z=i*Math.PI/4;fan.add(bl);}
   fan.position.x=.3;f.add(fan);upSpin.push({slot:g,o:fan,axis:'x',v:.09});
   const spout=upBox(.55,.12,.3,wood);spout.position.set(-.5,.3,.2);spout.rotation.z=.5;f.add(spout);
   f.position.set(2.2,.62,-.9);g.add(f);
  }
  const name=UP_TEXT('作坊 · '+UP_CN[r]+'级');name.position.set(0,2.35,0);g.add(name);
 },
 // 老宅三进：档案室 → 基因库 → 文化博物馆，买到哪级亮到哪进（整组缩 0.85，别把老宅门环挡了）
 house(g,h){
  const wing=(x,build)=>{
   const b=new THREE.Group();b.scale.setScalar(.85);
   const wall=UM(0xe7dfc8),roof=UM(0x5d5648),wood=UM(0x6f4d2e),dark=UM(0x3b3a36,1);
   const body=upBox(2.1,1.4,1.6,wall);body.position.y=.7;b.add(body);
   for(const s of[1,-1]){const r=upBox(2.6,.13,1.25,roof);r.position.set(0,1.6,.5*s);r.rotation.x=.34*s;b.add(r);}
   const ridge=upBox(2.7,.1,.16,roof);ridge.position.y=1.83;b.add(ridge);
   const door=upBox(.5,.95,.08,dark);door.position.set(0,.48,.82);b.add(door);
   build(b,{wall,roof,wood,dark});
   b.position.x=x;g.add(b);return b;
  };
  if(h>=1)wing(-2.2,(b,m)=>{
   for(const x of[-.72,.72]){const win=upBox(.5,.6,.06,m.wood);win.position.set(x,.85,.82);b.add(win);}
   const p=UP_TEXT('档案室',1.9);p.position.set(0,2.25,.2);b.add(p);
  });
  if(h>=2)wing(0,(b,m)=>{
   const glass=UM(0xbcd8d2,.45,{roughness:.15,metalness:.1}),green=UM(0x7da35a),clay=UM(0x9c6b4a);
   const house_=upBox(1.9,1.1,1.4,glass);house_.position.y=.6;b.add(house_);
   for(let i=0;i<4;i++){
    const pot=upCyl(.12,.09,.2,clay,8);pot.position.set(-.62+i*.41,.12,.25);b.add(pot);
    const sprout=new THREE.Mesh(new THREE.SphereGeometry(.09,6,4),green);sprout.position.set(-.62+i*.41,.3,.25);b.add(sprout);
   }
   const p=UP_TEXT('基因库',1.9);p.position.set(0,2.25,.2);b.add(p);
  });
  if(h>=3)wing(2.2,(b,m)=>{
   const red=UM(0xa33b2e),gold=UM(0xd9b25f,.95,{metalness:.5,roughness:.35});
   for(const s of[-1,1]){const pillar=upBox(.18,1.15,.18,red);pillar.position.set(.55*s,.57,.95);b.add(pillar);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),red);lamp.position.set(.55*s,1.28,.95);b.add(lamp);}
   const lintel=upBox(1.45,.16,.2,red);lintel.position.set(0,1.2,.95);b.add(lintel);
   const stand=upBox(.9,.5,.6,m.wood);stand.position.set(0,.25,1.35);b.add(stand);
   const vase=upCyl(.14,.1,.34,gold,10);vase.position.set(0,.67,1.35);b.add(vase);
   const p=UP_TEXT('京西稻博物馆',2.1);p.position.set(0,2.35,.2);b.add(p);
  });
 }
};
function applyUpgrades(state){
 if(!scene||!renderer)return;
 const show=state?.space!=='town';
 if(!upgradeGroup){
  upgradeGroup=new THREE.Group();upgradeGroup.name='SystemHomeUpgrades';scene.add(upgradeGroup);
  for(const id of Object.keys(UP_ANCHORS)){
   const g=new THREE.Group();g.name='HomeUpg_'+id;
   const a=UP_ANCHORS[id];g.position.set(a[0],a[1],a[2]);
   upgradeGroup.add(g);upgradeGroup.userData[id]=g;upBuilt[id]=null;
  }
  window.__upgrades=upgradeGroup;
 }
 upgradeGroup.visible=show;
 if(!show)return;
 const lv={
  tool:state?.tools?.level||0,
  land:state?.landLevel||0,
  workshop:state?.workshop?.rooms||1,
  house:state?.house?.level||0
 };
 for(const id of Object.keys(UP_ANCHORS)){
  const cur=lv[id],base=id==='workshop'?1:0;
  const g=upgradeGroup.userData[id];
  if(cur<=base){if(upBuilt[id]!==null){clearSlot(g);upBuilt[id]=null;}continue;}
  if(upBuilt[id]===cur)continue;
  const grown=upBuilt[id]!==null;
  clearSlot(g);UP_BUILD[id](g,cur);upBuilt[id]=cur;
  popIn(g,grown);
  if(grown)celebrate(g);
 }
}
function updateUpgrades(now){
 for(let i=upTweens.length-1;i>=0;i--){
  const tw=upTweens[i],k=Math.min(1,(now-tw.t0)/tw.dur),e=1-Math.pow(1-k,3);
  for(const m of tw.mats)m.opacity=(m.userData.op??.95)*e;
  if(tw.g){tw.g.scale.setScalar(tw.s0+(1-tw.s0)*e);if(k>=1)tw.g.scale.setScalar(1);}
  if(k>=1)upTweens.splice(i,1);
 }
 for(const s of upSpin){
  if(s.v)s.o.rotation[s.axis]+=s.v;
  if(s.bob)s.o.position.y=s.base+s.amp*Math.sin(now*.002);
 }
 for(let i=upFx.length-1;i>=0;i--){
  const p=upFx[i],k=(now-p.t0)/p.dur;
  if(k>=1){p.mesh.parent?.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();upFx.splice(i,1);continue;}
  p.mesh.position.y+=p.v;p.mesh.material.opacity=(1-k)*.9;
 }
}
function cropShader(material,box){
 if(material.userData.farmCrop)return;material.userData.farmCrop=true;
 // —— 包 G：不再「整体拉 y 轴」了。那一手让稻子像一根被抻长的棍子，分蘖、拔节、抽穗长得一模一样。
 //    改成按株高分段做形变：株高走平滑曲线（不是线性）、越往上越收、抽穗之后穗头才往下垂、
 //    成熟期穗垂得最狠、全程有风摆且越高摆得越明显。
 //    「哪一段算穗头」由这个材质所属几何体的实际 y 范围推出来，不写死常数——
 //    否则换个模型高度，下垂就会垂到地上或者完全不垂。——
 const y0=box?box.min.y:0,y1=box?box.max.y:2,span=Math.max(.3,y1-y0);
 const headCut=(y0+span*.62).toFixed(3);
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,cropUniforms);
  shader.vertexShader='varying vec3 vFarmPosition;uniform float farmGrowth;uniform float farmStage;uniform float farmTime;\n'+shader.vertexShader;
  // 地块的裁剪（farmMask）要按「秧苗原本插在哪」算，所以先把未形变的坐标存下来，再动 transformed。
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFarmPosition=(modelMatrix*vec4(transformed,1.0)).xyz;\n'+
   'float farmK=clamp((farmGrowth-0.55)/0.45,0.0,1.0);\n'+
   'float farmE=farmK*farmK*(3.0-2.0*farmK);\n'+                       // 平滑：分蘖慢、拔节快、抽穗后再缓下来
   'transformed.y*=mix(0.55,1.0,farmE);\n'+                            // 株高：两端与旧行为一致，中间是缓动的
   'float farmRipe=clamp(farmStage-1.0,0.0,2.0)*0.5;\n'+               // 0 未抽穗 → 1 成熟
   'float farmHead=max(0.0,transformed.y-' + headCut + ');\n'+         // 只有穗头那一段受影响
   'transformed.y-=farmHead*farmE*(0.18+0.16*farmRipe);\n'+            // 抽穗后下垂，成熟期垂得最狠
   'float farmSway=farmE*farmE*clamp(transformed.y,0.0,1.5);\n'+
   'transformed.x+=sin(farmTime*1.15+transformed.z*0.7+transformed.y*1.3)*0.05*farmSway;\n'+
   'transformed.z+=cos(farmTime*0.85+transformed.x*0.6)*0.03*farmSway;');
  shader.fragmentShader='varying vec3 vFarmPosition;uniform float farmMask[10];\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nint fieldColumn=int(clamp(floor((vFarmPosition.x+40.0)/16.0),0.0,4.0));int fieldRow=vFarmPosition.z < -3.0 ? 5 : 0;if(farmMask[fieldColumn+fieldRow]<0.5)discard;');
 };
 material.customProgramCacheKey=()=> 'farm-crop-v2-'+headCut;
}
function resizeView(){
 if(!renderer)return;
 const el=document.querySelector('#viewport');if(!el)return;
 const r=el.getBoundingClientRect();
 // 按容器真实尺寸渲染（不再硬顶 1200×900），并跟随设备像素比，避免大屏发糊。
 // qualityScale 是自适应分辨率系数：帧率吃紧时由渲染循环下调，缓过来再升回去。
 const base=Math.min(ALIGN.maxPixelRatio??2,window.devicePixelRatio||1);
 const dpr=Math.max(ALIGN.minQualityScale??.7,base*qualityScale);
 renderer.setPixelRatio(dpr);
 renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);
 // 关键：相机宽高比取「实际绘制缓冲」的比例，竖屏/平板下才不会与 CSS 尺寸不一致而拉伸。
 const buf=renderer.getDrawingBufferSize(new THREE.Vector2());
 camera.aspect=buf.x/Math.max(1,buf.y);
 camera.updateProjectionMatrix();
 diagnostics.renderSize=[buf.x,buf.y];
}

let slowSamples=0,fastSamples=0,qualityScale=1,lastFrame=0,seasonStarted=0;
const diagnostics={iteration:ALIGN.iteration,renderSize:[ALIGN.width,ALIGN.height],frameTimes:[],renderer:'Three.js WebGL',threeVersion:THREE.REVISION,modelLoaded:false,frames:[],errors:[],season:'spring',triangles:0,drawCalls:0,antialias:false,softShadows:true};
window.addEventListener('error',e=>{diagnostics.errors.push(String(e.message));});
window.addEventListener('unhandledrejection',e=>{diagnostics.errors.push(String(e.reason));});

function init(){
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.max(ALIGN.minQualityScale??.7,Math.min(ALIGN.maxPixelRatio??2,window.devicePixelRatio||1)*qualityScale));renderer.setSize(ALIGN.width,ALIGN.height,false);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1;
 renderer.shadowMap.autoUpdate=false;
 diagnostics.antialias=renderer.getContext().getContextAttributes().antialias;
 $('#viewport').appendChild(renderer.domElement);
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(ALIGN.fov,4/3,.1,240);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=5;controls.maxDistance=200;controls.maxPolarAngle=Math.PI*.55;controls.target.set(0,3,0);
 hemi=new THREE.HemisphereLight(0xe3f2fc,0xb5ad7c,1.35);scene.add(hemi);
 sun=new THREE.DirectionalLight(0xffe5bf,3);sun.castShadow=true;sun.shadow.mapSize.set(ALIGN.shadowSize,ALIGN.shadowSize);
 Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:120});sun.shadow.bias=-.0006;sun.shadow.normalBias=.035;sun.shadow.radius=3;sun.shadow.blurSamples=6;sun.target.position.set(0,0,-3);scene.add(sun,sun.target);
 pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();environment=pmrem.fromScene(room,.07);room.dispose();scene.environment=environment.texture;scene.environmentIntensity=.32;
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(140,140),new THREE.MeshStandardMaterial({color:0xd6d4b7,roughness:1,map:programTexture('soil',26)}));ground.rotation.x=-Math.PI/2;ground.position.y=-.145;ground.receiveShadow=true;ground.name='BackdropGround';scene.add(ground);
 renderer.setAnimationLoop(t=>{
  // 包 G：稻子的风摆要一直在动，所以每帧把时间喂给着色器（秒）。
  cropUniforms.farmTime.value=t*.001;
  if(lastFrame&&diagnostics.modelLoaded&&t-seasonStarted>4000){diagnostics.frameTimes.push(t-lastFrame);if(diagnostics.frameTimes.length>3600)diagnostics.frameTimes.shift();}lastFrame=t;controls.update();updateHotspots(t);updateUpgrades(t);renderer.render(scene,camera);frameCount++;
  if(t-frameStart>=1000){fps=Math.round(frameCount*1000/(t-frameStart));$('#fps').textContent=fps;diagnostics.frames.push({at:Math.round(t),season:activeSeason,fps});if(diagnostics.frames.length>180)diagnostics.frames.shift();frameStart=t;frameCount=0;
   // 自适应分辨率：把渲染分辨率当阀门用，而不是把帧率锁死。
   // 低于 40 fps 连续 3 秒 → 降一档（下限 ALIGN.minQualityScale）；高于 55 fps 连续 12 秒 → 升回一档。
   // 两档之间有 15 fps 的回差，避免在阈值上反复抖动把画面弄得忽清忽糊。
   if(diagnostics.modelLoaded){
    if(fps<40){slowSamples++;fastSamples=0;}else if(fps>55){fastSamples++;slowSamples=0;}else{slowSamples=0;fastSamples=0;}
    const floor=ALIGN.minQualityScale??.7;
    if(slowSamples>=3&&qualityScale>floor){qualityScale=Math.max(floor,qualityScale-.1);slowSamples=0;resizeView();}
    else if(fastSamples>=12&&qualityScale<1){qualityScale=Math.min(1,qualityScale+.05);fastSamples=0;resizeView();}
   }
   $('#viewport').dataset.diagnostics=JSON.stringify({...diagnostics,fps,qualityScale:Math.round(qualityScale*100)/100,viewport:{width:innerWidth,height:innerHeight,pixelRatio:renderer.getPixelRatio()},camera:camera.position.toArray(),target:controls.target.toArray()});}
  diagnostics.triangles=renderer.info.render.triangles;diagnostics.drawCalls=renderer.info.render.calls;
 });
 addEventListener('resize',resizeView);
 addEventListener('orientationchange',()=>setTimeout(resizeView,120));
 if(window.visualViewport)window.visualViewport.addEventListener('resize',resizeView);
 if(window.ResizeObserver){const ro=new ResizeObserver(resizeView);ro.observe(document.querySelector('#viewport'));}
 resizeView();
 // 首屏布局（100dvh / 移动端地址栏收起等）落定前测量可能拿到瞬时值，再补两拍。
 requestAnimationFrame(()=>resizeView());
 setTimeout(resizeView,300);
 // 调试钩子：?debug=1 时把场景暴露到 window，供探针 dump 场景图
 // 注意 riceMats 用函数取：模型是静态合批的，场景里没有 Rice_ 网格可数，
 // 「挂上生长着色器的材质数」才是稻子是否在场的真凭据。
 if(new URLSearchParams(location.search).has('debug')){window.__scene=scene;window.__camera=camera;window.__renderer=renderer;window.__cropUniforms=cropUniforms;window.__seasons=SEASONS;window.__riceMats=()=>riceMats.length;}
}
function skyTexture(colors){
 const c=document.createElement('canvas');c.width=1024;c.height=768;const ctx=c.getContext('2d');
 const g=ctx.createLinearGradient(0,0,0,768);g.addColorStop(0,colors[0]);g.addColorStop(.52,colors[1]);g.addColorStop(1,colors[2]);ctx.fillStyle=g;ctx.fillRect(0,0,1024,768);
 const cfg=SEASONS[activeSeason];let seed=45;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 ctx.globalAlpha=cfg.cloudAlpha??.5;ctx.fillStyle=cfg.cloudColor||'#ffffff';
 for(let i=0;i<22;i++){let x=rnd()*1024,y=120+rnd()*270;for(let j=0;j<5;j++){ctx.beginPath();ctx.ellipse(x+j*16,y+Math.sin(j)*4,20+rnd()*45,3+rnd()*9,0,0,Math.PI*2);ctx.fill();}}
 ctx.globalAlpha=1;const glow=ctx.createRadialGradient(490,345,0,490,345,190);glow.addColorStop(0,cfg.glow||'#fff3cbaa');glow.addColorStop(1,'#ffffff00');ctx.fillStyle=glow;ctx.fillRect(280,100,450,490);
 const image=ctx.getImageData(0,0,1024,768);for(let i=0;i<image.data.length;i+=4){const v=(rnd()-.5)*(ALIGN.grain??6);image.data[i]+=v;image.data[i+1]+=v;image.data[i+2]+=v;}ctx.putImageData(image,0,0);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function setView(season){const c=SEASONS[season];camera.position.fromArray(c.camera);controls.target.fromArray(c.target);controls.update();}
const SEASON_ORDER=['spring','summer','autumn','winter'];
// 按季懒加载：初始化只解析当前季，其余三季在空闲时按需预取、进入后再解析。
// 四季模型静态合批后几何体常驻显存很可观，因此缓存只保留最近 MAX_CACHED_SEASONS 季，
// 更早的季连同材质贴图一起 dispose，下次进入时重新走网络/HTTP 缓存。
const MAX_CACHED_SEASONS=3;
function modelURL(m){return './'+m.path.split('./').map(encodeURIComponent).join('./');}
const prefetched=new Set();
function prefetchModel(season){
 const conn=navigator.connection;if(conn&&(conn.saveData||/2g|3g/.test(conn.effectiveType||'')))return;
 if(cache.has(season)||prefetched.has(season))return;
 const m=assets.find(a=>a.name===SEASONS[season].file)||assets.find(a=>a.name.toLowerCase().includes(season));
 if(!m)return;
 prefetched.add(season);
 const url=modelURL(m);
 const idle=window.requestIdleCallback||(fn=>setTimeout(fn,1200));
 try{idle(()=>{fetch(url,{cache:'force-cache'}).then(r=>r.blob()).catch(()=>{prefetched.delete(season);});},{timeout:8000});}catch{prefetched.delete(season);}
}
// 当前季加载完后在空闲时把下一季拉进浏览器缓存，切季就不用再等下载。
function schedulePrefetch(season){
 const next=SEASON_ORDER[(SEASON_ORDER.indexOf(season)+1)%SEASON_ORDER.length];
 prefetchModel(next);
}
function disposeSeasonModel(model){
 model.traverse(o=>{
  if(!o.isMesh)return;
  if(o.geometry)o.geometry.dispose();
  for(const m of (Array.isArray(o.material)?o.material:[o.material])){
   if(!m)continue;
   if(m.map&&m.map.dispose)m.map.dispose();
   if(m.normalMap&&m.normalMap.dispose)m.normalMap.dispose();
   if(m.roughnessMap&&m.roughnessMap.dispose)m.roughnessMap.dispose();
   m.dispose();
  }
 });
}
function trimCache(keep){
 if(cache.size<=MAX_CACHED_SEASONS)return;
 for(const s of [...cache.keys()]){
  if(cache.size<=MAX_CACHED_SEASONS)break;
  if(s===keep||s===activeSeason)continue;
  const m=cache.get(s);if(m&&m===activeModel)continue;
  cache.delete(s);prefetched.delete(s);disposeSeasonModel(m);
 }
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
async function changeSeason(season){
 if(!SEASONS[season])season='spring';const token=++loadToken;activeSeason=season;diagnostics.season=season;diagnostics.modelLoaded=false;diagnostics.frames=[];diagnostics.frameTimes=[];seasonStarted=performance.now();
 document.body.dataset.season=season;document.title=`穿越京西稻 · ${farmState?.activity==='processing'?'御米作坊':farmState?.activity==='sales'?'时空交易行':farmState?.activity==='variety'?'御贡图鉴':SEASONS[season].label}`;
 const url=new URL(location.href);url.searchParams.set('season',season);history.replaceState({},'',url);
 $('#season-number').textContent=SEASONS[season].num;$('#season-note').textContent=SEASONS[season].note;$('#view-description').textContent='京西御田 · '+SEASONS[season].label;
 
 document.querySelectorAll('nav [data-season]').forEach(b=>{b.classList.toggle('active',b.dataset.season===season);b.setAttribute('aria-current',b.dataset.season===season?'page':'false');});
 const c=SEASONS[season];if(scene.background?.dispose)scene.background.dispose();scene.background=skyTexture(c.sky);scene.fog=new THREE.FogExp2(c.fog,c.density);
 // —— 包 G：天光/地光逐季换色，不再四季共用一个白顶。老档没有这三栏时回落到原来的值。——
 hemi.color.set(c.ambient||'#e4f1f7');hemi.groundColor.set(c.ground||'#b5ad7c');hemi.intensity=ALIGN.ambientIntensity;sun.color.setHex(c.sun);sun.intensity=c.power;sun.position.fromArray(c.sunPos);setView(season);
 const groundObj=scene.getObjectByName('BackdropGround');
 if(groundObj){groundObj.material.color.set(c.terrain||(season==='winter'?'#c6d2cc':season==='autumn'?'#c6b07a':'#b4bf99'));groundObj.material.needsUpdate=true;}
 if(activeModel){scene.remove(activeModel);activeModel=null;}
 $('#asset-message').textContent='正在加载 '+c.file+'…';$('#render-mode').textContent='GLB · LOADING';
 try{
  let model=cache.get(season);
  if(!model){
   const match=assets.find(a=>a.name===c.file)||assets.find(a=>a.name.toLowerCase().includes(season));
   if(!match)throw new Error('模型目录中缺少 '+c.file);
   const gltf=await new Promise((resolve,reject)=>loader.load(modelURL(match),resolve,ev=>{
     if(ev&&ev.total){const pct=Math.round(ev.loaded/ev.total*100);$('#asset-message').textContent=`正在加载 ${c.file}… ${pct}%（${(ev.loaded/1048576).toFixed(1)} / ${(ev.total/1048576).toFixed(1)} MB）`;}
     else if(ev&&ev.loaded)$('#asset-message').textContent=`正在加载 ${c.file}… ${(ev.loaded/1048576).toFixed(1)} MB`;
    },reject));model=gltf.scene;
   model.updateMatrixWorld(true);const basicCache=new Map();const groups=new Map();const originals=[];
   waterMats=[];riceMats=[];tintMats=[];
   model.traverse(o=>{
    if(!o.isMesh)return;o.castShadow=!/Water|System|Rice_|Mountain/.test(o.name);o.receiveShadow=!/System|Mountain|Rice_/.test(o.name);
    if(/TreeCrowns/.test(o.name)){o.position.y-=1.4;o.scale.y=1.3;o.updateMatrixWorld(true);}
  if(!Array.isArray(o.material)&&!/Village|Rice_/i.test(o.name)){
 const old=o.material;const key=old.uuid;if(!basicCache.has(key))basicCache.set(key,new THREE.MeshBasicMaterial({map:old.map,color:old.color,side:THREE.DoubleSide}));o.material=basicCache.get(key);
}
o.castShadow=/Village|TreeTrunks/.test(o.name);o.receiveShadow=/FieldEarth|Village/.test(o.name);
const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){m.side=THREE.DoubleSide;if(m.isMeshBasicMaterial){const tint=ALIGN.seasons[season].tint||'#ffffff';m.color.set(tint);}m.forceSinglePass=true;if(m.map)m.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());if(/water/i.test(m.name)){m.roughness=.10;m.envMapIntensity=1.25;m.depthWrite=false;} }
    if(Array.isArray(o.material))return;
    // KHR_mesh_quantization 的顶点是「归一化整数」（GPU 采样时才反归一化）。
    // CPU 侧 applyMatrix4 读到的是原始整数值，且写回整数数组时会截断 —— 直接烘焙
    // 会把整个农场坍缩成一个贴在原点的小黑块。先反归一化成 float32 再烘焙。
    const g0=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
    for(const an of ['position','normal','uv']){const a=g0.attributes[an];if(!a||!a.normalized)continue;const den=a.array instanceof Int8Array?127:a.array instanceof Uint8Array?255:a.array instanceof Int16Array?32767:65535;const f=new Float32Array(a.array.length);for(let i=0;i<f.length;i++){const v=a.array[i]/den;f[i]=den===127||den===32767?(v<-1?-1:v):v;}g0.setAttribute(an,new THREE.BufferAttribute(f,a.itemSize));}
    const g=g0;g.applyMatrix4(o.matrixWorld);for(const attr of Object.keys(g.attributes))if(!['position','normal','uv'].includes(attr))g.deleteAttribute(attr);
    if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    const selMats=Array.isArray(o.material)?o.material:[o.material];
    if(/Rice_/.test(o.name)){g.computeBoundingBox();cropShader(o.material,g.boundingBox);selMats.forEach(m=>{if(!riceMats.includes(m)){if(/grain/i.test(m.name))m.userData.grain=true;riceMats.push(m);}});}
    if(/water/i.test(o.name))selMats.forEach(m=>{if(!waterMats.includes(m))waterMats.push(m);});
    else if(/FieldEarth|Village|Ground|Field/i.test(o.name))selMats.forEach(m=>{if(!waterMats.includes(m)&&!riceMats.includes(m)&&!tintMats.includes(m))tintMats.push(m);});
    const key=o.material.uuid+':'+o.castShadow+':'+o.receiveShadow;const group=groups.get(key)||{geometries:[],material:o.material,cast:o.castShadow,receive:o.receiveShadow};group.geometries.push(g);groups.set(key,group);originals.push(o);
   });
   for(const [key,group]of groups){const geom=mergeGeometries(group.geometries,false);if(!geom)throw new Error('静态模型合批失败');const mesh=new THREE.Mesh(geom,group.material);mesh.name='StaticBatch_'+key;mesh.castShadow=group.cast;mesh.receiveShadow=group.receive;model.add(mesh);group.geometries.forEach(g=>g.dispose());}
   originals.forEach(o=>{o.parent.remove(o);o.geometry.dispose();});cache.set(season,model);trimCache(season);
  }
  if(token!==loadToken)return;activeModel=model;scene.add(model);renderer.shadowMap.needsUpdate=true;await renderer.compileAsync(scene,camera);
  if(farmState)syncSurface(farmState);
  if(token!==loadToken)return;diagnostics.modelLoaded=true;diagnostics.model=c.file;diagnostics.error=null;
  $('#asset-message').textContent=`${c.file} · 模型已加载 · 四季对齐 · 第 ${ALIGN.iteration-1} 轮`;
  $('#render-mode').textContent='GLB · WebGL';
  schedulePrefetch(season);
 }catch(err){if(token!==loadToken)return;errorMessage=String(err.message);diagnostics.error=errorMessage;diagnostics.errors.push(errorMessage);$('#asset-message').textContent=errorMessage;$('#render-mode').textContent='模型待导入';}
}
$('#reset-view').addEventListener('click',()=>{setView(activeSeason);toast('已恢复田野镜头');});
document.addEventListener('pointerdown',()=>{audioUnlock();if(farmState)audioScene({water:farmState.water,ecology:farmState.ecology});},{once:true});
window.jingxiAudio={toggle:()=>{const on=audioToggle();toast(on?'音效已开启':'音效已关闭');return on;}};
// —— 包 A：先过档位这一关，再起游戏。——
// 规则：正式局（无 ?demo=1）第一次进来必须选一个档位；选过就直接进；?slot=N 跳过界面直进第 N 档。
// 试玩局（?demo=1）完全不经过这里，存档只落 sessionStorage，关掉标签页就没了，不占任何档位。
function gateToSlot(){
 const q=new URLSearchParams(location.search);
 if(q.get('demo')==='1')return true;
 migrateLegacySlots();
 const want=forcedSlot();
 if(want!==null)pickSlot(want);
 if(currentSlot()!==null)return true;
 mountSlotPicker({parse:readSave,onPicked:()=>location.reload()});
 diagnostics.slotPicker=true;
 return false;
}
async function boot(){init();bindHotspotPointer();assets=(await (await fetch('./manifest.json')).json()).files;const game=mountFarm({onChange:syncFarm});gameAPI=game;mountImmersive(game);resizeView();window.__JINGXI_BOOTED=true;}
if(gateToSlot()){try{await boot();}catch(err){$('#farm-root').textContent='页面初始化失败：'+err.message;diagnostics.errors.push(String(err));}}
