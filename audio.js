// 程序化音效层：不依赖任何音频素材，全部用 Web Audio API 合成。
// 设计意图（隐性反馈）：水质好 → 流水声 + 随机鸟鸣；生态差 → 几乎静音，只留风声。
let ctx=null,master=null,waterG=null,windG=null,birdG=null,noiseBuf=null,birdTimer=null,birdLevel=0;
let on=true;
const KEY='jingxi-audio-on';
try{on=localStorage.getItem(KEY)!=='off';}catch{}
const clamp01=v=>Math.max(0,Math.min(1,v));
function makeNoise(c){
 const len=Math.floor(c.sampleRate*2),b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);
 let last=0;for(let i=0;i<len;i++){const w=Math.random()*2-1;last=(last+.02*w)/1.02;d[i]=last*3.2;}
 return b;
}
function loopGain(type,freq,q){
 const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true;
 const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
 const g=ctx.createGain();g.gain.value=0;s.connect(f);f.connect(g);g.connect(master);s.start();
 return g;
}
export function unlock(){
 if(ctx||!on)return false;
 try{
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  if(ctx.state==='suspended')ctx.resume();
  master=ctx.createGain();master.gain.value=.5;master.connect(ctx.destination);
  noiseBuf=makeNoise(ctx);
  waterG=loopGain('lowpass',900,.7);
  windG=loopGain('bandpass',420,.35);
  birdG=ctx.createGain();birdG.gain.value=.6;birdG.connect(master);
  return true;
 }catch{ctx=null;return false;}
}
function chirp(){
 if(!ctx||birdLevel<=0)return;
 const t=ctx.currentTime,f=1750+Math.random()*1500,o=ctx.createOscillator(),g=ctx.createGain();
 o.type='sine';o.frequency.setValueAtTime(f,t);
 o.frequency.exponentialRampToValueAtTime(f*1.45,t+.07);
 o.frequency.exponentialRampToValueAtTime(f*.92,t+.15);
 g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.075*birdLevel,t+.02);
 g.gain.exponentialRampToValueAtTime(.0008,t+.24);
 o.connect(g);g.connect(birdG);o.start(t);o.stop(t+.26);
}
function scheduleBird(){
 clearTimeout(birdTimer);birdTimer=null;
 if(!ctx||birdLevel<=0)return;
 birdTimer=setTimeout(()=>{chirp();if(Math.random()<.4)setTimeout(chirp,200+Math.random()*260);scheduleBird();},1100+Math.random()*2900);
}
export function setScene({water=50,ecology=50}={}){
 if(!ctx)return;
 const w=clamp01(water/100),e=clamp01(ecology/100),t=ctx.currentTime;
 const silent=1-e;
 for(const [g,v] of [[waterG,.05+.13*w],[windG,.012+.055*silent]]){
  if(!g)continue;g.gain.cancelScheduledValues(t);g.gain.linearRampToValueAtTime(v,t+1.4);
 }
 birdLevel=Math.max(0,e*1.25-.3);
 if(birdLevel>0&&!birdTimer)scheduleBird();
 if(birdLevel<=0){clearTimeout(birdTimer);birdTimer=null;}
}
function tone({type='sine',from=440,to=440,dur=.18,gain=.11,delay=0}){
 if(!ctx)return;
 const t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();
 o.type=type;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,to),t+dur);
 g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.014);
 g.gain.exponentialRampToValueAtTime(.0008,t+dur);
 o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.02);
}
export function sfx(kind){
 if(!ctx||!on)return;
 if(kind==='plant'){tone({type:'sine',from:220,to:110,dur:.16,gain:.10});tone({type:'triangle',from:1500,to:900,dur:.06,gain:.03,delay:.02});}
 else if(kind==='inspect'){tone({type:'triangle',from:900,to:620,dur:.07,gain:.055});tone({type:'triangle',from:1200,to:800,dur:.07,gain:.045,delay:.11});}
 else if(kind==='harvest'){[520,660,790].forEach((f,i)=>tone({type:'sine',from:f,to:f*1.02,dur:.5,gain:.075,delay:i*.12}));}
 else if(kind==='detect'){tone({type:'sine',from:1400,to:420,dur:.22,gain:.08});}
 else if(kind==='choice'){tone({type:'square',from:320,to:300,dur:.06,gain:.035});}
 else if(kind==='reward'){[660,880,1180].forEach((f,i)=>tone({type:'sine',from:f,to:f,dur:.34,gain:.07,delay:i*.09}));}
 // 耕织图修复（Q-9.5）：五声音阶琶音模拟古琴拨弦，逐层显画时伴音，约 3.5 秒。
 else if(kind==='gengzhi'){[262,294,330,392,440,523,587,659,784,880].forEach((f,i)=>tone({type:'triangle',from:f,to:f*.996,dur:.9,gain:.05,delay:i*.35}));}
}
export function toggle(){
 on=!on;
 try{localStorage.setItem(KEY,on?'on':'off');}catch{}
 if(on)unlock();
 if(master)master.gain.setTargetAtTime(on?.5:0,ctx.currentTime,.15);
 if(!on){clearTimeout(birdTimer);birdTimer=null;}
 return on;
}
export function isOn(){return on;}
export function ready(){return !!ctx;}
export default {unlock,setScene,sfx,toggle,isOn,ready};
