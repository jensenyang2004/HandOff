# Webhook Feature Spec — Slack Messages

## Objective

Add a way for Slack messages to land in HandOff in two stages:

1. **Ingest** — `POST /api/webhook/slack` writes each incoming Slack
   message to a new `slack_message` table, as-is. No AI involved.
2. **Interpret (on demand)** — the inbox shows "N new messages in
   #channel". When the user clicks **Interpret**, `POST
   /api/inbox/slack/interpret` bundles those messages, runs them
   through the existing `ai.parse_log`, and creates one
   `InboxSuggestion` row — which the existing `SlackBanner` UI already
   knows how to render.

This deliberately avoids the "windowing" problem (when is a thread
"done"? do we re-send already-processed messages?). The window is
always "whatever is currently unprocessed for this channel", and it's
the human who decides when to interpret it.

---

## New model — `SlackMessage`

Add to `models.py`, near `InboxSuggestion`:

```python
class SlackMessage(db.Model):
    __tablename__ = 'slack_message'
    id = db.Column(db.Integer, primary_key=True)
    channel = db.Column(db.String(100), nullable=False)
    user_id = db.Column(db.String(50), db.ForeignKey('user.id'), nullable=True)
    display_name = db.Column(db.String(200), nullable=False)
    text = db.Column(db.Text, nullable=False)
    ts = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    processed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'channel': self.channel,
            'user_id': self.user_id,
            'display_name': self.display_name,
            'text': self.text,
            'ts': self.ts.isoformat(),
            'processed': self.processed,
        }
