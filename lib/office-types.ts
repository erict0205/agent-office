export type Status = "working" | "idle" | "blocked" | "done" | "error" | "offline" | "unknown";
export type Attendance = ReturnType<typeof import('./office-attendance.mjs').attendanceFor>;
export type Agent = { id: string; name: string; role: string; status: Status; reportedStatus?: Status; attendance?: Attendance; task: string; category?: string; seenAt: number; color: string; deviceId?: string; deviceName?: string; provider?: string; client?: string; sessionKey?: string; source?: string; stateAt?: number };
export type Activity = { id: number; agentId?: string; name: string; status: Status; task: string; category?: string; at: number; deviceName?: string; provider?: string };
export type Device = { id: string; name: string; platform: string; tools: string; seenAt: number; connected: boolean };
export const statuses: Record<Status, { label: string; color: string }> = {
  working: { label: "工作中", color: "#4e8269" }, idle: { label: "休息中", color: "#b78b50" },
  blocked: { label: "等待確認", color: "#c07849" }, done: { label: "已完成", color: "#6388a6" },
  error: { label: "需要協助", color: "#ba635f" }, offline: { label: "已離線", color: "#999c97" },
  unknown: { label: "狀態未確認", color: "#98906b" },
};
export const colors = ["#6b927a", "#c68b70", "#829bb4", "#b39cbd", "#c5ad64", "#6faaa1", "#c67f94", "#9a9c6b"];
export const demoAgents: Agent[] = [
  { id: "milo", name: "Milo", role: "開發工程師", category:"development", status: "working", task: "打造 Agent Office 的第一個版本", seenAt: 0, color: colors[0] },
  { id: "luna", name: "Luna", role: "介面設計師", category:"design", status: "idle", task: "在咖啡區，等下一個好點子", seenAt: 0, color: colors[1] },
  { id: "atlas", name: "Atlas", role: "程式審查員", category:"review", status: "blocked", task: "修改已就緒，等待你的確認", seenAt: 0, color: colors[2] },
  { id: "nova", name: "Nova", role: "測試工程師", category:"testing", status: "done", task: "完成這一輪功能檢查", seenAt: 0, color: colors[3] },
];
