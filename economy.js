// 经济参数总表（包 O·经济平衡）。全部数值集中在这一个文件，要调档只改这里。
// 单位约定：1 kg = 2 斤；1 石 = 50 kg = 100 斤。价格基准是“良”级稻米的渠道价（文/斤）。
import {VARIETIES} from './variety-engine.js';
export const ECON={
 yieldBase:50,          // 御稻米亩产基准 kg（原 500，压缩 90%）
 rentPerAcre:20,        // 地租 文/亩/季（原 5，只占毛收 2% 形同虚设，已提到 20）
 toolUpkeep:4,          // 工具维护 文/件/季（件数 = 工具等级 + 1）
 houseUpkeep:20,        // 老宅修缮 文/季
 bribeChance:.3,        // 贪官索贿概率
 bribeRate:.2,          // 索贿扣当季收入比例
 disasterChance:.3,     // 天灾概率
 disasterMin:.3,        // 减产下限
 disasterMax:.5,        // 减产上限
 agedSeasons:3,         // 存放超过几季开始陈化
 agedDiscount:.5,       // 陈化后售价倍率
 lossMax:.30,           // 加工损耗上限（一个配方都没学）
 lossMin:.10,           // 加工损耗下限（配方全学会）
 lossStep:.025,         // 每多学一个配方，损耗降低

 // —— 经营压力（包 P）：留种不再全额返还，体力要省着用，钱成了真正的约束 ——
 seedKeepRate:.6,       // 收获留种比例（按已种亩数），其余要花钱买
 seedPrice:8,           // 集市买种 文/份
 seedCap:99,            // 种子库存上限
 hireCost:20,           // 雇短工 文/次
 hireStamina:40,        // 雇短工恢复体力
 staminaPlant:3,        // 插秧 体力/亩
 staminaInspect:7,      // 巡田 体力/次
 staminaHarvest:8,      // 收割 体力/次
 staminaDetect:5,       // 检测田情 体力/次（每季限一次）
 // 防卡死：一年靠 100 点体力不够用，但也不能让玩家「体力耗尽 + 无钱雇工 +
 // 生态事件挂着」三条同时成立 —— 那样夏季事件三个选项全不可用，而 advance 又被
 // pending 挡住，整局就死在这儿了。两道保险：
 //   ① 每次季节推进给一个体力保底（农闲总能缓过来）
 //   ② 雇短工钱不够时，每季可「邻里换工」一次（不花钱也回体力）—— 这才是真正的逃生口，
 //      因为保底只在 advance 时结算，而卡死状态下恰恰推不动 advance。
 staminaFloor:60,
 barterPerSeason:1,     // 每季可换工次数（不花钱，回 hireStamina 点体力）

 // —— 品质门槛（包 P）：不再是「选玉泉 = 优」，生态值也进公式 ——
 qWaterW:.40,           // 水质权重
 qHealthW:.25,          // 适湿权重
 qPestW:.20,            // 无虫害权重
 qEcoW:.15,             // 生态权重
 maxPixelRatio:2        // 渲染像素比上限（大屏清晰度与性能的折中）
};
export const JIN_PER_KG=2;
export const JIN_PER_STONE=100;
export {QUALITY_ORDER} from './variety-engine.js';
export const QUALITY_RATE={'特优':10/3,'优':2,'良':1,'劣':1/3};
// 渠道基准价（文/斤，良级）：市场 3、粮店 2（大宗）、酒楼 5（高端，只收优及以上）
export const RICE_BASE_PRICE={market:3,store:2,restaurant:5};
// 加工增值率：成品售价 = 原料成本 ×(1+PROCESS_MARKUP)
export const PROCESS_MARKUP=.3;
export const YIELD_TABLE=Object.fromEntries(VARIETIES.map(v=>[v.id,v.yield]));

// ================== 包 B / Q-9.14：种子经济 · 生长时间 · 年景 · 升级链 ==================

