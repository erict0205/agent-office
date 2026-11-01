# Eric’s Agent Office

一間用 Three.js 從零畫出的辦公室，集中顯示 Windows、Mac、Codex、Claude Code、Gemini CLI 的工作狀態。

網站： https://eric-agent-office.aglowant130.chatgpt.site （維持擁有者私人存取）

## 0.2 版的連線方式

```text
家裡 Windows：Codex App / CLI、Claude Code、Gemini CLI
                         ↓ 本機收集器
                  同一間雲端 Agent Office
                         ↑ 本機收集器
公司 Mac：Codex App / CLI、Claude Code、Gemini CLI
```

網站顯示電腦、工具、工作階段、狀態與最近回報。每個工作階段是一位夥伴；同一台電腦同一個 Codex session 同時出現在 App 和 CLI 時使用相同 ID，不會重複算人。3D 場景每次顯示 8 位，點其他工作階段會換到對應座位，清單不再只保留 8 筆。

- **工具 hooks（主要接法）**：接收開始、等待確認、完成與結束等事件。程式只觀察，不自動同意權限、不阻止任務、不注入模型上下文。
- **Codex 工作紀錄（相容模式）**：觀察既有 App／CLI 的本機 JSONL 中明確的 `task_started`、`task_complete`、`turn_aborted` 事件。畫面標示「工作紀錄 · 相容模式」，不能憑此判斷所有權限等待；工作紀錄久未更新時顯示「狀態未確認」。
- Claude、Gemini 的一般網頁聊天不屬於此連線範圍；Claude 指 **Claude Code**，Gemini 指 **Gemini CLI**。
- 遠端／雲端執行的工作必須在實際執行環境安裝收集器；不會僅靠桌面 App 的畫面推測遠端狀態。

相容模式依賴非穩定的工作紀錄格式，版本改動可能需要更新 reader。程式只解析已知狀態事件，不以檔案修改時間直接推斷任務完成。支援範圍是最近 24 小時有更新的工作紀錄（掃描最近三個 UTC 日期資料夾）。

## 每台電腦只需設定一次

前提：Node.js **22.13 以上**、Git，以及你要連接的 Agent 工具已安裝。可在終端執行下列指令，也可讓該電腦上的 Codex 依本文件代辦。

```text
git clone https://github.com/erict0205/agent-office.git
cd agent-office
npm ci
```

已下載的專案先更新即可，不要在既有檔案上重複 clone。

**公司 Mac：**

```text
npm run office:setup -- --device company-mac --name "公司 Mac" --tools codex,claude,gemini
```

**家裡 Windows（PowerShell 或終端機）：**

```text
npm run office:setup -- --device home-windows --name "家裡 Windows" --tools codex,claude,gemini
```

只使用 Codex 時，把工具清單改成 `--tools codex`。安裝器使用同一份 Node 程式；Windows 命令路徑會正規化，Codex 另外寫入 `commandWindows`。Windows 若使用 WSL，須在工具實際執行的環境安裝與啟動；原生 Windows 與 WSL 的使用者目錄預設並不相同。

安裝器先驗證所有 JSON，再備份、合併設定，保留原有 hooks 與其他設定。重跑不會重複加入同一份回報 hook。使用的檔案：

| 用途 | 路徑 |
|---|---|
| 裝置設定 | `~/.agent-office/device.json` |
| Codex hooks | `~/.codex/hooks.json` |
| Claude Code hooks | `~/.claude/settings.json` |
| Gemini CLI hooks | `~/.gemini/settings.json` |

hooks 指向此 repo 的安裝位置；搬移資料夾後請重跑設定指令。

`~` 在 Windows 代表使用者目錄。備份在原檔旁，檔名包含 `.agent-office-時間.bak`。裝置設定只含裝置資訊與本機收集器金鑰，**不保存 Sites 服務憑證**。

### 夥伴名稱、工作分類與出勤

每個 session 會依固定 ID 取得人名（例如 Milo Chen）。App／CLI 觀察到同一個 session 時沿用同一個名字，重啟收集器與重新整理也不會改名；不同 session 可能剛好同名，可用電腦、工具及工作識別區分。

