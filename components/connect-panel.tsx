"use client";
import { useState } from 'react';
import { ArrowUpRight, Check, Copy, Monitor, Radio } from 'lucide-react';

export default function ConnectPanel({ onLive }: { onLive:()=>void }) {
  const [os,setOs]=useState('mac');
  const [tools,setTools]=useState(['codex']);
  const [copied,setCopied]=useState(false);
  const device=os==='windows'?'home-windows':'company-mac';
  const name=os==='windows'?'家裡 Windows':'公司 Mac';
  const command=`npm run office:setup -- --device ${device} --name "${name}" --tools ${tools.join(',')}`;
  const prompt=`請在這台電腦設定 Agent Office 狀態收集器。下載或更新 https://github.com/erict0205/agent-office 並讀 README。偵測 Node.js 22.13+ 與作業系統，保留既有設定後執行：${command}。既有工作室為 https://eric-agent-office.aglowant130.chatgpt.site，Site ID 為 appgprj_6ae43a2aa7bc8191868f0aa413a150d6。使用 Sites get_site 取得服務存取憑證，透過 office:start --stdin-config 的隱藏輸入傳入；不要輸出憑證或寫入檔案。驗證實際工作階段到達雲端，未安裝的工具只回報缺少，不要冒稱已驗證。Codex hooks 需要使用者在 /hooks 信任，不要繞過信任；可先用工作紀錄相容模式連接現有 App/CLI。不要建立新 Site 或重新部署。`;
  async function copy(text:string) { try { await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),2000); } catch {setCopied(false);} }
  return <>
    <span className="dialog-symbol"><Radio size={25}/></span><p className="eyebrow">ONE OFFICE. EVERY AGENT.</p><h2>把每一台電腦，<br/>連進同一間工作室。</h2>
    <p className="dialog-intro">在各台電腦啟動一個收集器，照常使用 Agent 工具。Office 只接收狀態，不接收對話、程式碼或專案路徑。</p>
    <div className="setup-choice"><span>這台電腦</span><div className="mode-switch"><button className={os==='windows'?'selected':''} onClick={()=>setOs('windows')}>家裡 Windows</button><button className={os==='mac'?'selected':''} onClick={()=>setOs('mac')}>公司 Mac</button></div></div>
    <fieldset className="tool-choices"><legend>要連接的工具</legend>{[['codex','Codex App / CLI'],['claude','Claude Code'],['gemini','Gemini CLI']].map(([id,label])=><label key={id}><input type="checkbox" checked={tools.includes(id)} onChange={()=>setTools(t=>t.includes(id)?t.filter(x=>x!==id):[...t,id])}/>{label}</label>)}</fieldset>
    <ol className="connect-steps"><li><span>1</span><div><strong>準備本機程式</strong><p>下載 agent-office，安裝 Node.js 22.13 以上並執行 <code>npm ci</code>。公司和家裡各做一次。</p></div></li><li><span>2</span><div><strong>登記裝置與工具事件</strong><p>公開連結可以直接觀看；只有你的電腦需要連接。下方指令會合併 hooks，並先備份原設定。Codex hooks 需在工具內執行 <code>/hooks</code> 檢閱並信任。</p></div></li><li><span>3</span><div><strong>啟動收集器</strong><p>讓已登入且有 Sites 工具的 Codex 取得此網站的服務憑證，安全啟動收集器。之後切換「即時連線」。</p></div></li></ol>
    {tools.length?<div className="command-box"><code>{command}</code><button aria-label="複製裝置設定指令" onClick={()=>copy(command)}>{copied?<Check size={16}/>:<Copy size={16}/>}</button></div>:<p className="dialog-footnote">請至少選擇一種工具。</p>}
    <p className="dialog-footnote">Codex App 可先使用工作紀錄相容模式；「等待確認」等完整事件需信任 hooks。Claude、Gemini 的一般網頁聊天不在此連線範圍。</p>
    <div className="dialog-actions"><button disabled={!tools.length} className="primary-button full" onClick={()=>copy(prompt)}>{copied?<Check size={16}/>:<Copy size={16}/>}複製給 Codex，代我設定</button><button className="secondary-button full" onClick={onLive}>查看連線裝置 <ArrowUpRight size={16}/></button></div>
  </>;
}
