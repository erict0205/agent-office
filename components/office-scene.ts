import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Agent, statuses } from "@/lib/office-types";

export function createOfficeScene(host: HTMLElement, onSelect: (id: string) => void) {
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
  camera.position.set(14, 14, 18);
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
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11 });
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
    const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 192;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, 768, 192);
    ctx.fillStyle = color; ctx.font = "600 66px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 384, 96);
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
  // Architectural shell: open front and right wall keep the dollhouse readable.
  box(12.6, .35, 9.4, "#b49c7a", 0, -.23, 0);
  box(12.4, .08, 9.2, "#e6d8bd", 0, -.02, 0);
  for (let i = -11; i <= 11; i++) box(.018, .012, 9.1, "#d5c5a8", i * .52, .026, 0);
  box(12.5, 3.25, .18, "#e5e4d8", 0, 1.6, -4.6);
  box(.18, 3.25, 9.3, "#eeeadc", -6.2, 1.6, 0);
  box(12.5, .13, .25, "#c7c5b4", 0, 3.25, -4.6);
  box(.25, .13, 9.3, "#d1ccba", -6.2, 3.25, 0);
  box(12.35, .13, .12, "#faf5e7", 0, .12, -4.45);
  box(.12, .13, 9.2, "#faf5e7", -6.05, .12, 0);
  // Sage window frames, a bright sky and warm wooden mullions.
  for (const x of [-3.9, -.6]) {
    box(2.4, 1.65, .07, "#acb9ac", x, 2.02, -4.46);
    box(2.15, 1.4, .08, "#d9e7e1", x, 2.02, -4.4);
    box(.065, 1.5, .09, "#faf4df", x, 2.02, -4.33);
    box(2.2, .065, .09, "#faf4df", x, 1.98, -4.33);
    box(2.65, .12, .38, "#c3a782", x, 1.2, -4.32);
  }
  const sign = textPlane("ERIC’S STUDIO", "#52634f", "#e5e4d8", 3, .75);
  sign.position.set(3.55, 2.3, -4.48); scene.add(sign);
  const subSign = textPlane("GOOD THINGS TAKE A TEAM", "#8b927d", "#e5e4d8", 3, .36);
  subSign.position.set(3.55, 1.75, -4.47); scene.add(subSign);
  // Wall art and shelves.
  box(.1, 1.1, .85, "#bda380", -6.02, 2, -.25);
  box(.12, .95, .72, "#f7f0dd", -5.96, 2, -.25);
  ball(.28, "#c9906e", -5.86, 2.15, -.25).scale.x = .1;
  box(.8, .12, 2.2, "#b89a73", -5.72, 1.1, -2.75);
  for (let i = 0; i < 5; i++) box(.34, .55 + (i % 2) * .13, .12, ["#7d927d", "#c1927e", "#d7c48d"][i % 3], -5.7, 1.44, -3.3 + i * .25);
  const desks = [new T.Vector3(-3.2, 0, -2.4), new T.Vector3(.05, 0, -2.4), new T.Vector3(-3.2, 0, 1.05), new T.Vector3(.05, 0, 1.05), new T.Vector3(-3.2, 0, 3.5), new T.Vector3(.05, 0, 3.5), new T.Vector3(3.25, 0, 1.05), new T.Vector3(3.25, 0, 3.5)];
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
  desks.slice(0, 4).forEach(desk);
  const builtDesks = new Set([0,1,2,3]);
  // Soft lounge corner and coffee counter.
  box(3.4, .025, 3, "#c8c5a9", 3.9, .05, -.9);
  box(2.45, .42, .9, "#c79578", 3.9, .38, -2.4);
  box(2.45, .82, .25, "#d6a68a", 3.9, .82, -2.8);
  for (const x of [2.75, 5.05]) box(.25, .65, 1.1, "#d6a68a", x, .7, -2.4);
  box(.72, .18, .65, "#e5bf9e", 3.4, .7, -2.38);
  box(.72, .18, .65, "#e5bf9e", 4.28, .7, -2.38);
  cylinder(.74, .74, .12, "#e4ceb0", 3.9, .67, -.8, scene, 32);
  cylinder(.14, .26, .6, "#bb9a73", 3.9, .32, -.8);
  box(.55, .045, .39, "#8a9a7d", 3.9, .76, -.75).rotation.y = .4;
  cylinder(.11, .09, .21, "#e9e1cb", 4.23, .85, -.95);
  box(1.65, 1.1, .7, "#b3baa0", 4.85, .55, 3.8);
  box(1.77, .1, .8, "#eee5cf", 4.85, 1.15, 3.8);
  box(.6, .65, .5, "#535b4b", 4.55, 1.52, 3.8);
  box(.37, .26, .04, "#aeb8a0", 4.55, 1.57, 4.07);
  cylinder(.08, .08, .13, "#f4eddf", 4.55, 1.3, 4.03);
  cylinder(.08, .08, .16, "#f4eddf", 5.32, 1.29, 3.8);
  plant(-5.4, 3.6, 1.15); plant(5.4, -3.6, 1.4); plant(-5.4, -4, .65);
  plant(1.65, -3.7, .7);
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

  type Person = { group: T.Group; arms: T.Group[]; legs: T.Group[]; ring: T.Mesh; name: T.Sprite; state: Agent; target: T.Vector3; seat: T.Vector3; labelKey: string };
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
    if (!builtDesks.has(index)) { desk(desks[index], index); builtDesks.add(index); }
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
    return { group, arms, legs, ring, name, seat, state: a, target: seat.clone(), labelKey: `${a.name}:${a.status}` };
  }
  function update(agents: Agent[], selectedId: string) {
    selected = selectedId; current = agents;
    for (const [id, p] of people) if (!agents.some(a => a.id === id)) { scene.remove(p.group); disposePerson(p); people.delete(id); }
    agents.forEach((a, i) => {
      if (!people.has(a.id)) people.set(a.id, person(a, i));
      const p = people.get(a.id)!; p.state = a; p.seat.copy(desks[i]).add(new T.Vector3(0,0,.95));
      p.target.copy(a.status === "idle" ? new T.Vector3(3.1 + i % 2, 0, .05 + Math.floor(i / 2) * .5) : p.seat);
      p.ring.visible = a.id === selected;
      const key = `${a.name}:${a.status}`;
      if (key !== p.labelKey) { p.name.material.map?.dispose(); p.name.material.map = label(a); p.name.material.needsUpdate = true; p.labelKey = key; }
    });
  }
  function disposePerson(p: Person) { p.name.material.map?.dispose(); p.name.material.dispose(); p.ring.geometry.dispose(); (p.ring.material as T.Material).dispose(); }
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
    const aspect = w / h; const span = aspect < 1 ? 9 : 7.5;
    camera.left = -span * aspect; camera.right = span * aspect; camera.top = span; camera.bottom = -span; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  let lastFrame = performance.now(); let elapsed = 0; const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let suspended = document.hidden;
  const visibility = () => { suspended = document.hidden; }; document.addEventListener("visibilitychange", visibility);
  renderer.setAnimationLoop(() => {
    const frame = performance.now(); const dt = Math.min((frame - lastFrame) / 1000, .05); lastFrame = frame; if (suspended) return; elapsed += dt;
    for (const p of people.values()) {
      const distance = p.group.position.distanceTo(p.target); const walking = distance > .04;
      if (walking && !reduce.matches) {
        const dir = p.target.clone().sub(p.group.position); p.group.rotation.y = Math.atan2(-dir.x, -dir.z);
        p.group.position.add(dir.normalize().multiplyScalar(Math.min(dt * 1.9, distance)));
      } else { p.group.position.copy(p.target); p.group.rotation.y = p.state.status === "idle" ? -.7 : 0; }
      p.group.visible = p.state.status !== "offline";
      if (!reduce.matches) {
        p.arms.forEach((arm, i) => { arm.rotation.x = walking ? Math.sin(elapsed * 9 + i * Math.PI) * .65 : p.state.status === "working" ? -.85 + Math.sin(elapsed * 9 + i * 2) * .12 : p.state.status === "blocked" && i === 0 ? 2.5 + Math.sin(elapsed * 3) * .15 : .05; });
        p.legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(elapsed * 9 + i * Math.PI) * .55 : 0; });
        p.ring.scale.setScalar(1 + Math.sin(elapsed * 2) * .04);
      }
    }
    cat.position.set(1.4 + Math.sin(elapsed * .12) * 1.2, 0, 2.6 + Math.cos(elapsed * .12) * .45); cat.rotation.y = -elapsed * .12;
    if (reduce.matches) cat.position.set(1.6, 0, 2.6);
    controls.update(); renderer.render(scene, camera);
  });
  return {
    update,
    reset: () => { camera.position.set(14, 14, 18); camera.zoom = 1; camera.updateProjectionMatrix(); controls.target.set(0, .6, 0); controls.update(); },
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