分類包含功能開發、問題排查、測試驗證、資料研究、文件整理、程式審查、介面設計、部署發布及一般任務。本機依使用者輸入中的關鍵字與工具事件推測分類，公開畫面只收到固定分類與動作摘要（讀取檔案、修改程式、執行檢查等）。分類不呼叫模型。預設不上傳原始輸入、命令、路徑或輸出；--details 另將詳細紀錄送到擁有者專用接口。分類是粗略提示，可能不準確；讀取或執行某個工具不代表操作成功。無法辨識的事件保留一般任務／處理任務。

同一輪任務若能辨識使用者意圖，就保留該分類，直到下一輪重設；例如部署時順便跑測試，分類仍為部署發布，最近動作顯示執行檢查。Codex App 的紀錄相容模式支援已知的使用者訊息及工具呼叫格式；格式改變時可能只剩生命週期狀態。

出勤以 **Asia/Taipei（台北時間）** 計算，取代舊的 5 分鐘退場規則：

- 週一至週五 **08:00（含）–18:00（不含）**：已登記的夥伴都在辦公室。有工作／待確認／需要協助時留在電腦前，其餘時間去休息區。
- 其他時間：正在處理工作或待確認的夥伴仍會出現，標示「加班中」。工作結束／空閒後在休息區保留 **一小時**，顯示倒數與預計下班時間；到點進入「已下班」名單並從 3D 場景移除。
- 18:00 前已經空閒的夥伴在 18:00 正常下班，不會因收集器繼續送心跳而多留一小時。18:00 仍有工作時繼續加班，以之後的完成事件開始一小時計時。
- 休息期間再接到工作會回座；下一次完成重新計算一小時。跨午夜亦適用；遇到下一個平日 08:00，則進入正常上班時段並留到 18:00。

出勤控制角色的畫面呈現，不會啟動工具。連線狀態獨立保留：排班中但離線的角色可在休息區出現，清單仍標示「已離線／未連線」；不能把它視為工具正在工作。失聯且狀態陳舊的「工作中」不會讓角色整晚卡在電腦前。已登記夥伴沿用雲端最近 200 個工作階段的名單；一個 session 仍對應一位夥伴。

一小時從雲端保存的工作事件時間計算，讀取網站、重新整理、重啟收集器及裝置心跳不會延後下班。前端使用 API 的伺服器時間校正時鐘，每秒更新倒數；API 與前端共用 `lib/office-attendance.mjs`，不需要額外排程工作或模型呼叫。下班名單列出名字與原因，個別工作角落顯示下班時間。雲端最近 200 筆動態並非永久完整稽核紀錄。

### 場域與休閒互動

場景分成工作區、桌球區、主機遊戲間、茶水間與休憩角，可透過場域導覽放大查看。工作中、等待確認、需要協助及狀態未確認的角色留在工作區；閒置或已完成的角色會經走道前往休閒區。桌球需要兩位夥伴，單人休息安排主機遊戲、咖啡或休憩；每區最多兩人，約每 36 秒輪換，開始工作時重新安排回座路線。清單會顯示前往／位於哪個場域。

桌球共享球的來回運動，遊戲間有手把與電視畫面，茶水間有喝咖啡動作，休憩角則坐下聊天。這些全部是前端動畫，不會向 Agent 下遊戲指令、不會真正啟動 Switch／PS5，也不呼叫模型。關閉或切到背景分頁時暫停動畫；遵守系統的減少動態效果設定。出勤依上述平日班表與加班後一小時規則；工作狀態保持獨立。

「休閒示範」會切換到明確標示的示範模式，用八位模擬夥伴展示所有區域；示範狀態不寫入雲端，也不混入即時工作清單。可在示範中選擇夥伴並切成工作中，觀察回座，再切回休息中。3D 每次顯示最多八位的規則維持不變，較多工作可由清單選取切換。

### Codex hooks 的信任

Codex 要求你在工具內執行 **`/hooks`**，檢閱並信任新 hook 定義。此專案不繞過信任檢查。修改 hook 定義後可能需要重新信任；現有聊天可能要在下一輪或重開工作階段後才載入。

