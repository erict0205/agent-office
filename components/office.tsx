"use client";

import { useEffect, useRef, useState } from "react";
import { Armchair, ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Coffee, Command, Copy, ExternalLink, Focus, HelpCircle, LayoutGrid, Leaf, Minus, Monitor, MousePointer2, Plus, Radio, RotateCcw, Users, X, Zap } from "lucide-react";
import { Activity, Agent, colors, demoAgents, Status, statuses } from "@/lib/office-types";
import type { createOfficeScene } from "./office-scene";

type Mode = "demo" | "live";
const bridgeCommand = 'npm run agent -- --name Eric --prompt "閱讀專案並摘要目前的結構"';

export default function Office() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createOfficeScene> | null>(null);
  const [ready, setReady] = useState(false);
  const [sceneError, setSceneError] = useState(false);
  const [mode, setMode] = useState<Mode>("demo");
  const [demo, setDemo] = useState<Agent[]>(demoAgents);
  const [live, setLive] = useState<Agent[]>([]);
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
  const agents = mode === "demo" ? demo : live.map(a => now && now - a.seenAt > 45_000 ? { ...a, status: "offline" as Status } : a);
  const agent = agents.find(a => a.id === selected) ?? agents[0];
  const activity = mode === "demo" ? demoEvents : events;
  const activeCount = agents.filter(a => a.status === "working").length;

  useEffect(() => {
    let disposed = false;
    import("./office-scene").then(({ createOfficeScene }) => {
      if (disposed || !host.current) return;
      try { scene.current = createOfficeScene(host.current, setSelected); setReady(true); } catch { setSceneError(true); }
    }).catch(() => setSceneError(true));
    return () => { disposed = true; scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { if (ready) scene.current?.update(agents, agent?.id ?? ""); }, [agents, agent?.id, ready]);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (mode !== "live") return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const res = await fetch("/api/office", { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error("暫時無法同步，正在重試");
        const data = await res.json() as { agents: Agent[]; events: Activity[] };
        if (!stopped) { setLive(data.agents); setEvents(data.events); setLastSync(Date.now()); setFetchError(""); }
      } catch { if (!stopped) setFetchError("暫時無法同步，正在重試"); }
      finally { if (!stopped) timer = setTimeout(poll, 5000); }
    }
    poll(); return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [mode]);
  useEffect(() => {
    if (panel) modal.current?.showModal(); else modal.current?.close();
  }, [panel]);
  function switchMode(next: Mode) { setMode(next); setFilter("all"); setSelected(next === "demo" ? demo[0].id : live[0]?.id ?? ""); }
  function changeState(status: Status) {
    if (!agent || mode !== "demo") return;
    const tasks: Record<Status, string> = { working: "專心處理手邊的開發任務", idle: "走到休息區，喝一杯咖啡", blocked: "等待你確認下一個步驟", done: "任務完成，隨時準備出發", error: "遇到問題，需要一點協助", offline: "連線已中斷" };
    setDemo(list => list.map(a => a.id === agent.id ? { ...a, status, task: tasks[status] } : a));
    setDemoEvents(list => [{ id: Date.now(), name: agent.name, status, task: tasks[status], at: Date.now() }, ...list].slice(0, 20));
  }
  const synced = mode === "live" && lastSync > 0 && now - lastSync < 15_000 && !fetchError;
  return (
    <div className="office-app">
      <nav className="rail" aria-label="主要導覽">
        <a className="brand-mark" href="/" aria-label="Agent Office 首頁"><Command size={25} strokeWidth={1.7} /></a>
        <button className="rail-button active" aria-label="辦公室" title="辦公室" onClick={() => { setPanel(null); scene.current?.reset(); }}><LayoutGrid size={21} /></button>
        <button className="rail-button" aria-label="連接 Agent" title="連接 Agent" onClick={() => setPanel("connect")}><Radio size={21} /></button>
        <div className="rail-bottom"><span className="rail-divider" /><button className="rail-button" aria-label="製作說明" title="製作說明" onClick={() => setPanel("about")}><HelpCircle size={21} /></button><div className="owner-avatar" title="Eric 的工作室">E</div></div>
      </nav>
      <div className="workspace">
        <header className="topbar"><div className="breadcrumb">工作空間 <span>/</span> <strong>Eric’s Studio</strong><ChevronDown size={13} /></div><div className="topbar-right"><span className="local-clock">{now ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(now) : "--:--"} <small>TAIPEI</small></span><span className="owner-tag"><span /> 我的工作室</span></div></header>
        <main>
          <section className="page-heading"><div><p className="eyebrow"><span /> A LITTLE SPACE FOR BIG IDEAS</p><h1>小小辦公室，<span>大大生產力。</span></h1><p className="intro">讓每一份專注、每一次休息，都有自己的位置。</p></div><button className="primary-button" onClick={() => setPanel("connect")}><Plus size={16} /> 連接 Agent <ArrowUpRight size={16} /></button></section>
          <div className="dashboard-grid">
            <section className="office-card" aria-label="3D 辦公室">
              <div className="scene-toolbar"><div className="scene-title"><span className="status-dot" /> 辦公室全景 <span className="small-pill">3D</span></div><div className="mode-switch" aria-label="資料模式"><button aria-pressed={mode === "demo"} className={mode === "demo" ? "selected" : ""} onClick={() => switchMode("demo")}>示範模式</button><button aria-pressed={mode === "live"} className={mode === "live" ? "selected" : ""} onClick={() => switchMode("live")}>即時連線</button></div></div>
              <div className="scene-area"><div className="scene-corner"><span className="sun-icon">☀</span><div>美好的一天<small>MAKE YOURSELF AT HOME</small></div></div><div ref={host} className="canvas-host" />{!ready && !sceneError && <div className="scene-loading"><Leaf size={24} /><span>正在打開工作室…</span></div>}{sceneError && <div className="scene-loading"><Monitor size={26} /><strong>3D 畫面暫時無法開啟</strong><span>請使用支援 WebGL 的瀏覽器，員工清單仍可操作。</span></div>}<div className="scene-caption"><span className="tiny-dot" /> {mode === "demo" ? "示範工作室 · 所有人物與任務皆為模擬" : synced ? "已同步本機 Agent 狀態" : fetchError || "等待本機 Agent 連接"}</div><div className="scene-controls"><button onClick={() => scene.current?.zoom(.15)} aria-label="放大辦公室" title="放大"><Plus size={17} /></button><button onClick={() => scene.current?.zoom(-.15)} aria-label="縮小辦公室" title="縮小"><Minus size={17} /></button><span /><button onClick={() => scene.current?.reset()} aria-label="重設視角" title="重設視角"><Focus size={17} /></button></div></div>
              <div className="scene-footer"><div className="legend"><span><i style={{ background: statuses.working.color }} /> 工作中</span><span><i style={{ background: statuses.idle.color }} /> 休息中</span><span><i style={{ background: statuses.blocked.color }} /> 等待確認</span><span><i style={{ background: statuses.done.color }} /> 已完成</span></div><span className="drag-hint"><MousePointer2 size={13} /> 拖曳旋轉 · 捲動縮放</span></div>
            </section>
            <aside className="team-card" aria-label="員工清單"><div className="section-title"><h2>工作室夥伴 <span>{agents.length}</span></h2><Users size={17} /></div><div className="team-filters"><button className={filter === "all" ? "current" : ""} onClick={() => setFilter("all")}>全部</button><button className={filter === "working" ? "current" : ""} onClick={() => setFilter("working")}>工作中</button><button className={filter === "blocked" ? "current" : ""} onClick={() => setFilter("blocked")}>待確認</button></div><div className="team-list">{agents.filter(a => filter === "all" || a.status === filter).map(a => <button className={`agent-row ${agent?.id === a.id ? "chosen" : ""}`} onClick={() => setSelected(a.id)} key={a.id}><div className="agent-avatar" style={{ background: `${a.color}26`, color: a.color }}><span>{a.name.slice(0, 1).toUpperCase()}</span><i style={{ background: statuses[a.status].color }} /></div><div className="agent-info"><strong>{a.name}<span className="agent-status" style={{ color: statuses[a.status].color }}>{statuses[a.status].label}</span></strong><small>{a.role}</small><p>{a.task}</p></div></button>)}{agents.length === 0 && <div className="empty-team"><Radio size={28} /><strong>{fetchError ? "連線暫時中斷" : "你的第一位夥伴即將入座"}</strong><p>{fetchError || "連接本機 Codex，就能在這裡看到真實工作狀態。"}</p><button onClick={() => setPanel("connect")}>查看連接方式 <ArrowUpRight size={14} /></button></div>}{agents.length > 0 && agents.filter(a => filter === "all" || a.status === filter).length === 0 && <p className="filter-empty">目前沒有這個狀態的夥伴。</p>}</div><div className="team-bottom"><Coffee size={16} /><span>專注工作，也別忘了好好休息。</span></div></aside>
            <section className="detail-card"><div className="section-title"><h2>{agent ? `${agent.name} 的工作角落` : "工作角落"}</h2><span className="muted-label">{mode === "demo" ? "試著切換狀態" : "來自真實 Agent"}</span></div>{agent ? <><div className="task-line"><div className="task-icon" style={{ background: `${statuses[agent.status].color}16`, color: statuses[agent.status].color }}><Monitor size={20} /></div><div><small>目前任務</small><p>{agent.task || "暫時沒有任務"}</p></div></div>{mode === "demo" ? <div className="state-buttons">{(["working", "idle", "blocked", "done"] as Status[]).map(s => <button key={s} className={agent.status === s ? "is-current" : ""} onClick={() => changeState(s)}><span style={{ background: statuses[s].color }} />{statuses[s].label}{agent.status === s && <Check size={13} />}</button>)}</div> : <p className="live-note"><Radio size={13} /> {fetchError || (agent.status === "offline" ? "已超過 45 秒未收到心跳" : `最近回報：${new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(agent.seenAt)}`)}</p>}</> : <p className="detail-empty">連接 Agent 後，點選夥伴查看目前任務。</p>}</section>
            <section className="activity-card"><div className="section-title"><h2>工作室動態</h2><span className="muted-label">{mode === "demo" ? "DEMO" : synced ? "LIVE" : "等待同步"}</span></div><div className="activity-list">{activity.slice(0, 3).map(e => <div className="activity-row" key={e.id}><span className="activity-icon" style={{ color: statuses[e.status].color }}><Zap size={13} /></span><p><strong>{e.name}</strong> {statuses[e.status].label}</p><time>{new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(e.at)}</time></div>)}{activity.length === 0 && <div className="activity-empty"><Leaf size={18} /><p>{mode === "demo" ? "切換夥伴的狀態，讓故事開始。" : "等候第一筆工作動態。"}</p></div>}</div></section>
          </div>
          <footer className="page-footer"><span><Leaf size={14} /> BUILT WITH CARE, ONE AGENT AT A TIME.</span><span>{activeCount} 位專注中 <i>·</i> {agents.filter(a => a.status === "idle").length} 位充電中</span></footer>
        </main>
      </div>
      <dialog ref={modal} className="info-dialog" onCancel={() => setPanel(null)} onClick={e => { if (e.target === modal.current) setPanel(null); }}><button className="dialog-close" onClick={() => setPanel(null)} aria-label="關閉說明"><X size={20} /></button>{panel === "connect" ? <><span className="dialog-symbol"><Radio size={25} /></span><p className="eyebrow">BRING YOUR AGENT HOME</p><h2>讓你的 Agent，<br />在這裡有個位置。</h2><p className="dialog-intro">辦公室顯示狀態，Codex 在你的 Mac 上工作。從本機啟動的工作，會自動回報到這裡。</p><ol className="connect-steps"><li><span>1</span><div><strong>準備本機連線</strong><p>在專案資料夾執行 <code>npm install</code>，並確認 Codex CLI 已登入。</p></div></li><li><span>2</span><div><strong>設定工作室網址與存取權</strong><p>設定 <code>OFFICE_URL</code> 與 Sites 的服務存取憑證。憑證只放在本機環境變數。</p></div></li><li><span>3</span><div><strong>給 Agent 一件事做</strong><p>執行下方指令，再切換到「即時連線」。完整步驟在專案 README。</p></div></li></ol><div className="command-box"><code>{bridgeCommand}</code><button aria-label="複製啟動指令" onClick={async () => { try { await navigator.clipboard.writeText(bridgeCommand); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><p className="dialog-footnote">此版本連接由本專案啟動的 Codex 工作；既有桌面聊天不會自動加入。網站只接收狀態與簡短任務名稱。</p><button className="primary-button full" onClick={() => { switchMode("live"); setPanel(null); }}>查看即時辦公室 <ArrowUpRight size={16} /></button></> : <><span className="dialog-symbol"><Leaf size={25} /></span><p className="eyebrow">MADE FROM A BLANK CANVAS</p><h2>一間，自己蓋的工作室。</h2><p className="dialog-intro">從空白 repo 開始，用 Three.js 畫出桌子、窗戶、植物和夥伴。每個角色的動作，都跟著工作狀態改變。</p><div className="about-grid"><div><Armchair size={22} /><strong>用方塊蓋房子</strong><p>場景由幾何物件、光線和材質組成。</p></div><div><Radio size={22} /><strong>讓狀態說故事</strong><p>工作、休息、完成、待確認都有對應行為。</p></div><div><Monitor size={22} /><strong>本機工作，雲端看見</strong><p>本機接收 Codex 事件，再回報到工作室。</p></div></div><a className="repo-link" href="https://github.com/erict0205/agent-office" target="_blank" rel="noreferrer">在 GitHub 查看這間工作室 <ExternalLink size={15} /></a></>}</dialog>
    </div>
  );
}
