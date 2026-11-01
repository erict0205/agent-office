"use client";
import { useEffect,useRef,useState } from 'react';
import { LockKeyhole,Activity,Play,Square,GitBranch,ShieldCheck,RefreshCw,Send } from 'lucide-react';

type Task={id:string;workflowId:string;stage:number;title:string;prompt?:string;deviceId:string;projectId:string;role:string;status:string;agentId:string;createdAt:number;updatedAt:number;attempt:number;result?:string;diff?:string;approval?:string|null};
type Project={deviceId:string;projectId:string;name:string;seenAt:number};
type Event={id:string;agentId:string;kind:string;label:string;detail:string;at:number};
type Data={tasks:Task[];projects:Project[];events:Event[];task:Task|null;agent:{task:string;deviceName:string;client:string;source:string}|null;labels:Record<string,string>};
const roleNames:Record<string,string>={development:'開發',testing:'測試',review:'審查'};
function parsed(value?:string|null){try{return JSON.parse(value??'');}catch{return null;}}
function clock(at:number){return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(at);}

export default function ControlDesk({agentId,onAccess,onLocate}:{agentId:string|undefined;onAccess:(owner:boolean)=>void;onLocate:(id:string)=>void}) {
  const [owner,setOwner]=useState(false),[checked,setChecked]=useState(false),[data,setData]=useState<Data|null>(null),[error,setError]=useState('');
  const [taskId,setTaskId]=useState(''),[project,setProject]=useState(''),[title,setTitle]=useState(''),[prompt,setPrompt]=useState(''),[workflow,setWorkflow]=useState('pipeline'),[role,setRole]=useState('development');
  const [message,setMessage]=useState(''),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const refresh=useRef<()=>Promise<void>>(async()=>{});
  useEffect(()=>{let cancelled=false;fetch('/api/viewer',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json() as Promise<{isOwner:boolean}>;}).then(v=>{if(!cancelled){setOwner(v.isOwner===true);onAccess(v.isOwner===true);setChecked(true);}}).catch(()=>{if(!cancelled){setChecked(true);setError('暫時無法確認登入身分，私人資料保持關閉。');}});return()=>{cancelled=true;};},[onAccess]);
  useEffect(()=>{setTaskId('');setMessage('');setReviewed(false);},[agentId]);
  useEffect(()=>{if(!owner)return;let cancelled=false,timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
    async function load(){try{const query=new URLSearchParams();if(agentId)query.set('agent',agentId);if(taskId)query.set('task',taskId);const r=await fetch('/api/control?'+query,{cache:'no-store',signal:controller.signal});if(!r.ok){if(r.status===403){setData(null);setOwner(false);onAccess(false);}throw new Error('管理資料暫時無法同步');}const next=await r.json() as Data;if(!cancelled){setData(next);setError('');}}catch(e){if(!cancelled)setError(e instanceof Error?e.message:'讀取失敗');}}
    async function poll(){await load();if(!cancelled)timer=setTimeout(poll,4000);}refresh.current=load;void poll();return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
  },[owner,agentId,taskId,onAccess]);
  async function act(body:Record<string,unknown>){if(busy)return;setBusy(true);setNotice('');try{const r=await fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/json','X-Office-Action':'1'},body:JSON.stringify(body)});const reply=await r.json() as {error?:string};if(!r.ok)throw new Error(reply.error??'操作未完成');setNotice(body.op==='create'?'工作已排入佇列；電腦離線時會等候連線。':'已送出操作，等待執行器確認。');setMessage('');setReviewed(false);await refresh.current();}catch(e){setNotice(e instanceof Error?e.message:'操作失敗，請稍後再試');}finally{setBusy(false);}}
  if(!owner)return <section id="control-desk" className="control-locked"><LockKeyhole size={18}/><div><strong>公開觀看模式</strong><p>可看夥伴的工作分類與簡短動作，打招呼、送咖啡等互動不會指派任務。完整紀錄與工作控制只開放給工作室擁有者。</p>{error&&<p>{error}</p>}</div>{checked&&<a href="/signin-with-chatgpt?return_to=%2F%23control-desk" target="_top">擁有者登入</a>}</section>;
  const task=data?.task,result=parsed(task?.result),approval=parsed(task?.approval),active=task&&['running','blocked'].includes(task.status);
  const chosenProject=data?.projects.find(p=>`${p.deviceId}:${p.projectId}`===project)??data?.projects[0];
  const groups=[...new Set(data?.tasks.map(t=>t.workflowId)??[])];
  return <section id="control-desk" className="control-desk" aria-label="擁有者工作控制台">
    <header className="control-header"><div><p className="eyebrow">YOUR PRIVATE WORKSPACE</p><h2><ShieldCheck size={21}/> 工作控制台</h2><p>只有你的帳號能查看這裡的資料、派工與回答確認要求。</p></div><a href="/signout-with-chatgpt?return_to=%2F" target="_top">登出</a></header>
    {error&&<p className="control-warning" role="alert">{error}</p>}{notice&&<p className="control-notice" role="status">{notice}</p>}
    <div className="control-grid"><form className="control-compose" onSubmit={e=>{e.preventDefault();if(chosenProject)void act({op:'create',id:crypto.randomUUID(),title,prompt,deviceId:chosenProject.deviceId,projectId:chosenProject.projectId,workflow,role});}}>
      <h3><Play size={16}/> 指派新工作</h3><label>本機已授權專案<select value={chosenProject?`${chosenProject.deviceId}:${chosenProject.projectId}`:''} onChange={e=>setProject(e.target.value)} aria-label="派工專案">{data?.projects.map(p=><option key={`${p.deviceId}:${p.projectId}`} value={`${p.deviceId}:${p.projectId}`}>{p.name} · {p.deviceId}{Date.now()-p.seenAt>30000?'（執行器離線）':''}</option>)}</select></label>
      {!data?.projects.length&&<p className="control-help">尚未收到可派工專案。請先在電腦執行 office:project 登記專案，再啟動 office:runner。雲端不會接收任意本機路徑。</p>}
      <label>工作名稱<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} required placeholder="例如：修正登入逾時問題"/></label>
      <label>工作要求<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={12000} required rows={5} placeholder="描述預期行為、限制與驗收條件。只有你與本機執行器能讀取。"/></label>
      <label>執行方式<select value={workflow} onChange={e=>setWorkflow(e.target.value)}><option value="pipeline">協作：開發 → 測試 → 審查 → 由我驗收</option><option value="single">單一角色</option></select></label>
      {workflow==='single'&&<label>角色<select value={role} onChange={e=>setRole(e.target.value)}>{Object.entries(roleNames).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>}
      <p className="control-help">工作從已提交的 HEAD 建立獨立分支與工作目錄，不會自動合併或推送。派工會使用本機 Codex 的模型額度。</p>
      <button className="control-primary" type="submit" disabled={busy||!chosenProject||!title.trim()||!prompt.trim()}><Play size={14}/>{busy?'處理中…':'送出工作'}</button>
    </form>
    <div className="control-workflows"><h3><GitBranch size={17}/> 工作與交接</h3>{groups.length===0&&<p className="control-help">指派第一份工作後，會在這裡顯示各角色的進度。</p>}
      {groups.map(group=>{const tasks=data!.tasks.filter(t=>t.workflowId===group).sort((a,b)=>a.stage-b.stage);return <article className="workflow-card" key={group}><strong>{tasks[0].title}</strong><small>{tasks[0].projectId} · {tasks[0].deviceId}</small><div className="workflow-stages">{tasks.map((t,i)=><span className="workflow-step" key={t.id}>{i>0&&<i>→</i>}<button className={`${task?.id===t.id?'selected ':''}task-${t.status}`} onClick={()=>{setTaskId(t.id);setMessage('');setReviewed(false);}}><b>{roleNames[t.role]}</b><span>{data?.labels[t.status]??t.status}</span></button></span>)}</div></article>;})}
    </div></div>
    {task&&<article className="managed-detail" aria-label="受控工作細節"><div className="control-task-title"><div><h3>{task.title} · {roleNames[task.role]}</h3><p>{data?.labels[task.status]} · 第 {task.attempt} 次執行</p></div><button onClick={()=>onLocate(task.agentId)}>定位角色</button></div><details><summary>原始工作要求</summary><pre>{task.prompt}</pre></details>
      {approval&&<div className="approval-box"><h4>需要你的確認</h4><pre>{approval.description}</pre>{approval.kind==='item/tool/requestUserInput'?<><textarea aria-label="回答 Agent 問題" value={message} onChange={e=>setMessage(e.target.value)} maxLength={6000}/><button disabled={busy||!message.trim()} onClick={()=>act({op:'approval',id:task.id,requestId:approval.requestId,decision:'answer',answer:message})}>送出回答</button></>:<button disabled={busy} onClick={()=>act({op:'approval',id:task.id,requestId:approval.requestId,decision:'accept'})}>允許這一次</button>}<button disabled={busy} onClick={()=>act({op:'approval',id:task.id,requestId:approval.requestId,decision:'decline'})}>拒絕</button></div>}
      {active&&!approval&&<div className="control-followup"><label>補充要求<textarea rows={2} value={message} onChange={e=>setMessage(e.target.value)} maxLength={6000} placeholder="調整目前工作的方向"/></label><button disabled={busy||!message.trim()} onClick={()=>act({op:'steer',id:task.id,message})}><Send size={13}/> 送給執行中的角色</button></div>}
      {['waiting','queued','running','blocked','stale'].includes(task.status)&&<button className="control-stop" disabled={busy} onClick={()=>act({op:'cancel',id:task.id})}><Square size={13}/> 停止這組工作</button>}
      {task.result&&<div className="control-result"><h4>交付成果</h4><p>{result?.summary??task.result}</p>{result?.verdict&&<span className="result-verdict">角色判斷：{result.verdict==='pass'?'本階段可交付':result.verdict==='changes_requested'?'需要修改':'尚未確認'}</span>}{result?.tests?.length>0&&<><h4>測試回報</h4><ul>{result.tests.map((t:{name:string;status:string;detail:string},i:number)=><li key={i}><b>{t.status==='passed'?'通過':t.status==='failed'?'失敗':'未執行'}</b> · {t.name}<p>{t.detail}</p></li>)}</ul><small>以上為角色回報；實際指令與結束代碼可在活動紀錄核對。</small></>}{result?.artifacts?.length>0&&<><h4>產出位置</h4>{result.artifacts.map((a:{label:string;path:string},i:number)=><p key={i}>{a.label}：<code>{a.path}</code></p>)}</>}{result?.execution&&<details><summary>工作分支與本機位置</summary><pre>{JSON.stringify(result.execution,null,2)}</pre></details>}</div>}
      {task.diff&&<details className="control-diff"><summary>檢視程式變更</summary><pre>{task.diff}</pre></details>}
      {['failed','interrupted','stale','changes_requested','awaiting_acceptance','succeeded'].includes(task.status)&&<label className="review-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> 我已檢查成果與本機執行狀況</label>}
      {['failed','interrupted','stale','changes_requested'].includes(task.status)&&<button disabled={busy||!reviewed} onClick={()=>act({op:'retry',id:task.id,checked:reviewed})}><RefreshCw size={13}/> 重試此階段</button>}
      {['changes_requested','awaiting_acceptance','succeeded'].includes(task.status)&&<div className="control-followup"><label>退回修改要求<textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={6000} rows={2}/></label><button disabled={busy||!reviewed||!message.trim()} onClick={()=>act({op:'return',id:task.id,message,checked:reviewed})}>退回第一階段</button></div>}
      {task.status==='awaiting_acceptance'&&<button className="control-primary" disabled={busy||!reviewed} onClick={()=>act({op:'accept',id:task.id})}>確認驗收（保留分支，不自動合併）</button>}
    </article>}
    <div className="private-timeline"><h3><Activity size={17}/> 選取角色的私人活動紀錄 <small>{data?.agent?.client??''}</small></h3>{data?.agent&&<p className="control-help">{data.agent.deviceName} · {data.agent.source==='runner'?'Office 管理的工作':'觀察模式：可查看紀錄，操作仍在原工具進行'}</p>}{!data?.events.length&&<p className="control-help">尚未收到這位角色的詳細活動。現有 Codex App／CLI 需以 --details 啟動收集器；會開始同步近期的任務與工具紀錄。</p>}{data?.events.map((e,i)=><details key={e.id} open={i===0}><summary><time>{clock(e.at)}</time><span>{e.label}</span><small>{e.kind}</small></summary><pre>{e.detail}</pre></details>)}</div>
  </section>;
}