未信任前，Codex App／CLI 可先用工作紀錄相容模式回報開始、完成、中斷；完整的「等待確認」仍以 hook 事件為準。Claude Code、Gemini CLI 也需要依各工具顯示的設定／信任提示完成載入；管理員停用 hooks 時，安裝器不會強制打開。

## 啟動收集器

每台電腦執行一個收集器即可，不必為每位 Agent 開一個，也不需要在家裡重建網站或資料庫。

```text
npm run office:start -- --stdin-config
```

由有 Sites 存取權的 Codex 讀取既有 Site：

- Site ID：`appgprj_6ae43a2aa7bc8191868f0aa413a150d6`
- 網址：`https://eric-agent-office.aglowant130.chatgpt.site`
- 透過 `get_site` 取得 `siwc_bypass_bearer_token`，只把 `{"token":"服務存取憑證"}` 傳入提示後的**隱藏 stdin**。

憑證只留在程序記憶體；不要貼入聊天、命令參數或設定檔。也支援外部安全注入的 `OFFICE_SITE_TOKEN` 環境變數。重啟收集器時需要重新提供存取憑證；目前不會替你把它永久存入電腦，也不會自動設定開機啟動。

收集器連上後，在網站選擇「即時連線」。它只對外發出 HTTPS；本機 hook 接收端綁定 `127.0.0.1`，要求獨立隨機金鑰，拒絕瀏覽器跨站送入事件，不需要開放公司或家裡的入站連接埠。

```text
npm run office:doctor
```

這會顯示工具是否存在、裝置設定、收集器是否運作、最近雲端同步時間，不會顯示金鑰。按 Control+C 停止收集器；45 秒未收到心跳後，Office 會顯示裝置／員工離線。

可用選項：

- 設定時 `--dry-run`：只檢查將修改的檔案，不寫入。
- 設定或啟動時 `--config /absolute/device.json`：使用另一份裝置設定。
- 設定或啟動時 `--no-codex-files`：停用 Codex 工作紀錄相容 reader，只依賴 hooks。
- 設定時 `--url http://127.0.0.1:5173`：只連本機開發網站；需用 OFFICE_WRITE_TOKEN 提供測試用更新金鑰，並在忽略追蹤的 `.dev.vars` 設定相同金鑰的 SHA-256 指紋。
- 設定時 `--port 47832`：變更收集器本機連接埠。

## 狀態、排序與隱私

收集器每 15 秒回報心跳，狀態變更後會提早同步；網站每 5 秒更新。事件用狀態時間排序，延遲到達的舊事件不能覆蓋新狀態。短暫斷線會保留記憶體內狀態並重試。每台收集器最多保留 64 個工作階段，雲端清單最多讀取 200 筆，最近動態保留 200 筆。

預設的簡要狀態上傳白名單只有：雜湊工作階段 ID、工具、裝置別名、狀態、通用工作描述、來源與時間。不上傳 prompt、模型回覆、終端輸出、工具參數、專案路徑或帳號資料。工作階段原始 ID 只在本機使用；Office 使用雜湊識別。狀態收集使用一般 Node 程式，不額外呼叫模型。

「完成」代表收到本輪結束訊號，不能用它代替程式測試或業務驗收。相容 reader 沒有足夠訊號時顯示未知，不把沉默當成成功。

## 開發網站與驗證

資料庫 migration 依 `drizzle/meta/_journal.json` 順序套用；既有 migration 不改寫。新增私人工作控制台的資料表在 `0003`，新本機資料庫需套用全部檔案，既有資料庫只套用尚未執行的檔案一次。

```text
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_crazy_harrier.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_curvy_sunfire.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_sharp_maria_hill.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_lean_shadowcat.sql
npm run dev -- --host 127.0.0.1 --port 5173
```

```text
npm test
npx tsc --noEmit
node tests/http-smoke.mjs
node tests/ingest-smoke.mjs
```

