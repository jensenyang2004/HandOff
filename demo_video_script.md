｜開場：Jensen 最後一天
｜Timeline：每個節點都是一種開發情境
｜Reference、Experiment、Note 快速回溯
｜AI 功能一：Free Log 把混合紀錄拆成節點
｜Decision Flow：決策如何串起來
｜系統偵測：從 GitHub、Slack 自動產生節點 preview
｜AI 功能二：Branch Context Panel 整理 branch 背景
｜My Tasks：確認交接後誰接著做
｜Handover Report：輸出完整交接文件


---

｜開場：Jensen 最後一天

畫面：以 Jensen Park 登入，停在 Timeline，右上角顯示「Departing · last day Jun 6」。

旁白：
「今天是 Jensen 在 Receipts OCR 專案的最後一天。他過去負責 OCR Pipeline、Model Training 和 Deployment Pipeline。如果今天才開始寫交接文件，很多決策、實驗結果和踩過的坑都很難完整回想。」
「但 Jensen 平常就用 Handoff 記錄開發過程，所以今天的交接不是從零開始，而是回頭整理已經留下的脈絡。」


---

｜Timeline：每個節點都是一種開發情境

操作：
1. 畫面停在 Timeline，可見 OCR Pipeline、Data Preprocessing、Model Training、Deployment Pipeline 四條 branch lane。
2. 滑過不同顏色的節點圓圈，讓各種型別都出現 popover。

旁白：
「在 Timeline 裡，每條線是一個開發主題，每個節點代表一次重要事件。」
「Commit 是重要程式改動，Reference 是查過的 paper、repo 或文件，Experiment 是實驗結果或還沒驗證的想法，Note 是工程判斷和踩坑提醒，Decision 則是明確的技術選擇，會被系統連結到後續的 commit 和實驗。」


---

｜Reference、Experiment、Note 快速回溯

操作：
1. 在 OCR Pipeline lane，hover 或點開 Reference 節點「CRAFT: Character Region Awareness for Text Detection」。
2. hover 或點開另一個 Reference 節點「open-mmlab/mmocr」。
3. 點開 Experiment 節點「EfficientNet-B3 — 87.2% char-F1, stable on edge cases」，展示 metric 顯示「87.2% char-F1」。
4. 點開 Note 節點「Batch size 512 caused gradient explosion — reverted to 128」，展示 body 說明。

旁白：
「除了 commit，Jensen 平常也會留下其他節點。」
「查外部資料時，他會留下 Reference，例如 CRAFT paper 或 mmocr repo，讓接手的人知道設計依據在哪裡。」
「做實驗時，他會留下 Experiment，例如 EfficientNet-B3 達到 87.2% char-F1，這讓結果可以被追溯。」
「遇到踩坑時，他會留下 Note。像 batch size 512 造成 gradient explosion，最後退回 128。這種失敗紀錄對交接特別重要，它可以避免接手的人重踩同樣的坑。」


---

｜AI 功能一：Free Log 把混合紀錄拆成節點

操作：
1. 到 My Log。
2. 點「Free log」按鈕或點開 FreeLogSection。
3. 在 Branch 下拉選「Deployment Pipeline」。
4. 貼上以下混合文字：

Met with Priya and Maya about deployment handoff. We decided to ship Triton staging first and delay production rollout until recognizer latency is below 180ms.

Commit 9f3a21c added Triton config templates.

Need Maya to benchmark recognizer latency by 2026-06-10.

https://github.com/triton-inference-server/server

5. 按「Parse with AI →」。
6. 展示 preview 右欄：AI 拆出 meeting、decision、commit、task、reference 五種節點。
7. 可以點 ×  移除不需要的節點。
8. 按「Add X entries →」。

旁白：
「真實開發中，Jensen 不一定有時間一筆一筆分類。Free Log 允許他直接貼上一段混合紀錄。」
「AI 會把 meeting、decision、commit、task 和 reference 拆成結構化節點。Jensen 仍然可以在 preview 階段確認，最後才加入 timeline。」


---

｜Decision Flow：看 AI 怎麼分析決策脈絡、確認連結

操作：
── 第一步：切換 Decision Flow，看 AI 建議的連結 ──

1. 回到 Timeline。
2. 按 toolbar 右方的「Link decisions」按鈕，讓 AI 掃描所有 decision 節點並建立連結建議。
   （按鈕會短暫顯示「Linking…」，完成後 badge 消失。）
