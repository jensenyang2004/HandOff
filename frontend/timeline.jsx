// timeline.jsx — Screen 1: horizontal railway-map timeline
const { useState, useRef, useMemo, useEffect, useCallback } = React;

// Shared spread algorithm: spaces items with minimum 3% gap, returns { id → adjustedFrac, startF, endF }
function spreadFracs(items) {
  const MIN_GAP = 0.03;
  const sorted = items.slice().sort((a, b) => a.f - b.f);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].f - sorted[i - 1].f < MIN_GAP)
      sorted[i].f = sorted[i - 1].f + MIN_GAP;
  }
  if (sorted.length && sorted[sorted.length - 1].f > 1) {
    sorted[sorted.length - 1].f = 1;
    for (let i = sorted.length - 2; i >= 0; i--)
      sorted[i].f = Math.min(sorted[i].f, sorted[i + 1].f - MIN_GAP);
  }
  return {
    map: Object.fromEntries(sorted.map(s => [s.id, s.f])),
    startF: sorted.length ? sorted[0].f : 0,
    endF:   sorted.length ? sorted[sorted.length - 1].f : 0,
  };
}

// ── Entry hover popover ────────────────────────────────────────────────────
function EntryPopover({ e, down, flip }) {
  const { TYPE_META, PEOPLE, fmtTime } = window.HANDOFF;
  const m = TYPE_META[e.type];
  const who = PEOPLE[e.author];
  return (
    <div className="pop-in" style={{
      position: 'absolute', ...(down ? { top: 'calc(100% + 10px)' } : { bottom: 'calc(100% + 10px)' }),
      ...(flip ? { right: 0 } : { left: 0 }),
      width: 268, background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '11px 12px', boxShadow: '0 12px 34px rgba(0,0,0,.55)',
      zIndex: 60, pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
        <span style={{ display: 'inline-flex', color: m.color }}><Icon name={m.glyph} size={13} /></span>
        <span style={{ fontSize: 11, fontWeight: 600, color: m.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>{m.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{fmtTime(e.date)}</span>
      </div>
      {e.hash && <div className="mono" style={{ fontSize: 11.5, color: 'var(--teal)', marginBottom: 4 }}>{e.hash}</div>}
      {e.metric && e.metric !== 'pending' && <div className="mono" style={{ fontSize: 11.5, color: 'var(--amber)', marginBottom: 4 }}>{e.metric}</div>}
      <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, marginBottom: 7, textWrap: 'pretty' }}>{e.title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5, fontStyle: 'italic', borderLeft: `2px solid ${m.color}55`, paddingLeft: 8, textWrap: 'pretty' }}>"{e.note}"</div>
      {who && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, fontSize: 11, color: 'var(--muted)' }}>
        <Avatar person={who} size={16} /> {who.name}
      </div>}
    </div>
  );
}