HTTP smoke 測試只允許本機網址，會在本機資料庫建立測試員工。自動化測試涵蓋三種 hook、真實 hook 入口、設定合併與備份、Windows 路徑引號、部分 JSONL、隱私過濾、本機認證、斷線重試、跨裝置識別與舊事件排序。Windows 指令與路徑有測試覆蓋，但仍需在你的 Windows 電腦做實機驗證；Claude／Gemini 的完整工作回合也需在工具內載入 hooks 後驗證。

## 原始碼怎麼分工

| 檔案 | 責任 |
|---|---|
| `components/office-scene.ts` | 3D 房間與角色動畫 |
| `components/office.tsx` | 場景、清單、裝置／工具篩選 |
| `components/connect-panel.tsx` | Windows／Mac 連線說明與設定提示複製 |
| `bridge/collector/setup.mjs` | 裝置與工具設定、備份與合併 |
| `bridge/collector/hook.mjs` | 從工具事件挑出白名單資訊 |
| `bridge/collector/transcripts.mjs` | Codex App／CLI 相容 reader |
| `bridge/collector/server.mjs` | 本機認證、工作階段去重、批次上傳與重試 |
| `app/api/ingest/route.ts` | 接收裝置心跳與批次狀態 |
| `lib/server-office.ts` | 舊事件防護與狀態資料寫入 |

第一版的 `npm run agent` 仍保留，供需要透過程式啟動獨立唯讀 Codex 任務時使用；日常 App／CLI 的狀態監看改用收集器。

GitHub 保存使用者原始碼；Sites 使用自己的部署來源遠端。推送 GitHub 不會自動觸發部署。更新重用 `.openai/hosting.json` 中既有 Site ID，保留當時的分享權限；正式 migration 由 Sites 部署套用，本機測試資料不會上傳。網站目前公開唯讀，訪客可查看狀態與操作本機角色互動；所有狀態更新均需獨立收集器金鑰。

