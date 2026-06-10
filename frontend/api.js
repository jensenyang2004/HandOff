// api.js — fetches from Flask backend and populates window.HANDOFF

const TYPE_META = {
  commit:     { color: '#1D9E75', label: 'Commit',     glyph: 'commit'    },
  experiment: { color: '#EF9F27', label: 'Experiment', glyph: 'flask'     },
  reference:  { color: '#7F77DD', label: 'Reference',  glyph: 'link'      },
  note:       { color: '#6B6B7A', label: 'Note',       glyph: 'note'      },
  decision:   { color: '#E05475', label: 'Decision',   glyph: 'decision'  },
  meeting:    { color: '#3AAFA9', label: 'Meeting',    glyph: 'meeting'   },
  milestone:  { color: '#E9A319', label: 'Milestone',  glyph: 'milestone' },
};

const TASK_META = {
  active:    { color: '#378ADD', label: 'Active'    },
  completed: { color: '#639922', label: 'Completed' },
  overdue:   { color: '#E24B4A', label: 'Overdue'   },
};

function buildUtils(winStart, winEnd, now) {
  const WS = new Date(winStart), WE = new Date(winEnd), N = new Date(now);

  function daysAgo(iso) { return Math.round((N - new Date(iso)) / 86400000); }
  function frac(iso) {
    const t = new Date(iso).getTime();
    return Math.min(1, Math.max(0, (t - WS) / (WE - WS)));
  }
  function fmtDate(iso, opts) {
    return new Date(iso).toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric' });
  }
  function fmtTime(iso) {
    return new Date(iso).toLocaleString('en-US',
      { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function relTime(iso) {
    const d = daysAgo(iso);
    if (d === 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 7)  return d + 'd ago';
    if (d < 30) return Math.floor(d / 7) + 'w ago';
    return Math.floor(d / 30) + 'mo ago';
  }
  return { daysAgo, frac, fmtDate, fmtTime, relTime };
}

function nodeToFrontend(node, branchSlug) {
  const meta = node.metadata || {};
  // spec types → frontend display types
  const typeMap = { idea: 'experiment', link: 'reference' };
  const frontType = typeMap[node.type] || node.type;

  if (node.type === 'task') {
    const now = new Date();
    const due = meta.due ? new Date(meta.due + 'T00:00:00') : null;
    let state = 'active';
    if (node.assignment_status === 'done') state = 'completed';
    else if (due && due < now)             state = 'overdue';
    return {
      _isTask: true,
      id: 't' + node.id,
      nodeId: node.id,
      lane: branchSlug,
      state,
      label: node.content,
      date: node.created_at,
      due: meta.due || '',
      by: node.created_by,
      assignment_status: node.assignment_status,
      assigned_to: node.assigned_to,
    };
  }

  return {
    id: 'e' + node.id,
    nodeId: node.id,
    lane: branchSlug,
    type: frontType,
    date: node.created_at,
    author: node.created_by,
    title: meta.title || node.content,
    body:  meta.body  || node.content,
    note:  meta.note  || '',
    hash:    meta.hash,
    metric:  meta.metric,
    refKind: meta.refKind,
    rationale:    meta.rationale,
    alternatives: meta.alternatives,
    attendees:    meta.attendees,
    outcome:      meta.outcome,
    assignment_status: node.assignment_status,
    assigned_to: node.assigned_to,
  };
}

async function loadHandoffData() {
  const [projectRes, branchesRes, nodesRes, usersRes, contactsRes, linksRes] = await Promise.all([
    fetch('/api/project').then(r => { if (!r.ok) throw new Error('Backend unreachable'); return r.json(); }),
    fetch('/api/branches').then(r => r.json()),
    fetch('/api/nodes').then(r => r.json()),
    fetch('/api/users').then(r => r.json()),
    fetch('/api/contacts').then(r => r.json()),
    fetch('/api/links').then(r => r.json()),
  ]);

  const slugMap = {};
  branchesRes.forEach(b => { slugMap[b.id] = b.slug || String(b.id); });

  const LANES = branchesRes.map(b => ({
    id: b.slug || String(b.id),
    dbId: b.id,
    name: b.name,
    parent_id: b.parent_branch_id != null ? (slugMap[b.parent_branch_id] || String(b.parent_branch_id)) : null,
    created_at: b.created_at,
    context_doc: b.context_doc || '',
    running_summary: b.running_summary || '',
    running_summary_updated_at: b.running_summary_updated_at,
    node_count_since_last_summary: b.node_count_since_last_summary,
    context_updating: b.context_updating,
    ai_context: b.ai_context || '',
    ai_context_updated_at: b.ai_context_updated_at,
    nodes_since_context_sync: b.nodes_since_context_sync || 0,
  }));

  const all = nodesRes.map(n => nodeToFrontend(n, slugMap[n.branch_id]));
  const ENTRIES = all.filter(e => !e._isTask);
  const TASKS   = all.filter(e =>  e._isTask);

  const PEOPLE = {};
  usersRes.forEach(u => {
    PEOPLE[u.id] = {
      id: u.id,
      name: u.name,
      initials: u.initials || u.name.split(' ').map(c => c[0]).join(''),
      color: u.color || '#7F77DD',
      role: u.role === 'manager' ? 'EM' : 'ML Engineer',  // display label
      isManager: u.role === 'manager',                     // role check
      departing: u.departing || false,
      lastDay: u.last_day || '',
    };
  });

  const now      = new Date();
  const winStart = new Date(now.getTime() - 30 * 86400000);
  const winEnd   = now;
  const utils    = buildUtils(winStart, winEnd, now);

  function laneActivity(laneId) {
    const items = [
      ...ENTRIES.filter(e => e.lane === laneId),
      ...TASKS.filter(t => t.lane === laneId),
    ];
    if (!items.length) return { health: 'dead', lastDays: Infinity, count: 0, entries: 0 };
    const last = Math.min(...items.map(i => utils.daysAgo(i.date)));
    const entries = ENTRIES.filter(e => e.lane === laneId).length;
    let health = 'active';
    if (last > 14) health = 'dead';
    else if (last > 7) health = 'stalled';
    return { health, lastDays: last, count: items.length, entries };
  }

  window.HANDOFF = {
    NOW: now, WIN_START: winStart, WIN_END: winEnd,
    PROJECT: projectRes,
    ...utils,
    TYPE_META, TASK_META,
    PEOPLE, LANES, ENTRIES, TASKS,
    CONTACTS: contactsRes,
    LINKS: linksRes,
    laneActivity,
    CURRENT_USER: 'jensen',
  };

  return window.HANDOFF;
}

const API = {
  async addNode(branchId, nodeData) {
    const r = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: branchId, ...nodeData }),
    });
    return r.json();
  },

  async updateNode(nodeId, data) {
    const r = await fetch(`/api/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return r.json();
  },

  async createBranch(data) {
    const r = await fetch('/api/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return r.json();
  },

  async updateBranch(branchId, data) {
    const r = await fetch(`/api/branches/${branchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return r.json();
  },

  async parseLog(branchId, text) {
    const r = await fetch('/api/ai/parse-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: branchId, text }),
    });
    return r.json();
  },

  async weeklyDigest(userId) {
    const r = await fetch('/api/ai/weekly-digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    return r.json();
  },

  async syncContext(branchDbId) {
    const r = await fetch(`/api/ai/sync-context/${branchDbId}`, { method: 'POST' });
    return r.json();
  },

  async addLink(data) {
    const r = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return r.json();
  },

  async deleteLink(linkId) {
    const r = await fetch(`/api/links/${linkId}`, { method: 'DELETE' });
    return r.json();
  },

  async describeLink(linkId) {
    const r = await fetch(`/api/ai/describe-link/${linkId}`, { method: 'POST' });
    return r.json();
  },

  async confirmLink(linkId) {
    const r = await fetch(`/api/links/${linkId}/confirm`, { method: 'POST' });
    return r.json();
  },

  async rejectLink(linkId) {
    const r = await fetch(`/api/links/${linkId}/reject`, { method: 'POST' });
    return r.json();
  },

  async linkAllDecisions() {
    const r = await fetch('/api/ai/link-decisions', { method: 'POST' });
    return r.json();
  },

  async relinkDecision(nodeId) {
    const r = await fetch(`/api/ai/link-decisions/${nodeId}`, { method: 'POST' });
    return r.json();
  },

  async addContact(data) {
    const r = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return r.json();
  },

  async updateContact(contactId, data) {
    const r = await fetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return r.json();
  },

  async deleteContact(contactId) {
    const r = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
    return r.json();
  },

  async getInbox() {
    const r = await fetch('/api/inbox');
    return r.json();
  },

  async dismissInbox(itemId) {
    const r = await fetch(`/api/inbox/${itemId}/dismiss`, { method: 'POST' });
    return r.json();
  },

  async interpretInbox(itemId, branchSlug) {
    const r = await fetch(`/api/inbox/${itemId}/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_slug: branchSlug }),
    });
    return r.json();
  },

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

  async handover(userId) {
    const r = await fetch('/api/ai/handover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    return r.json();
  },
};

window.loadHandoffData = loadHandoffData;
window.API = API;
