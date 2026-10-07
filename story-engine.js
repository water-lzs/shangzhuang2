import {awardFragment,VARIETIES} from './variety-engine.js'
import {ECON} from './economy.js'
// —— 包 I2 / Q-9.9：天工开物的科技定义与研发规则已抽到 tech-engine.js ——
import {TECHS,TECH_IDS,newTechState,normalizeTech,techStart} from './tech-engine.js'
export {TECHS} from './tech-engine.js'
// —— 包 B：种子来源（c）。穿越任务结算时，行囊里带回一份当世的稀有稻种。——
export const QUEST_SEED_REWARD={spring:{id:'purple',n:2},summer:{id:'bigRed',n:2},autumn:{id:'water300',n:2},winter:{id:'yuefu3',n:3}};
// 科技表见 tech-engine.js（TECHS 已从这里转出，UI 直接引 tech-engine 亦可）。
export const CHAPTERS=[{"season":"spring","title":"第一章 · 春水认人","paragraphs":["【系统档案·谷雨】绑定对象：林宇。原职业：程序员。坐标：清代，京西稻田。归返条件：待校验。提示音只响了半声，像有人用指甲轻叩瓷碗。他伸手去找键盘，掌下却是一层冷泥，袖口挂着昨夜未干的露水。","田埂那头，老农周伯把一束秧递来，说：“先认水，再认田。人名晚些问也成。”林宇望着十亩浅水，习惯性地盘算最省工的办法。周伯用竹竿拦住他：“秧脚要站稳，莫只顾齐整。”远处送粮的车轮碾过石桥，车夫把一袋破口的谷子重新扎紧，没有拾尽落在辙里的几粒。","“这些都要送进宫里？”林宇问。“好的送去，留下的也得够人吃。”周伯答得很轻。系统随即亮出一行小字：贡米评级尚未生成。林宇第一次觉得，这行字漏掉的东西比写下的多。他把田号、引水口和下种的日子记在旧账纸背面，纸上的租额透过来，恰好压在自己的名字上。","【系统附注】检测到未编目记录。周伯看见纸角的朱印，忽然收了笑：“这本账，夏天别交给管水的人。”林宇翻到下一页，那里画着一条被墨线截断的水渠。水声还在，图上的下游却没有田。"]},{"season":"summer","title":"第二章 · 渠下无名","paragraphs":["【系统档案·小暑】巡田记录开放。建议：保存每次选择及其后果。林宇沿渠走了三回，鞋底的泥由软变硬，叶背的虫卵却一天多过一天。系统列出水源与除虫办法，每项都有代价，唯独没有替他作主。","管水的差役拿着名册来，说上游先足了水，下游再等。周伯把空瓢放在田埂上：“等得起的是人，秧不成。”林宇想起账纸上的断渠，才看清所谓空地，原来是几户佃农的田，被画在册页之外。一个背蟹篓的姑娘停在渠边，自称阿禾：“图里没有，脚下总有。你肯去看，我带路。”","林宇曾以为找到最好的办法，就能把一季平安算出来。眼下清水要工钱，捉虫要人手，买蟹苗也须留下秋后的口粮。他逐项记下所得与所失，又替下游几户补上田号。周伯没有夸，只将湿透的账纸挪到灯边：“记全了，来年的人才知道怎么接着做。”","【系统校验】新增田号无法匹配贡册。夜里，阿禾送来一张旧种袋，袋上写着两个不同的稻名，旁边却盖着同一枚贡米印。她说：“秋后送粮，你把这个也带上。”灯芯爆出细小的火星，系统把其中一个名字反复擦去，又反复补回。"]},{"season":"autumn","title":"第三章 · 谷仓缺页","paragraphs":["【系统档案·秋分】收获待入库。请核对斤数、品质与留种。镰刀划过稻秆，声音短而密。林宇把稻谷摊开，好的、瘪的分列在簸箕里；同样一亩田，水、虫与人工留下的差别，到了掌心才有分量。","粮铺掌柜只问成色，不问稻名。阿禾把旧种袋搁在柜上：“若年年只写贡米，谁还认得它原来的样子？”掌柜停了算盘：“交得齐，册子便算齐。”林宇翻到往年的留种页，纸缝里藏着几行小字：某户迁去，某渠改道，某种停留。没有一道命令叫稻种消失，名字却在一次次誊抄中变少了。","他将田间手记对上贡册，系统忽然发出两声不等长的提示音。【校验失败。贡米连续记录，不等于稻种连续传承。】原本通向归返的光标停住，仓壁上闪过没有水的渠、合上的种匣和一页无人署名的新表。那些影像比他所在的年代晚得多，却不能完整读取。","“断的不是某一年。”林宇低声说，“是没人再记谁留了种，谁会种。”周伯从空匣底取出一把钥匙：“冬天去老宅，把另一半账找出来。”系统最后留下一句：归返条件存在误译。随后，所有代表奖励的字都暗了。"]},{"season":"winter","title":"第四章 · 留种之人","paragraphs":["【系统档案·冬至】异常复核完成。此处所称“断代”，为种名、田渠与耕作记录之间的断链。林宇推开老宅的柜门，钥匙转得很涩。另一半账没有贡额，只有换种的人家、试水的日子，以及几次失败后留下的改法。","阿禾读到祖母的名字，手指停在纸边：“她只说过怎样晒种，从没说自己也进过档案。”周伯把火盆拨亮：“给谁种过田，册上有；怎样把田种活，倒常常没处写。”系统显出更正：复兴对象不是一批可交割的贡米，而是能够继续传下去的稻作。秋夜的故障并非催他赚得更多，而是两套记法终于互相抵触。","林宇把收获的品种逐一比对，将作坊、交易与乡邻手中的残图接在一起。没有收过的，他留下空格；不明白的，他在旁边写“待访”。写程序时最怕未完成，如今却懂得，空格比伪造一个完整答案更能让后来人接手。归返的提示重新亮起，这一次没有倒数。","“明春还下田么？”阿禾问。林宇将留种簿放到门边：“先让接手的人认得它。”【系统提示】终章依经营与收藏记录核验。窗外积雪化出一道细水，正流向春天那条断渠。种匣底还有一粒无名稻，等着下一年的第一块空地。"]}]
export const QUESTS=Object.fromEntries(CHAPTERS.map(c=>[c.season,{title:c.title,text:c.paragraphs.join('\n\n')}]))
export const chapterLimit=s=>s.year>1?3:Math.max(0,CHAPTERS.findIndex(c=>c.season===s.season))
export function newStory(){return {introSeen:false,systemLog:['系统连接成功：京西稻贡米系统已绑定。'],tech:newTechState(),techNotice:false,quest:null,questsDone:0,fragments:0,cards:[],archive:{pages:[0,0,0,0],claimed:[]}};}
// —— 包 I2：科技结构从「boolean 买断」迁到「{state,branch,progress} 立项研发」；迁移过的旧档给一次提示。——
export function normalizeStory(s){
 if(s===undefined)return newStory()
 if(!s||typeof s.introSeen!=='boolean'||!s.tech||typeof s.tech!=='object'||!Array.isArray(s.systemLog)||s.systemLog.some(t=>typeof t!=='string')||!Array.isArray(s.cards)||s.cards.some(t=>typeof t!=='string')||!Number.isSafeInteger(s.fragments)||s.fragments<0||!Number.isSafeInteger(s.questsDone)||s.questsDone<0)return null
 s=structuredClone(s)
 const legacyIds=TECH_IDS.filter(id=>s.tech[id]===true)
 const tech=normalizeTech(s.tech)
 if(!tech)return null
 s.tech=tech
 if(legacyIds.length){s.techNotice=true;s.techLegacy=legacyIds}else{s.techLegacy=[];if(typeof s.techNotice!=='boolean')s.techNotice=false}
 if(s.quest!==null&&(!s.quest||!Object.hasOwn(QUESTS,s.quest.season)||!['ready','resolved'].includes(s.quest.phase)))return null
 if(s.archive===undefined){s.archive={pages:[0,0,0,0],claimed:[]};s.quest=null;}
 const a=s.archive
 if(!a||!Array.isArray(a.pages)||a.pages.length!==4||a.pages.some((n,i)=>!Number.isInteger(n)||n<0||n>CHAPTERS[i].paragraphs.length)||!Array.isArray(a.claimed)||new Set(a.claimed).size!==a.claimed.length||a.claimed.some(i=>!Number.isInteger(i)||i<0||i>3||a.pages[i]!==CHAPTERS[i].paragraphs.length))return null
 return s
}
export function reduceStory(current,action){const s=structuredClone(current),w=normalizeStory(s.story);if(!w)return {state:current,error:'叙事存档无效。'};s.story=w;let error=null;const fail=t=>error=t,log=t=>{w.systemLog.unshift(t);w.systemLog=w.systemLog.slice(0,24);};const i=action.chapter??CHAPTERS.findIndex(c=>c.season===(w.quest?.season||s.season)),c=CHAPTERS[i],a=w.archive,valid=Number.isInteger(i)&&i>=0&&i<=chapterLimit(s)
 if(action.type==='story:ack'){if(!w.introSeen){w.introSeen=true;log('林宇：先把这一季的田记清楚。');}}
 else if(action.type==='story:tech'){const e=techStart(s,action.tech,action.branch);if(e)fail(e);else{const d=TECHS[action.tech],b=d.branches[action.branch];log(`天工开物：立下「${d.name}·${b.name}」项目，投入 ${d.cost.wen} 文、${d.cost.rice} kg 稻米，约需 ${d.seasons} 季，七成成算。`);}}
 else if(action.type==='story:tech-notice'){w.techNotice=false;}
 else if(['story:trigger','story:read','story:skip','story:resolve'].includes(action.type)){if(!valid)fail('档案尚未随季节开放。');else if(action.type==='story:trigger'){w.introSeen=true;w.quest={season:c.season,phase:a.claimed.includes(i)?'resolved':'ready',title:c.title,text:c.paragraphs.join('\n\n')};}
 else if(action.type==='story:read'||action.type==='story:skip'){w.introSeen=true;a.pages[i]=action.type==='story:skip'?c.paragraphs.length:Math.min(c.paragraphs.length,a.pages[i]+1);}
 else if(a.pages[i]<c.paragraphs.length)fail('请先读完或跳过本章。');else if(a.claimed.includes(i))fail('本章已归档，不能重复领取。');else if(!['card','fragment'].includes(action.reward))fail('请选择奖励。');else{a.claimed.push(i);w.questsDone++;if(action.reward==='card')w.cards.push('御稻古法卡');else w.fragments+=3;w.quest={season:c.season,phase:'resolved',title:c.title,text:c.paragraphs.join('\n\n')};log(`${c.title}已归档：${action.reward==='card'?'御稻古法卡':'稻种碎片 ×3'}。`);s.log.unshift('四时档案归档，旧账纸中寻得耕织图残片。');const sr=QUEST_SEED_REWARD[c.season];if(sr){const vn=(VARIETIES.find(v=>v.id===sr.id)||{}).name||sr.id;s.seedBag??={};s.seedBag[sr.id]=Math.min(ECON.seedCap,(s.seedBag[sr.id]||0)+sr.n);s.log.unshift(`行囊里多出一小包${vn}稻种（×${sr.n}），来年可以下地试种。`);}s.log=s.log.slice(0,8);awardFragment(s,'story');}}
 else fail('未知叙事操作。')
 return error?{state:current,error}:{state:s,error:null}
}
