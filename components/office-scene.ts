import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Agent, statuses } from "@/lib/office-types";
import { deskPositions, zoneDefinitions, planOfficeLife, station, walkingRoute } from "@/lib/office-life.mjs";

export type LifeState = Record<string, { zone: string; label: string; moving: boolean }>;
type Zone = keyof typeof zoneDefinitions;

export function createOfficeScene(host: HTMLElement, onSelect: (id: string) => void, onLife: (state: LifeState) => void = () => {}) {
  const scene = new T.Scene();
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "可旋轉的 3D 辦公室，拖曳旋轉，捲動縮放；也可使用員工清單選取角色。");
  const camera = new T.OrthographicCamera(-9, 9, 7, -7, .1, 100);
  camera.position.set(17, 18, 23);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, .6, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minPolarAngle = .28;
  controls.maxPolarAngle = Math.PI / 2.25;
  controls.minZoom = .65;
  controls.maxZoom = 1.9;
  controls.update();
  scene.add(new T.HemisphereLight(0xffffff, 0xc4b7a0, 2.8));
  const sun = new T.DirectionalLight(0xfff3d6, 3.8);
  sun.position.set(-5, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15 });
  sun.shadow.normalBias = .035;
  scene.add(sun);
  const materials = new Map<string, T.MeshStandardMaterial>();
  function material(color: string, roughness = .8) {
    if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({ color, roughness }));
    return materials.get(color)!;
  }
  function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: T.Object3D = scene) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), material(color));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function cylinder(rt: number, rb: number, h: number, color: string, x: number, y: number, z: number, parent: T.Object3D = scene, sides = 16) {
    const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, sides), material(color));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function ball(r: number, color: string, x: number, y: number, z: number, parent: T.Object3D = scene) {
    const m = new T.Mesh(new T.IcosahedronGeometry(r, 1), material(color));
    m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  }
  function textPlane(text: string, color: string, background: string, width: number, height: number) {
    const canvas = document.createElement("canvas"); canvas.width = Math.min(2048,Math.max(512,Math.round(192*width/height))); canvas.height = Math.round(canvas.width*height/width);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let fontSize=canvas.height*.5;ctx.font=`600 ${fontSize}px system-ui, sans-serif`;
    while(ctx.measureText(text).width>canvas.width*.92&&fontSize>12){fontSize-=2;ctx.font=`600 ${fontSize}px system-ui, sans-serif`;}
    ctx.fillStyle = color;ctx.textAlign = "center";ctx.textBaseline = "middle";ctx.fillText(text,canvas.width/2,canvas.height/2);
    const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ map: tex }));
    return m;
  }
  function plant(x: number, z: number, scale = 1) {
    const g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); scene.add(g);
    cylinder(.24, .18, .42, "#c29176", 0, .21, 0, g);
    cylinder(.21, .21, .03, "#635b45", 0, .43, 0, g);
    cylinder(.045, .055, 1, "#7b7652", 0, .85, 0, g);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      const leaf = ball(.32, i % 2 ? "#71906d" : "#4e735b", Math.sin(a) * .28, .85 + i * .11, Math.cos(a) * .25, g);
      leaf.scale.set(1, .48, .7); leaf.rotation.z = Math.sin(a) * .7;
    }
  }
  // One open dollhouse, five distinct spaces and a central circulation aisle.
  box(19.4,.35,13.5,"#b49c7a",0,-.23,0);
  box(19.2,.08,13.3,"#e6d8bd",0,-.02,0);
  for(let i=-18;i<=18;i++) box(.018,.012,13.2,"#d5c5a8",i*.52,.026,0);
  box(19.3,3.15,.18,"#e5e4d8",0,1.55,-6.6);
  box(.18,3.15,13.4,"#eeeadc",-9.6,1.55,0);
  box(19.3,.13,.25,"#c7c5b4",0,3.15,-6.6);
  box(.25,.13,13.4,"#d1ccba",-9.6,3.15,0);
  box(19.2,.13,.12,"#faf5e7",0,.12,-6.45);
  box(.12,.13,13.2,"#faf5e7",-9.45,.12,0);
  // Floor finishes, rather than high walls, keep every room visible.
  box(8.25,.025,12.55,"#e9dfc9",-5.35,.05,0);
  box(5.35,.025,5.85,"#c6d3bc",2.8,.05,-3.4);
  box(3.45,.025,5.85,"#c4c7d6",7.65,.05,-3.4);
  box(4.65,.025,5.5,"#e6cfb1",2.55,.05,3.55);
  box(4.05,.025,5.5,"#d2d2bd",7.4,.05,3.55);
  for(const x of [-7.05,-3.75,.95,3.8]) {
    box(2.15,1.45,.07,"#aab7aa",x,1.96,-6.46);
    box(1.95,1.25,.08,"#d9e7e1",x,1.96,-6.4);
    box(.055,1.34,.09,"#faf4df",x,1.96,-6.33);
    box(2,.055,.09,"#faf4df",x,1.98,-6.33);
    box(2.35,.12,.35,"#c3a782",x,1.2,-6.32);
  }
  const sign=textPlane("ERIC’S STUDIO · WORK & PLAY","#52634f","#e5e4d8",6.5,.42);
  sign.position.set(-4.9,2.84,-6.48);scene.add(sign);
  function floorSign(text:string,x:number,z:number,width=2.7) {
    const plate=textPlane(text,"#66745f","#f4efdf",width,.43);
    plate.rotation.x=-Math.PI/2;plate.position.set(x,.082,z);scene.add(plate);
  }
  floorSign("01  工作區",-5.2,6.1,3.2);
  floorSign("02  桌球區",2.9,-.83);
  floorSign("03  遊戲間",7.6,-.83);
  floorSign("04  茶水間",2.5,1.05);
  floorSign("05  休憩角",7.4,1.05);
  // Low planters mark room edges without blocking walking routes.
  box(.18,.62,2,"#a7b198",5.7,.35,-5.35);
  box(.18,.62,1.7,"#b4bba2",5.05,.35,5.35);
  for(const z of [-5.1,1.8]) {box(.6,.55,.9,"#c6b392",-1.25,.33,z);plant(-1.25,z,.58);}
  const desks=deskPositions.map(v=>new T.Vector3(...v as [number,number,number]));
  function desk(v: T.Vector3, i: number) {
    const { x, z } = v;
    box(2.5, .14, 1.3, "#bca07a", x, 1, z);
    box(2.52, .035, 1.31, "#dfc5a1", x, 1.09, z);
    for (const a of [-1.04, 1.04]) for (const b of [-.45, .45]) box(.09, .94, .09, "#eee9d9", x + a, .5, z + b);
    box(.48, .045, .25, "#485950", x, 1.14, z - .2);
    box(.07, .36, .07, "#485950", x, 1.34, z - .3);
    box(1.08, .72, .075, "#344b43", x, 1.65, z - .32);
    box(.95, .6, .02, "#a8c6b2", x, 1.65, z - .273);
    for (let j = 0; j < 4; j++) box(.28 + (j % 2) * .28, .026, .025, "#638c76", x - .18, 1.83 - j * .11, z - .256);
    box(.65, .03, .23, "#eeeae0", x, 1.14, z + .27);
    cylinder(.09, .075, .17, "#f3ede0", x + .85, 1.2, z + .15);
    cylinder(.07, .07, .006, "#705541", x + .85, 1.29, z + .15);
    box(.38, .04, .48, i % 2 ? "#97a8b7" : "#c9947c", x - .87, 1.14, z + .08).rotation.y = -.15;
    cylinder(.065, .065, .5, "#69766c", x, .37, z + 1);
    box(.74, .14, .65, "#7c8b7b", x, .64, z + 1);
    box(.74, .68, .12, "#7c8b7b", x, .98, z + 1.3);
    for (let j = 0; j < 5; j++) {
      const a = j * Math.PI * .4; const leg = box(.56, .045, .06, "#576458", x + Math.cos(a) * .2, .12, z + 1 + Math.sin(a) * .2); leg.rotation.y = -a;
    }
  }
  desks.forEach(desk);
  // Table tennis: paired places, net, court lines and a shared animated ball.
  box(3.0,.13,1.72,"#648e7d",3,1.02,-3.4);
  box(3.04,.035,1.76,"#e9ecdb",3,1.101,-3.4);
  box(2.91,.018,1.63,"#729b87",3,1.13,-3.4);
  box(2.95,.022,.026,"#f1f0da",3,1.15,-3.4);
  for(const x of [1.9,4.1]) for(const z of [-3.98,-2.82]) box(.1,.96,.1,"#53665b",x,.53,z);
  box(.035,.27,1.85,"#e2e6d7",3,1.3,-3.4);
  for(let i=0;i<9;i++) box(.045,.014,1.82,"#9cae98",3,1.19+i*.027,-3.4);
  const pingBall=ball(.075,"#fff3cf",2.2,1.3,-3.4);
  for(const x of [1.25,4.75]) for(const z of [-4.6,-2.2]) box(.12,.014,.12,"#e5ead8",x,.085,z);
  const scoreboard=textPlane("FRIENDLY MATCH · PLAY FAIR","#647960","#e9eddc",3.4,.42);
  scoreboard.position.set(3,2.78,-6.45);scene.add(scoreboard);
  // Main console corner: a sofa, two controllers, PS5-like tower and a dock.
  function sofa(x:number,z:number,width:number,color:string) {
    box(width,.4,.93,color,x,.47,z);
    box(width,.75,.2,color,x,.88,z+.44);
    for(const dx of [-width/2+.12,width/2-.12]) box(.24,.65,1.05,color,x+dx,.76,z);
    for(const dx of [-.59,.59]) box(.9,.13,.76,"#e0b69b",x+dx,.73,z-.05);
  }
  sofa(7.4,-2.35,2.9,"#b397a7");
  box(2.9,.5,.65,"#baa17f",7.4,.34,-5.7);
  box(2.93,.08,.72,"#dfc6a5",7.4,.62,-5.7);
  box(2.65,1.55,.11,"#333f46",7.4,1.65,-5.83);
  box(2.45,1.34,.025,"#263c50",7.4,1.65,-5.755);
  // A tiny animated racing scene on the television; purely decorative.
  box(1.1,.98,.015,"#52676b",7.4,1.58,-5.73);
  for(const dx of [-.56,.56]) box(.035,1,.02,"#c5d9bc",7.4+dx,1.58,-5.71);
  const roadMarks=Array.from({length:5},(_,i)=>box(.025,.12,.02,"#d9ddbf",7.4,1.15+i*.21,-5.7));
  const tvCars=[box(.2,.32,.025,"#c78370",7.16,1.4,-5.68),box(.2,.32,.025,"#b7ce8c",7.65,1.88,-5.68)];
  box(.17,.62,.3,"#f1eee5",8.61,.98,-5.68);box(.06,.62,.3,"#414b4c",8.59,.98,-5.67);
  box(.5,.23,.18,"#3d4d49",6.25,.8,-5.65);box(.08,.25,.18,"#93b6bf",5.99,.8,-5.65);box(.08,.25,.18,"#c98276",6.51,.8,-5.65);
  const gameSign=textPlane("PLAY TOGETHER","#6d6a7b","#e5e4d8",2.8,.35);gameSign.position.set(7.4,2.8,-6.45);scene.add(gameSign);
  // Pantry: coffee machine, mugs, water cooler and a standing conversation table.
  box(3.6,1,.72,"#aab498",2.6,.55,5.55);box(3.7,.12,.84,"#f0e6d0",2.6,1.11,5.55);
  for(const x of [1.45,2.65,3.75]) box(.02,.78,.025,"#89987d",x,.57,5.17);
  box(.76,.65,.5,"#48594f",1.45,1.48,5.5);box(.48,.3,.03,"#b8c5ad",1.45,1.53,5.23);
  cylinder(.085,.075,.13,"#fbf0dc",1.45,1.28,5.16);
  for(const x of [2.55,2.85,3.15]) cylinder(.09,.075,.17,"#f4ecdb",x,1.25,5.5);
  box(.65,1.1,.65,"#eae7dc",4.45,.6,5.55);cylinder(.22,.22,.48,"#adcbcd",4.45,1.4,5.55);
  cylinder(.68,.68,.11,"#dfc4a2",3.2,1.0,2.35,scene,32);cylinder(.1,.2,.92,"#9e9677",3.2,.5,2.35);
  // Quiet conversation corner and a low bookcase.
  sofa(7.3,4.7,2.9,"#c49d7e");
  cylinder(.65,.65,.11,"#e5cfaa",7.3,.65,2.9,scene,32);cylinder(.14,.24,.58,"#b79a78",7.3,.33,2.9);
  box(.5,.04,.36,"#8a9a7d",7.22,.74,2.9).rotation.y=.3;
  cylinder(.09,.075,.16,"#f3e9d4",7.65,.78,2.7);
  box(.45,1.15,1.9,"#ba9e7c",9.02,.64,4.35);
  for(let i=0;i<8;i++) box(.32,.35+(i%3)*.08,.12,["#8a9e86","#b98d79","#cbb77d"][i%3],8.99,.99,3.65+i*.2);
  plant(-8.65,5.65,1.2);plant(-8.7,-5.6,.9);plant(5.5,-6.0,.85);plant(8.9,5.9,.8);
  // Steam curls remain subtle and only animate while somebody uses the pantry.
  const steam=Array.from({length:3},(_,i)=>{
    const puff=ball(.055,"#e4dfd0",1.45,1.5+i*.15,5.13);puff.scale.set(.6,1.7,.6);return puff;
  });
  // A small studio companion.
  const cat = new T.Group(); scene.add(cat);
  const catBody = box(.48, .3, .27, "#c49363", 0, .24, 0, cat);
  ball(.18, "#d7a679", .23, .4, 0, cat);
  for (const z of [-.09, .09]) {
    const ear = new T.Mesh(new T.ConeGeometry(.075, .16, 3), material("#bf895f")); ear.position.set(.24, .57, z); cat.add(ear);
    for (const x of [-.14, .16]) box(.06, .16, .06, "#ae7f54", x, .09, z, cat);
  }
  const tail = cylinder(.04, .04, .45, "#bf895f", -.35, .43, 0, cat); tail.rotation.z = -.7;
  void catBody;

  type Person = { group:T.Group; arms:T.Group[]; legs:T.Group[]; ring:T.Mesh; name:T.Sprite; state:Agent; target:T.Vector3; seat:T.Vector3; labelKey:string; zone:Zone; slot:number; route:T.Vector3[]; trail:T.Vector3[]; origin: {zone:Zone;slot:number;seat:T.Vector3}; paddle:T.Group; cup:T.Group; controller:T.Group; moving:boolean; phase:number };
  const people = new Map<string, Person>(); let selected = ""; let current: Agent[] = [];
  function label(agent: Agent) {
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffffed"; ctx.beginPath(); ctx.roundRect(8, 8, 496, 144, 30); ctx.fill();
    ctx.fillStyle = statuses[agent.status].color; ctx.beginPath(); ctx.arc(51, 80, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#34483d"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "600 48px system-ui"; ctx.fillText(agent.name, 276, 80);
    const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace; return tex;
  }
  function person(a: Agent, index: number) {
    const group = new T.Group(); group.userData.agentId = a.id; scene.add(group);
    const seat = desks[index % desks.length].clone().add(new T.Vector3(0, 0, .95));
    group.position.copy(seat);
    box(.46, .55, .29, a.color, 0, 1.03, 0, group);
    box(.12, .13, .13, "#e2b28d", 0, 1.39, 0, group);
    box(.39, .42, .36, "#efc9a5", 0, 1.66, 0, group);
    box(.43, .13, .39, "#574b40", 0, 1.9, 0, group);
    box(.43, .24, .1, "#574b40", 0, 1.76, .16, group);
    for (const x of [-.09, .09]) box(.045, .05, .02, "#3d4439", x, 1.66, -.19, group);
    const arms: T.Group[] = []; const legs: T.Group[] = [];
    for (const sign of [-1, 1]) {
      const arm = new T.Group(); arm.position.set(sign * .32, 1.25, 0); group.add(arm);
      box(.16, .27, .19, a.color, 0, -.13, 0, arm); box(.14, .23, .15, "#efc9a5", 0, -.36, 0, arm); arms.push(arm);
      const leg = new T.Group(); leg.position.set(sign * .13, .75, 0); group.add(leg);
      box(.18, .55, .21, "#56625a", 0, -.28, 0, leg); box(.2, .13, .34, "#eeeadc", 0, -.6, -.05, leg); legs.push(leg);
    }
    const ring = new T.Mesh(new T.RingGeometry(.45, .53, 48), new T.MeshBasicMaterial({ color: "#4e8269", transparent: true, opacity: .7, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .055; group.add(ring);
    const name = new T.Sprite(new T.SpriteMaterial({ map: label(a), depthTest: false, transparent: true }));
    name.position.y = 2.35; name.scale.set(1.5, .47, 1); name.userData.agentId = a.id; group.add(name);
    const paddle=new T.Group();arms[1].add(paddle);paddle.position.set(0,-.48,-.03);
    cylinder(.1,.1,.045,"#c78072",0,-.07,0,paddle).rotation.x=Math.PI/2;
    box(.045,.14,.045,"#b89a73",0,.04,0,paddle);paddle.visible=false;
    const cup=new T.Group();arms[1].add(cup);cup.position.set(0,-.45,-.02);
    cylinder(.1,.085,.18,"#f4e8d0",0,0,0,cup);cylinder(.075,.075,.008,"#735643",0,.095,0,cup);cup.visible=false;
    const controller=new T.Group();group.add(controller);controller.position.set(0,1.05,-.44);
    box(.36,.13,.16,"#f0eee6",0,0,0,controller);box(.075,.16,.16,"#8cb0bb",-.21,0,0,controller);box(.075,.16,.16,"#c78171",.21,0,0,controller);
    for(const x of [-.1,.1]) ball(.035,"#4a5655",x,.085,-.02,controller);controller.visible=false;
    return {group,arms,legs,ring,name,seat,state:a,target:seat.clone(),labelKey:`${a.name}:${a.status}`,zone:'work' as Zone,slot:0,route:[],trail:[seat.clone()],origin:{zone:'work' as Zone,slot:0,seat:seat.clone()},paddle,cup,controller,moving:false,phase:index*1.7};
  }
  let lastLifeKey="", lastCycle=-1;
  function emitLife() {
    const state:LifeState={};
    for(const [id,p] of people) state[id]={zone:p.zone,label:zoneDefinitions[p.zone].label,moving:p.moving};
    const key=JSON.stringify(state);if(key!==lastLifeKey){lastLifeKey=key;onLife(state);}
  }
  function arrange() {
    const cycle=reduce.matches?0:Math.floor(elapsed/36), plan=planOfficeLife(current,cycle) as Record<string,{zone:Zone;slot:number}>;lastCycle=cycle;
    for(const [id,p] of people) {
      const next=plan[id];if(!next)continue;
      const zone=next.zone as Zone, slot=next.slot;
      const destination=new T.Vector3(...station(zone,slot,p.seat.toArray()) as [number,number,number]);
      if(zone===p.zone&&slot===p.slot&&p.target.distanceToSquared(destination)<.001)continue;
      let originZone=p.zone, originSlot=p.slot, originSeat=p.origin.seat;
      const route:T.Vector3[]=[];
      if(p.route.length) {
        // A state change during a walk retraces visited waypoints safely before rerouting.
        route.push(...p.trail.slice().reverse().map(v=>v.clone()));
        originZone=p.origin.zone;originSlot=p.origin.slot;originSeat=p.origin.seat;
      }
      const start=route.at(-1)??p.group.position;
      route.push(...walkingRoute(start.toArray(),originZone,originSlot,originSeat.toArray(),zone,slot,p.seat.toArray()).map(v=>new T.Vector3(...v as [number,number,number])));
      p.origin={zone:originZone,slot:originSlot,seat:originSeat.clone()};
      p.route=route;p.trail=[start.clone()];p.zone=zone;p.slot=slot;p.target.copy(destination);p.moving=route.length>0;
    }
    emitLife();
  }
  function update(agents:Agent[],selectedId:string) {
    selected=selectedId;current=agents;
    for(const [id,p] of people) if(!agents.some(a=>a.id===id)){scene.remove(p.group);disposePerson(p);people.delete(id);}
    agents.forEach((a,i)=>{
      if(!people.has(a.id))people.set(a.id,person(a,i));
      const p=people.get(a.id)!;p.state=a;p.seat.copy(desks[i]).add(new T.Vector3(0,0,.95));
      p.ring.visible=a.id===selected;
      const key=`${a.name}:${a.status}`;
      if(key!==p.labelKey){p.name.material.map?.dispose();p.name.material.map=label(a);p.name.material.needsUpdate=true;p.labelKey=key;}
    });
    arrange();
  }
  function disposePerson(p:Person) {
    p.group.traverse(obj=>{if(obj instanceof T.Mesh)obj.geometry.dispose();});
    p.name.material.map?.dispose();p.name.material.dispose();(p.ring.material as T.Material).dispose();
  }
  const raycaster = new T.Raycaster(); const pointer = new T.Vector2(); let startX = 0; let startY = 0;
  function down(e: PointerEvent) { startX = e.clientX; startY = e.clientY; }
  function up(e: PointerEvent) {
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) return;
    const r = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...people.values()].map(p => p.group), true);
    for (const hit of hits) { let obj: T.Object3D | null = hit.object; while (obj) { if (obj.userData.agentId) { onSelect(obj.userData.agentId); return; } obj = obj.parent; } }
  }
  renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointerup", up);
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const aspect = w / h; const span = aspect < 1 ? 14.3 : 10.2;
    camera.left = -span * aspect; camera.right = span * aspect; camera.top = span; camera.bottom = -span; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  let lastFrame = performance.now(); let elapsed = 0; const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let suspended = document.hidden;
  const visibility = () => { suspended = document.hidden; }; document.addEventListener("visibilitychange", visibility);
  renderer.setAnimationLoop(() => {
    const frame = performance.now(); const dt = Math.min((frame - lastFrame) / 1000, .05); lastFrame = frame; if (suspended) return; elapsed += dt;
    if((reduce.matches?0:Math.floor(elapsed/36))!==lastCycle)arrange();
    const atZone=(zone:Zone)=>[...people.values()].filter(p=>p.zone===zone&&!p.moving);
    const pingPlayers=atZone('pingpong');
    const rally=pingPlayers.length===2&&!reduce.matches;
    pingBall.visible=pingPlayers.length>0;
    pingBall.position.set(rally?3+Math.sin(elapsed*3.4)*1.68:2.2,rally?1.27+Math.abs(Math.cos(elapsed*6.8))*.29:1.23,-3.4+(rally?Math.sin(elapsed*6.8)*.12:0));
    const gamers=atZone('gaming').length>0;
    roadMarks.forEach((mark,i)=>{mark.position.y=gamers&&!reduce.matches?1.07+((i*.21+elapsed*.45)%1.12):1.15+i*.21;});
    tvCars.forEach((car,i)=>{car.position.x=7.4+(i?1:-1)*.25+(gamers&&!reduce.matches?Math.sin(elapsed*2+i*3)*.08:0);});
    steam.forEach((puff,i)=>{puff.visible=atZone('pantry').length>0;puff.position.y=1.5+(reduce.matches?i*.15:(elapsed*.17+i*.15)%.52);});
    for(const p of people.values()) {
      const waypoint=p.route[0];let walking=Boolean(waypoint);
      if(waypoint) {
        const dir=waypoint.clone().sub(p.group.position);dir.y=0;const distance=dir.length();
        if(reduce.matches){p.group.position.copy(p.target);p.route=[];walking=false;}
        else if(distance<.055){p.group.position.copy(waypoint);p.trail.push(waypoint.clone());p.route.shift();walking=p.route.length>0;}
        else {p.group.rotation.y=Math.atan2(-dir.x,-dir.z);p.group.position.add(dir.normalize().multiplyScalar(Math.min(dt*2.65,distance)));}
      }
      if(!p.route.length){p.group.position.x=p.target.x;p.group.position.z=p.target.z;}
      if(p.moving!==walking){p.moving=walking;if(!walking)p.origin={zone:p.zone,slot:p.slot,seat:p.seat.clone()};emitLife();}
      const rest=!walking&&['idle','done'].includes(p.state.status);
      const seated=rest&&['gaming','lounge'].includes(p.zone);
      p.group.position.y=seated?-.23:0;p.ring.position.y=.055-p.group.position.y;
      p.group.visible=p.state.status!=='offline';
      if(!walking){p.group.rotation.y=p.zone==='pingpong'?(p.slot===0?-Math.PI/2:Math.PI/2):p.zone==='pantry'?(p.slot===0?Math.PI:-1.1):p.zone==='lounge'?(p.slot===0?-.25:.25):0;}
      p.paddle.visible=rest&&p.zone==='pingpong';p.cup.visible=rest&&p.zone==='pantry';p.controller.visible=rest&&p.zone==='gaming';
      const t=elapsed+p.phase;
      p.arms.forEach((arm,i)=>{
        arm.rotation.z=0;
        if(reduce.matches){arm.rotation.x=seated?.9:0;return;}
        arm.rotation.x=walking?Math.sin(t*9+i*Math.PI)*.6:
          rest&&p.zone==='pingpong'?(i===1?.95+Math.sin(elapsed*3.4+(p.slot?Math.PI:0))*.65:.25):
          rest&&p.zone==='gaming'?1.05+Math.sin(t*6+i)*.07:
          rest&&p.zone==='pantry'?(i===1?2.0+Math.sin(t*.85)*.55:.1):
          rest&&p.zone==='lounge'?(i===1?.45+Math.sin(t*1.7)*.3:.15):
          p.state.status==='working'?.85+Math.sin(t*9+i*2)*.1:
          p.state.status==='blocked'&&i===0?2.5+Math.sin(t*3)*.15:.08;
        if(rest&&p.zone==='pingpong'&&i===1)arm.rotation.z=Math.sin(elapsed*3.4+(p.slot?Math.PI:0))*.3;
      });
      p.legs.forEach((leg,i)=>{leg.rotation.x=reduce.matches?(seated?Math.PI/2:0):walking?Math.sin(t*9+i*Math.PI)*.52:seated?Math.PI/2:0;});
      if(!reduce.matches)p.ring.scale.setScalar(1+Math.sin(t*2)*.04);
      if(rest&&p.zone==='pingpong'&&!reduce.matches)p.group.position.z+=Math.sin(elapsed*3.4+(p.slot?Math.PI:0))*.09;
    }
    cat.position.set(-.55+Math.sin(elapsed*.16)*.22,0,Math.sin(elapsed*.1)*4.5);cat.rotation.y=Math.cos(elapsed*.1)>0?Math.PI:0;
    if(reduce.matches)cat.position.set(-.55,0,2.5);
    controls.update(); renderer.render(scene, camera);
  });
  return {
    update,
    focusZone:(zone:Zone)=>{const v=zoneDefinitions[zone]?.center;if(!v)return;controls.target.set(v[0],.6,v[2]);camera.position.copy(controls.target).add(new T.Vector3(17,18,23));camera.zoom=1.6;camera.updateProjectionMatrix();controls.update();},
    reset: () => { camera.position.set(17, 18, 23); camera.zoom = 1; camera.updateProjectionMatrix(); controls.target.set(0, .6, 0); controls.update(); },
    zoom: (amount: number) => { camera.zoom = T.MathUtils.clamp(camera.zoom + amount, .65, 1.9); camera.updateProjectionMatrix(); },
    dispose: () => {
      renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose(); document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointerup", up);
      people.forEach(disposePerson);
      scene.traverse(obj => { if (obj instanceof T.Mesh) { obj.geometry.dispose(); const ms = Array.isArray(obj.material) ? obj.material : [obj.material]; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } });
      materials.forEach(m => m.dispose()); renderer.dispose(); renderer.domElement.remove(); current = [];
    },
  };
}