3. 接著按旁邊的「Decision flow」按鈕切換到 Decision Flow 模式。
4. Timeline 上浮現曲線箭頭。
   - 實線箭頭 = 已確認的連結。
   - 虛線箭頭 = AI 建議、待確認（箭頭上方有「待確認」小標籤）。

── 第二步：點開 AI 建議的連結，看內容並確認 ──

5. 點擊 OCR Pipeline lane 上的一條虛線箭頭，
   例如從「Switch detector backbone from ResNet50 to EfficientNet-B3」指向
   commit「Switch ResNet50 → EfficientNet backbone」（a3f9c2d）的那條。
   → 右側滑出 Link Drawer。

6. 在 Link Drawer 裡確認以下內容：
   - 上方「Decision」card：決策節點標題 + branch 名稱。
   - 關係標籤（紫色）：「IMPLEMENTS」。
   - 下方「Linked node」card：commit 標題 + hash a3f9c2d + branch 名稱。
   - 「Why this link?」區塊：AI 生成一句話說明因果關係，例如
     「This commit directly implements the backbone switch recorded in the decision.」

7. 確認內容無誤，按底部的「Confirm link ✓」。
   → Drawer 關閉，那條箭頭從虛線變成實線。

── 第三步：拒絕一條不夠準確的建議 ──

8. 找到另一條虛線箭頭（例如指向某個間接相關的 note），點擊打開 Link Drawer。
9. 確認 AI 解釋後，判斷這條連結不夠精確，按「Reject」。
   → Drawer 關閉，那條箭頭消失。

── 第四步：從 Decision 節點內部直接管理連結 ──

10. 點開 Decision 節點「Switch detector backbone…」本身（點節點圓圈），
    展示右側 Entry Drawer 裡的「Decision links」區塊：
    - 每條連結旁有「待確認」標籤 + ✓ 和 ✕ 按鈕，可在這裡逐一確認或拒絕。
    - 已 Confirm 的連結顯示為正常行，沒有操作按鈕。
    - 右上角有「Re-link」按鈕，可隨時重新讓 AI 掃描這個 decision。

旁白：
「Free Log 加入的 decision 節點，不只是一筆文字紀錄。系統會讓 AI 去分析這個決策和哪些 commit、experiment 有因果關係，然後在 timeline 上畫出連結。」
「這些連結一開始是 AI 的建議，用虛線顯示，上面標著『待確認』。Jensen 可以點開任何一條連結，看到兩端的節點、關係類型，以及 AI 對這條因果連結的一句話解釋。」
「確認之後，虛線變成實線，代表這條連結已經被驗證過。覺得不對的可以直接拒絕。這個設計讓 AI 的判斷有人在把關，而不是直接寫死進去。」
「對接手的人來說，這很重要。他不只看到一個決策，而是能看到：這個決策是怎麼來的、落地在哪個 commit、被哪個實驗驗證，而且這些連結都是有人確認過的，不是 AI 猜的。」


---

｜系統偵測：從 GitHub、Slack 自動產生節點 preview

操作：
1. 進入 My Log。
2. 畫面頂部出現兩種 banner：

   ── Git banner：
   展示「e4b9f01 — Add recognizer beam-search decoder · pushed just now」。
   點選 note 輸入框，輸入一句注解，例如：
   「Switched CTC decoder to beam-search (width=10) — better on low-confidence chars.」
   在 Lane 下拉選「OCR Pipeline」。
   按「Add to log →」。

   ── Slack banner（#ml-team）：
   展示 banner 標題「Slack messages detected · #ml-team · 5 messages · 5 items」及型別顏色點。
   點擊 banner 展開。
   展示 Slack 訊息 thread：
     - Diego [3:47 PM]: finished the DALI stress test — 94k samples/sec on V100, no OOM after 6 hours
     - Diego [3:48 PM]: full run log: https://wandb.ai/ocr-team/receipts/runs/dali-stress-v3
     - Maya [3:51 PM]: also pushed the weight EMA patch, commit 9d1c4fe — ablations showed +0.4% on eval
     - Diego [3:53 PM]: we decided to go with ICU tokenizer instead of NFKC, handles full-width chars way better
     - Jensen [3:55 PM]: +1. ref doc: https://unicode.org/reports/tr29/
   展示 AI 拆出的 5 個節點 preview（experiment、link、commit、decision、link）。
   可以點 × 移除不需要的節點，例如移除 unicode ref。
   在 Lane 下拉選「Data Preprocessing」。
   按「Add entries →」。

