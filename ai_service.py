import os
import json
import logging

logger = logging.getLogger(__name__)

try:
    from google import genai
    _HAS_GENAI = True
except ImportError:
    _HAS_GENAI = False

MODEL = 'gemini-3.1-flash-lite'


class AIService:
    def __init__(self):
        api_key = os.environ.get('GEMINI_API_KEY')
        self.enabled = bool(api_key and _HAS_GENAI)
        if self.enabled:
            self.client = genai.Client(api_key=api_key)
            logger.info('Gemini AI enabled (model: %s)', MODEL)
        else:
            logger.warning('Gemini AI disabled — set GEMINI_API_KEY to enable')

    def _call(self, prompt):
        response = self.client.models.generate_content(model=MODEL, contents=prompt)
        return response.text

    def _call_json(self, prompt):
        text = self._call(prompt)
        text = text.strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1] if '\n' in text else text[3:]
            if text.endswith('```'):
                text = text[:-3]
        return json.loads(text.strip())

    def serialize_nodes_rich(self, nodes):
        """Full-fidelity serialization: includes body, metric, hash, refKind, author."""
        lines = []
        for n in nodes:
            m = n.get('metadata') or {}
            date = n['created_at'][:10]
            ntype = n['type'].upper()
            title = m.get('title') or n['content']
            author = n.get('created_by', '')
            line = f"[{date}] {ntype}"
            if author:
                line += f" by {author}"
            line += f" — {title}"
            lines.append(line)
            if m.get('hash'):
                lines.append(f"  hash: {m['hash']}")
            if m.get('metric') and m['metric'] != 'pending':
                lines.append(f"  result: {m['metric']}")
            if m.get('refKind'):
                lines.append(f"  kind: {m['refKind']}")
            content = n.get('content', '')
            if content.startswith('http'):
                lines.append(f"  url: {content}")
            if m.get('body'):
                lines.append(f"  detail: {m['body']}")
            if m.get('note'):
                lines.append(f"  note: {m['note']}")
        return '\n'.join(lines)

    def build_context_prefix(self, project, branch):
        parts = []
        if project and project.get('context_doc'):
            parts.append(f"=== Project Context ===\n{project['context_doc']}")
        if branch and branch.get('context_doc'):
            parts.append(f"=== Branch Notes ({branch['name']}) ===\n{branch['context_doc']}")
        # Prefer ai_context (structured) over running_summary (prose) if available
        if branch and branch.get('ai_context'):
            parts.append(f"=== Branch Context ({branch['name']}) ===\n{branch['ai_context']}")
        elif branch and branch.get('running_summary'):
            parts.append(f"=== Running Summary ===\n{branch['running_summary']}")
        return '\n\n'.join(parts)

    def sync_context(self, project, branch, nodes):
        """Generate a structured claude.md-style context doc for a branch."""
        if not self.enabled:
            return self._mock_context(branch, nodes)

        proj_name = (project or {}).get('name', 'this project')
        proj_ctx = (project or {}).get('context_doc', '')
        user_notes = branch.get('context_doc', '')
        existing = branch.get('ai_context', '')
        nodes_text = self.serialize_nodes_rich(nodes)
        # Python <3.12 forbids backslashes inside f-string expressions
        prev_doc = ('Previous context doc (update rather than replace if still accurate):\n' + existing) if existing else ''

        prompt = f"""You are generating a context document for a branch in the "{proj_name}" project.
This document is consumed by an AI assistant as primary context for all tasks on this branch.
{('Project context: ' + proj_ctx) if proj_ctx else ''}
{('Team notes on this branch: ' + user_notes) if user_notes else ''}
{prev_doc}

All entries on branch "{branch['name']}" (chronological, newest last):
{nodes_text or '(no entries yet)'}

Generate a structured markdown context document with these sections (omit any that have no relevant content):

## Purpose
## Current Status
## Key Decisions
## Technical Details
## References
## Open Questions

Rules:
- Be factual and dense. No fluff or filler sentences.
- For Key Decisions: note if a decision was reversed or superseded.
- For commits: reference hash when available.
- For experiments: include result metrics.
- This is read by an AI, not humans directly — prioritise information density.
- Output ONLY the markdown. No explanation, no preamble."""

        try:
            return self._call(prompt).strip()
        except Exception as e:
            logger.error('sync_context failed: %s', e)
            return self._mock_context(branch, nodes)

    def _mock_context(self, branch, nodes):
        return f"## {branch['name']}\n\n**Status:** {len(nodes)} entries recorded. Sync with AI to generate full context."

    def parse_log(self, project, branch, text):
        """Parse free-form text into a structured node array."""
        if not self.enabled:
            return self._mock_parse_log(text)

        prefix = self.build_context_prefix(project, branch)
        prompt = f"""{prefix}

=== Instruction ===
Parse the following input into structured timeline nodes for a software project.
Return a strict JSON array only. No prose. No explanation.

Rules:
- If the input contains NO project-relevant content — e.g. it's purely small talk, social chitchat, scheduling lunch/coffee, greetings, jokes — return an empty array []. Do not invent a node just to produce output. A node should only be created if there is something a teammate would actually want recorded (a decision, result, task, link, meeting outcome, milestone, etc).
- Extract EVERY URL as its own separate node of type "link". Never embed a URL inside another node.
- Detect link kind: arxiv.org / doi.org / .pdf → "Paper"; github.com / gitlab.com → "Repo"; anything else → "Article" or "Docs".
- If the input contains both narrative text AND one or more URLs, produce multiple nodes: one for the narrative (commit/note/idea) and one per URL.
- For commit nodes: extract the hash if present (7–40 hex chars), extract any metric results into "metric".
- For idea/experiment nodes: put the result metric in "metric" (e.g. "F1=0.91").
- For decision nodes: use when text records an explicit choice — "we decided", "chose X", "going with", "finalized". Put chosen option in "title", reasoning in "rationale", rejected options in "alternatives".
- For meeting nodes: use when text describes a conversation or sync — "met with", "discussed", "call with", "standup". List all mentioned people in "attendees", capture key outcome in "outcome".
- For milestone nodes: use when text announces a completion or release — "shipped", "launched", "released v1", "went live", "deployed to prod". No extra metadata required.
- Put the full descriptive detail in "body". Put a concise teammate-facing annotation in "note".

Each node schema:
{{
  "type": "commit | link | note | idea | task | decision | meeting | milestone",
  "content": "main text, or URL if type=link",
  "metadata": {{
    "title": "short display title",
    "body": "full detail — do not truncate",
    "note": "one-line annotation for teammates",
    "hash": "7–40 char hex if type=commit, else omit",
    "metric": "result string if type=idea/commit, else omit",
    "refKind": "Paper|Repo|Article|Docs — only if type=link",
    "due": "YYYY-MM-DD — only if type=task",
    "rationale": "for decision: why this choice was made — omit otherwise",
    "alternatives": "for decision: options considered but rejected, comma-separated — omit otherwise",
    "attendees": "for meeting: attendees comma-separated (include external names) — omit otherwise",
    "outcome": "for meeting: what was decided or agreed — omit otherwise"
  }}
}}

=== Input ===
{text}"""

        try:
            return self._call_json(prompt)
        except Exception as e:
            logger.error('parse_log failed: %s', e)
            return self._mock_parse_log(text)

    def _mock_parse_log(self, text):
        import re
        text = text.strip()
        if not text:
            return []
        if re.search(r'github\.com/.+/commit/|^[0-9a-f]{7,40}$', text, re.I):
            t, ref_kind = 'commit', None
        elif re.search(r'arxiv\.org|\.pdf(\?|$)|doi\.org', text, re.I):
            t, ref_kind = 'link', 'Paper'
        elif re.search(r'github\.com|gitlab\.com', text, re.I):
            t, ref_kind = 'link', 'Repo'
        elif re.search(r'^https?://', text, re.I):
            t, ref_kind = 'link', 'Article'
        elif re.search(r'\bwe decided\b|\bchose\b|\bfinalized\b|\bgoing with\b', text, re.I):
            t, ref_kind = 'decision', None
        elif re.search(r'\bmeeting\b|\bmet with\b|\bcall with\b|\bstandup\b', text, re.I):
            t, ref_kind = 'meeting', None
        elif re.search(r'\bshipped\b|\blaunched\b|\breleased\b|\bmilestone\b', text, re.I):
            t, ref_kind = 'milestone', None
        elif re.search(r'=|\d+%|acc|loss|f1|epoch', text, re.I):
            t, ref_kind = 'idea', None
        elif re.search(r'\blunch\b|\bcoffee\b|\bhappy hour\b|\bgood morning\b|\blol\b|\bhaha\b|\bthanks\b|\bthank you\b|\bcongrats\b|\bweekend\b', text, re.I):
            return []
        else:
            t, ref_kind = 'note', None
        meta = {'title': text[:80], 'note': text[:120]}
        if ref_kind:
            meta['refKind'] = ref_kind
        return [{'type': t, 'content': text, 'metadata': meta}]

    def update_running_summary(self, project, branch, nodes):
        """Regenerate running_summary from all nodes on the branch."""
        if not self.enabled:
            return self._mock_summary(nodes)

        prefix = self.build_context_prefix(project, branch)
        entries_text = '\n'.join(
            f"- [{n['created_at'][:10]}] ({n['type']}) "
            f"{(n.get('metadata') or {}).get('title') or n['content']}"
            f"{': ' + (n.get('metadata') or {})['note'] if (n.get('metadata') or {}).get('note') else ''}"
            for n in nodes
        )
        prompt = f"""{prefix}

=== Task ===
Update the running summary for branch "{branch['name']}".
Write 2-3 concise paragraphs covering: what has been accomplished, key decisions and rationale,
current state and what is in progress.

All entries on this branch (chronological):
{entries_text}

Return only the updated summary text. No headers, no JSON, no explanation."""

        try:
            return self._call(prompt).strip()
        except Exception as e:
            logger.error('update_running_summary failed: %s', e)
            return self._mock_summary(nodes)

    def _mock_summary(self, nodes):
        count = len(nodes)
        commits = sum(1 for n in nodes if n['type'] == 'commit')
        ideas   = sum(1 for n in nodes if n['type'] == 'idea')
        return (
            f"Branch has {count} recorded entries including {commits} commits and "
            f"{ideas} experiments. Work is ongoing — see individual entries for details."
        )

    def scout_decision_branches(self, project, decision_node, branch_summaries):
        """Pass 1: which branch slugs does this decision likely affect?"""
        if not self.enabled:
            return [b['slug'] for b in branch_summaries]

        meta = decision_node.get('metadata') or {}
        decision_text = f"[{decision_node['created_at'][:10]}] {meta.get('title') or decision_node['content']}"
        if meta.get('rationale'):
            decision_text += f"\nRationale: {meta['rationale']}"
        if meta.get('alternatives'):
            decision_text += f"\nAlternatives considered: {meta['alternatives']}"

        branches_text = '\n\n'.join(
            f"Branch: {b['name']} ({b['slug']})\n{b.get('summary') or '(no summary yet)'}"
            for b in branch_summaries
        )

        prompt = f"""Decision node:
{decision_text}

Project branches and their summaries:
{branches_text}

Which branch slugs likely contain work caused by, validating, or triggering this decision?
Return ONLY a JSON array of slug strings. Example: ["ocr", "train"]
Be selective — only include branches with genuine causal connections to this decision."""

        try:
            result = self._call_json(prompt)
            return result if isinstance(result, list) else [b['slug'] for b in branch_summaries]
        except Exception as e:
            logger.error('scout_decision_branches failed: %s', e)
            return [b['slug'] for b in branch_summaries]

    def link_decision_to_nodes(self, project, decision_node, nodes_by_branch):
        """Pass 2: find exact node IDs causally linked to a decision."""
        if not self.enabled:
            return []

        meta = decision_node.get('metadata') or {}
        decision_id = decision_node['id']
        decision_text = f"[{decision_node['created_at'][:10]}] {meta.get('title') or decision_node['content']}"
        if meta.get('rationale'):
            decision_text += f"\nRationale: {meta['rationale']}"

        branches_text = '\n\n'.join(
            f"Branch: {slug}\n" + '\n'.join(
                f"  Node {n['id']}: [{n['created_at'][:10]}] ({n['type']}) "
                f"{(n.get('metadata') or {}).get('title') or n['content']}"
                for n in nodes
            )
            for slug, nodes in nodes_by_branch.items() if nodes
        )

        if not branches_text.strip():
            return []

        prompt = f"""Decision (id={decision_id}):
{decision_text}

Nodes across branches that may relate to this decision:
{branches_text}

For each node causally linked to this decision return a JSON entry:
- "implements": node directly implements the decision (a commit or experiment that follows from it)
- "validates": node tests or confirms the decision was correct (experiment result)
- "triggered_by": this node caused or prompted the decision (a meeting, result, or problem note)
- "supersedes": this decision overrides a previous decision node

Rules:
- from_id is ALWAYS {decision_id} (the decision node)
- Only include nodes with clear causal relationships — skip coincidental similarity
- Do not link the decision to itself

Return ONLY a JSON array:
[{{"from_id": {decision_id}, "to_id": NODE_ID, "rel": "implements"}}, ...]
Return [] if no clear causal links exist."""

        try:
            result = self._call_json(prompt)
            valid_ids = {n['id'] for nodes in nodes_by_branch.values() for n in nodes}
            valid_ids.add(decision_id)
            # Normalize: AI sometimes uses source/target instead of from_id/to_id
            normalized = []
            for item in (result or []):
                if not isinstance(item, dict):
                    continue
                fid = item.get('from_id') or item.get('source') or item.get('from')
                tid = item.get('to_id')   or item.get('target') or item.get('to')
                rel = item.get('rel') or item.get('relationship') or item.get('type')
                if fid is not None and tid is not None:
                    normalized.append({'from_id': int(fid), 'to_id': int(tid), 'rel': rel or 'implements'})
            return [
                l for l in normalized
                if l['from_id'] == decision_id
                and l['to_id'] in valid_ids
                and l['to_id'] != decision_id
                and l['rel'] in ('implements', 'validates', 'triggered_by', 'supersedes')
            ]
        except Exception as e:
            logger.error('link_decision_to_nodes failed: %s', e)
            return []

    def describe_link(self, project, decision_node, linked_node, rel):
        """Generate one sentence explaining why two nodes are causally linked."""
        if not self.enabled:
            return self._mock_describe_link(rel)

        proj_name = (project or {}).get('name', 'this project')
        dmeta = decision_node.get('metadata') or {}
        lmeta = linked_node.get('metadata') or {}
        d_title = dmeta.get('title') or decision_node.get('content', '')
        d_rationale = dmeta.get('rationale', '')
        l_title = lmeta.get('title') or linked_node.get('content', '')
        l_type = linked_node.get('type', 'note')

        prompt = f"""Project: {proj_name}

Decision: "{d_title}"
{('Rationale: ' + d_rationale) if d_rationale else ''}

Linked node (type={l_type}): "{l_title}"
Relationship: {rel}

In one concise sentence (under 30 words), explain the specific causal connection that "{rel.replace('_', ' ')}" describes between these two nodes.
Return only the sentence. No quotes, no preamble."""

        try:
            return self._call(prompt).strip()
        except Exception as e:
            logger.error('describe_link failed: %s', e)
            return self._mock_describe_link(rel)

    def _mock_describe_link(self, rel):
        return {
            'implements': 'This commit directly implements the architectural choice recorded in the decision.',
            'validates': 'This experiment result confirms that the decision approach was correct.',
            'triggered_by': 'This meeting or finding surfaced the problem that prompted the decision.',
            'supersedes': 'This decision overrides an earlier choice that is no longer valid.',
        }.get(rel, 'These two nodes share a documented causal relationship.')

    def generate_weekly_digest(self, project, user, branch_nodes):
        """Generate a weekly digest for one employee across their branches."""
        if not self.enabled:
            return self._mock_weekly_digest(branch_nodes)

        proj_ctx = (project or {}).get('context_doc', '')
        entries_by_branch = '\n\n'.join(
            f"Branch: {bn['branch_name']}\n" + '\n'.join(
                f"  - [{n['created_at'][:10]}] ({n['type']}) "
                f"{(n.get('metadata') or {}).get('title') or n['content']}"
                for n in bn['nodes']
            )
            for bn in branch_nodes
        )

        prompt = f"""Project: {proj_ctx}

Generate a weekly work digest for {user['name']} (week ending today).
Write in first person. Be concise and factual.

Entries this week:
{entries_by_branch or '(none)'}

Return ONLY a JSON object (no markdown, no explanation):
{{
  "week": "Week of [current week start date]",
  "sections": [
    {{"h": "What I worked on", "items": ["..."]}},
    {{"h": "Key decisions made", "items": ["..."]}},
    {{"h": "References used", "items": ["..."]}},
    {{"h": "Dead ends", "items": ["..."]}},
    {{"h": "Still in progress", "items": ["..."]}}
  ]
}}"""

        try:
            return self._call_json(prompt)
        except Exception as e:
            logger.error('generate_weekly_digest failed: %s', e)
            return self._mock_weekly_digest(branch_nodes)

    def _mock_weekly_digest(self, branch_nodes):
        items = []
        for bn in branch_nodes:
            for n in bn['nodes'][:2]:
                title = (n.get('metadata') or {}).get('title') or n['content']
                items.append(f"{title} (in {bn['branch_name']})")
        return {
            'week': 'This week',
            'sections': [
                {'h': 'What I worked on',    'items': items or ['No entries this week.']},
                {'h': 'Key decisions made',  'items': ['—']},
                {'h': 'References used',     'items': ['—']},
                {'h': 'Dead ends',           'items': ['—']},
                {'h': 'Still in progress',   'items': ['—']},
            ],
        }

    def generate_handover(self, project, user, branch_data):
        """Generate structured handover sections for each branch."""
        if not self.enabled:
            return None

        proj_ctx = (project or {}).get('context_doc', '')
        branches_text = ''
        for bd in branch_data:
            b = bd['branch']
            node_lines = '\n'.join(
                f"  [{n['created_at'][:10]}] ({n['type']}) "
                f"{(n.get('metadata') or {}).get('title') or n['content']}"
                f"{' — note: ' + (n.get('metadata') or {})['note'] if (n.get('metadata') or {}).get('note') else ''}"
                f"{' hash:' + (n.get('metadata') or {})['hash'] if (n.get('metadata') or {}).get('hash') else ''}"
                for n in bd['nodes']
            )
            task_lines = '\n'.join(
                f"  [{t.get('assignment_status') or 'pending'}] {t['content']}"
                f" (due {(t.get('metadata') or {}).get('due', 'N/A')})"
                for t in bd['tasks']
            )
            branches_text += f"""
Branch: {b['name']} (slug: {b['slug']})
Context: {b.get('context_doc', '')}
Summary: {b.get('running_summary', '')}
Entries:
{node_lines or '  (none)'}
Tasks:
{task_lines or '  (none)'}
"""

        prompt = f"""Project: {proj_ctx}

Generate a comprehensive handover document for {user['name']} who is departing.
For each branch synthesize: key decisions (with commit hashes), references used,
dead ends and why, what is still in progress, and open/overdue tasks.

{branches_text}

Return ONLY a JSON array (no markdown, no explanation), one object per branch:
[
  {{
    "branch_slug": "ocr",
    "decisions":   [{{"note": "...", "hash": "commit hash or null"}}],
    "refs":        [{{"refKind": "Paper|Repo|Article|Docs", "title": "..."}}],
    "dead_ends":   [{{"note": "..."}}],
    "in_progress": [{{"note": "..."}}],
    "open_tasks":  [{{"id": 0, "label": "...", "state": "active|overdue"}}]
  }}
]"""

        try:
            return self._call_json(prompt)
        except Exception as e:
            logger.error('generate_handover failed: %s', e)
            return None