官方參考：[Codex hooks](https://learn.chatgpt.com/docs/hooks)、[Claude Code hooks](https://code.claude.com/docs/en/hooks)、[Gemini CLI hooks](https://geminicli.com/docs/hooks/reference/)、[Sites](https://learn.chatgpt.com/docs/sites)。


### 公開觀看、收集器更新與角色互動

- 分享網址即可觀看，不需要連接自己的 Agent。頁面的互動是瀏覽器中的情境短句與手勢，不會發送工作指令，也不呼叫模型、不增加 token 用量。
- 每張桌子的畫面依該座位的角色決定：工作中顯示分類畫面與活動動畫；離座／休息顯示螢幕保護程式；下班或空位關閉。畫面是示意，沒有真實程式碼或操作結果。
- `POST /api/office` 與 `POST /api/ingest` 需 `X-Office-Token`。收集器以 Sites 服務憑證衍生範圍限定的 HMAC-SHA256 更新金鑰（識別字 `agent-office/ingest/v1`），服務端只保存其 SHA-256 指紋 `OFFICE_INGEST_TOKEN_SHA256`，以 Sites runtime secret 設定。缺少設定時拒絕全部寫入。
- 既有隱藏 stdin 的 `{token:...}` 啟動方式會自動衍生更新金鑰。也可只提供 `{writeToken:...}` 或由安全來源注入 `OFFICE_WRITE_TOKEN`；公開網站無需額外的私人存取 header。兩種金鑰都只留在程序記憶體。
- 管理者可用 `node bridge/collector/write-auth.mjs --fingerprint-stdin`，在隱藏輸入提供服務憑證，只取得指紋，再透過 Sites 環境變數工具設定為 secret 並部署。服務憑證輪替時，須重新設定指紋與啟動各台收集器；不要把更新金鑰放進前端或 Git。
- 本機 HTTP 測試固定使用公開的測試金鑰 `a` 重複 64 次；只可用於本機。將其 SHA-256 放入本機 `.dev.vars` 後執行兩個 smoke 檔；不要套用到正式環境。

## 擁有者控制台與真正的協作

公開訪客與其他登入帳號只能取得固定分類的簡短狀態；`/api/office` 不回傳原始工作要求、指令、輸出、專案／裝置別名、差異或原始 session 識別。打招呼、咖啡與加油仍是訪客瀏覽器內的情境互動。

管理資料放在獨立的 `/api/control`，每次讀寫都驗證 Sites 提供的登入身分。首次綁定僅允許 native Site 所有者的 email（runtime secret `OFFICE_OWNER_EMAIL`），成功後以此 Site 的穩定 user ID 綁定，其他帳號即使登入也不會取得權限。更新操作另檢查同來源與操作標記；服務憑證不等於管理者登入。頁面右上角的「擁有者控制台」或底部「擁有者登入」是入口。

### 觀察既有 Codex App／CLI 的詳細活動

```text
npm run office:start -- --stdin-config --details
```

用既有隱藏 stdin 提供服務憑證。`--details` 明確開啟私人紀錄：同步最近一天的工作要求、已提供的最終回答、工具參數和輸出。相容 reader 不解析模型內部推理。常見憑證會遮罩，但原始公司工作內容仍只供擁有者查看；若不希望同步詳細內容，省略 `--details`。既有工作仍在原工具操作，Office 不接管其對話。

### 登記可以派工的本機專案

每台電腦先以 `office:setup` 設定裝置，再登記 Git 專案。以下路徑換成本機實際位置；Windows 可使用 `C:/...` 路徑：

```text
npm run office:project -- --id agent-office --name "Agent Office" --path /absolute/path/agent-office --worktrees /absolute/path/managed-worktrees
npm run office:runner -- --stdin-config
```

- 本機專案清單在 `~/.agent-office/projects.json`；只含授權的專案路徑與工作目錄位置，不含雲端憑證。路徑不接受網頁任意指定。
- 執行器使用本機已登入的 Codex CLI，從 `model/list` 選其預設模型；實際使用的模型記在私人活動紀錄。每份工作建立自己的 Codex thread。
- `office:runner` 透過隱藏 stdin 接收 `{token:...}`，衍生另一組執行器金鑰。正式 runtime secret `OFFICE_RUNNER_TOKEN_SHA256` 只保存該金鑰的 SHA-256 指紋，與狀態收集器金鑰分開；可用 `node bridge/runner/start.mjs --fingerprint-stdin` 取得指紋。憑證輪替後須更新指紋、部署並重啟。
- 網站每台執行器一次只交付一份工作，離線時排隊。每份協作使用同一個獨立 git worktree，依序交給開發、測試、審查；不自動 merge、push、刪除工作目錄。
- 工作從本機已提交的 HEAD 建立，不包含原 checkout 未提交內容；多台電腦需各自同步 Git。執行結果包含工作目錄與分支位置，供你在本機檢查。
- 權限要求送到擁有者畫面，由你允許這一次或拒絕；額外的 permissions 類型不自動授予。支援補充要求、停止整組工作、檢查後重試、退回修改和人工驗收。
- 連線租約逾時不會自動重跑，會停止本機程序並標記待檢查，避免重複修改。程序關閉或電腦斷電可能留下已執行的變更，重試前先檢查。
- 「本輪結束」是 Codex 回合結果；測試清單是角色回報，可與活動中的指令與 exit code 核對。最終狀態由你驗收，不能以角色的 pass 直接替代驗收。

工作控制台可檢視活動、指令輸出、程式差異、交付摘要、測試回報、產出位置和用量事件。這些紀錄有大小上限，私人活動最多保留近期 3,000 筆，單次讀取最近 100 筆，超過預覽上限需到本機檢查。真正派工會使用 Codex 模型額度；觀看紀錄與情境動畫不呼叫模型。

本機額外驗證：`.dev.vars` 使用測試用收集器金鑰 `a` ×64、執行器金鑰 `b` ×64 的 SHA-256，以及 `OFFICE_OWNER_EMAIL=seedy@sites.test`，啟動 dev 後執行 `node tests/control-smoke.mjs`。測試涵蓋匿名／偽造身分拒絕、CSRF、兩種服務權限分離、私人資料隔離、同時領取去重、確認／回覆、三階段交接與取消。測試 Cookie 只供 Sites 本機預覽使用，正式環境不接受。
