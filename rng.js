// 共享的线性同余随机数：所有玩法（种植、加工、交易、社交、剧情、碎片掉落）都必须走这里，
// 种子存在 state.rng 里，这样读档后重放同一操作的结果才一致。
// 单独成模块是为了避免 variety-engine 反向 import farm-engine 造成循环依赖。
export function nextRandom(s){
 s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;
 return s.rng/4294967296;
}
export function pickIndex(s,length){
 return Math.min(length-1,Math.floor(nextRandom(s)*length));
}