// —— 生长时间：游戏内「天」是唯一时间刻度，1 天 = 现实 20 秒 ——
export const DAY_MS=20000;        // 1 游戏天 = 现实 20 秒
export const CATCHUP_MAX=3;       // 关掉页面再回来，最多一次补算 3 天（防止隔一周回来直接成熟）
export const INSPECT_LIMIT=3;     // 每季可巡田加速的次数上限

// —— 种子按稀有度定价（文/份）：图鉴收录越靠后的品种越贵 ——
export const SEED_PRICE={royal:20,purple:25,bigPurple:30,mingMang:30,bigRed:30,smallRed:45,silver:55,water300:80,jingyue1:110,yuefu3:95,jindao305:150,shangxiang1:180,jingxi3:200};
export const seedPriceOf=id=>SEED_PRICE[id]??ECON.seedPrice;
// 开局种子：只给 3 份御稻米，其余全靠自己挣（留种 / 收录奖励 / 穿越任务 / 粮店购买 / 邻里借种）
export const START_SEEDS={royal:3};
export const BEG_SEEDS={royal:3};   // 邻里借种：每季 1 次，绝不让人卡在「无种可种」

// —— 年景（每年开局随机 roll 一个）：影响产量系数、水量消耗、虫害初始值与生长天数 ——
export const OMENS={
 normal:{name:'风调雨顺',desc:'雨水调和，田里少事，穗子也稳。',yieldMul:1.05,waterCostMul:1,pestAdd:0,growAdd:0},
 cold:{name:'倒春寒',desc:'春寒拖了半个月，稻苗发得比往年慢。',yieldMul:.95,waterCostMul:1,pestAdd:0,growAdd:1},
 pest:{name:'虫害年',desc:'虫口比往年密，田埂上的鸟都少了。',yieldMul:.9,waterCostMul:1,pestAdd:18,growAdd:0},
 drought:{name:'大旱',desc:'水比油贵，引水的工钱要加价，田土也干得快。',yieldMul:.9,waterCostMul:1.5,pestAdd:5,growAdd:0},
 bumper:{name:'丰收年',desc:'天时顺，稻穗压得田埂都弯了。',yieldMul:1.2,waterCostMul:1,pestAdd:0,growAdd:0}
};
export const OMEN_KEYS=Object.keys(OMENS);

// —— 当年特殊事件（每年抽 1 条，抽过的不再重复；不阻塞主线，随时可处理）——
// pay = 花钱息事；resist = 硬扛，代价落在体力 / 生态 / 虫害上。
export const OMEN_EVENTS=[
 {id:'caoyun',name:'漕运加派',text:'漕船要提前装粮，官府加派一趟脚力，家家出人。',payText:'出钱雇车代役',pay:{wen:80},resistText:'自己扛，弯腰半日',resist:{stamina:20}},
 {id:'hegong',name:'河工征夫',text:'上游修渠要人，册子上念到了你的田号。',payText:'交钱免役',pay:{wen:120},gain:{ecology:3},resistText:'亲自上工，田里荒几天',resist:{ecology:10}},
 {id:'shexi',name:'社戏摊派',text:'村里搭台唱戏，按亩摊钱，少了不好看。',payText:'按亩出份子',pay:{wen:60},gain:{ecology:2},resistText:'推说田里忙',resist:{stamina:15}},
 {id:'chongfan',name:'虫贩上门',text:'挑担的虫贩子蹲在田埂上，说他的药水能保一季太平。',payText:'买下他的药水',pay:{wen:100},gain:{pests:-15},resistText:'摆手赶人',resist:{pests:15}},
 {id:'yanshang',name:'盐商收青',text:'盐商想低价收青苗，拿陈米抵账也认。',payText:'拿陈米抵过去',pay:{rice:150},resistText:'硬顶回去',resist:{ecology:8}},
 {id:'tiejiang',name:'铁匠赊账',text:'铁匠拿着旧账单上门，说农具该换了。',payText:'结清旧账',pay:{wen:150},resistText:'自己敲打修补',resist:{stamina:12}},
 {id:'miaohui',name:'庙会借棚',text:'庙会要借你家的晒谷棚，管事人开口就是一笔香火钱。',payText:'出香火钱',pay:{wen:70},gain:{culture:1},resistText:'婉言推了',resist:{stamina:18}},
 {id:'xianxue',name:'县学劝捐',text:'县学修葺，劝捐的名帖送到了门口。',payText:'认捐一笔',pay:{wen:200},gain:{culture:1},resistText:'推脱不认',resist:{ecology:12}}
];
export const OMEN_EVENT_MAP=Object.fromEntries(OMEN_EVENTS.map(e=>[e.id,e]));