// ── Assign button (inline user picker) ────────────────────────────────────
function AssignButton({ entry, onRefresh }) {
  const { PEOPLE } = window.HANDOFF;
  const [open, setOpen] = useState(false);
  const employees = Object.values(PEOPLE).filter(p => !p.isManager);

  const assign = async (userId) => {
    await API.updateNode(entry.nodeId, { assigned_to: userId, assignment_status: 'pending' });
    setOpen(false);
    onRefresh();
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setOpen(s => !s)}>
        <Icon name="plus" size={13} /> Assign
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
          <div className="pop-in" style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', width: 200, zIndex: 71, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,.5)' }}>
            {employees.map(p => (
              <button key={p.id} onClick={() => assign(p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--text)', fontSize: 12.5 }}
                onMouseEnter={e => e.currentTarget.style.background = '#ffffff0d'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <Avatar person={p} size={20} />
                <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Side drawer (expanded entry detail) ───────────────────────────────────
function EntryDrawer({ e, onClose, onRefresh }) {
  const { TYPE_META, PEOPLE, LANES, fmtTime, relTime, ENTRIES, TASKS, LINKS } = window.HANDOFF;
  const [relinking, setRelinking] = useState(false);
  const [linkActions, setLinkActions] = useState({});

  const handleConfirmLink = async (linkId) => {
    setLinkActions(a => ({ ...a, [linkId]: 'confirming' }));
    await API.confirmLink(linkId);
    setLinkActions(a => { const n = { ...a }; delete n[linkId]; return n; });
    onRefresh();
  };

  const handleRejectLink = async (linkId) => {
    setLinkActions(a => ({ ...a, [linkId]: 'rejecting' }));
    await API.rejectLink(linkId);
    setLinkActions(a => { const n = { ...a }; delete n[linkId]; return n; });
    onRefresh();
  };

  const decisionLinks = e.type === 'decision'
    ? (LINKS || []).filter(l => l.from_id === e.nodeId || l.to_id === e.nodeId)
    : [];

  const getLinkedEntry = (link) => {
    const rawId = link.from_id === e.nodeId ? link.to_id : link.from_id;
    return ENTRIES.find(x => x.nodeId === rawId) || TASKS.find(x => x.nodeId === rawId);
  };

  const handleRelink = async () => {
    setRelinking(true);
    await API.relinkDecision(e.nodeId);
    setRelinking(false);
    onRefresh();
  };
  const m = TYPE_META[e.type];
  const who = PEOPLE[e.author];
  const assignee = e.assigned_to ? PEOPLE[e.assigned_to] : null;
  const lane = LANES.find(l => l.id === e.lane);
  const related = ENTRIES.filter(x => x.lane === e.lane && x.id !== e.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);

  const markDone = async () => {
    await API.updateNode(e.nodeId, { assignment_status: 'done' });
    onRefresh(); onClose();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 80, animation: 'fadeIn .15s ease both' }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 408, zIndex: 81,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        boxShadow: '-18px 0 50px rgba(0,0,0,.5)', animation: 'slideInRight .22s cubic-bezier(.2,.8,.2,1) both',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '16px 18px', borderBottom: '1px solid var(--border-soft)' }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: m.color + '1f', color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={m.glyph} size={16} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: m.color }}>{m.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{lane ? lane.name : ''}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="close" size={16} color="var(--muted-2)" /></button>
        </div>

        <div style={{ padding: '18px', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35, marginBottom: 12, textWrap: 'pretty' }}>{e.title}</div>

          {e.hash && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
              <Icon name="github" size={15} color="var(--muted-2)" />
              <span className="mono" style={{ fontSize: 13, color: 'var(--teal)' }}>{e.hash}</span>
            </div>
          )}
          {e.metric && (
            <div style={{ display: 'inline-flex', marginBottom: 14 }}>
              <Pill color="var(--amber)" style={{ fontSize: 12.5, padding: '4px 11px' }}>
                {e.metric === 'pending' ? 'result pending' : e.metric}
              </Pill>
            </div>
          )}
          {e.refKind && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
              <Pill color="var(--purple)">{e.refKind}</Pill>
            </div>
          )}

          <div style={{ fontSize: 13.5, lineHeight: 1.65, color: '#d6d6dd', marginBottom: 18, textWrap: 'pretty' }}>{e.body}</div>

          {e.note && (
            <>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 7 }}>Annotation</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, fontStyle: 'italic', color: 'var(--muted-2)', borderLeft: `2px solid ${m.color}66`, paddingLeft: 11, marginBottom: 20, textWrap: 'pretty' }}>"{e.note}"</div>
            </>
          )}

          {e.type === 'decision' && (
            <div style={{ padding: '14px 0', borderTop: '1px solid var(--border-soft)', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>
                  Decision links {decisionLinks.length > 0 && `(${decisionLinks.length})`}
                </span>
                <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 9px' }}
                  onClick={handleRelink} disabled={relinking}>
                  <Icon name="sparkle" size={12} color="var(--purple)" />
                  {relinking ? ' Linking…' : ' Re-link'}
                </button>
              </div>
              {decisionLinks.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                  No links yet — AI links when the decision is saved, or click Re-link.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {decisionLinks.map(link => {
                    const linked = getLinkedEntry(link);
                    if (!linked) return null;
                    const lm = TYPE_META[linked.type] || TYPE_META.note;
                    const llane = LANES.find(l => l.id === linked.lane);
                    const REL_COLORS = { implements: 'var(--teal)', validates: 'var(--green)', triggered_by: 'var(--amber)', supersedes: 'var(--red)' };
                    const isPending = link.status === 'pending' && link.is_ai;
                    const acting = linkActions[link.id];
                    return (
                      <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', background: 'var(--bg)', border: `1px solid ${isPending ? 'var(--amber)44' : lm.color + '33'}`, borderRadius: 7, opacity: acting ? 0.5 : 1 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: lm.color, flex: '0 0 auto' }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: REL_COLORS[link.rel] || 'var(--muted)', flex: '0 0 auto', textTransform: 'uppercase', letterSpacing: '.04em' }}>{link.rel.replace('_', ' ')}</span>
                        <span style={{ flex: 1, fontSize: 12, color: '#d2d2da', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {linked.title || linked.label}
                        </span>
                        {llane && <span style={{ fontSize: 10, color: 'var(--muted)', flex: '0 0 auto' }}>{llane.name}</span>}
                        {isPending && (
                          <>
                            <span style={{ fontSize: 9, color: 'var(--amber)', flex: '0 0 auto', fontWeight: 600 }}>待確認</span>
                            <button className="btn btn-ghost btn-icon" style={{ padding: '2px 5px', fontSize: 11, color: 'var(--green)', flex: '0 0 auto' }}
                              disabled={!!acting} onClick={() => handleConfirmLink(link.id)} title="Confirm">✓</button>
                            <button className="btn btn-ghost btn-icon" style={{ padding: '2px 5px', fontSize: 11, color: 'var(--muted)', flex: '0 0 auto' }}
                              disabled={!!acting} onClick={() => handleRejectLink(link.id)} title="Reject">✕</button>
                          </>
                        )}
                        {!link.is_ai && <span style={{ fontSize: 9, color: 'var(--muted)', flex: '0 0 auto' }}>manual</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {e.type === 'decision' && (e.rationale || e.alternatives) && (
            <div style={{ marginBottom: 18 }}>
              {e.rationale && (
                <>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 7 }}>Why</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: '#d6d6dd', marginBottom: 12, padding: '10px 12px', background: 'var(--bg)', border: `1px solid ${m.color}33`, borderRadius: 8, textWrap: 'pretty' }}>{e.rationale}</div>
                </>
              )}
              {e.alternatives && (
                <>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 7 }}>Alternatives considered</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--muted-2)', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontStyle: 'italic', textWrap: 'pretty' }}>{e.alternatives}</div>
                </>
              )}
            </div>
          )}

          {e.type === 'meeting' && (e.attendees || e.outcome) && (
            <div style={{ marginBottom: 18 }}>
              {e.attendees && (
                <>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 7 }}>Attendees</div>
                  <div style={{ fontSize: 13, color: '#d6d6dd', marginBottom: 12 }}>{e.attendees}</div>
                </>
              )}
              {e.outcome && (
                <>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 7 }}>Outcome</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: '#d6d6dd', padding: '10px 12px', background: 'var(--bg)', border: `1px solid ${m.color}33`, borderRadius: 8, textWrap: 'pretty' }}>{e.outcome}</div>
                </>
              )}
            </div>
          )}

          {/* Assignment section */}
          <div style={{ padding: '14px 0', borderTop: '1px solid var(--border-soft)', marginBottom: 14 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 8 }}>Assigned to</div>
            {assignee ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Avatar person={assignee} size={26} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{assignee.name}</div>
                </div>
                <Pill color={e.assignment_status === 'done' ? 'var(--green)' : 'var(--blue)'}>{e.assignment_status || 'pending'}</Pill>
                {e.assignment_status !== 'done' && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 9px' }} onClick={markDone}>
                    <Icon name="check" size={13} color="var(--green)" /> Done
                  </button>
                )}
              </div>
            ) : (
              <AssignButton entry={e} onRefresh={onRefresh} />
            )}
          </div>

          {/* Author + timestamp */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}>
            {who && <><Avatar person={who} size={28} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{who.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{who.role}</div>
            </div></>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--muted)' }}>
              <Icon name="clock" size={13} /> {fmtTime(e.date)} · {relTime(e.date)}
            </div>
          </div>

          {related.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 9 }}>More in this lane</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {related.map(r => {
                  const rm = TYPE_META[r.type];
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: rm.color, flex: '0 0 auto' }} />
                      <span style={{ fontSize: 12, color: '#c7c7d0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{relTime(r.date)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Task detail drawer ────────────────────────────────────────────────────
function TaskDrawer({ task, onClose, onRefresh }) {
  const { PEOPLE, LANES, TASK_META, fmtDate, relTime } = window.HANDOFF;
  const [saving, setSaving] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const tm = TASK_META[task.state];
  const lane = LANES.find(l => l.id === task.lane);
  const assignee = task.assigned_to ? PEOPLE[task.assigned_to] : null;
  const creator = PEOPLE[task.by];
  const employees = Object.values(PEOPLE).filter(p => !p.isManager);

  const markDone = async () => {
    setSaving(true);
    await API.updateNode(task.nodeId, { assignment_status: 'done' });
    setSaving(false);
    onRefresh(); onClose();
  };

  const assign = async (userId) => {
    setSaving(true);
    await API.updateNode(task.nodeId, { assigned_to: userId, assignment_status: 'pending' });
    setSaving(false);
    setReassignOpen(false);
    onRefresh();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 80, animation: 'fadeIn .15s ease both' }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 380, zIndex: 81,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        boxShadow: '-18px 0 50px rgba(0,0,0,.5)', animation: 'slideInRight .22s cubic-bezier(.2,.8,.2,1) both',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '16px 18px', borderBottom: '1px solid var(--border-soft)' }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: tm.color + '22', color: tm.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={task.state === 'completed' ? 'check' : task.state === 'overdue' ? 'warn' : 'clock'} size={15} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: tm.color }}>Task · <Pill color={tm.color} style={{ fontSize: 10 }}>{tm.label}</Pill></div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{lane ? lane.name : ''}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="close" size={16} color="var(--muted-2)" /></button>
        </div>

        <div style={{ padding: '18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Title */}
          <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35, textWrap: 'pretty',
            textDecoration: task.state === 'completed' ? 'line-through' : 'none',
            color: task.state === 'completed' ? 'var(--muted-2)' : 'var(--text)' }}>
            {task.label}
          </div>

          {/* Due date */}
          {task.due && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: 'var(--bg)', border: `1px solid ${task.state === 'overdue' ? 'var(--red)' : 'var(--border)'}`, borderRadius: 8 }}>
              <Icon name="clock" size={14} color={task.state === 'overdue' ? 'var(--red)' : 'var(--muted-2)'} />
              <span style={{ fontSize: 13, color: task.state === 'overdue' ? 'var(--red)' : 'var(--muted-2)', fontWeight: 500 }}>
                Due {fmtDate(task.due + 'T00:00:00')}
              </span>
              {task.state === 'overdue' && <Pill color="var(--red)" style={{ marginLeft: 'auto', fontSize: 10 }}>Overdue</Pill>}
            </div>
          )}

          {/* Assignment section */}
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 10 }}>Assigned to</div>
            {assignee ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar person={assignee} size={28} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{assignee.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{assignee.role}</div>
                </div>
                <Pill color={task.state === 'completed' ? 'var(--green)' : 'var(--blue)'}>{task.assignment_status || 'pending'}</Pill>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>Unassigned</div>
            )}

            {/* Reassign / Assign picker */}
            <div style={{ marginTop: 12, display: 'flex', gap: 8, position: 'relative' }}>
              {task.state !== 'completed' && (
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} disabled={saving} onClick={markDone}>
                  <Icon name="check" size={13} color="var(--green)" /> Mark done
                </button>
              )}
              <div style={{ position: 'relative' }}>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setReassignOpen(s => !s)}>
                  {assignee ? 'Reassign' : 'Assign'} <Icon name="chevDown" size={11} color="var(--muted)" />
                </button>
                {reassignOpen && (
                  <>
                    <div onClick={() => setReassignOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                    <div className="pop-in" style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', width: 200, zIndex: 91, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,.5)' }}>
                      {employees.map(p => (
                        <button key={p.id} onClick={() => assign(p.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', background: p.id === task.assigned_to ? '#ffffff10' : 'none', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--text)', fontSize: 12.5 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#ffffff0d'}
                          onMouseLeave={e => e.currentTarget.style.background = p.id === task.assigned_to ? '#ffffff10' : 'none'}>
                          <Avatar person={p} size={20} />
                          <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
                          {p.id === task.assigned_to && <Icon name="check" size={12} color="var(--purple)" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Created by */}
          {creator && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
              <Avatar person={creator} size={24} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Created by</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{creator.name}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{relTime(task.date)}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Branch context panel ──────────────────────────────────────────────────
function BranchContextPanel({ lane, onClose, onRefresh, onShowDecisionFlow }) {
  const { relTime, LINKS, ENTRIES, TASKS } = window.HANDOFF;
  const [contextDoc, setContextDoc] = useState(lane.context_doc || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const laneNodeRawIds = new Set([
    ...ENTRIES.filter(e => e.lane === lane.id).map(e => e.nodeId),
    ...TASKS.filter(t => t.lane === lane.id).map(t => t.nodeId),
  ]);
  const pendingLinksCount = (LINKS || []).filter(l =>
    l.status === 'pending' && (laneNodeRawIds.has(l.from_id) || laneNodeRawIds.has(l.to_id))
  ).length;

  const save = async () => {
    setSaving(true);
    await API.updateBranch(lane.dbId, { context_doc: contextDoc });
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 80, animation: 'fadeIn .15s ease both' }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 380, zIndex: 81,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        boxShadow: '-18px 0 50px rgba(0,0,0,.5)', animation: 'slideInRight .22s cubic-bezier(.2,.8,.2,1) both',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '16px 18px', borderBottom: '1px solid var(--border-soft)' }}>
          <Icon name="doc" size={17} color="var(--purple)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{lane.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Branch context</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="close" size={16} color="var(--muted-2)" /></button>
        </div>

        <div style={{ padding: '18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>Branch context</span>
              {!editing && <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={() => setEditing(true)}><Icon name="edit" size={13} color="var(--muted-2)" /></button>}
            </div>
            {editing ? (
              <div>
                <textarea value={contextDoc} onChange={e => setContextDoc(e.target.value)} autoFocus
                  placeholder="Why does this branch exist? What problem does it solve? What does done look like?"
                  style={{ width: '100%', minHeight: 120, padding: '10px 12px', resize: 'vertical', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, lineHeight: 1.6, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-ghost" onClick={() => { setEditing(false); setContextDoc(lane.context_doc || ''); }}>Cancel</button>
                  <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.65, color: contextDoc ? '#d6d6dd' : 'var(--muted)', fontStyle: contextDoc ? 'normal' : 'italic', cursor: 'text' }} onClick={() => setEditing(true)}>
                {contextDoc || 'Click to add context — why does this branch exist?'}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>Running summary</span>
              <Pill color="var(--purple)" style={{ fontSize: 10 }}>AI</Pill>
            </div>
            {lane.context_updating ? (
              <ContextProgressBar />
            ) : lane.running_summary ? (
              <>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: '#d6d6dd', textWrap: 'pretty' }}>{lane.running_summary}</div>
                {lane.running_summary_updated_at && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="clock" size={12} /> Context updated {relTime(lane.running_summary_updated_at)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                No summary yet — generated automatically after 5 new entries.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
              <Icon name="clock" size={12} />
              落後 {lane.node_count_since_last_summary || 0} 個 node updates
            </div>
            {pendingLinksCount > 0 && (
              <div onClick={() => { onClose(); onShowDecisionFlow && onShowDecisionFlow(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--amber)', cursor: 'pointer', fontWeight: 500 }}
                title="Click to view pending links on timeline">
                <Icon name="warn" size={12} color="var(--amber)" />
                待確認 link {pendingLinksCount} 個
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Context update progress bar ────────────────────────────────────────────
function ContextProgressBar() {
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('Reading branch history…');

  React.useEffect(() => {
    const stages = [
      { target: 30, dur: 1200, label: 'Reading branch history…' },
      { target: 65, dur: 1500, label: 'Identifying key decisions…' },
      { target: 90, dur: 1000, label: 'Updating context…' },
    ];
    let idx = 0, start = null, startPct = 0;
    function tick(ts) {
      if (!start) start = ts;
      const s = stages[idx];
      const progress = Math.min(1, (ts - start) / s.dur);
      setPct(Math.round(startPct + (s.target - startPct) * progress));
      if (progress < 1) { requestAnimationFrame(tick); }
      else if (idx < stages.length - 1) { idx++; startPct = s.target; setLabel(stages[idx].label); start = null; requestAnimationFrame(tick); }
    }
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div style={{ padding: '14px 0' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{label}</div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: 'var(--purple)', borderRadius: 2, transition: 'width .3s linear' }} />
      </div>
    </div>
  );
}

// ── Create task modal (expanded) ──────────────────────────────────────────
function CreateTaskModal({ pos, lane, onClose, onRefresh }) {
  const { CURRENT_USER, PEOPLE, fmtDate } = window.HANDOFF;
  const defaultDue = pos.date ? pos.date.substring(0, 10) : '';
  const [label, setLabel] = useState('');
  const [body, setBody] = useState('');
  const [due, setDue] = useState(defaultDue);
  const [assignTo, setAssignTo] = useState('');
  const [saving, setSaving] = useState(false);
  const employees = Object.values(PEOPLE).filter(p => !p.isManager);

  const save = async () => {
    if (!label.trim() || saving) return;
    setSaving(true);
    await API.addNode(lane.dbId, {
      type: 'task',
      content: label.trim(),
      created_by: CURRENT_USER,
      assigned_to: assignTo || null,
      assignment_status: assignTo ? 'pending' : null,
      metadata: { body: body.trim() || undefined, due: due || undefined },
    });
    setSaving(false);
    onRefresh(); onClose();
  };

  const inp = { width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.45)' }} />
      <div className="pop-in" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 400, zIndex: 71, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 20px 6px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>New task</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            <b style={{ color: 'var(--muted-2)', fontWeight: 600 }}>{lane.name}</b>
            {pos.date && <> · {fmtDate(pos.date)}</>}
          </div>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Title */}
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>Title *</div>
            <input autoFocus value={label} onChange={e => setLabel(e.target.value)}
              placeholder="What needs to be done?"
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && save()}
              style={inp} />
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>Description (optional)</div>
            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="Additional context or details…"
              rows={2}
              style={{ ...inp, resize: 'vertical', minHeight: 60 }} />
          </div>

          {/* Due date + Assign — side by side */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>Due date</div>
              <input type="date" value={due} onChange={e => setDue(e.target.value)}
                style={{ ...inp, colorScheme: 'dark' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>Assign to</div>
              <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
                style={{ ...inp, appearance: 'none' }}>
                <option value="">— unassigned —</option>
                {employees.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 9, padding: '10px 20px 18px' }}>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !label.trim()}>
            {saving ? 'Adding…' : 'Add task'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Add Branch modal ──────────────────────────────────────────────────────
function AddBranchModal({ onClose, onRefresh }) {
  const { LANES, CURRENT_USER } = window.HANDOFF;
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [ctx, setCtx] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    await API.createBranch({ name: name.trim(), parent_branch_id: parentId ? Number(parentId) : null, context_doc: ctx.trim(), created_by: CURRENT_USER });
    setSaving(false); onRefresh(); onClose();
  };

  const inp = { width: '100%', padding: '9px 11px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 90, animation: 'fadeIn .15s ease both' }} />
      <div className="pop-in" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, zIndex: 91, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 6px' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 5 }}>Add branch</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Branches represent parallel workstreams on the timeline.</div>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>Branch name *</div>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Post-processing" onKeyDown={e => e.key === 'Enter' && save()} style={inp} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>Parent branch (optional)</div>
            <select value={parentId} onChange={e => setParentId(e.target.value)} style={{ ...inp, appearance: 'none' }}>
              <option value="">— none (root branch) —</option>
              {LANES.map(l => <option key={l.dbId} value={l.dbId}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>What is this branch for?</div>
            <textarea value={ctx} onChange={e => setCtx(e.target.value)} placeholder="Why does this branch exist?" style={{ ...inp, minHeight: 80, resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9, padding: '10px 20px 18px' }}>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create branch'}</button>
        </div>
      </div>
    </>
  );
}

// ── Parsed node preview card (shared with personal-log via window global) ──
// ── Parsed node preview card (shared with personal-log via window global) ──
function ParsedNodeCard({ node, onChange, onRemove }) {
  const { TYPE_META } = window.HANDOFF;
  const typeMap = { idea: 'experiment', link: 'reference' };
  const frontType = typeMap[node.type] || node.type;
  const m = TYPE_META[frontType] || TYPE_META.note;
  const meta = node.metadata || {};
  const title        = meta.title   || node.content;
  const body         = meta.body;
  const note         = meta.note;
  const refKind      = meta.refKind;
  const metric       = meta.metric;
  const hash         = meta.hash;
  const rationale    = meta.rationale;
  const alternatives = meta.alternatives;
  const attendees    = meta.attendees;
  const outcome      = meta.outcome;

  // Local state for editing
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title || '');
  const [editBody, setEditBody] = useState(body || '');
  const [editNote, setEditNote] = useState(note || '');
  const [editRationale, setEditRationale] = useState(rationale || '');
  const [editAlternatives, setEditAlternatives] = useState(alternatives || '');
  const [editAttendees, setEditAttendees] = useState(attendees || '');
  const [editOutcome, setEditOutcome] = useState(outcome || '');

  // Keep track of values if prop changes
  useEffect(() => {
    setEditTitle(title || '');
    setEditBody(body || '');
    setEditNote(note || '');
    setEditRationale(rationale || '');
    setEditAlternatives(alternatives || '');
    setEditAttendees(attendees || '');
    setEditOutcome(outcome || '');
  }, [title, body, note, rationale, alternatives, attendees, outcome]);

  const isSelected = node.selected !== false;

  const toggleSelect = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange({ ...node, selected: !isSelected });
    }
  };

  const handleSave = (e) => {
    e.stopPropagation();
    if (onChange) {
      const updatedMeta = { ...meta };
      if (meta.title !== undefined || node.content) updatedMeta.title = editTitle;
      if (meta.body !== undefined) updatedMeta.body = editBody;
      if (meta.note !== undefined) updatedMeta.note = editNote;
      if (meta.rationale !== undefined) updatedMeta.rationale = editRationale;
      if (meta.alternatives !== undefined) updatedMeta.alternatives = editAlternatives;
      if (meta.attendees !== undefined) updatedMeta.attendees = editAttendees;
      if (meta.outcome !== undefined) updatedMeta.outcome = editOutcome;

      onChange({
        ...node,
        content: editTitle,
        metadata: updatedMeta
      });
    }
    setIsEditing(false);
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    setEditTitle(title || '');
    setEditBody(body || '');
    setEditNote(note || '');
    setEditRationale(rationale || '');
    setEditAlternatives(alternatives || '');
    setEditAttendees(attendees || '');
    setEditOutcome(outcome || '');
    setIsEditing(false);
  };

  return (
    <div style={{
      display: 'flex',
      gap: 10,
      padding: '11px 13px',
      background: isSelected ? 'var(--bg)' : 'rgba(0, 0, 0, 0.15)',
      border: isSelected ? `1px solid ${m.color}33` : '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: 8,
      opacity: isSelected ? 1 : 0.45,
      transition: 'all 0.2s ease',
    }}>
      {/* Checkbox for Keep/Discard Selection */}
      {onChange && (
        <div
          onClick={toggleSelect}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            borderRadius: 4,
            border: `1.5px solid ${isSelected ? m.color : 'rgba(255, 255, 255, 0.25)'}`,
            background: isSelected ? `${m.color}22` : 'transparent',
            color: m.color,
            marginTop: 2,
            flexShrink: 0,
            transition: 'all 0.15s ease'
          }}
        >
          {isSelected && <Icon name="check" size={12} color={m.color} />}
        </div>
      )}

      {/* Glyph icon */}
      <span style={{ color: isSelected ? m.color : 'var(--muted)', display: 'inline-flex', flex: '0 0 auto', marginTop: 2 }}>
        <Icon name={m.glyph} size={15} />
      </span>

      {/* Card Content / Form */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
            <div>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Title/Content</span>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  color: 'var(--text)',
                  fontSize: 13,
                  outline: 'none',
                  marginTop: 2
                }}
              />
            </div>

            {body !== undefined && (
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Body</span>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    color: 'var(--text)',
                    fontSize: 12,
                    lineHeight: 1.4,
                    minHeight: 50,
                    outline: 'none',
                    marginTop: 2,
                    resize: 'vertical'
                  }}
                />
              </div>
            )}

            {note !== undefined && (
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Note</span>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    color: 'var(--text)',
                    fontSize: 12,
                    lineHeight: 1.4,
                    minHeight: 50,
                    outline: 'none',
                    marginTop: 2,
                    resize: 'vertical'
                  }}
                />
              </div>
            )}

            {rationale !== undefined && (
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Why (Rationale)</span>
                <input
                  type="text"
                  value={editRationale}
                  onChange={(e) => setEditRationale(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    color: 'var(--text)',
                    fontSize: 12,
                    outline: 'none',
                    marginTop: 2
                  }}
                />
              </div>
            )}

            {alternatives !== undefined && (
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Alternatives</span>
                <input
                  type="text"
                  value={editAlternatives}
                  onChange={(e) => setEditAlternatives(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    color: 'var(--text)',
                    fontSize: 12,
                    outline: 'none',
                    marginTop: 2
                  }}
                />
              </div>
            )}

            {attendees !== undefined && (
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>With (Attendees)</span>
                <input
                  type="text"
                  value={editAttendees}
                  onChange={(e) => setEditAttendees(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    color: 'var(--text)',
                    fontSize: 12,
                    outline: 'none',
                    marginTop: 2
                  }}
                />
              </div>
            )}

            {outcome !== undefined && (
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Outcome</span>
                <input
                  type="text"
                  value={editOutcome}
                  onChange={(e) => setEditOutcome(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    color: 'var(--text)',
                    fontSize: 12,
                    outline: 'none',
                    marginTop: 2
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11, height: 'auto' }} onClick={handleCancel}>Cancel</button>
              <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 11, height: 'auto' }} onClick={handleSave}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
              <Pill color={m.color} style={{ fontSize: 10.5 }}>{refKind || m.label}</Pill>
              {hash   && <span className="mono" style={{ fontSize: 11, color: 'var(--teal)' }}>{hash}</span>}
              {metric && metric !== 'pending' && <span className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>{metric}</span>}
            </div>
            <div style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text)',
              lineHeight: 1.4,
              marginBottom: body || note ? 5 : 0,
              textDecoration: isSelected ? 'none' : 'line-through'
            }}>
              {title}
            </div>
            {body && (
              <div style={{ fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.55, marginBottom: note || rationale || attendees ? 4 : 0 }}>{body}</div>
            )}
            {rationale && (
              <div style={{ fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.4, marginBottom: 3 }}>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Why: </span>{rationale}
              </div>
            )}
            {alternatives && (
              <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.4, marginBottom: 3 }}>
                <span style={{ fontStyle: 'normal', fontWeight: 600 }}>Alt: </span>{alternatives}
              </div>
            )}
            {attendees && (
              <div style={{ fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.4, marginBottom: 3 }}>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>With: </span>{attendees}
              </div>
            )}
            {outcome && (
              <div style={{ fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.4, marginBottom: 3 }}>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Outcome: </span>{outcome}
              </div>
            )}
            {note && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic' }}>"{note}"</div>
            )}
          </>
        )}
      </div>

      {/* Edit and Remove action buttons */}
      {!isEditing && (
        <div style={{ display: 'flex', gap: 4, flex: '0 0 auto', alignSelf: 'flex-start' }}>
          {onChange && (
            <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
              <Icon name="edit" size={13} color="var(--muted-2)" />
            </button>
          )}
          {onRemove && (
            <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
              <Icon name="close" size={13} color="var(--muted-2)" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
window.ParsedNodeCard = ParsedNodeCard;

// ── Free-form add modal (AI parsing) ─────────────────────────────────────
function FreeformModal({ initialLaneId, originRect, onClose, onRefresh }) {
  const { LANES, CURRENT_USER, CONTACTS, ENTRIES } = window.HANDOFF;
  const [text, setText] = useState('');
  const [laneId, setLaneId] = useState(initialLaneId || LANES[0]?.id || '');
  const [parsed, setParsed] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [mention, setMention] = useState(null);   // { query, start, end } | null
  const [activeIdx, setActiveIdx] = useState(0);
  const textareaRef = useRef(null);
  const [mentionPos, setMentionPos] = useState(null);
  const [isClosing, setIsClosing] = useState(false);

  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    if (mention !== null && textareaRef.current) {
      const r = textareaRef.current.getBoundingClientRect();
      setMentionPos({ left: r.left, top: r.bottom + 6, width: r.width });
    } else {
      setMentionPos(null);
    }
  }, [mention]);

  useEffect(() => {
    if (originRect && modalRef.current) {
      const modalContainer = modalRef.current;
      const fader = contentRef.current;
      const overlay = overlayRef.current;

      const modalRect = modalContainer.getBoundingClientRect();
      const scaleX = originRect.width / modalRect.width;
      const scaleY = originRect.height / modalRect.height;
      const deltaX = (originRect.left + originRect.width / 2) - (window.innerWidth / 2);
      const deltaY = (originRect.top + originRect.height / 2) - (window.innerHeight / 2);

      modalContainer.style.transition = 'none';
      modalContainer.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(${scaleX}, ${scaleY})`;
      modalContainer.style.borderRadius = '12px'; 
      modalContainer.style.opacity = '0.3';
      if (fader) fader.style.opacity = '0';
      if (overlay) overlay.style.opacity = '0';

      void modalContainer.offsetWidth;

      requestAnimationFrame(() => {
        if (overlay) overlay.style.opacity = '1';
        modalContainer.style.transition = 'transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.4s ease, border-radius 0.5s cubic-bezier(0.19, 1, 0.22, 1)';
        modalContainer.style.transform = 'translate(-50%, -50%) scale(1)';
        modalContainer.style.borderRadius = '20px';
        modalContainer.style.opacity = '1';
        if (fader) {
          fader.style.transition = 'opacity 0.25s ease 0.1s';
          fader.style.opacity = '1';
        }
      });
    }
  }, []);

  const close = () => {
    if (modalRef.current && originRect) {
      const modalContainer = modalRef.current;
      const fader = contentRef.current;
      const overlay = overlayRef.current;

      const modalRect = modalContainer.getBoundingClientRect();
      const scaleX = originRect.width / modalRect.width;
      const scaleY = originRect.height / modalRect.height;
      const deltaX = (originRect.left + originRect.width / 2) - (window.innerWidth / 2);
      const deltaY = (originRect.top + originRect.height / 2) - (window.innerHeight / 2);

      if (fader) {
        fader.style.transition = 'opacity 0.15s ease';
        fader.style.opacity = '0';
      }
      if (overlay) {
        overlay.style.transition = 'opacity 0.45s ease';
        overlay.style.opacity = '0';
      }

      modalContainer.style.transition = 'transform 0.45s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.4s ease, border-radius 0.45s cubic-bezier(0.19, 1, 0.22, 1)';
      modalContainer.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(${scaleX}, ${scaleY})`;
      modalContainer.style.borderRadius = '12px';
      modalContainer.style.opacity = '0';
    }

    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 450);
  };

  const selectedLane = LANES.find(l => l.id === laneId);
  const expanded = parsing || parsed.length > 0;

  // @ mention candidates
  const allCommits = (ENTRIES || [])
    .filter(e => e.type === 'commit' && e.hash)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 30);
  const filteredContacts = mention
    ? (CONTACTS || []).filter(c =>
        !mention.query ||
        c.name.toLowerCase().includes(mention.query.toLowerCase()) ||
        (c.company || '').toLowerCase().includes(mention.query.toLowerCase())
      ).slice(0, 3)
    : [];
  const filteredCommits = mention
    ? allCommits.filter(c =>
        !mention.query ||
        c.hash.toLowerCase().startsWith(mention.query.toLowerCase()) ||
        c.title.toLowerCase().includes(mention.query.toLowerCase())
      ).slice(0, 4)
    : [];
  const mentionItems = [
    ...filteredContacts.map(c => ({ ...c, _kind: 'contact' })),
    ...filteredCommits.map(c => ({ ...c, _kind: 'commit' })),
  ];

  const handleTextChange = (e) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    const match = val.slice(0, pos).match(/@(\w*)$/);
    if (match) {
      setMention({ query: match[1], start: pos - match[0].length, end: pos });
      setActiveIdx(0);
    } else {
      setMention(null);
    }
    setText(val);
    setError(null);
  };

  const selectMention = (item) => {
    const ins = item._kind === 'contact' ? '@' + item.name + ' ' : '@' + item.hash.slice(0, 7) + ' ';
    const newVal = text.slice(0, mention.start) + ins + text.slice(mention.end);
    setMention(null);
    setText(newVal);
    setTimeout(() => {
      if (textareaRef.current) {
        const p = mention.start + ins.length;
        textareaRef.current.setSelectionRange(p, p);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (mention && mentionItems.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, mentionItems.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 0, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(mentionItems[activeIdx]); return; }
      if (e.key === 'Escape')    { setMention(null); return; }
    }
  };

  const parse = async () => {
    if (!text.trim() || !selectedLane || parsing) return;
    setParsing(true); setError(null); setParsed([]);
    try {
      const result = await API.parseLog(selectedLane.dbId, text);
      setParsed(Array.isArray(result) ? result.map(n => ({ ...n, selected: true })) : []);
    } catch {
      setError('Parse failed — check backend connection.');
    }
    setParsing(false);
  };

  const confirm = async () => {
    const activeNodes = parsed.filter(n => n.selected !== false);
    if (!selectedLane || saving || !activeNodes.length) return;
    setSaving(true);
    for (const node of activeNodes) {
      await API.addNode(selectedLane.dbId, {
        type: node.type,
        content: node.content || (node.metadata || {}).title || 'Untitled',
        created_by: CURRENT_USER,
        metadata: node.metadata || {},
        is_ai_generated: true,
      });
    }
    setSaving(false);
    onRefresh();
    close();
  };

  const inp = { padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const textareaStyle = { flex: 1, resize: 'none', lineHeight: 1.75, minHeight: 140, width: '100%', padding: '4px 2px', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <>
      <div ref={overlayRef} className="liquid-glass-overlay">
        <div onClick={close} style={{ position: 'absolute', inset: 0 }} />
        <div ref={modalRef} className="liquid-glass-modal" style={{ width: expanded ? 860 : 560, maxWidth: 'calc(100vw - 40px)', height: '78vh', transition: 'width .32s cubic-bezier(.2,.8,.2,1)', padding: '0px' }}>
          <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, opacity: 0, padding: '20px 24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: '12px', borderBottom: '1px solid var(--border-soft)', flex: '0 0 auto' }}>
              <Icon name="sparkle" size={16} color="var(--purple)" />
              <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Free log</span>
              {parsed.length > 0 && !parsing && (
                <Pill color="var(--purple)">{parsed.filter(n => n.selected !== false).length} of {parsed.length} selected</Pill>
              )}
              <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={close}>
                <Icon name="close" size={15} color="var(--muted-2)" />
              </button>
            </div>

            {/* Body — split layout */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', marginTop: '16px' }}>

              {/* Left: compose */}
              <div style={{
                flex: expanded ? '0 0 400px' : '1',
                display: 'flex', flexDirection: 'column',
                borderRight: expanded ? '1px solid var(--border-soft)' : 'none',
                minWidth: 0, overflow: 'hidden',
                paddingRight: expanded ? '16px' : '0px'
              }}>
                {/* Branch picker */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flex: '0 0 auto' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', flex: '0 0 auto' }}>Branch</span>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <select value={laneId} onChange={e => setLaneId(e.target.value)}
                      style={{ ...inp, appearance: 'none', paddingRight: 28, width: '100%' }}
                      disabled={parsing}>
                      {LANES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      <Icon name="chevDown" size={12} color="var(--muted)" />
                    </span>
                  </div>
                  {selectedLane?.ai_context && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--purple)', flex: '0 0 auto' }}>
                      <Icon name="sparkle" size={11} color="var(--purple)" /> context
                    </div>
                  )}
                </div>

                {/* Textarea */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    onClick={e => {
                      const before = text.slice(0, e.target.selectionStart);
                      const m = before.match(/@(\w*)$/);
                      setMention(m ? { query: m[1], start: e.target.selectionStart - m[0].length, end: e.target.selectionStart } : null);
                    }}
                    autoFocus
                    disabled={parsing}
                    placeholder={'Paste anything — commits, results, decisions, meeting notes.\n\nType @ to mention a contact or commit.'}
                    style={textareaStyle}
                  />

                  {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
                </div>
              </div>

              {/* Right: AI output */}
              {expanded && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', paddingLeft: '16px' }}>
                  {parsing ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 }}>
                      <div style={{ width: 28, height: 28, border: '2.5px solid var(--border)', borderTopColor: 'var(--purple)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>Parsing with Gemini…</span>
                    </div>
                  ) : (
                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 12 }}>
                        {parsed.length === 0 ? 'All nodes removed' : `${parsed.filter(n => n.selected !== false).length} selected of ${parsed.length}`}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {parsed.map((node, i) => (
                          <ParsedNodeCard key={i} node={node}
                            onChange={(updatedNode) => setParsed(prev => prev.map((item, idx) => idx === i ? updatedNode : item))}
                            onRemove={() => setParsed(n => n.filter((_, j) => j !== i))} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 9, paddingTop: '12px', borderTop: '1px solid var(--border-soft)', flex: '0 0 auto', alignItems: 'center', marginTop: '16px' }}>
              {parsed.length > 0 && !parsing && (
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Re-parse will replace results</span>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={close}>Cancel</button>
              <button className="btn" onClick={parse} disabled={!text.trim() || parsing} style={{ opacity: parsing ? 0.7 : 1 }}>
                <Icon name="sparkle" size={14} color="var(--purple)" />
                {parsing ? ' Parsing…' : parsed.length > 0 ? ' Re-parse' : ' Parse →'}
              </button>
              {parsed.length > 0 && !parsing && (
                <button className="btn btn-primary" onClick={confirm} disabled={saving || parsed.filter(n => n.selected !== false).length === 0}>
                  {saving ? 'Adding…' : `Add ${parsed.filter(n => n.selected !== false).length} entr${parsed.filter(n => n.selected !== false).length !== 1 ? 'ies' : 'y'} →`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* @ mention dropdown — position:fixed so overflow:hidden on modal can't clip it */}
      {mention && mentionItems.length > 0 && mentionPos && (
        <div style={{ position: 'fixed', left: mentionPos.left, top: mentionPos.top, width: mentionPos.width, zIndex: 200, background: '#202027', border: '1px solid #3a3a45', borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.7)', overflow: 'hidden' }}>
          {mentionItems.map((item, i) => {
            const isContact = item._kind === 'contact';
            const isFirstCommit = !isContact && i === filteredContacts.length && filteredContacts.length > 0;
            const lane = !isContact ? (LANES || []).find(l => l.id === item.lane) : null;
            return (
              <React.Fragment key={isContact ? 'c' + item.id : item.id}>
                {isFirstCommit && <div style={{ height: 1, background: '#2c2c35', margin: '2px 0' }} />}
                <button
                  onMouseDown={e => { e.preventDefault(); selectMention(item); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', border: 'none', cursor: 'pointer', textAlign: 'left', background: i === activeIdx ? '#2e2e3a' : 'none', color: 'var(--text)' }}>
                  {isContact ? (
                    <>
                      <Icon name="person" size={13} color="var(--purple)" />
                      <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#d2d2da' }}>{item.name}</span>
                      {item.company && <span style={{ fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}>{item.company}</span>}
                    </>
                  ) : (
                    <>
                      <Icon name="commit" size={13} color="var(--teal)" />
                      <span className="mono" style={{ fontSize: 12, color: 'var(--teal)', flex: '0 0 auto' }}>{item.hash.slice(0, 7)}</span>
                      <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#d2d2da' }}>{item.title}</span>
                      {lane && <span style={{ fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}>{lane.name}</span>}
                    </>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </>
  );
}
window.FreeformModal = FreeformModal;

// ── Timeline toolbar (range, filter, actions) ─────────────────────────────
function TimelineToolbar({ onGenerateHandover, onAddBranch, onFreeLog, onLinkDecisions, linking, viewMode, onToggleDecisionFlow, range, setRange, filters, setFilters }) {
  const { TYPE_META, PROJECT, relTime } = window.HANDOFF;
  const nodesNew = PROJECT?.nodes_since_last_link || 0;
  const everLinked = !!PROJECT?.last_linked_at;
  const isUpToDate = nodesNew === 0 && everLinked;
  const [showFilter, setShowFilter] = useState(false);
  const toggle = (t) => setFilters(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', height: 48, borderBottom: '1px solid var(--border)', flex: '0 0 auto', overflowX: 'auto', overflowY: 'hidden' }}>
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {Object.entries(TYPE_META).map(([k, m]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: filters.has(k) ? .35 : 1, cursor: 'pointer' }} onClick={() => toggle(k)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: k === 'reference' ? 'var(--bg)' : m.color, border: k === 'reference' ? `1.5px solid ${m.color}` : 'none', boxSizing: 'border-box' }} />
            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{m.label}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Range selector */}
      <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
        {['7D', '30D', '90D', 'All'].map(r => (
          <button key={r} onClick={() => setRange(r)} style={{ border: 'none', background: range === r ? 'var(--surface-2)' : 'transparent', color: range === r ? 'var(--text)' : 'var(--muted)', padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>{r}</button>
        ))}
      </div>

      {/* Filter */}
      <div style={{ position: 'relative' }}>
        <button className="btn btn-icon" onClick={() => setShowFilter(s => !s)} style={{ borderColor: filters.size ? 'var(--purple)' : 'var(--border)' }}>
          <Icon name="filter" size={16} color={filters.size ? 'var(--purple)' : 'var(--muted-2)'} />
        </button>
        {showFilter && (
          <>
            <div onClick={() => setShowFilter(false)} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
            <div className="pop-in" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 180, zIndex: 71, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 8, boxShadow: '0 14px 40px rgba(0,0,0,.5)' }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', padding: '4px 8px 8px' }}>Show entry types</div>
              {Object.entries(TYPE_META).map(([k, m]) => (
                <button key={k} onClick={() => toggle(k)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 8px', background: 'none', border: 'none', borderRadius: 7, color: 'var(--text)', fontSize: 12.5, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#ffffff0d'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: m.color }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{m.label}</span>
                  {!filters.has(k) && <Icon name="check" size={14} color="var(--muted-2)" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button className="btn" onClick={onFreeLog}><Icon name="sparkle" size={15} color="var(--purple)" /> Free log</button>
      <button className="btn" onClick={onLinkDecisions} disabled={linking || isUpToDate}
        title={isUpToDate && PROJECT?.last_linked_at ? `Last linked ${relTime(PROJECT.last_linked_at)}` : undefined}
        style={{ opacity: (linking || isUpToDate) ? 0.55 : 1, position: 'relative' }}>
        <Icon name={isUpToDate ? 'check' : 'sparkle'} size={15}
          color={linking ? 'var(--amber)' : isUpToDate ? 'var(--green)' : 'var(--purple)'}
          style={{ animation: linking ? 'pulse 1s ease infinite' : 'none' }} />
        {linking ? ' Linking…' : isUpToDate ? ' Links synced' : ' Link decisions'}
        {!linking && !isUpToDate && nodesNew > 0 && (
          <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 99, background: 'var(--purple)', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 1.6 }}>
            {nodesNew}
          </span>
        )}
      </button>
      <button className="btn" onClick={onToggleDecisionFlow}
        style={{ borderColor: viewMode === 'decision-flow' ? 'var(--purple)' : 'var(--border)', background: viewMode === 'decision-flow' ? '#7F77DD18' : 'transparent', color: viewMode === 'decision-flow' ? 'var(--purple)' : 'var(--muted-2)' }}>
        <Icon name="decision" size={15} color={viewMode === 'decision-flow' ? 'var(--purple)' : 'var(--muted-2)'} />
        Decision flow
      </button>
      <button className="btn" onClick={onAddBranch}><Icon name="plus" size={15} /> Add branch</button>
      {onGenerateHandover && (
        <button className="btn btn-primary" onClick={onGenerateHandover}><Icon name="sparkle" size={15} /> Generate Handover</button>
      )}
    </div>
  );
}

// ── Scrubber ──────────────────────────────────────────────────────────────
function Scrubber({ totalStart, totalEnd, viewStart, viewEnd, onChange, labelW = 176 }) {
  const { fmtDate } = window.HANDOFF;
  const trackRef = useRef(null);

  // Calculate percentages
  const totalDuration = totalEnd.getTime() - totalStart.getTime();
  const leftPct = (viewStart.getTime() - totalStart.getTime()) / totalDuration;
  const rightPct = (viewEnd.getTime() - totalStart.getTime()) / totalDuration;

  const leftStr = `${Math.max(0, Math.min(100, leftPct * 100))}%`;
  const rightStr = `${Math.max(0, Math.min(100, (1 - rightPct) * 100))}%`;

  // Draw ticks based on the total range
  const ticks = [];
  for (let i = 0; i <= 6; i++) {
    ticks.push(new Date(totalStart.getTime() + (i / 6) * totalDuration));
  }

  // Handle dragging
  const handleMouseDown = (type, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startLeftPct = leftPct;
    const startRightPct = rightPct;
    const trackWidth = trackRef.current.getBoundingClientRect().width;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaPct = deltaX / trackWidth;

      let newLeftPct = startLeftPct;
      let newRightPct = startRightPct;

      const minDiffPct = 0.02; // Prevent collapsing to less than 2% of total width

      if (type === 'left') {
        newLeftPct = Math.max(0, Math.min(startRightPct - minDiffPct, startLeftPct + deltaPct));
      } else if (type === 'right') {
        newRightPct = Math.max(startLeftPct + minDiffPct, Math.min(1, startRightPct + deltaPct));
      } else if (type === 'pan') {
        const widthPct = startRightPct - startLeftPct;
        newLeftPct = Math.max(0, Math.min(1 - widthPct, startLeftPct + deltaPct));
        newRightPct = newLeftPct + widthPct;
      }

      const newViewStart = new Date(totalStart.getTime() + newLeftPct * totalDuration);
      const newViewEnd = new Date(totalStart.getTime() + newRightPct * totalDuration);
      onChange(newViewStart, newViewEnd);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div style={{ flex: '0 0 auto', borderTop: '1px solid var(--border)', padding: '10px 22px 12px', userSelect: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, paddingLeft: labelW }}>
        {ticks.map((t, i) => (
          <span key={i} style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {fmtDate(t)}
          </span>
        ))}
      </div>
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: 30,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 7,
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: '0 2px', gap: 1, pointerEvents: 'none' }}>
          {Array.from({ length: 60 }).map((_, i) => {
            const h = [4,6,5,8,7,10,6,5,9,12,8,7,5,4,6,9,11,7,6,5,8,10,7,6,4,5,7,9,6,5,8,11,9,7,6,5,4,6,8,10,12,9,7,6,5,7,9,11,8,6,5,4,6,8,10,13,11,9,7,5][i] || 4;
            return <div key={i} style={{ flex: 1, height: h, background: '#34343f', borderRadius: 1 }} />;
          })}
        </div>
        <div
          onMouseDown={(e) => handleMouseDown('pan', e)}
          style={{
            position: 'absolute',
            left: leftStr,
            right: rightStr,
            top: 0,
            bottom: 0,
            border: '1.5px solid var(--purple)',
            borderRadius: 6,
            background: '#7F77DD12',
            cursor: 'grab'
          }}
        >
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              handleMouseDown('left', e);
            }}
            style={{
              position: 'absolute',
              left: -2,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 5,
              height: 18,
              background: 'var(--purple)',
              borderRadius: 3,
              cursor: 'ew-resize',
              zIndex: 10,
              boxShadow: '0 0 4px rgba(0,0,0,0.5)'
            }}
          />
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              handleMouseDown('right', e);
            }}
            style={{
              position: 'absolute',
              right: -2,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 5,
              height: 18,
              background: 'var(--purple)',
              borderRadius: 3,
              cursor: 'ew-resize',
              zIndex: 10,
              boxShadow: '0 0 4px rgba(0,0,0,0.5)'
            }}
          />
        </div>
      </div>
    </div>
  );
}


// ── Single lane row ───────────────────────────────────────────────────────
function Lane({ lane, style, filters, hiddenUsers, onSelect, onTaskSelect, onQuickAdd, onContextOpen, decisionFocus, viewMode, onNodeHover }) {
  const { ENTRIES, TASKS, TYPE_META, TASK_META, PEOPLE, laneActivity, frac } = window.HANDOFF;
  const [hover, setHover] = useState(null);
  const trackRef = useRef(null);
  const TRACK_PAD = 70;
  const act = laneActivity(lane.id);
  const laneEntries = ENTRIES.filter(e => e.lane === lane.id);
  const entries = laneEntries.filter(e => !filters.has(e.type) && !hiddenUsers.has(e.author));
  const tasks = TASKS.filter(t => t.lane === lane.id && !hiddenUsers.has(t.by));
  const trunkEntries = entries.filter(e => e.type !== 'reference');
  const refEntries = entries.filter(e => e.type === 'reference');
  const headId = laneEntries.length ? laneEntries.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b).id : null;
  const lineStyle = { active: { opacity: 1, dash: 'none', color: '#454552' }, stalled: { opacity: .6, dash: 'none', color: '#3f3f4a' }, dead: { opacity: .42, dash: '5 6', color: '#54545f' } }[act.health];
  const purple = TYPE_META.reference.color;
  const refCY = style.refCY, refDot = style.refDot;
  const branchTop = refCY + refDot / 2;
  const branchH = style.lineY - branchTop;
  const BOW = style.dense ? 36 : 46;

  const { map: fracAdj, startF, endF } = spreadFracs([
    ...entries.map(e => ({ id: e.id, f: frac(e.date) })),
    ...tasks.map(t => ({ id: t.id, f: frac(t.date) })),
  ]);

  // Decision focus / decision-flow mode: compute which nodes are linked
  const { LINKS } = window.HANDOFF;
  const decisionFlowMode = viewMode === 'decision-flow';
  const isActiveFocus = !!decisionFocus || decisionFlowMode;

  // In global decision-flow mode, build the set of frontend IDs in any link
  const flowLinkedIds = decisionFlowMode ? (() => {
    const rawIds = new Set([...(LINKS||[]).map(l => l.from_id), ...(LINKS||[]).map(l => l.to_id)]);
    const ids = new Set();
    [...entries, ...tasks].forEach(e => { if (rawIds.has(e.nodeId)) ids.add(e.id); });
    return ids;
  })() : null;

  const laneNodeIds = [...entries.map(e => e.id), ...tasks.map(t => t.id)];
  const laneHasLinks = !isActiveFocus
    || (decisionFocus
        ? laneNodeIds.some(id => decisionFocus.linkedNodeIds.has(id))
        : laneNodeIds.some(id => flowLinkedIds.has(id)));

  const isLinked = (id) => !isActiveFocus
    || (decisionFocus ? decisionFocus.linkedNodeIds.has(id) : flowLinkedIds.has(id));

  const isDecisionNode = (id) => decisionFocus
    ? decisionFocus.decisionId === id
    : (decisionFlowMode && (() => { const n = [...entries,...tasks].find(e=>e.id===id); return n?.type==='decision'; })());
  // af() returns a raw [0,1] frac; CSS calc maps it to [TRACK_PAD px, 100% - TRACK_PAD px]
  const af = (id, date) => fracAdj[id] ?? frac(date);
  const fracToLeft = f => `calc(${TRACK_PAD}px + ${f} * (100% - ${2 * TRACK_PAD}px))`;

  const handleTrackClick = (ev) => {
    if (ev.target.closest('[data-node]')) return;
    const r = trackRef.current.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (ev.clientX - r.left - TRACK_PAD) / (r.width - 2 * TRACK_PAD)));
    const t = new Date(window.HANDOFF.WIN_START.getTime() + f * (window.HANDOFF.WIN_END - window.HANDOFF.WIN_START));
    onQuickAdd({ px: ev.nativeEvent.offsetX + style.labelW, py: ev.currentTarget.offsetTop + style.lineY, date: t.toISOString() });
  };

  return (
    <div style={{ display: 'flex', height: style.laneH, position: 'relative', background: style.band ? (style.idx % 2 ? '#ffffff04' : 'transparent') : 'transparent', borderBottom: style.band ? '1px solid var(--border-soft)' : 'none', opacity: laneHasLinks ? 1 : 0.15, transition: 'opacity .2s' }}>
      {/* label — click to open context panel */}
      <div onClick={() => onContextOpen(lane)} style={{ width: style.labelW, flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 16, position: 'sticky', left: 0, zIndex: 20, background: 'var(--bg)', boxShadow: '8px 0 20px 8px var(--bg)', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: style.dense ? 12.5 : 14, fontWeight: 500, color: act.health === 'dead' ? 'var(--muted)' : '#d6d6dd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lane.name}</div>
          {lane.context_updating && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--purple)', animation: 'pulse 1.2s ease infinite', flex: '0 0 auto' }} />}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: act.health === 'active' ? 'var(--green)' : act.health === 'stalled' ? 'var(--amber)' : 'var(--muted)' }} />
          {act.entries === 0 ? 'no activity' : act.health === 'active' ? 'active' : act.health === 'stalled' ? `${act.lastDays}d quiet` : `dead · ${act.lastDays}d`}
        </div>
      </div>

      {/* track */}
      <div ref={trackRef} onClick={handleTrackClick} style={{ position: 'relative', flex: 1, cursor: 'crosshair' }}>
        {endF > startF && (
          <div style={{ position: 'absolute', left: fracToLeft(startF), width: `calc(${endF - startF} * (100% - ${2 * TRACK_PAD}px))`, top: style.lineY, height: style.lineW, opacity: lineStyle.opacity }}>
            {lineStyle.dash === 'none'
              ? <div style={{ width: '100%', height: '100%', background: `linear-gradient(90deg, ${lineStyle.color}88, ${lineStyle.color})`, borderRadius: 2 }} />
              : <svg width="100%" height={style.lineW + 2} preserveAspectRatio="none" style={{ display: 'block' }}><line x1="0" y1={style.lineW / 2} x2="100%" y2={style.lineW / 2} stroke={lineStyle.color} strokeWidth={style.lineW} strokeDasharray={lineStyle.dash} /></svg>}
          </div>
        )}

        {refEntries.map(e => {
          const isHover = hover === e.id; const f = af(e.id, e.date);
          return (
            <React.Fragment key={e.id}>
              <svg width={BOW} height={branchH} preserveAspectRatio="none" style={{ position: 'absolute', left: fracToLeft(f), top: branchTop, transform: 'translateX(-50%)', overflow: 'visible', pointerEvents: 'none', zIndex: 4 }}>
                <path d={`M ${BOW/2} 0 C ${BOW/2} ${branchH*.5} ${BOW/2-(BOW/2-2)} ${branchH} ${BOW/2} ${branchH}`} fill="none" stroke={purple} strokeWidth="1.4" strokeOpacity={isHover?0.9:0.5} />
                <circle cx={BOW/2} cy={branchH} r="2.4" fill={purple} fillOpacity={isHover?1:0.6} />
              </svg>
              <div data-node onMouseEnter={() => { setHover(e.id); onNodeHover && onNodeHover(e.id); }} onMouseLeave={() => { setHover(h => h===e.id?null:h); onNodeHover && onNodeHover(null); }} onClick={ev => { ev.stopPropagation(); onSelect(e); }}
                style={{ position: 'absolute', left: fracToLeft(f), top: refCY, transform: 'translate(-50%,-50%)', zIndex: isHover?60:11 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: isHover?refDot+5:refDot, height: isHover?refDot+5:refDot, borderRadius: '50%', background: 'var(--bg)', border: `1.5px solid ${purple}`, cursor: 'pointer', boxShadow: isHover?`0 0 0 4px ${purple}2e`:'none', transition: 'width .12s, height .12s, box-shadow .12s' }}>
                  <span style={{ width: refDot*.34, height: refDot*.34, borderRadius: '50%', background: purple }} />
                </span>
                {isHover && <EntryPopover e={e} down flip={f > 0.5} />}
              </div>
            </React.Fragment>
          );
        })}

        {trunkEntries.map(e => {
          const m = TYPE_META[e.type]; const isHover = hover===e.id; const isHead = e.id===headId;
          const nodeF = af(e.id, e.date);
          const assignee = e.assigned_to ? PEOPLE[e.assigned_to] : null;
          const dotSize = isHover ? style.dot+5 : (isHead ? style.dot+2 : style.dot);
          return (
            <div key={e.id} data-node
              onMouseEnter={() => { setHover(e.id); onNodeHover && onNodeHover(e.id); }} onMouseLeave={() => { setHover(h=>h===e.id?null:h); onNodeHover && onNodeHover(null); }}
              onClick={ev=>{ev.stopPropagation();onSelect(e);}}
              style={{ position: 'absolute', left: fracToLeft(nodeF), top: style.lineY, transform: 'translateX(-50%)', zIndex: isHover?60:(isHead?12:10), cursor: 'pointer', opacity: laneHasLinks && !isLinked(e.id) ? 0.08 : 1, transition: 'opacity .2s' }}>

              {/* Dot — straddles the track line; milestone uses a diamond shape */}
              <span style={{ position: 'absolute', left: '50%', top: 0, transform: e.type === 'milestone' ? 'translate(-50%,-50%) rotate(45deg)' : 'translate(-50%,-50%)', display: 'block', width: dotSize, height: dotSize, borderRadius: e.type === 'milestone' ? '3px' : '50%', background: m.color, boxShadow: isHover?`0 0 0 4px ${m.color}33`:isHead?`0 0 0 2.5px var(--bg), 0 0 0 5px ${m.color}${act.health==='active'?'44':'22'}`:`0 0 0 2.5px var(--bg)`, transition: 'width .12s, height .12s, box-shadow .12s' }} />

              {/* Head pulse ring — skip for milestone (diamond shape breaks circle animation) */}
              {isHead && act.health==='active' && e.type !== 'milestone' && (
                <span style={{ position: 'absolute', left: '50%', top: 0, transform: 'translate(-50%,-50%)', width: style.dot+2, height: style.dot+2, borderRadius: '50%', border: `1.5px solid ${m.color}`, animation: 'headPulse 1.8s ease-out infinite', pointerEvents: 'none' }} />
              )}

              {/* Decision focus rings */}
              {isDecisionNode(e.id) && (
                <span style={{ position: 'absolute', left: '50%', top: 0, transform: 'translate(-50%,-50%)', width: style.dot+14, height: style.dot+14, borderRadius: e.type==='milestone'?'4px':'50%', background: m.color+'18', border: `2px solid ${m.color}`, pointerEvents: 'none', zIndex: 65 }} />
              )}
              {laneHasLinks && isLinked(e.id) && !isDecisionNode(e.id) && (
                <span style={{ position: 'absolute', left: '50%', top: 0, transform: 'translate(-50%,-50%)', width: style.dot+8, height: style.dot+8, borderRadius: e.type==='milestone'?'3px':'50%', border: `1.5px solid ${m.color}99`, pointerEvents: 'none', zIndex: 65 }} />
              )}

              {/* Hover popover — appears above the dot */}
              {isHover && <EntryPopover e={e} flip={nodeF > 0.5} />}

              {/* Connector */}
              <div style={{ width: 1, height: style.connH, background: '#3a3a45', margin: '0 auto' }} />

              {/* Card chip — opaque so overlapping cards fully cover each other */}
              <div style={{
                width: style.taskW, padding: style.dense ? '4px 7px' : '5px 8px',
                borderRadius: 7,
                background: isHover ? 'var(--surface-2)' : '#1e1e28',
                border: `1.5px solid ${isHover ? m.color+'cc' : m.color+'55'}`,
                boxShadow: isHover ? `0 4px 16px rgba(0,0,0,.5), 0 0 0 1px ${m.color}44` : 'none',
                transition: 'background .12s, border-color .12s, box-shadow .12s',
              }}>
                <span style={{ display: 'block', fontSize: style.dense?10:11, fontWeight: 500, lineHeight: 1.3, color: isHover ? '#e8e8f0' : '#b8b8c8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.title}
                </span>
                {assignee && !style.dense && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                    <div style={{ width: 11, height: 11, borderRadius: '50%', background: assignee.color+'44', border: `1px solid ${assignee.color}88`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6.5, fontWeight: 700, color: assignee.color }}>
                      {assignee.initials?.[0] || '?'}
                    </div>
                    <span style={{ fontSize: 8.5, color: 'var(--muted)' }}>{assignee.name.split(' ')[0]}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Tasks rendered last so they sit above entry cards in DOM stacking order */}
        {tasks.map(t => {
          const tm = TASK_META[t.state];
          const assignee = t.assigned_to ? PEOPLE[t.assigned_to] : null;
          const isTaskHover = hover === t.id;
          return (
            <div key={t.id} data-node
              onMouseEnter={() => { setHover(t.id); onNodeHover && onNodeHover(t.id); }} onMouseLeave={() => { setHover(h => h===t.id ? null : h); onNodeHover && onNodeHover(null); }}
              onClick={ev => { ev.stopPropagation(); onTaskSelect(t); }}
              style={{ position: 'absolute', left: fracToLeft(af(t.id, t.date)), top: style.lineY+style.lineW, transform: 'translateX(-50%)', cursor: 'pointer', zIndex: isTaskHover ? 60 : 10 }}>
              <div style={{ width: 1, height: style.connH, background: '#3a3a45', margin: '0 auto' }} />
              <div title={`${tm.label}${t.due ? ' · due ' + t.due : ''}${assignee ? ' · ' + assignee.name : ''}`}
                style={{ width: style.taskW, minHeight: style.taskH, padding: '5px 8px', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 3, fontSize: style.dense?10:11, lineHeight: 1.25, fontWeight: 500,
                  background: t.state==='active' ? tm.color : '#1e1e28',
                  color: t.state==='active'?'#fff':t.state==='completed'?'var(--muted-2)':'#f0c8c7',
                  border: `1.5px solid ${isTaskHover ? tm.color+'cc' : tm.color+'66'}`,
                  textDecoration: t.state==='completed'?'line-through':'none',
                  boxShadow: isTaskHover ? `0 4px 16px rgba(0,0,0,.5), 0 0 0 1px ${tm.color}44` : 'none',
                  transition: 'border-color .12s, box-shadow .12s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {t.state==='overdue' && <Icon name="warn" size={11} color={tm.color} />}
                  {t.state==='completed' && <Icon name="check" size={11} color={tm.color} />}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                </div>
                {assignee && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: .85 }}>
                    <div style={{ width: 13, height: 13, borderRadius: '50%', background: assignee.color+'44', border: `1px solid ${assignee.color}88`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: assignee.color, flex: '0 0 auto' }}>
                      {assignee.initials?.[0] || '?'}
                    </div>
                    <span style={{ fontSize: 9.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {assignee.name.split(' ')[0]}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Branch fork SVG overlay ───────────────────────────────────────────────
function BranchForkOverlay({ containerW, style }) {
  const { LANES, frac } = window.HANDOFF;
  const LABEL_W = style.labelW;
  const TRACK_PAD = 70;

  const laneIndexMap = {};
  LANES.forEach((l, i) => { laneIndexMap[l.id] = i; });

  const forks = LANES.flatMap(child => {
    if (!child.parent_id) return [];
    const pi = laneIndexMap[child.parent_id];
    const ci = laneIndexMap[child.id];
    if (pi === undefined || ci === undefined) return [];
    const x = LABEL_W + TRACK_PAD + frac(child.created_at) * (containerW - LABEL_W - 2 * TRACK_PAD);
    const py = pi * style.laneH + style.lineY;
    const cy = ci * style.laneH + style.lineY;
    return [{ x, py, cy, id: child.id }];
  });

  if (!forks.length) return null;

  const totalH = LANES.length * style.laneH;
  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: containerW, height: totalH, pointerEvents: 'none', zIndex: 4 }} overflow="visible">
      {forks.map(({ x, py, cy, id }) => {
        const dy = cy - py;
        const absDy = Math.abs(dy);
        // bow: how far right C1 sits — gives a strong rightward departure
        const bow = Math.max(absDy * 0.55, 50);
        // drift: how far right the endpoint sits — child track picks up here
        const drift = Math.max(absDy * 0.30, 40);
        // C2 is to the LEFT of the endpoint so the arrival tangent points rightward
        // tangent at end = endpoint - C2 = (drift - drift*0.35, 0) = rightward ✓
        const d = `M ${x} ${py} C ${x + bow} ${py} ${x + drift * 0.35} ${cy} ${x + drift} ${cy}`;
        return (
          <g key={id}>
            <path d={d} fill="none" stroke="var(--purple)" strokeWidth={style.lineW + 3} strokeOpacity={0.07} />
            <path d={d} fill="none" stroke="var(--purple)" strokeWidth={style.lineW + 0.5} strokeOpacity={0.38} />
          </g>
        );
      })}
    </svg>
  );
}

// ── Decision thread SVG overlay ────────────────────────────────────────────
function DecisionThreadOverlay({ decisionFocus, viewMode, fracAdjAll, containerW, style, hoveredNodeId, onLinkClick }) {
  const { LANES, ENTRIES, TASKS, LINKS, TYPE_META } = window.HANDOFF;
  const showAll = viewMode === 'decision-flow' && !decisionFocus;
  const links = showAll ? (LINKS || []) : (decisionFocus?.links || []);
  if (!links.length) return null;
  const LABEL_W = style.labelW;
  const TRACK_PAD = 70;
  const color = TYPE_META.decision.color;

  const hoveredRawId = hoveredNodeId
    ? (() => { const n = [...ENTRIES, ...TASKS].find(x => x.id === hoveredNodeId); return n?.nodeId ?? null; })()
    : null;

  // Map frontend node id → lane index
  const laneIdxMap = {};
  LANES.forEach((l, i) => {
    [...ENTRIES, ...TASKS].filter(e => e.lane === l.id).forEach(e => { laneIdxMap[e.id] = i; });
  });

  const nodePos = (rawId) => {
    // Try entry prefix first, then task prefix
    const fid = (() => {
      const e = ENTRIES.find(x => x.nodeId === rawId); if (e) return e.id;
      const t = TASKS.find(x => x.nodeId === rawId);   if (t) return t.id;
      return null;
    })();
    if (!fid) return null;
    const f = fracAdjAll[fid];
    const li = laneIdxMap[fid];
    if (f === undefined || li === undefined) return null;
    return {
      x: LABEL_W + TRACK_PAD + f * (containerW - LABEL_W - 2 * TRACK_PAD),
      y: li * style.laneH + style.lineY,
    };
  };

  const totalH = LANES.length * style.laneH;

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: containerW, height: totalH, pointerEvents: 'none', zIndex: 6 }} overflow="visible">
      <defs>
        <marker id="df-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill={color} fillOpacity="0.7" />
        </marker>
        <marker id="df-arrow-hot" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill={color} fillOpacity="1" />
        </marker>
      </defs>
      {links.map((link, i) => {
        const from = nodePos(link.from_id);
        const to   = nodePos(link.to_id);
        if (!from || !to) return null;
        const dx = (to.x - from.x) * 0.45;
        const d = `M ${from.x} ${from.y} C ${from.x + dx} ${from.y} ${to.x - dx} ${to.y} ${to.x} ${to.y}`;
        const isPending = link.status === 'pending';
        const isHot = hoveredRawId !== null && (link.from_id === hoveredRawId || link.to_id === hoveredRawId);
        const baseOpacity = isPending ? 0.45 : 0.6;
        const opacity = isHot ? 0.9 : (hoveredRawId !== null ? 0.08 : baseOpacity);
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        return (
          <g key={i}>
            {/* Wide transparent hit area — captures clicks on the arrow */}
            <path d={d} fill="none" stroke="transparent" strokeWidth="16"
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={() => onLinkClick && onLinkClick(link)} />
            {isHot && <path d={d} fill="none" stroke={color} strokeWidth="9" strokeOpacity="0.12" style={{ pointerEvents: 'none' }} />}
            <path d={d} fill="none" stroke={color}
              strokeWidth={isHot ? 2.5 : 1.5}
              strokeDasharray={isPending ? '5 4' : 'none'}
              strokeOpacity={opacity}
              style={{ pointerEvents: 'none' }}
              markerEnd={`url(#df-arrow${isHot ? '-hot' : ''})`} />
            {isPending && (
              <text x={mx} y={my - 6} textAnchor="middle" fontSize="9" fill={color} fillOpacity={isHot ? 0.9 : 0.55}
                style={{ pointerEvents: 'none' }} fontFamily="system-ui, sans-serif" fontWeight="600">
                待確認
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Contacts tab (inside team panel) ──────────────────────────────────────
function ContactsTab({ contacts, onRefresh }) {
  const [mode, setMode] = useState('list'); // 'list' | 'add' | number (edit id)
  const [form, setForm] = useState({ name: '', company: '', role: '', email: '' });
  const [saving, setSaving] = useState(false);

  const startEdit = (c) => {
    setForm({ name: c.name, company: c.company || '', role: c.role || '', email: c.email || '' });
    setMode(c.id);
  };
  const cancel = () => { setMode('list'); setForm({ name: '', company: '', role: '', email: '' }); };

  const save = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    if (mode === 'add') await API.addContact(form);
    else await API.updateContact(mode, form);
    setSaving(false);
    cancel();
    onRefresh();
  };

  const del = async (id) => { await API.deleteContact(id); onRefresh(); };

  const isEditing = mode === 'add' || typeof mode === 'number';
  const inp = { width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!isEditing && (
        <div style={{ padding: '7px 10px 5px' }}>
          <button className="btn btn-ghost" onClick={() => setMode('add')}
            style={{ width: '100%', fontSize: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <Icon name="plus" size={13} /> Add contact
          </button>
        </div>
      )}

      {isEditing && (
        <div style={{ padding: '9px 10px', borderBottom: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 2 }}>
            {mode === 'add' ? 'New contact' : 'Edit contact'}
          </div>
          <input autoFocus placeholder="Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} onKeyDown={e => e.key === 'Enter' && save()} />
          <input placeholder="Company" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} style={inp} />
          <input placeholder="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inp} />
          <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inp} />
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 9px', flex: 1 }} onClick={cancel}>Cancel</button>
            <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 9px', flex: 1 }} onClick={save} disabled={!form.name.trim() || saving}>
              {saving ? '…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {contacts.length === 0 && !isEditing ? (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', padding: '12px 14px', lineHeight: 1.5 }}>
            No contacts yet.<br />Type @ in any note to reference them once added.
          </div>
        ) : contacts.map(c => (
          <ContactCard key={c.id} contact={c} onEdit={() => startEdit(c)} onDelete={() => del(c.id)} />
        ))}
      </div>
    </div>
  );
}

function ContactCard({ contact: c, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ padding: '8px 13px', display: 'flex', alignItems: 'flex-start', gap: 8, transition: 'background .1s', background: hover ? '#ffffff08' : 'none' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', marginTop: 1 }}>
        <Icon name="person" size={14} color="var(--muted-2)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', lineHeight: 1.2 }}>{c.name}</div>
        {(c.company || c.role) && (
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[c.role, c.company].filter(Boolean).join(' · ')}
          </div>
        )}
        {c.email && (
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
        )}
      </div>
      {hover && (
        <div style={{ display: 'flex', gap: 2, flex: '0 0 auto' }}>
          <button className="btn btn-ghost btn-icon" style={{ padding: 3 }} onClick={onEdit}>
            <Icon name="edit" size={12} color="var(--muted)" />
          </button>
          <button className="btn btn-ghost btn-icon" style={{ padding: 3 }} onClick={onDelete}>
            <Icon name="close" size={12} color="var(--muted)" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Team filter panel ─────────────────────────────────────────────────────
function TeamPanel({ hiddenUsers, onToggle, onRefresh }) {
  const { PEOPLE, ENTRIES, TASKS, CONTACTS, relTime } = window.HANDOFF;
  const [tab, setTab] = useState('team');
  const employees = Object.values(PEOPLE).filter(p => !p.isManager);
  const allItems = [...ENTRIES, ...TASKS];

  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setTab(id)} style={{
      flex: 1, padding: '7px 0', fontSize: 11.5, fontWeight: tab === id ? 600 : 400,
      border: 'none', borderBottom: `2px solid ${tab === id ? 'var(--purple)' : 'transparent'}`,
      background: 'none', cursor: 'pointer',
      color: tab === id ? 'var(--text)' : 'var(--muted)',
      transition: 'color .12s, border-color .12s',
    }}>{label}</button>
  );

  return (
    <div style={{ width: 204, flex: '0 0 auto', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flex: '0 0 auto' }}>
        {tabBtn('team', `Team (${employees.length})`)}
        {tabBtn('contacts', `Contacts (${(CONTACTS || []).length})`)}
      </div>

      {tab === 'team' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          <div style={{ padding: '4px 14px 6px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Click to hide/show</div>
          </div>
          {employees.map(p => {
            const isHidden = hiddenUsers.has(p.id);
            const latest = allItems
              .filter(i => (i.author || i.by) === p.id)
              .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const latestTitle = latest ? (latest.title || latest.label) : null;

            return (
              <div key={p.id} onClick={() => onToggle(p.id)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 13px', cursor: 'pointer', opacity: isHidden ? 0.4 : 1, transition: 'opacity .15s, background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#ffffff08'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <div style={{ width: 14, height: 14, borderRadius: 3, marginTop: 6, flex: '0 0 auto',
                  border: `1.5px solid ${isHidden ? '#44444e' : p.color}`,
                  background: isHidden ? 'transparent' : p.color + '28',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border-color .15s, background .15s' }}>
                  {!isHidden && <Icon name="check" size={9} color={p.color} />}
                </div>
                <Avatar person={p} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: isHidden ? 'var(--muted)' : 'var(--text)', lineHeight: 1.2 }}>
                    {p.name.split(' ')[0]}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                    {p.departing ? 'Departing' : 'Employee'}
                  </div>
                  <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border-soft)' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Last update</div>
                    {latestTitle ? (
                      <>
                        <div style={{ fontSize: 10.5, color: 'var(--muted-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.35 }}>{latestTitle}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{relTime(latest.date)}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' }}>No activity</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'contacts' && (
        <ContactsTab contacts={CONTACTS || []} onRefresh={onRefresh} />
      )}
    </div>
  );
}

// ── Link detail drawer ────────────────────────────────────────────────────
function LinkDrawer({ link, onClose, onRefresh }) {
  const { ENTRIES, TASKS, TYPE_META, LANES } = window.HANDOFF;
  const [description, setDescription] = useState(null);
  const [loadingDesc, setLoadingDesc] = useState(true);
  const [acting, setActing] = useState(null);

  const fromNode = ENTRIES.find(e => e.nodeId === link.from_id) || TASKS.find(t => t.nodeId === link.from_id);
  const toNode   = ENTRIES.find(e => e.nodeId === link.to_id)   || TASKS.find(t => t.nodeId === link.to_id);

  useEffect(() => {
    setLoadingDesc(true);
    API.describeLink(link.id)
      .then(r => { setDescription(r.description || null); setLoadingDesc(false); })
      .catch(() => setLoadingDesc(false));
  }, [link.id]);

  const confirm = async () => {
    setActing('confirming');
    await API.confirmLink(link.id);
    onRefresh(); onClose();
  };

  const reject = async () => {
    setActing('rejecting');
    await API.rejectLink(link.id);
    onRefresh(); onClose();
  };

  const REL_COLORS = { implements: 'var(--teal)', validates: 'var(--green)', triggered_by: 'var(--amber)', supersedes: 'var(--red)' };
  const relColor = REL_COLORS[link.rel] || 'var(--muted)';
  const isPending = link.status === 'pending';

  function NodeCard({ node }) {
    if (!node) return <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Node not found</div>;
    const m = TYPE_META[node.type] || TYPE_META.note;
    const lane = LANES.find(l => l.id === node.lane);
    return (
      <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg)', border: `1px solid ${m.color}33`, borderRadius: 8 }}>
        <span style={{ color: m.color, display: 'inline-flex', flex: '0 0 auto', marginTop: 1 }}>
          <Icon name={m.glyph} size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Pill color={m.color} style={{ fontSize: 10 }}>{m.label}</Pill>
            {lane && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{lane.name}</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.title || node.label}
          </div>
          {node.hash && <div className="mono" style={{ fontSize: 11, color: 'var(--teal)', marginTop: 2 }}>{node.hash}</div>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 80, animation: 'fadeIn .15s ease both' }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 390, zIndex: 81,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        boxShadow: '-18px 0 50px rgba(0,0,0,.5)', animation: 'slideInRight .22s cubic-bezier(.2,.8,.2,1) both',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '16px 18px', borderBottom: '1px solid var(--border-soft)' }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: relColor + '1f', color: relColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="decision" size={16} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: relColor, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {link.rel.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {isPending ? 'AI suggestion — pending review' : link.is_ai ? 'AI link · confirmed' : 'Manual link'}
            </div>
          </div>
          {isPending && <Pill color="var(--amber)" style={{ fontSize: 10 }}>待確認</Pill>}
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="close" size={16} color="var(--muted-2)" /></button>
        </div>

        <div style={{ padding: '18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Decision (from) */}
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 7 }}>Decision</div>
            <NodeCard node={fromNode} />
          </div>

          {/* Relationship badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 99, border: `1px solid ${relColor}44`, background: relColor + '12' }}>
              <Icon name="arrowRight" size={12} color={relColor} />
              <span style={{ fontSize: 11, fontWeight: 700, color: relColor, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {link.rel.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
          </div>

          {/* Linked node (to) */}
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 7 }}>Linked node</div>
            <NodeCard node={toNode} />
          </div>

          {/* AI explanation */}
          <div style={{ padding: '13px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
              <Icon name="sparkle" size={12} color="var(--purple)" />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Why this link?</span>
            </div>
            {loadingDesc ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'var(--muted)' }}>
                <div style={{ width: 12, height: 12, border: '2px solid var(--border)', borderTopColor: 'var(--purple)', borderRadius: '50%', animation: 'spin .8s linear infinite', flex: '0 0 auto' }} />
                Generating explanation…
              </div>
            ) : description ? (
              <div style={{ fontSize: 13, lineHeight: 1.65, color: '#d6d6dd', textWrap: 'pretty' }}>{description}</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No description available.</div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 9 }}>
          {isPending ? (
            <>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}
                disabled={!!acting} onClick={reject}>
                <Icon name="close" size={14} color="var(--muted-2)" />
                {acting === 'rejecting' ? ' Rejecting…' : ' Reject'}
              </button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', background: 'var(--teal)', borderColor: 'var(--teal)' }}
                disabled={!!acting} onClick={confirm}>
                <Icon name="check" size={14} />
                {acting === 'confirming' ? ' Confirming…' : ' Confirm link'}
              </button>
            </>
          ) : (
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', color: 'var(--red)' }}
              disabled={!!acting} onClick={reject}>
              <Icon name="close" size={14} />
              {acting === 'rejecting' ? 'Removing…' : 'Remove link'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Timeline screen ────────────────────────────────────────────────────────
function TimelineScreen({ styleVariant = 'railway', currentUser, onGenerateHandover, onRefresh }) {
  const { LANES, ENTRIES, TASKS, LINKS } = window.HANDOFF;
  
  const totalEnd = useMemo(() => window.HANDOFF.NOW || new Date(), []);
  const oldestDate = useMemo(() => {
    let minT = totalEnd.getTime() - 90 * 86400000; // default 90 days ago
    [...ENTRIES, ...TASKS].forEach(item => {
      if (item.date) {
        const t = new Date(item.date).getTime();
        if (t < minT) minT = t;
      }
    });
    return new Date(minT - 2 * 86400000); // 2 days padding
  }, [ENTRIES, TASKS, totalEnd]);

  const [viewStart, setViewStart] = useState(() => {
    const now = window.HANDOFF.NOW || new Date();
    return new Date(now.getTime() - 30 * 86400000);
  });
  const [viewEnd, setViewEnd] = useState(() => {
    return window.HANDOFF.NOW || new Date();
  });

  const frac = useCallback((iso) => {
    const t = new Date(iso).getTime();
    return Math.min(1, Math.max(0, (t - viewStart.getTime()) / (viewEnd.getTime() - viewStart.getTime())));
  }, [viewStart, viewEnd]);

  // Sync state back to window.HANDOFF so all children (Lanes, overlays, etc.) read the updated range
  window.HANDOFF.WIN_START = viewStart;
  window.HANDOFF.WIN_END = viewEnd;
  window.HANDOFF.frac = frac;

  const [selected, setSelected] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [quickAdd, setQuickAdd] = useState(null);
  const [contextLane, setContextLane] = useState(null);
  const [addBranch, setAddBranch] = useState(false);
  const [freeLog, setFreeLog] = useState(null);
  const [range, setRange] = useState('30D');
  const [filters, setFilters] = useState(new Set());
  const [hiddenUsers, setHiddenUsers] = useState(new Set());
  const [decisionFocus, setDecisionFocus] = useState(null);
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'decision-flow'
  const [linking, setLinking] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [selectedLink, setSelectedLink] = useState(null);
  const containerRef = useRef(null);
  const [containerW, setContainerW] = useState(1800);

  const handleRangeChange = (r) => {
    setRange(r);
    const now = totalEnd;
    if (r === '7D') {
      setViewStart(new Date(now.getTime() - 7 * 86400000));
      setViewEnd(now);
    } else if (r === '30D') {
      setViewStart(new Date(now.getTime() - 30 * 86400000));
      setViewEnd(now);
    } else if (r === '90D') {
      setViewStart(new Date(now.getTime() - 90 * 86400000));
      setViewEnd(now);
    } else if (r === 'All') {
      setViewStart(oldestDate);
      setViewEnd(now);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => setContainerW(entries[0].contentRect.width));
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Pre-compute spread-adjusted fracs for ALL nodes (used by the SVG overlay)
  const fracAdjAll = useMemo(() => {
    const result = {};
    LANES.forEach(lane => {
      const { map } = spreadFracs([
        ...ENTRIES.filter(e => e.lane === lane.id).map(e => ({ id: e.id, f: frac(e.date) })),
        ...TASKS.filter(t => t.lane === lane.id).map(t => ({ id: t.id, f: frac(t.date) })),
      ]);
      Object.assign(result, map);
    });
    return result;
  }, [ENTRIES, TASKS, LANES, frac]);

  const handleEntrySelect = (e) => {
    setSelected(e);
    if (e.type === 'decision') {
      const links = (LINKS || []).filter(l => l.from_id === e.nodeId || l.to_id === e.nodeId);
      const linkedNodeIds = new Set([
        e.id,
        ...links.map(l => {
          const rawId = l.from_id === e.nodeId ? l.to_id : l.from_id;
          const entry = ENTRIES.find(x => x.nodeId === rawId);
          const task  = TASKS.find(x => x.nodeId === rawId);
          return (entry || task)?.id;
        }).filter(Boolean),
      ]);
      setDecisionFocus({ decisionId: e.id, linkedNodeIds, links });
    } else {
      setDecisionFocus(null);
    }
  };

  const closeDrawer = () => { setSelected(null); setDecisionFocus(null); };
  const toggleDecisionFlow = () => {
    setViewMode(m => m === 'decision-flow' ? 'timeline' : 'decision-flow');
    setDecisionFocus(null);
  };

  const handleLinkDecisions = async () => {
    setLinking(true);
    await API.linkAllDecisions();
    // AI runs in background threads; give it time then auto-refresh
    setTimeout(() => { onRefresh(); setLinking(false); }, 9000);
  };

  const toggleUser = (id) => setHiddenUsers(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const STYLES = {
    railway: { laneH: 128, lineY: 66, lineW: 2,   dot: 9,  refCY: 18, refDot: 13, taskW: 124, taskH: 38, connH: 14, labelW: 176, band: false, dense: false },
    dense:   { laneH: 84,  lineY: 44, lineW: 1.5, dot: 7,  refCY: 11, refDot: 10, taskW: 104, taskH: 28, connH: 8,  labelW: 176, band: false, dense: true  },
    bands:   { laneH: 140, lineY: 72, lineW: 3,   dot: 11, refCY: 20, refDot: 15, taskW: 130, taskH: 40, connH: 16, labelW: 176, band: true,  dense: false },
  };
  const style = STYLES[styleVariant] || STYLES.railway;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <TimelineToolbar
        onGenerateHandover={onGenerateHandover}
        onAddBranch={() => setAddBranch(true)}
        onFreeLog={(e) => setFreeLog({ originRect: e.currentTarget.getBoundingClientRect() })}
        onLinkDecisions={handleLinkDecisions}
        linking={linking}
        viewMode={viewMode}
        onToggleDecisionFlow={toggleDecisionFlow}
        range={range} setRange={handleRangeChange}
        filters={filters} setFilters={setFilters} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px 8px' }}>
          <div ref={containerRef} style={{ minWidth: 1800, position: 'relative' }}>
            {LANES.map((lane, i) => (
              <Lane key={lane.id} lane={lane} style={{ ...style, idx: i }} filters={filters} hiddenUsers={hiddenUsers}
                onSelect={handleEntrySelect}
                onTaskSelect={setSelectedTask}
                onQuickAdd={p => setQuickAdd({ ...p, lane })}
                onContextOpen={lane => setContextLane(lane)}
                decisionFocus={decisionFocus}
                viewMode={viewMode}
                onNodeHover={setHoveredNodeId} />
            ))}
            <BranchForkOverlay containerW={containerW} style={style} />
            <DecisionThreadOverlay
              decisionFocus={decisionFocus}
              viewMode={viewMode}
              fracAdjAll={fracAdjAll}
              containerW={containerW}
              style={style}
              hoveredNodeId={hoveredNodeId}
              onLinkClick={setSelectedLink} />
          </div>
        </div>
        <TeamPanel hiddenUsers={hiddenUsers} onToggle={toggleUser} onRefresh={onRefresh} />
      </div>

      <Scrubber
        totalStart={oldestDate}
        totalEnd={totalEnd}
        viewStart={viewStart}
        viewEnd={viewEnd}
        onChange={(start, end) => {
          setViewStart(start);
          setViewEnd(end);
          setRange(null);
        }}
        labelW={style.labelW}
      />

      {selectedLink && <LinkDrawer link={selectedLink} onClose={() => setSelectedLink(null)} onRefresh={() => { setSelectedLink(null); onRefresh(); }} />}
      {freeLog !== null && <FreeformModal initialLaneId={freeLog.laneId} originRect={freeLog.originRect} onClose={() => setFreeLog(null)} onRefresh={() => { setFreeLog(null); onRefresh(); }} />}
      {quickAdd && <CreateTaskModal pos={quickAdd} lane={quickAdd.lane} onClose={() => setQuickAdd(null)} onRefresh={() => { setQuickAdd(null); onRefresh(); }} />}
      {selected && <EntryDrawer e={selected} onClose={closeDrawer} onRefresh={onRefresh} />}
      {selectedTask && <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} onRefresh={() => { setSelectedTask(null); onRefresh(); }} />}
      {contextLane && <BranchContextPanel lane={contextLane} onClose={() => setContextLane(null)} onRefresh={() => { setContextLane(null); onRefresh(); }}
        onShowDecisionFlow={() => { setContextLane(null); setViewMode('decision-flow'); }} />}
      {addBranch && <AddBranchModal onClose={() => setAddBranch(false)} onRefresh={() => { setAddBranch(false); onRefresh(); }} />}
    </div>
  );
}

window.TimelineScreen = TimelineScreen;
