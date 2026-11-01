"use client";

import { useEffect, useRef, useState } from "react";
import { Armchair, ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Coffee, Command, Copy, ExternalLink, Focus, HelpCircle, LayoutGrid, Leaf, Minus, Monitor, MousePointer2, Plus, Radio, RotateCcw, Users, X, Zap } from "lucide-react";
import { Activity, Agent, Device, colors, demoAgents, Status, statuses } from "@/lib/office-types";
import type { createOfficeScene, LifeState } from "./office-scene";

import ConnectPanel from "./connect-panel";
import { workCategories, categoryLabel } from "@/lib/work-labels.mjs";
import { zoneDefinitions } from "@/lib/office-life.mjs";
import { attendanceFor, officeHours, countdownLabel } from "@/lib/office-attendance.mjs";

type Mode = "demo" | "live";
const zoneIcons: Record<string,string> = {work:"💻",pingpong:"🏓",gaming:"🎮",pantry:"☕",lounge:"🌿"};
const bridgeCommand = 'npm run agent -- --name Eric --prompt "閱讀專案並摘要目前的結構"';

export default function Office() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createOfficeScene> | null>(null);
  const [ready, setReady] = useState(false);
  const [life, setLife] = useState<LifeState>({});
  const [focusedZone, setFocusedZone] = useState<string>("all");
  const [sceneError, setSceneError] = useState(false);
  const [mode, setMode] = useState<Mode>("live");
  const [demo, setDemo] = useState<Agent[]>(demoAgents);
  const [live, setLive] = useState<Agent[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [teamView, setTeamView] = useState<"office" | "history">("office");
  const [events, setEvents] = useState<Activity[]>([]);
  const [demoEvents, setDemoEvents] = useState<Activity[]>([]);
  const [selected, setSelected] = useState("milo");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [panel, setPanel] = useState<"connect" | "about" | null>(null);
  const [copied, setCopied] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [lastSync, setLastSync] = useState(0);
  const [now, setNow] = useState(0);
  const modal = useRef<HTMLDialogElement>(null);
  const serverClockOffset = useRef(0);
  const clockNow = now || Date.now();
  const schedule = officeHours(clockNow);
  const allAgents = mode === "demo" ? demo : live.map(a => {
    const status = clockNow-a.seenAt>45_000 ? "offline" as Status : a.status;
    const updated = {...a,status};
    return {...updated,attendance:attendanceFor(updated,clockNow)};
  });
  const scopedAgents = allAgents.filter(a => (deviceFilter === "all" || a.deviceId === deviceFilter) && (providerFilter === "all" || a.provider === providerFilter) && (categoryFilter === "all" || (a.category ?? "general") === categoryFilter));
  const officeAgents = mode === "demo" ? scopedAgents : scopedAgents.filter(a => a.attendance?.present);
  const historyAgents = mode === "demo" ? [] : scopedAgents.filter(a => !a.attendance?.present);
  const agents = teamView === "history" && mode === "live" ? historyAgents : officeAgents;
  const agent = agents.find(a => a.id === selected) ?? agents[0];
  const activity = mode === "demo" ? demoEvents : events;
  const activeCount = officeAgents.filter(a => (a.attendance?.sceneStatus ?? a.status) === "working").length;
  const agentActivity = activity.filter(e => e.agentId === agent?.id || (!e.agentId && e.name === agent?.name)).slice(0,4);

  useEffect(() => {
    let disposed = false;
    import("./office-scene").then(({ createOfficeScene }) => {
      if (disposed || !host.current) return;
      try { scene.current = createOfficeScene(host.current, setSelected, setLife); setReady(true); } catch { setSceneError(true); }
    }).catch(() => setSceneError(true));
    return () => { disposed = true; scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { if (ready) { const page = Math.max(0, Math.floor(officeAgents.findIndex(a => a.id === agent?.id) / 8)); scene.current?.update(officeAgents.slice(page*8,page*8+8).map(a=>({...a,status:(a.attendance?.sceneStatus ?? a.status) as Status})), agent?.id ?? ""); } }, [officeAgents, agent?.id, ready]);
  useEffect(() => { setNow(Date.now()+serverClockOffset.current); const t = setInterval(() => setNow(Date.now()+serverClockOffset.current), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (mode !== "live") return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const res = await fetch("/api/office", { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error("暫時無法同步，正在重試");
        const data = await res.json() as { agents: Agent[]; events: Activity[]; devices: Device[]; at: number };
        if (!stopped) { if(Number.isFinite(data.at)){serverClockOffset.current=data.at-Date.now();setNow(data.at);} setLive(data.agents); setEvents(data.events); setDevices(data.devices ?? []); setLastSync(Date.now()); setFetchError(""); }
      } catch { if (!stopped) setFetchError("暫時無法同步，正在重試"); }
      finally { if (!stopped) timer = setTimeout(poll, 5000); }
    }
    poll(); return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [mode]);
  useEffect(() => {
    if (panel) modal.current?.showModal(); else modal.current?.close();
  }, [panel]);
  function switchMode(next: Mode) { setMode(next); setFilter("all"); setDeviceFilter("all"); setProviderFilter("all"); setCategoryFilter("all"); setTeamView("office"); setSelected(next === "demo" ? demo[0].id : live[0]?.id ?? ""); }
  function changeState(status: Status) {
    if (!agent || mode !== "demo") return;
    const tasks: Record<Status, string> = { working: "專心處理手邊的開發任務", idle: "走到休息區，喝一杯咖啡", blocked: "等待你確認下一個步驟", done: "任務完成，隨時準備出發", error: "遇到問題，需要一點協助", offline: "連線已中斷", unknown: "狀態尚未確認" };
    setDemo(list => list.map(a => a.id === agent.id ? { ...a, status, task: tasks[status] } : a));
    setDemoEvents(list => [{ id: Date.now(), name: agent.name, status, task: tasks[status], at: Date.now() }, ...list].slice(0, 20));
  }
  function showLeisureDemo() {
    const extras: Agent[] = [
      {id:"eli",name:"Eli",role:"開發工程師",color:colors[4],status:"idle",task:"休閒互動示範",seenAt:0},
      {id:"iris",name:"Iris",role:"研究員",color:colors[5],status:"idle",task:"休閒互動示範",seenAt:0},
      {id:"finn",name:"Finn",role:"測試工程師",color:colors[6],status:"idle",task:"休閒互動示範",seenAt:0},
      {id:"cleo",name:"Cleo",role:"介面設計師",color:colors[7],status:"idle",task:"休閒互動示範",seenAt:0},
    ];
    setDemo([...demoAgents,...extras].map(a=>({...a,status:"idle",task:"工作告一段落，去休閒區充電"})));
    setDemoEvents([]);switchMode("demo");setSelected("milo");focusZone("all");
  }
  function focusZone(zone:string) {
    setFocusedZone(zone);
    if(zone==="all")scene.current?.reset();else scene.current?.focusZone(zone as keyof typeof zoneDefinitions);
  }
  const synced = mode === "live" && lastSync > 0 && now - lastSync < 15_000 && !fetchError;
  return (
    <div className="office-app">
      <nav className="rail" aria-label="主要導覽">
        <a className="brand-mark" href="/" aria-label="Agent Office 首頁"><Command size={25} strokeWidth={1.7} /></a>
        <button className="rail-button active" aria-label="辦公室" title="辦公室" onClick={() => { setPanel(null); focusZone("all"); }}><LayoutGrid size={21} /></button>
        <button className="rail-button" aria-label="連接 Agent" title="連接 Agent" onClick={() => setPanel("connect")}><Radio size={21} /></button>
        <div className="rail-bottom"><span className="rail-divider" /><button className="rail-button" aria-label="製作說明" title="製作說明" onClick={() => setPanel("about")}><HelpCircle size={21} /></button><div className="owner-avatar" title="Eric 的工作室">E</div></div>
      </nav>
      <div className="workspace">
        <header className="topbar"><div className="breadcrumb">工作空間 <span>/</span> <strong>Eric’s Studio</strong><ChevronDown size={13} /></div><div className="topbar-right"><span className="local-clock">{now ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(now) : "--:--"} <small>TAIPEI</small></span><span className="owner-tag"><span /> 我的工作室</span></div></header>
        <main>
          <section className="page-heading"><div><p className="eyebrow"><span /> A LITTLE SPACE FOR BIG IDEAS</p><h1>小小辦公室，<span>大大生產力。</span></h1><p className="intro">讓每一份專注、每一次休息，都有自己的位置。</p></div><button className="primary-button" onClick={() => setPanel("connect")}><Plus size={16} /> 連接 Agent <ArrowUpRight size={16} /></button></section>
          {mode === "live" && <section className="connection-bar" aria-label="裝置與工具篩選"><div><Radio size={15}/><strong>{devices.filter(d=>d.connected && (!now || now-d.seenAt<=45_000)).length} 台裝置在線</strong><span>{officeAgents.length} 位在辦公室 · {historyAgents.length} 位已下班</span></div><div className="connection-filters"><select aria-label="篩選電腦" value={deviceFilter} onChange={e=>setDeviceFilter(e.target.value)}><option value="all">全部電腦</option>{devices.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><select aria-label="篩選工具" value={providerFilter} onChange={e=>setProviderFilter(e.target.value)}><option value="all">全部工具</option><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="gemini">Gemini CLI</option><option value="legacy">獨立工作</option></select><select aria-label="篩選工作分類" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">全部工作</option>{Object.entries(workCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>{devices.length>0 && <div className="device-chips">{devices.map(d=><span key={d.id}><i className={d.connected && (!now||now-d.seenAt<=45_000)?"online":""}/>{d.name}<small>{d.platform==="win32"?"Windows":d.platform==="darwin"?"macOS":"Linux"}</small></span>)}</div>}</section>}
          {mode === "live" && <section className="attendance-bar" aria-label="出勤規則與下班名單"><div className="attendance-heading"><span className={`attendance-light ${schedule.inHours ? "open" : ""}`}/><strong>{schedule.inHours ? "正常上班中" : schedule.workday ? "上班時間外" : "週末休息日"}</strong><span>週一至週五 08:00–18:00 · 台北時間</span></div><p>{schedule.inHours ? "有工作就回電腦前，空閒時留在休息區。" : "有工作仍會進辦公室；工作結束後休息一小時再下班。"}</p>{historyAgents.length>0 && <div className="off-duty-roster"><strong>已下班</strong>{historyAgents.slice(0,6).map(a=><button key={a.id} onClick={()=>{setTeamView("history");setFilter("all");setSelected(a.id);}} title={a.attendance?.reason}>{a.name}<span>已下班</span></button>)}{historyAgents.length>6&&<button onClick={()=>{setTeamView("history");setFilter("all");}}>查看全部 {historyAgents.length} 位</button>}</div>}</section>}
          <div className="dashboard-grid">
            <section className="office-card" aria-label="3D 辦公室">
              <div className="scene-toolbar"><div className="scene-title"><span className="status-dot" /> 辦公室全景 <span className="small-pill">3D</span></div><div className="mode-switch" aria-label="資料模式"><button aria-pressed={mode === "demo"} className={mode === "demo" ? "selected" : ""} onClick={() => switchMode("demo")}>示範模式</button><button aria-pressed={mode === "live"} className={mode === "live" ? "selected" : ""} onClick={() => switchMode("live")}>即時連線</button></div></div>
              <div className="zone-toolbar" aria-label="辦公室場域"><div><button className={focusedZone === "all" ? "selected" : ""} onClick={()=>focusZone("all")}>全景</button>{Object.entries(zoneDefinitions).map(([key,zone])=><button className={focusedZone === key ? "selected" : ""} onClick={()=>focusZone(key)} key={key}><span aria-hidden="true">{zoneIcons[key]}</span>{zone.label}<small>{Object.values(life).filter(p=>p.zone===key).length}</small></button>)}</div><button className="leisure-demo-button" onClick={showLeisureDemo}>休閒示範 <ArrowUpRight size={12}/></button></div><div className="scene-area"><div className="scene-corner"><span className="sun-icon">☀</span><div>美好的一天<small>MAKE YOURSELF AT HOME</small></div></div><div ref={host} className="canvas-host" />{!ready && !sceneError && <div className="scene-loading"><Leaf size={24} /><span>正在打開工作室…</span></div>}{sceneError && <div className="scene-loading"><Monitor size={26} /><strong>3D 畫面暫時無法開啟</strong><span>請使用支援 WebGL 的瀏覽器，員工清單仍可操作。</span></div>}<div className="scene-caption"><span className="tiny-dot" /> {mode === "demo" ? "示範工作室 · 所有人物與任務皆為模擬" : synced ? "已同步各台電腦的工作狀態" : fetchError || "等待本機 Agent 連接"}</div><div className="scene-controls"><button onClick={() => scene.current?.zoom(.15)} aria-label="放大辦公室" title="放大"><Plus size={17} /></button><button onClick={() => scene.current?.zoom(-.15)} aria-label="縮小辦公室" title="縮小"><Minus size={17} /></button><span /><button onClick={() => focusZone("all")} aria-label="重設視角" title="重設視角"><Focus size={17} /></button></div></div>
              <div className="scene-footer"><div className="legend"><span><i style={{ background: statuses.working.color }} /> 工作中</span><span><i style={{ background: statuses.idle.color }} /> 休息中</span><span><i style={{ background: statuses.blocked.color }} /> 等待確認</span><span><i style={{ background: statuses.done.color }} /> 已完成</span></div><span className="drag-hint"><MousePointer2 size={13} /> 拖曳旋轉 · 捲動縮放</span></div>
            </section>
            <aside className="team-card" aria-label="員工清單"><div className="section-title"><h2>{teamView === "history" && mode === "live" ? "已下班的夥伴" : "工作室夥伴"} <span>{agents.length}</span></h2><Users size={17} /></div><div className="team-views" aria-label="工作階段清單">{mode === "live" && <><button className={teamView === "office" ? "current" : ""} onClick={()=>{setTeamView("office");setFilter("all");}}>辦公室 {officeAgents.length}</button><button className={teamView === "history" ? "current" : ""} onClick={()=>{setTeamView("history");setFilter("all");}}>已下班 {historyAgents.length}</button></>}</div><div className="team-filters"><button className={filter === "all" ? "current" : ""} onClick={() => setFilter("all")}>全部</button><button className={filter === "working" ? "current" : ""} onClick={() => setFilter("working")}>工作中</button><button className={filter === "blocked" ? "current" : ""} onClick={() => setFilter("blocked")}>待確認</button></div><div className="team-list">{agents.filter(a => filter === "all" || a.status === filter).map(a => <button className={`agent-row ${agent?.id === a.id ? "chosen" : ""}`} onClick={() => setSelected(a.id)} key={a.id}><div className="agent-avatar" style={{ background: `${a.color}26`, color: a.color }}><span>{a.name.slice(0, 1).toUpperCase()}</span><i style={{ background: statuses[a.status].color }} /></div><div className="agent-info"><strong>{a.name}<span className="agent-status" style={{ color: statuses[a.status].color }}>{statuses[a.status].label}</span></strong><small>{a.deviceName ?? a.role}{a.provider && a.provider !== "legacy" ? ` · ${a.client}` : ""}</small><span className={`work-tag category-${a.category ?? "general"}`}>{categoryLabel(a.category)}</span>{mode === "live" && a.attendance && <span className={`attendance-tag phase-${a.attendance.phase}`} title={a.attendance.reason}>{a.attendance.label}{!a.attendance.connected ? " · 未連線" : ""}{a.attendance.phase === "cooldown" && a.attendance.clockOutAt ? ` · ${countdownLabel(a.attendance.clockOutAt,clockNow)} 後下班` : ""}</span>}<p>{a.task}</p>{mode === "live" && !a.attendance?.present && <span className="agent-location">{a.attendance?.reason}</span>}{(mode === "demo" || a.attendance?.present) && life[a.id] && <span className="agent-location">{life[a.id].moving ? "前往" : "位於"} {life[a.id].label}</span>}</div></button>)}{agents.length === 0 && <div className="empty-team"><Radio size={28} /><strong>{fetchError ? "連線暫時中斷" : teamView === "history" ? "目前沒有已下班的夥伴" : "目前沒有夥伴在辦公室"}</strong><p>{fetchError || "上班時間：平日 08:00–18:00。其他時間有工作就會出現，工作結束後休息一小時再下班。"}</p><button onClick={() => setPanel("connect")}>查看連接方式 <ArrowUpRight size={14} /></button></div>}{agents.length > 0 && agents.filter(a => filter === "all" || a.status === filter).length === 0 && <p className="filter-empty">目前沒有這個狀態的夥伴。</p>}</div><div className="team-bottom"><Coffee size={16} /><span>專注工作，也別忘了好好休息。</span></div></aside>
            <section className="detail-card"><div className="section-title"><h2>{agent ? `${agent.name} 的工作角落` : "工作角落"}</h2><span className="muted-label">{mode === "demo" ? "試著切換狀態" : "來自本機工作階段"}</span></div>{agent ? <><div className="task-line"><div className="task-icon" style={{ background: `${statuses[agent.status].color}16`, color: statuses[agent.status].color }}><Monitor size={20} /></div><div><small>最近動作</small><p>{agent.task || "暫時沒有任務"}</p></div></div>{mode === "demo" ? <div className="state-buttons">{(["working", "idle", "blocked", "done"] as Status[]).map(s => <button key={s} className={agent.status === s ? "is-current" : ""} onClick={() => changeState(s)}><span style={{ background: statuses[s].color }} />{statuses[s].label}{agent.status === s && <Check size={13} />}</button>)}</div> : <><div className="source-tags"><span className={`work-tag category-${agent.category ?? "general"}`}>{categoryLabel(agent.category)}</span><span>{agent.deviceName ?? "手動連線"}</span><span>{agent.client ?? "Codex CLI"}</span><span>{agent.source === "transcript" ? "工作紀錄 · 相容模式" : agent.source === "hook" ? "工具事件" : "獨立工作"}</span>{agent.sessionKey && <span>工作 {agent.sessionKey.slice(0,8)}</span>}</div>{agent.attendance && <div className={`attendance-detail phase-${agent.attendance.phase}`}><strong>{agent.name} · {agent.attendance.label}</strong><p>{agent.attendance.reason}</p>{agent.attendance.phase === "cooldown" && agent.attendance.clockOutAt && <span>休息倒數 {countdownLabel(agent.attendance.clockOutAt,clockNow)} · 預計 {new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hour12:false}).format(agent.attendance.clockOutAt)} 下班</span>}{agent.attendance.phase === "off-duty" && agent.attendance.clockedOutAt && <span>下班時間：{new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(agent.attendance.clockedOutAt)}</span>}</div>}<p className="live-note"><Radio size={13} /> {fetchError || (agent.status === "offline" ? agent.attendance?.connected ? "工具工作階段已關閉，收集器仍在線" : "已超過 45 秒未收到此工作階段心跳" : `最近回報：${new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(agent.seenAt)}`)}</p>{agent.attendance?.present && life[agent.id] && life[agent.id].zone !== "work" && <p className="leisure-note"><Coffee size={14}/>{life[agent.id].moving ? `正在前往${life[agent.id].label}` : `正在${zoneDefinitions[life[agent.id].zone as keyof typeof zoneDefinitions].activity}`}<span>休閒動畫</span></p>}<p className="classification-note">分類依本機文字與工具事件的規則判斷；動作摘要不含原始內容，也不代表操作成功。</p>{agentActivity.length > 0 && <div className="agent-history"><h3>最近動作</h3>{agentActivity.map(e=><div key={e.id}><span className="work-tag">{categoryLabel(e.category)}</span><p>{e.task}</p><time>{new Intl.DateTimeFormat("zh-TW", {timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hour12:false}).format(e.at)}</time></div>)}</div>}</>}</> : <p className="detail-empty">連接 Agent 後，點選夥伴查看目前任務。</p>}</section>
            <section className="activity-card"><div className="section-title"><h2>工作室動態</h2><span className="muted-label">{mode === "demo" ? "DEMO" : synced ? "LIVE" : "等待同步"}</span></div><div className="activity-list">{activity.slice(0, 3).map(e => <div className="activity-row" key={e.id}><span className="activity-icon" style={{ color: statuses[e.status].color }}><Zap size={13} /></span><p><strong>{e.name}</strong> <span className="work-tag">{categoryLabel(e.category)}</span><small>{e.task}</small></p><time>{new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(e.at)}</time></div>)}{activity.length === 0 && <div className="activity-empty"><Leaf size={18} /><p>{mode === "demo" ? "切換夥伴的狀態，讓故事開始。" : "等候第一筆工作動態。"}</p></div>}</div></section>
          </div>
          {mode === "live" && officeAgents.length > 8 && <p className="scene-page-note">場景每次顯示 8 位夥伴；點選清單中的其他工作，會切換到對應座位。</p>}
          <p className="office-life-note">平日 08:00–18:00 上班，空閒時留在休息區；其他時間工作結束後休息一小時再下班。排班與休閒互動僅控制畫面，不會啟動 Agent 或使用模型用量。</p><footer className="page-footer"><span><Leaf size={14} /> BUILT WITH CARE, ONE AGENT AT A TIME.</span><span>{activeCount} 位專注中 <i>·</i> {officeAgents.filter(a => (a.attendance?.sceneStatus ?? a.status) === "idle").length} 位充電中</span></footer>
        </main>
      </div>
      <dialog ref={modal} className="info-dialog" onCancel={() => setPanel(null)} onClick={e => { if (e.target === modal.current) setPanel(null); }}><button className="dialog-close" onClick={() => setPanel(null)} aria-label="關閉說明"><X size={20} /></button>{panel === "connect" ? <ConnectPanel onLive={() => { switchMode("live"); setPanel(null); }}/> : <><span className="dialog-symbol"><Leaf size={25} /></span><p className="eyebrow">MADE FROM A BLANK CANVAS</p><h2>一間，自己蓋的工作室。</h2><p className="dialog-intro">從空白 repo 開始，用 Three.js 畫出桌子、窗戶、植物和夥伴。每個角色的動作，都跟著工作狀態改變。</p><div className="about-grid"><div><Armchair size={22} /><strong>用方塊蓋房子</strong><p>場景由幾何物件、光線和材質組成。</p></div><div><Radio size={22} /><strong>讓狀態說故事</strong><p>工作、休息、完成、待確認都有對應行為。</p></div><div><Monitor size={22} /><strong>本機工作，雲端看見</strong><p>本機收集 App、CLI 與工具事件，再回報到工作室。</p></div></div><a className="repo-link" href="https://github.com/erict0205/agent-office" target="_blank" rel="noreferrer">在 GitHub 查看這間工作室 <ExternalLink size={15} /></a></>}</dialog>
    </div>
  );
}
