// personal-log.jsx — Screen: employee's vertical feed + free log + weekly digest
const { useState: useStatePL, useEffect: useEffectPL, useRef: useRefPL, useMemo: useMemopl } = React;

// ── @ commit mention input ─────────────────────────────────────────────────
function CommitMentionInput({ value, onChange, onKeyDown: outerKeyDown, style, placeholder, autoFocus }) {
  const { ENTRIES, LANES, CONTACTS, relTime } = window.HANDOFF;
  const [mention, setMention] = useStatePL(null);   // { query, start, end } | null
  const [activeIdx, setActiveIdx] = useStatePL(0);
  const inputRef = useRefPL(null);

  const allCommits = (ENTRIES || [])
    .filter(e => e.type === 'commit' && e.hash)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 30);

  const allContacts = CONTACTS || [];

  const filteredCommits = mention
    ? allCommits.filter(c =>
        !mention.query ||
        c.hash.toLowerCase().startsWith(mention.query.toLowerCase()) ||
        c.title.toLowerCase().includes(mention.query.toLowerCase())
      ).slice(0, 4)
    : [];

  const filteredContacts = mention
    ? allContacts.filter(c =>
        !mention.query ||
        c.name.toLowerCase().includes(mention.query.toLowerCase()) ||
        (c.company || '').toLowerCase().includes(mention.query.toLowerCase())
      ).slice(0, 3)
    : [];

  const filtered = [
    ...filteredContacts.map(c => ({ ...c, _kind: 'contact' })),
    ...filteredCommits.map(c => ({ ...c, _kind: 'commit' })),
  ];

  const handleChange = (e) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    const before = val.slice(0, pos);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMention({ query: match[1], start: pos - match[0].length, end: pos });
      setActiveIdx(0);
    } else {
      setMention(null);
    }
    onChange(val);
  };

  const select = (item) => {
    const ins = item._kind === 'contact'
      ? '@' + item.name + ' '
      : '@' + item.hash.slice(0, 7) + ' ';
    const newVal = value.slice(0, mention.start) + ins + value.slice(mention.end);
    setMention(null);
    onChange(newVal);
    setTimeout(() => {
      if (inputRef.current) {
        const pos = mention.start + ins.length;
        inputRef.current.setSelectionRange(pos, pos);
        inputRef.current.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (mention && filtered.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); select(filtered[activeIdx]); return; }
      if (e.key === 'Escape')    { setMention(null); return; }
    }
    outerKeyDown && outerKeyDown(e);
  };

  // Pull marginBottom off the input and put it on the wrapper so it applies
  // below the popup (if open) rather than between input and popup.
  const { marginBottom, ...inputStyle } = style || {};

  return (
    <div style={{ flex: style?.flex, minWidth: 0, marginBottom }}>
      <input ref={inputRef} value={value} onChange={handleChange} onKeyDown={handleKeyDown}
        onClick={e => {
          const pos = e.target.selectionStart;
          const before = value.slice(0, pos);
          const match = before.match(/@(\w*)$/);
          setMention(match ? { query: match[1], start: pos - match[0].length, end: pos } : null);
        }}
        style={{ ...inputStyle, flex: undefined, width: inputStyle?.width || (inputStyle?.flex ? '100%' : undefined) }}
        placeholder={placeholder} autoFocus={autoFocus} />

      {/* Inline panel — no position:fixed/absolute, no coordinate math, no clipping issues */}
      {mention && filtered.length > 0 && (
        <div style={{
          marginTop: 4, background: '#202027', border: '1px solid #3a3a45',
          borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.7)', overflow: 'hidden',
        }}>
          {filtered.map((item, i) => {
            const isContact = item._kind === 'contact';
            const isFirstCommit = !isContact && i === filteredContacts.length && filteredContacts.length > 0;
            const lane = !isContact ? LANES.find(l => l.id === item.lane) : null;
            return (
              <React.Fragment key={isContact ? 'c' + item.id : item.id}>
                {isFirstCommit && (
                  <div style={{ height: 1, background: '#2c2c35', margin: '2px 0' }} />
                )}
                <button onMouseDown={e => { e.preventDefault(); select(item); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: i === activeIdx ? '#2e2e3a' : 'none', color: 'var(--text)' }}>
                  {isContact ? (
                    <>
                      <Icon name="person" size={13} color="var(--purple)" />
                      <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#d2d2da' }}>
                        {item.name}
                      </span>
                      {item.company && <span style={{ fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}>{item.company}</span>}
                    </>
                  ) : (
                    <>
                      <Icon name="commit" size={13} color="var(--teal)" />
                      <span className="mono" style={{ fontSize: 12, color: 'var(--teal)', flex: '0 0 auto' }}>
                        {item.hash.slice(0, 7)}
                      </span>
                      <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#d2d2da' }}>
                        {item.title}
                      </span>
                      {lane && <span style={{ fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}>{lane.name}</span>}
                      <span style={{ fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}>{relTime(item.date)}</span>
                    </>
                  )}
                </button>
              </React.Fragment>
            );
          })}
          <div style={{ padding: '5px 12px 6px', borderTop: '1px solid #2c2c35', fontSize: 10.5, color: 'var(--muted)' }}>
            ↑↓ navigate · Enter / Tab to insert · Esc dismiss
          </div>
        </div>
      )}
    </div>
  );
}

// ── Free Log with AI parsing ───────────────────────────────────────────────
// ParsedNodeCard is defined in timeline.jsx (loads first) as window.ParsedNodeCard

function FreeLogSection({ onRefresh }) {
  const { LANES, CURRENT_USER } = window.HANDOFF;
  const [open, setOpen] = useStatePL(false);
  const [text, setText] = useStatePL('');
  const [lane, setLane] = useStatePL(LANES[0] ? LANES[0].id : '');
  const [phase, setPhase] = useStatePL('input');   // input | parsing | preview
  const [preview, setPreview] = useStatePL([]);
  const [saving, setSaving] = useStatePL(false);
  const [error, setError] = useStatePL(null);

  const parse = async () => {
    if (!text.trim() || !lane) return;
    const selectedLane = LANES.find(l => l.id === lane);
    if (!selectedLane) return;
    setPhase('parsing');
    setError(null);
    try {
      const parsed = await API.parseLog(selectedLane.dbId, text);
      setPreview(Array.isArray(parsed) ? parsed : []);
      setPhase('preview');
    } catch (e) {
      setError('Parse failed — check backend connection.');
      setPhase('input');
    }
  };

  const confirm = async () => {
    if (!preview.length || saving) return;
    const selectedLane = LANES.find(l => l.id === lane);
    if (!selectedLane) return;
    setSaving(true);
    for (const node of preview) {
      await API.addNode(selectedLane.dbId, {
        type: node.type,
        content: node.content || (node.metadata || {}).title || 'Untitled',
        created_by: CURRENT_USER,
        metadata: node.metadata || {},
        is_ai_generated: true,
      });
    }
    setSaving(false);
    setText('');
    setPreview([]);
    setPhase('input');
    setOpen(false);
    onRefresh();
  };

  const reset = () => { setPhase('input'); setPreview([]); };
  const close = () => { setOpen(false); setPhase('input'); setText(''); setPreview([]); setError(null); };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 14px', marginBottom: 14, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--muted-2)', fontSize: 13, cursor: 'pointer', transition: 'border-color .14s, color .14s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--purple)'; e.currentTarget.style.color = 'var(--text)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted-2)'; }}>
      <Icon name="sparkle" size={16} color="var(--purple)" />
      <span>Paste anything — AI will parse it into entries</span>
      <span style={{ marginLeft: 'auto', fontSize: 11.5 }}>Free log ↓</span>
    </button>
  );

  return (
    <div className="card" style={{ padding: '16px', marginBottom: 18, animation: 'slideUp .16s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <Icon name="sparkle" size={16} color="var(--purple)" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Free log</span>
        {phase === 'preview' && <Pill color="var(--purple)">{preview.length} node{preview.length !== 1 ? 's' : ''} parsed</Pill>}
        <button className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto', padding: 4 }} onClick={close}><Icon name="close" size={15} color="var(--muted-2)" /></button>
      </div>

      {/* Input phase */}
      {phase === 'input' && (
        <>
          <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
            placeholder={'Paste links, commit hashes, experiment results, or notes.\n\nAI will detect types and structure them. You can paste multiple items at once.'}
            style={{ width: '100%', minHeight: 120, padding: '11px 13px', resize: 'vertical', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, lineHeight: 1.65, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }} />
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Lane</span>
            <div style={{ position: 'relative' }}>
              <select value={lane} onChange={e => setLane(e.target.value)} style={{ appearance: 'none', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 30px 7px 11px', color: 'var(--text)', fontSize: 12.5, outline: 'none' }}>
                {LANES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><Icon name="chevDown" size={14} color="var(--muted)" /></span>
            </div>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost" onClick={close}>Cancel</button>
            <button className="btn btn-primary" onClick={parse} disabled={!text.trim()}>
              <Icon name="sparkle" size={14} /> Parse with AI →
            </button>
          </div>
        </>
      )}

      {/* Parsing spinner */}
      {phase === 'parsing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '24px 8px' }}>
          <div style={{ width: 28, height: 28, border: '2.5px solid var(--border)', borderTopColor: 'var(--purple)', borderRadius: '50%', animation: 'spin .8s linear infinite', flex: '0 0 auto' }} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Parsing with Gemini…</span>
        </div>
      )}

      {/* Preview phase */}
      {phase === 'preview' && (
        <>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Review parsed entries — remove any you don't want, then confirm.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
            {preview.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>All entries removed.</div>
            ) : preview.map((node, i) => (
              <ParsedNodeCard key={i} node={node} onRemove={() => setPreview(p => p.filter((_, j) => j !== i))} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button className="btn btn-ghost" onClick={reset}>← Re-parse</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost" onClick={close}>Cancel</button>
            <button className="btn btn-primary" onClick={confirm} disabled={saving || preview.length === 0}>
              {saving ? 'Saving…' : `Add ${preview.length} entr${preview.length !== 1 ? 'ies' : 'y'} →`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Single-entry quick-add bar ─────────────────────────────────────────────
const TYPE_OPTIONS = [
  { type: 'note',      frontType: 'note',       label: 'Note'       },
  { type: 'commit',    frontType: 'commit',      label: 'Commit'     },
  { type: 'idea',      frontType: 'experiment',  label: 'Experiment' },
  { type: 'link',      frontType: 'reference',   label: 'Reference'  },
  { type: 'decision',  frontType: 'decision',    label: 'Decision'   },
  { type: 'meeting',   frontType: 'meeting',     label: 'Meeting'    },
  { type: 'milestone', frontType: 'milestone',   label: 'Milestone'  },
];

function QuickAddBar({ onRefresh }) {
  const { TYPE_META, LANES, CURRENT_USER } = window.HANDOFF;
  const [text, setText] = useStatePL('');
  const [lane, setLane] = useStatePL(LANES[0] ? LANES[0].id : '');
  const [annot, setAnnot] = useStatePL('');
  const [saving, setSaving] = useStatePL(false);
  const [typeOverride, setTypeOverride] = useStatePL(null);

  function detectType(t) {
    t = t.trim().toLowerCase();
    if (!t) return null;
    if (/github\.com\/.+\/commit\/|^[0-9a-f]{7,40}$/.test(t)) return { type: 'commit', hint: 'Commit hash detected' };
    if (/arxiv\.org|\.pdf($|\?)|doi\.org/.test(t))            return { type: 'link', refKind: 'Paper',   hint: 'Paper / arXiv link' };
    if (/github\.com|gitlab\.com/.test(t))                    return { type: 'link', refKind: 'Repo',    hint: 'Repository link' };
    if (/^https?:\/\//.test(t))                               return { type: 'link', refKind: 'Article', hint: 'Link detected' };
    if (/\bwe decided\b|\bchose\b|\bfinalized\b|\bgoing with\b|\bdecision:/i.test(t)) return { type: 'decision', hint: 'Looks like a decision' };
    if (/\bmeeting\b|\bmet with\b|\bcall with\b|\bstandup\b|\bsync\b/i.test(t))       return { type: 'meeting',  hint: 'Looks like a meeting'  };
    if (/\bshipped\b|\blaunched\b|\breleased\b|\bmilestone\b|\bwent live\b|\bdeployed to prod\b/i.test(t)) return { type: 'milestone', hint: 'Looks like a milestone' };
    if (/=|\d+%|acc|loss|f1|epoch/i.test(t))                  return { type: 'idea', hint: 'Looks like a result' };
    return { type: 'note', hint: 'Plain note' };
  }

  const detAuto = detectType(text);
  const det = typeOverride ? { type: typeOverride, hint: null } : detAuto;
  const frontType = det ? (det.type === 'link' ? 'reference' : det.type === 'idea' ? 'experiment' : det.type) : null;
  const m = frontType ? TYPE_META[frontType] : null;

  const cancel = () => { setText(''); setAnnot(''); setTypeOverride(null); };

  const submit = async () => {
    if (!text.trim() || !lane || saving || !det) return;
    const selectedLane = LANES.find(l => l.id === lane);
    if (!selectedLane) return;
    setSaving(true);
    // extract hash from text if commit type
    const hashMatch = det.type === 'commit' ? text.trim().match(/[0-9a-f]{7,40}/i) : null;
    await API.addNode(selectedLane.dbId, {
      type: det.type,
      content: text.trim(),
      created_by: CURRENT_USER,
      metadata: {
        title: text.trim().slice(0, 80),
        note: annot.trim() || undefined,
        ...(det.refKind ? { refKind: det.refKind } : {}),
        ...(hashMatch ? { hash: hashMatch[0] } : {}),
      },
    });
    cancel(); setSaving(false); onRefresh();
  };

  return (
    <div className="card" style={{ padding: det ? '14px 16px 16px' : '4px 6px', marginBottom: 12, transition: 'padding .15s' }}>
      {/* Main input row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: det ? '0 0 12px' : '6px 8px' }}>
        <span style={{ color: m ? m.color : 'var(--muted)', display: 'inline-flex', flex: '0 0 auto', paddingTop: 8 }}>
          <Icon name={m ? m.glyph : 'plus'} size={18} />
        </span>
        <CommitMentionInput
          value={text}
          onChange={v => { setText(v); setTypeOverride(null); }}
          onKeyDown={e => e.key === 'Enter' && det && submit()}
          placeholder="Paste a link, commit hash, result, or note… (type @ for commits)"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, padding: '8px 0', width: '100%' }}
        />
        {det && m && !typeOverride && <Pill color={m.color} style={{ flex: '0 0 auto' }}>{det.refKind || m.label}</Pill>}
      </div>

      {det && (
        <div style={{ animation: 'slideUp .16s ease both' }}>
          {/* Type selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 11 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 3 }}>Type</span>
            {TYPE_OPTIONS.map(opt => {
              const om = TYPE_META[opt.frontType];
              const active = det.type === opt.type;
              return (
                <button key={opt.type} onClick={() => setTypeOverride(active && typeOverride ? null : opt.type)}
                  style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer',
                    border: `1px solid ${active ? om.color : 'var(--border)'}`,
                    background: active ? om.color + '22' : 'transparent',
                    color: active ? om.color : 'var(--muted)',
                    transition: 'background .1s, border-color .1s, color .1s' }}>
                  {opt.label}
                </button>
              );
            })}
            {typeOverride && (
              <span style={{ fontSize: 10.5, color: 'var(--muted)', marginLeft: 2 }}>manual</span>
            )}
          </div>

          {/* Annotation with @ mention */}
          <CommitMentionInput
            value={annot}
            onChange={setAnnot}
            placeholder="One-line annotation — type @ to reference a commit"
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 11 }}
          />

          {/* Lane + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Lane</span>
            <div style={{ position: 'relative' }}>
              <select value={lane} onChange={e => setLane(e.target.value)}
                style={{ appearance: 'none', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 30px 7px 11px', color: 'var(--text)', fontSize: 12.5, outline: 'none' }}>
                {LANES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <Icon name="chevDown" size={14} color="var(--muted)" />
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost" onClick={cancel}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={submit}>
              {saving ? 'Saving…' : <>Add entry <span className="kbd" style={{ background: '#ffffff22', color: '#fff', borderColor: 'transparent' }}>↵</span></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inbox: shared Slack message parser ────────────────────────────────────
function parseSlackMessages(rawText) {
  return (rawText || '').split('\n')
    .map(line => {
      const m = line.trim().match(/^(.+?)\s*\[(\d+:\d+\s*[AP]M)\]:\s*(.+)$/i);
      return m ? { name: m[1].trim(), time: m[2].trim(), text: m[3].trim() } : null;
    })
    .filter(Boolean);
}

// ── Inbox: Git commit banner ───────────────────────────────────────────────
function GitBanner({ item, onDismiss, onRefresh }) {
  const { LANES, CURRENT_USER } = window.HANDOFF;
  const firstNode = (item.nodes || [])[0] || {};
  const meta = firstNode.metadata || {};
  const [note, setNote] = useStatePL('');
  const [lane, setLane] = useStatePL(() => {
    const l = LANES.find(l => l.id === item.branch_slug);
    return l ? l.id : (LANES[0] ? LANES[0].id : '');
  });
  const [saving, setSaving] = useStatePL(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const selectedLane = LANES.find(l => l.id === lane);
    if (selectedLane) {
      await API.addNode(selectedLane.dbId, {
        type: firstNode.type || 'commit',
        content: firstNode.content || meta.title,
        created_by: CURRENT_USER,
        metadata: { ...meta, ...(note.trim() ? { note: note.trim() } : {}) },
      });
    }
    await API.dismissInbox(item.id);
    setSaving(false);
    onRefresh();
    onDismiss(item.id);
  };

  const skip = async () => { await API.dismissInbox(item.id); onDismiss(item.id); };

  return (
    <div style={{ marginBottom: 10, border: '1px solid #1D9E7555', background: '#1D9E751a', borderRadius: 12, padding: '13px 15px', animation: 'slideUp .2s ease both' }}>
      {/* Commit header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
        <Icon name="github" size={17} color="var(--teal)" />
        <span className="mono" style={{ fontSize: 13, color: 'var(--teal)', flex: '0 0 auto' }}>{meta.hash}</span>
        <span style={{ fontSize: 13, color: '#d6d6dd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.title}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', flex: '0 0 auto' }}>pushed just now</span>
      </div>
      {/* Note + lane + actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={note} onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          placeholder="Add a note about this commit… (optional)"
          style={{ flex: 1, minWidth: 200, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', color: 'var(--text)', fontSize: 12.5, outline: 'none' }} />
        <select value={lane} onChange={e => setLane(e.target.value)}
          style={{ appearance: 'none', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', color: 'var(--text)', fontSize: 12, outline: 'none', flex: '0 0 auto' }}>
          {LANES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={skip}>Skip</button>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 13px' }} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Add to log →'}
        </button>
      </div>
    </div>
  );
}

// ── Inbox: Slack message banner ────────────────────────────────────────────
function SlackBanner({ item, onDismiss, onRefresh }) {
  const { LANES, CURRENT_USER, TYPE_META } = window.HANDOFF;
  const [nodes, setNodes] = useStatePL(item.nodes || []);
  const [lane, setLane] = useStatePL(() => {
    const l = LANES.find(l => l.id === item.branch_slug);
    return l ? l.id : (LANES[0] ? LANES[0].id : '');
  });
  const [expanded, setExpanded] = useStatePL(false);
  const [saving, setSaving] = useStatePL(false);
  const messages = parseSlackMessages(item.raw_text);

  const save = async () => {
    if (saving || !nodes.length) return;
    const selectedLane = LANES.find(l => l.id === lane);
    if (!selectedLane) return;
    setSaving(true);
    for (const n of nodes) {
      await API.addNode(selectedLane.dbId, {
        type: n.type, content: n.content, created_by: CURRENT_USER,
        metadata: n.metadata || {}, is_ai_generated: true,
      });
    }
    await API.dismissInbox(item.id);
    setSaving(false);
    onRefresh();
    onDismiss(item.id);
  };

  const skip = async () => { await API.dismissInbox(item.id); onDismiss(item.id); };

  const dotColors = nodes.map(n => {
    const ft = n.type === 'idea' ? 'experiment' : n.type === 'link' ? 'reference' : n.type;
    return (TYPE_META[ft] || TYPE_META.note).color;
  });

  return (
    <div style={{ marginBottom: 10, border: '1px solid #7F77DD44', background: '#7F77DD0c', borderRadius: 12, overflow: 'hidden', animation: 'slideUp .2s ease both' }}>
      {/* Always-visible header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <Icon name="slack" size={17} color="var(--purple)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#d6d6dd' }}>Slack messages detected</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{item.title}</div>
        </div>
        {/* Colored dot preview */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: '0 0 auto' }}>
          {dotColors.map((c, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />)}
          <span style={{ fontSize: 10.5, color: 'var(--muted)', marginLeft: 4 }}>{nodes.length} items</span>
        </div>
        {!expanded && (
          <button className="btn btn-ghost" style={{ fontSize: 11.5, padding: '4px 9px', flex: '0 0 auto' }}
            onClick={e => { e.stopPropagation(); skip(); }}>Skip</button>
        )}
        <Icon name="chevDown" size={14} color="var(--muted)"
          style={{ flex: '0 0 auto', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 15px 14px', borderTop: '1px solid #7F77DD1a' }}>
          {/* Slack message log */}
          <div style={{ background: 'var(--bg)', borderRadius: 9, padding: '11px 12px', margin: '12px 0 13px' }}>
            {messages.map((m, i) => {
              const initials = m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
              const hue = (m.name.charCodeAt(0) * 37 + m.name.charCodeAt(m.name.length - 1) * 13) % 360;
              return (
                <div key={i} style={{ display: 'flex', gap: 9, marginBottom: i < messages.length - 1 ? 10 : 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: `hsl(${hue},35%,22%)`, border: `1px solid hsl(${hue},40%,32%)`, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: `hsl(${hue},55%,65%)` }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginBottom: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#d6d6dd' }}>{m.name.split(' ')[0]}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{m.time}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#b0b0c0', lineHeight: 1.55, wordBreak: 'break-word' }}>{m.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Extracted nodes */}
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', marginBottom: 8 }}>
            {nodes.length} node{nodes.length !== 1 ? 's' : ''} extracted — remove any you don't need
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 13 }}>
            {nodes.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>All removed.</div>
              : nodes.map((n, i) => (
                  <ParsedNodeCard key={i} node={n} onRemove={() => setNodes(p => p.filter((_, j) => j !== i))} />
                ))}
          </div>

          {/* Lane + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Lane</span>
            <select value={lane} onChange={e => setLane(e.target.value)}
              style={{ appearance: 'none', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
              {LANES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={skip}>Skip all</button>
            <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={saving || !nodes.length} onClick={save}>
              {saving ? 'Adding…' : `Add ${nodes.length} entr${nodes.length !== 1 ? 'ies' : 'y'} →`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inbox section (fetches git + slack suggestions) ────────────────────────
function InboxSection({ onRefresh }) {
  const [items, setItems] = useStatePL([]);

  useEffectPL(() => {
    API.getInbox()
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const dismiss = (id) => setItems(prev => prev.filter(item => item.id !== id));
  if (!items.length) return null;

  return (
    <div style={{ marginBottom: 4 }}>
      {items.map(item =>
        item.source === 'git'
          ? <GitBanner key={item.id} item={item} onDismiss={dismiss} onRefresh={onRefresh} />
          : <SlackBanner key={item.id} item={item} onDismiss={dismiss} onRefresh={onRefresh} />
      )}
    </div>
  );
}

// ── Entry card ─────────────────────────────────────────────────────────────
function LogCard({ e }) {
  const { TYPE_META, LANES, relTime } = window.HANDOFF;
  const [hover, setHover] = useStatePL(false);
  const m = TYPE_META[e.type];
  const lane = LANES.find(l => l.id === e.lane);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'stretch', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', transition: 'border-color .14s', borderColor: hover ? '#3a3a45' : 'var(--border)' }}>
      <div style={{ width: 3, flex: '0 0 auto', background: m.color }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', flex: 1, minWidth: 0 }}>
        <span style={{ width: 30, height: 30, flex: '0 0 auto', borderRadius: 8, background: m.color + '1c', color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={m.glyph} size={15} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {e.hash && <span className="mono" style={{ fontSize: 12, color: m.color, flex: '0 0 auto' }}>{e.hash}</span>}
            {e.metric && e.metric !== 'pending' && <span className="mono" style={{ fontSize: 11.5, color: 'var(--amber)', flex: '0 0 auto', whiteSpace: 'nowrap' }}>{e.metric}</span>}
            <span style={{ fontSize: 13.5, color: '#e2e2e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
          </div>
          {e.note && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>"{e.note}"</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: '0 0 auto' }}>
          {hover && <button className="btn btn-ghost btn-icon" style={{ padding: 5 }}><Icon name="edit" size={15} color="var(--muted-2)" /></button>}
          {lane && <Pill color="var(--muted)" style={{ fontSize: 11 }}>{lane.name}</Pill>}
          <span style={{ fontSize: 11.5, color: 'var(--muted)', width: 54, textAlign: 'right' }}>{relTime(e.date)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Weekly digest modal ────────────────────────────────────────────────────
function DigestModal({ currentUser, onClose }) {
  const [phase, setPhase] = useStatePL('generating');
  const [digest, setDigest] = useStatePL(null);
  const [error, setError] = useStatePL(null);
  const [step, setStep] = useStatePL(0);

  const GEN_STEPS = ['Collecting entries from the past 7 days…', 'Clustering by lane and decision…', 'Drafting structured summary…', 'Polishing prose…'];

  // Kick off AI call immediately; show animation while we wait
  useEffectPL(() => {
    API.weeklyDigest(currentUser)
      .then(data => { setDigest(data); setPhase('review'); })
      .catch(e => { setError(e.message); setPhase('review'); });
  }, []);

  useEffectPL(() => {
    if (phase !== 'generating' || step >= GEN_STEPS.length - 1) return;
    const id = setTimeout(() => setStep(s => s + 1), 720);
    return () => clearTimeout(id);
  }, [phase, step]);

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 90, animation: 'fadeIn .15s ease both' }} />
      <div className="pop-in" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 560, maxHeight: '82%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, zIndex: 91, boxShadow: '0 30px 80px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '15px 18px', borderBottom: '1px solid var(--border-soft)' }}>
          <Icon name="sparkle" size={16} color="var(--purple)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Weekly digest</span>
          {phase === 'review'    && <Pill color="var(--purple)" style={{ marginLeft: 4 }}>draft</Pill>}
          {phase === 'published' && <Pill color="var(--green)"  style={{ marginLeft: 4 }}><Icon name="check" size={11} /> published</Pill>}
          <button className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }} onClick={onClose}><Icon name="close" size={16} color="var(--muted-2)" /></button>
        </div>

        {phase === 'generating' && (
          <div style={{ padding: '40px 28px 44px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--purple)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340, margin: '0 auto' }}>
              {GEN_STEPS.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: i < step ? 'var(--muted)' : i === step ? 'var(--text)' : '#44444f', transition: 'color .3s' }}>
                  {i < step ? <Icon name="check" size={15} color="var(--green)" />
                    : i === step ? <span style={{ width: 15, height: 15, display: 'inline-flex' }}><span style={{ width: 7, height: 7, margin: 'auto', borderRadius: '50%', background: 'var(--purple)', animation: 'pulse 1s ease infinite' }} /></span>
                    : <span style={{ width: 15, height: 15, display: 'inline-block' }}><span style={{ display: 'block', width: 6, height: 6, margin: 'auto', borderRadius: '50%', border: '1.5px solid #44444f' }} /></span>}
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {phase !== 'generating' && (
          <div style={{ overflowY: 'auto', padding: '20px 22px' }}>
            {error && <div style={{ fontSize: 12.5, color: 'var(--amber)', marginBottom: 12, padding: '8px 11px', background: '#EF9F270d', borderRadius: 7 }}>AI unavailable — showing mock digest. ({error})</div>}
            {digest && (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{digest.week || 'This week'}</div>
                {(digest.sections || []).map((s, i) => (
                  <div key={i} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--purple)', marginBottom: 7 }}>{s.h}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(s.items || []).map((it, j) => (
                        <div key={j} style={{ display: 'flex', gap: 9, fontSize: 13, lineHeight: 1.55, color: '#d2d2da' }}>
                          <span style={{ color: 'var(--muted)', flex: '0 0 auto' }}>•</span>
                          <span style={{ textWrap: 'pretty' }}>{it}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {phase === 'review' && (
          <div style={{ display: 'flex', gap: 9, padding: '13px 18px', borderTop: '1px solid var(--border-soft)' }}>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', alignSelf: 'center' }}>Review before publishing — your manager sees this read-only.</span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={() => setPhase('published')}>Publish digest</button>
          </div>
        )}
        {phase === 'published' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 18px', borderTop: '1px solid var(--border-soft)' }}>
            <Icon name="check" size={16} color="var(--green)" />
            <span style={{ fontSize: 13, color: '#d2d2da' }}>Published to your weekly report.</span>
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Personal log screen ────────────────────────────────────────────────────
function PersonalLogScreen({ currentUser, onRefresh }) {
  const { ENTRIES, PEOPLE } = window.HANDOFF;
  const me = PEOPLE[currentUser];
  const [digest, setDigest] = useStatePL(false);
  const mine = ENTRIES.filter(e => e.author === currentUser)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px', height: 56, borderBottom: '1px solid var(--border)', flex: '0 0 auto' }}>
        {me && <><Avatar person={me} size={30} ring />
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {me.name}
            {me.departing && <Pill color="var(--red)">departing · last day {me.lastDay}</Pill>}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{me.role} · {mine.length} entries</div>
        </div></>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setDigest(true)}>
          <Icon name="sparkle" size={15} /> Generate weekly digest
        </button>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0' }}>
        <div style={{ width: 680, maxWidth: '92%', margin: '0 auto' }}>
          {/* Inbox: git commits + Slack message suggestions */}
          <InboxSection onRefresh={onRefresh} />

          {/* Quick single-entry add */}
          <QuickAddBar onRefresh={onRefresh} />

          {/* AI free log (paste anything) */}
          <FreeLogSection onRefresh={onRefresh} />

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '10px 2px 12px' }}>My entries</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {mine.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: '8px 2px' }}>No entries yet — add one above.</div>
              : mine.map(e => <LogCard key={e.id} e={e} />)}
          </div>
        </div>
      </div>

      {digest && <DigestModal currentUser={currentUser} onClose={() => setDigest(false)} />}
    </div>
  );
}

window.PersonalLogScreen = PersonalLogScreen;
