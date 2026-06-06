
## 改動一：Linking 變成「建議」而非自動儲存

**現在的行為：**
`_trigger_decision_links()` 跑完直接把邊寫進 NodeLink table，`is_ai=True`。

**要改成：**
AI 跑完之後，結果先存進一個暫存狀態，不寫進 NodeLink。等使用者確認之後才正式寫入。

需要的 code 改動：

`NodeLink` table 加一個欄位：
```
status   (pending | confirmed | rejected)
```
預設值 `pending`。

`_trigger_decision_links()` 改成存 `status=pending` 的記錄，不是直接 confirmed。

新增兩個 API endpoint：
```
POST /nodes/:node_id/links/:link_id/confirm
POST /nodes/:node_id/links/:link_id/reject
```
confirm 把 status 改成 confirmed，reject 改成 rejected 或直接刪除。

---

## 改動二：Timeline 上虛線 vs 實線

**現在的行為：**
`DecisionThreadOverlay` 畫所有 `is_ai=True` 的邊，沒有區分狀態。

**要改成：**
讀取 `status` 欄位：
- `pending` → dashed SVG line，顏色淡一點，加一個小標籤「待確認」
- `confirmed` → solid line，正常顏色

`timeline.jsx` 裡 `DecisionThreadOverlay` 的箭頭渲染加條件：
```js
strokeDasharray={link.status === 'pending' ? '5 4' : 'none'}
opacity={link.status === 'pending' ? 0.5 : 1}
```

---

## 改動三：context.md 落後指標加上 pending links 數量

**現在的行為：**
context.md panel 只顯示 `nodes_since_last_summary`，也就是落後了幾個 node updates。

**要改成：**
同時顯示兩個數字：

```
context.md
  落後 3 個 node updates
  待確認 link 2 個
```

需要的改動：

`Branch` table 加一個計算欄位或 query：
```sql
SELECT COUNT(*) FROM NodeLink
WHERE branch_id = :branch_id
AND status = 'pending'
```

這個數字不需要存在 Branch table，每次 render context panel 的時候 query 一次就夠。

前端 context panel 改成顯示兩行，`pending_links_count > 0` 的時候第二行標紅或加警示色。點擊「待確認 link 2 個」直接跳到 timeline 上那些 dashed 的邊。

---

