// A deterministic scene simulation, independent of model calls and real work state.
export const zoneDefinitions = {
  work: {label:'工作區', activity:'專注工作', center:[-5.2,0,.2]},
  pingpong: {label:'桌球區', activity:'打桌球', center:[3,0,-3.4]},
  gaming: {label:'遊戲間', activity:'玩主機遊戲', center:[7.4,0,-3.5]},
  pantry: {label:'茶水間', activity:'喝咖啡', center:[2.6,0,3.5]},
  lounge: {label:'休憩角', activity:'聊天休息', center:[7.3,0,3.8]},
};
export const deskPositions = Array.from({length:8},(_,i)=>[-6.9+(i%2)*3.4,0,-4.5+Math.floor(i/2)*2.9]);
export const zoneSlots = {
  pingpong: [[.9,0,-3.4],[5.1,0,-3.4]],
  gaming: [[6.8,0,-2.6],[8,0,-2.6]],
  pantry: [[1.4,0,4.45],[3.65,0,3.5]],
  lounge: [[6.6,0,4.45],[7.9,0,4.45]],
};
const leisureZones=['pingpong','gaming','pantry','lounge'];
export const isResting = status => status==='idle'||status==='done';
export function planOfficeLife(agents, cycle=0) {
  const resting=agents.filter(a=>isResting(a.status)).map(a=>a.id).sort();
  const result={};
  for(const a of agents) result[a.id]={zone:'work',slot:0};
  const round=Math.max(0,Math.trunc(cycle));
  const solo=resting.length%2===1;
  const soloZone=['gaming','pantry','lounge'][round%3];
  const available=solo?leisureZones.filter(z=>z!==soloZone):leisureZones;
  const pairs=Math.floor(resting.length/2);
  for(let pair=0;pair<pairs;pair++) {
    const zone=available[(pair+round)%available.length];
    for(let slot=0;slot<2;slot++) result[resting[pair*2+slot]]={zone,slot};
  }
  if(solo) result[resting.at(-1)]={zone:soloZone,slot:0};
  return result;
}

export function station(zone,slot,seat) {
  return zone==='work'?[...seat]:[...zoneSlots[zone][slot%2]];
}
function entry(zone,slot,target) {
  if(zone==='pingpong') return [[-.7,0,.15],[target[0],0,.15],target];
  if(zone==='gaming') return [[-.7,0,.15],[9.1,0,.15],[9.1,0,-3.65],[target[0],0,-3.65],target];
  if(zone==='pantry') return [[-.7,0,1.1],[.65,0,1.1],[.65,0,target[2]],target];
  if(zone==='lounge') return [[-.7,0,.2],[5.4,0,.2],[5.4,0,3.9],[target[0],0,3.9],target];
  // Desk exits are aisles between rows, so nobody walks through a desk.
  const aisle=Math.min(6.0,target[2]+.8);
  return [[-.7,0,aisle],[target[0],0,aisle],target];
}
export function walkingRoute(from,oldZone,oldSlot,oldSeat,zone,slot,seat) {
  const target=station(zone,slot,seat), source=station(oldZone,oldSlot,oldSeat);
  const out=entry(oldZone,oldSlot,source).slice(0,-1).reverse();
  return [from,...out,...entry(zone,slot,target)].filter((p,i,list)=>i>0&&Math.hypot(p[0]-list[i-1][0],p[2]-list[i-1][2])>.03);
}