// —— 轮作（第 3 年起解锁）：同块地连作减产，换品种有加成 ——
export const ROTATION={fromYear:3,sameMul:.92,swapMul:1.06};

// ================== Q-9.14：金钱升级链 ==================
// 工具七级（0 级为手动农具，向上 7 次升级）：收割更省力、亩产更高
export const TOOL_LEVELS=[
 {level:0,name:'手动农具',cost:0,harvestStamina:1,yieldMul:1},
 {level:1,name:'曲辕犁',cost:1000,harvestStamina:.92,yieldMul:1.06},
 {level:2,name:'水车',cost:3000,harvestStamina:.88,yieldMul:1.12},
 {level:3,name:'牛耕',cost:8000,harvestStamina:.82,yieldMul:1.18},
 {level:4,name:'脚踏打谷机',cost:15000,harvestStamina:.75,yieldMul:1.25},
 {level:5,name:'小型拖拉机',cost:30000,harvestStamina:.66,yieldMul:1.34},
 {level:6,name:'联合收割机',cost:80000,harvestStamina:.55,yieldMul:1.45},
 {level:7,name:'智能无人机',cost:150000,harvestStamina:.42,yieldMul:1.6}
];
// 土地三级：地力提升 → 品质分加成（钱的出口之一）
export const LAND_LEVELS=[
 {level:0,name:'初级地',costPerAcre:0,qBonus:0},
 {level:1,name:'中级地',costPerAcre:1000,qBonus:4},
 {level:2,name:'高级地',costPerAcre:3000,qBonus:9}
];
// 作坊 Lv1→Lv5：加工损耗逐级下降
export const WORKSHOP_LEVELS=[
 {level:1,cost:0,lossBonus:0},
 {level:2,cost:2000,lossBonus:.03},
 {level:3,cost:5000,lossBonus:.06},
 {level:4,cost:10000,lossBonus:.09},
 {level:5,cost:20000,lossBonus:.13}
];
// 老宅 Lv1→Lv4：档案室 / 基因库 / 文化博物馆，各自减免或增益一处玩法成本
export const HOUSE_LEVELS=[
 {level:0,name:'老宅',cost:0,effect:'暂无改建'},
 {level:1,name:'档案室',cost:1500,effect:'图鉴收录费 −30%'},
 {level:2,name:'基因库',cost:4000,effect:'杂交育种材料 −50%'},
 {level:3,name:'文化博物馆',cost:10000,effect:'每次收录多得 1 点文化碎片'}
];
export const levelAt=(table,level)=>table[Math.max(0,Math.min(table.length-1,level))]||table[0];
export const toolOf=s=>levelAt(TOOL_LEVELS,s?.tools?.level||0);
export const landOf=s=>levelAt(LAND_LEVELS,s?.landLevel||0);
export const roomsOf=s=>levelAt(WORKSHOP_LEVELS,(s?.workshop?.rooms||1)-1);
export const houseOf=s=>levelAt(HOUSE_LEVELS,s?.house?.level||0);
export const ricePricePerStone=(channel,quality,aged)=>{const base=RICE_BASE_PRICE[channel]||3;const rate=QUALITY_RATE[quality]||1;return Math.round(base*rate*(aged?ECON.agedDiscount:1)*JIN_PER_STONE);};