```

This is a brand-new table, so `db.create_all()` (already called in
`app.py`) creates it automatically on a fresh DB. No `ALTER TABLE`
migration needed.

Remember to add `SlackMessage` to the import on `app.py:14`.

---

## Endpoint 1 — Ingest

```
POST /api/webhook/slack
Content-Type: application/json
```

### Input (simplified schema — not the real Slack Events API)

```json
{
  "channel": "ml-team",
  "user": "diego",
  "display_name": "Diego Torres",
  "text": "finished the DALI stress test — 94k samples/sec on V100, no OOM after 6 hours",
  "ts": "2026-06-10T15:47:00"
}
```

- `channel`, `user`, `text` are required → `400` if any is missing.
- `ts` is optional — default to `datetime.utcnow()` if absent.
- `display_name` is optional — fall back to `user` if absent.

### User matching

Match `payload["user"]` against `User.slack_username` (already seeded,
e.g. `'jensen'`, `'maya'`, `'diego'`, `'priya'` — see `models.py:35`
and `seed.py:33-42`).

```python
user = User.query.filter_by(slack_username=payload['user']).first()
user_id = user.id if user else None
display_name = user.name if user else payload.get('display_name', payload['user'])
```

### Output

Insert one `SlackMessage` row with `processed=False`. Return `201`:

```json
{ "ok": true, "id": 12 }
```

---

## Endpoint 2 — Pending messages (for the inbox banner)

```
GET /api/inbox/slack/pending
```

Group unprocessed `SlackMessage` rows by `channel`:

```json
[
  { "channel": "ml-team", "count": 5 }
]
```

Only channels with `count > 0` should appear.

---

## Endpoint 3 — Interpret

```
POST /api/inbox/slack/interpret
Content-Type: application/json
```

### Input

```json
{ "channel": "ml-team", "branch_slug": "data" }
```

The user picks the HandOff branch in the UI before triggering this
(same reasoning as the git webhook — there's no reliable automatic
mapping from a Slack channel to a HandOff branch).

### Behavior

1. Look up `Branch.query.filter_by(slug=branch_slug).first_or_404()`.
2. Fetch all `SlackMessage` rows where `channel == channel and
   processed == False`, ordered by `ts`.
   - If none, return `400` (`"no pending messages for this channel"`).
3. Build `raw_text` in the **exact format** the existing
   `parseSlackMessages` regex in `frontend/personal-log.jsx:418`
   expects: `"<display_name> [<H:MM AM/PM>]: <text>"`, one per line.

   ```python
   def fmt_time(dt):
       return dt.strftime('%I:%M %p').lstrip('0')

   raw_text = '\n'.join(
       f"{m.display_name} [{fmt_time(m.ts)}]: {m.text}"
       for m in messages
   )
   ```

4. Call the existing AI function — **no new AI work needed**:

   ```python
   project = Project.query.first()
   nodes = ai.parse_log(project.to_dict(), branch.to_dict(), raw_text)
   ```

5. Create one `InboxSuggestion`:

   ```python
   suggestion = InboxSuggestion(
       source='slack',
       title=f"#{channel} · {len(messages)} messages",
       raw_text=raw_text,
       nodes_json=json.dumps(nodes),
       branch_slug=branch_slug,
   )
   db.session.add(suggestion)
   ```

6. Mark all those `SlackMessage` rows `processed = True`.
7. `db.session.commit()`.

### Output

```json
{ "ok": true, "id": 7 }
```

---

## Frontend addition

A new small banner in the inbox, separate from `SlackBanner` (which
expects `item.nodes` to already be populated).

1. **`frontend/api.js`** — add next to `getInbox`/`dismissInbox`:

   ```js
   async getSlackPending() {
     const r = await fetch('/api/inbox/slack/pending');
     return r.json();
   },

   async interpretSlack(channel, branchSlug) {
     const r = await fetch('/api/inbox/slack/interpret', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ channel, branch_slug: branchSlug }),
     });
     return r.json();
   },
   ```

2. **`frontend/personal-log.jsx`** — in `InboxSection` (around
   `personal-log.jsx:603`), fetch `getSlackPending()` alongside
   `getInbox()`. For each pending channel, render a small row:
   "💬 5 new messages in #ml-team" + a branch `<select>` (use
   `window.HANDOFF.LANES`, same as `GitBanner`/`SlackBanner`) + an
   **Interpret** button.

   On click: call `interpretSlack(channel, selectedBranchSlug)`, then
   re-fetch both `getInbox()` (to pick up the new `InboxSuggestion`,
   rendered by the existing `SlackBanner`) and `getSlackPending()` (to
   remove/update the row).

---

## Where to add code

- `models.py` — `SlackMessage` model (near `InboxSuggestion`, ~line 153), and add `SlackMessage` to the import in `app.py:14`.
- `app.py` — three new routes near the existing inbox routes (~line 397):
  ```python
  @app.route('/api/webhook/slack', methods=['POST'])
  def webhook_slack():
      ...

  @app.route('/api/inbox/slack/pending')
  def slack_pending():
      ...

  @app.route('/api/inbox/slack/interpret', methods=['POST'])
  def interpret_slack():
      ...
  ```
- `frontend/api.js` — `getSlackPending`, `interpretSlack`.
- `frontend/personal-log.jsx` — new pending-banner UI in `InboxSection`.

---

## Testing

### Ingest a few messages

```bash
curl -X POST http://localhost:5001/api/webhook/slack \
  -H "Content-Type: application/json" \
  -d '{"channel": "ml-team", "user": "diego", "text": "finished the DALI stress test — 94k samples/sec on V100"}'

curl -X POST http://localhost:5001/api/webhook/slack \
  -H "Content-Type: application/json" \
  -d '{"channel": "ml-team", "user": "maya", "text": "nice!! also pushed the weight EMA patch, commit 9d1c4fe"}'
```

### Check pending

```bash
curl http://localhost:5001/api/inbox/slack/pending
# → [{"channel": "ml-team", "count": 2}]
```

### Interpret

```bash
curl -X POST http://localhost:5001/api/inbox/slack/interpret \
  -H "Content-Type: application/json" \
  -d '{"channel": "ml-team", "branch_slug": "data"}'
```

Then open the app, go to **My Log → Inbox**, and verify:
- the pending row for `#ml-team` is gone
- a new Slack banner appears with AI-parsed nodes from `ai.parse_log`

---

## What is already done (do not re-implement)

- `InboxSuggestion` model — `models.py:153`
- `GET /api/inbox`, `POST /api/inbox/<id>/dismiss` — `app.py:397-407`
- `SlackBanner` UI (renders `item.nodes`, "Add to log") — `frontend/personal-log.jsx:488`
- `parseSlackMessages` regex (`"Name [3:47 PM]: text"` format) — `frontend/personal-log.jsx:418`
- `ai.parse_log(project, branch, text)` — `ai_service.py:127`
- `User.slack_username` field, seeded for jensen/maya/diego/priya — `seed.py:33-42`