旁白：
「除了手動輸入，Handoff 也會在背景偵測常見的訊號。」
「如果 Jensen 剛 push 了一個 commit，系統會出現 Git banner，讓他在 My Log 頁面直接輸入這個 commit 的注解，不需要切換到 terminal 或另開視窗。」
「同時，Slack 的對話也會被偵測。這裡系統從 #ml-team 的五則訊息中，自動拆出 DALI 壓測結果、weight EMA 的 commit、ICU tokenizer 的決策，以及兩個 reference 連結。Jensen 可以選擇要留下哪些，不要的直接點 × 移除，然後加進指定的 branch。」
「這讓日常工作裡那些流失在 Slack 的重要訊息，能夠自動整理進 timeline，不需要 Jensen 再回頭複製貼上。」


---

｜AI 功能二：Branch Context Panel 整理 branch 背景

操作：
1. 回到 Timeline。
2. 點 OCR Pipeline 的 branch label（左側文字），打開 Branch Context Panel（右側抽屜）。
3. 展示上半部「Branch context」— 顯示這條 branch 的目的描述（可編輯）。
4. 展示下半部「Running summary」— 顯示 AI 自動整理的 branch 摘要，最後更新時間「May 31」：
   「The OCR pipeline has progressed significantly. The detector backbone was switched from ResNet50 to EfficientNet-B3, yielding 87.2% char-F1...」
5. 展示底部落後指標：「落後 N 個 node updates」。
6. 如果有待確認 link（待確認 link N 個），點擊該行，系統自動切換到 Decision Flow 模式。
7. 可選：按「Re-sync」按鈕，讓 AI 重新根據所有節點更新這段 running summary。

旁白：
「這些日常節點不只出現在 timeline，也會被整理成每個 branch 的 Context Panel。」
「Branch context 讓 Jensen 描述這條開發線的目的和現況，而 Running Summary 則是 AI 根據所有節點自動更新的摘要。每加入五個新節點，系統就會在背景重新整理一次。」
「這個背景資訊之後也會被 AI 用在解析 Free Log 和產生交接報告，所以系統不是只看單一輸入，而是理解整個 branch 的脈絡。」


---

｜My Tasks：確認交接後誰接著做

操作：
1. 點上方 Tab 切到「My Tasks」頁面。
2. 展示 task list，可見 overdue（紅）、active（藍）、done（綠）三種狀態。
3. 點開一個 overdue task，例如「Optimize to 90% accuracy · due May 29 · OCR Pipeline」。
4. 展示 task 的 branch、assigner（Priya Rao）、due date、assignment_status。

旁白：
「最後一天，Jensen 也可以在 My Tasks 確認還有哪些工作需要收尾。」
「每個 task 都連到對應的 branch、指派者和期限，所以交接不是口頭說『這個你幫我接』，而是有上下文和狀態可以追蹤。」


---

｜Handover Report：輸出完整交接文件

操作：
1. 回到 Timeline。
2. 按 toolbar 右方的「Generate Handover」按鈕。
3. 在 modal 選「Jensen Park」（標示 departing）。
4. 按「Generate」，展示生成動畫（5 個步驟依序完成）。
5. 展示 Handover Report 畫面：
   - 左側 sidebar：OCR Pipeline、Data Preprocessing、Model Training、Deployment Pipeline 四個 section。
   - 右側文件：點到「OCR Pipeline」section，快速指到 Key decisions、References used、Dead ends、Still in progress、Open tasks。
   - Key decisions 包含：Switch backbone to EfficientNet-B3（commit a3f9c2d）。
   - Dead ends 包含：Batch size 512 → gradient explosion，reverted to 128。
   - Open tasks 包含：Optimize to 90% accuracy（overdue）。
6. 底部出現「Coverage gaps detected」區塊，標示 Deployment Pipeline 和 Error Handling Logic 紀錄較少。
7. 按「Copy as Markdown」。

旁白：
「最後，Jensen 產生 Handover Report。AI 會把平常留下的 commit、reference、experiment、note、decision 和 task，整理成接手者能讀的交接文件。」
「這裡可以看到 key decisions 帶著對應的 commit hash，dead ends 說明了踩坑的原因，open tasks 清楚標示還有哪些工作未完成。底部還會自動偵測哪些 branch 紀錄不足，提醒接手者需要額外詢問。」
「交接變簡單，不是因為最後一天補了一份文件，而是因為日常開發的脈絡早就被留下來了。」
