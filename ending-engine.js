export const ENDINGS={
 merchant:{name:'御贡米商',tag:'标准结局',style:'金色宫灯、御贡车队与繁忙粮仓',rule:'生态值 ≥50，财富值 ≥500 文，成功进贡'},
 hermit:{name:'归隐田园',tag:'生态结局',style:'青绿山水、晨雾水田与稻神祠',rule:'生态值 ≥90，并选择拒绝进贡'},
 traveler:{name:'时空归客',tag:'现代结局',style:'银白时空门、现代城市与申遗灯光',rule:'13 个稻种全部收集，20 片图鉴碎片全部修复'},
 corrupt:{name:'贪腐之路',tag:'黑暗结局',style:'灰黑查抄队、破败粮仓与冷色闪电',rule:'生态值 ≤20，财富值 ≥1000 文'}
};
export function endingMetrics(s){return {ecology:s.ecology,wealth:s.sales?.wen||0,varieties:s.varietyBook?.unlocked?.length||0,fragments:s.varietyBook?.artFragments?.length||0};}
export function availableEndings(s){const m=endingMetrics(s);return {traveler:m.varieties===13&&m.fragments===20,corrupt:m.ecology<=20&&m.wealth>=1000,hermit:m.ecology>=90,merchant:m.ecology>=50&&m.wealth>=500};}
export function reduceEnding(current,action){const s=structuredClone(current);s.ending??=null;let error=null;const a=availableEndings(s);if(action.type==='ending:evaluate'){if(action.choice==='hermit'){if(!a.hermit)error='生态值尚未达到 90。';else s.ending='hermit';}else if(action.choice&&ENDINGS[action.choice]){if(!a[action.choice])error='当前数值尚未满足该结局门槛。';else s.ending=action.choice;}else{s.ending=Object.keys(ENDINGS).find(k=>a[k])||null;}}else error='未知结局操作。';return error?{state:current,error}:{state:s,error:null};}
