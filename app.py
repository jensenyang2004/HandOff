import os
import json
import hmac
import hashlib
import time
import logging
import threading
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash

from models import db, Project, User, Branch, Node, Contact, NodeLink, InboxSuggestion, SlackMessage
from ai_service import AIService

load_dotenv()


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')


def create_app():
    app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='/static')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', f'sqlite:///{os.path.join(BASE_DIR, "handoff.db")}')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    CORS(app)
    db.init_app(app)

    ai = AIService()

    with app.app_context():
        db.create_all()
        # Migrate: add columns introduced after initial schema
        from sqlalchemy import text, inspect as sa_inspect
        inspector = sa_inspect(db.engine)
        existing = [c['name'] for c in inspector.get_columns('branch')]
        existing_proj = [c['name'] for c in inspector.get_columns('project')]
        existing_nl = [c['name'] for c in inspector.get_columns('node_link')]
        existing_user = [c['name'] for c in inspector.get_columns('user')]
        with db.engine.connect() as conn:
            if 'status' not in existing_nl:
                conn.execute(text("ALTER TABLE node_link ADD COLUMN status VARCHAR(20) DEFAULT 'confirmed'"))
            if 'description' not in existing_nl:
                conn.execute(text("ALTER TABLE node_link ADD COLUMN description TEXT DEFAULT ''"))
            if 'ai_context' not in existing:
                conn.execute(text("ALTER TABLE branch ADD COLUMN ai_context TEXT DEFAULT ''"))
            if 'ai_context_updated_at' not in existing:
                conn.execute(text("ALTER TABLE branch ADD COLUMN ai_context_updated_at DATETIME"))
            if 'nodes_since_context_sync' not in existing:
                conn.execute(text("ALTER TABLE branch ADD COLUMN nodes_since_context_sync INTEGER DEFAULT 0"))
            if 'nodes_since_last_link' not in existing_proj:
                conn.execute(text("ALTER TABLE project ADD COLUMN nodes_since_last_link INTEGER DEFAULT 0"))
            if 'last_linked_at' not in existing_proj:
                conn.execute(text("ALTER TABLE project ADD COLUMN last_linked_at DATETIME"))
            if 'password_hash' not in existing_user:
                conn.execute(text("ALTER TABLE user ADD COLUMN password_hash VARCHAR(256)"))
            if 'slack_username' not in existing_user:
                conn.execute(text("ALTER TABLE user ADD COLUMN slack_username VARCHAR(100) DEFAULT ''"))
            conn.commit()
        from seed import seed_if_empty, seed_inbox_if_empty
        seed_if_empty()
        seed_inbox_if_empty()

    # ── Frontend ────────────────────────────────────────────────────────────
    @app.route('/')
    def index():
        return send_from_directory(FRONTEND_DIR, 'index.html')

    # ── Project ─────────────────────────────────────────────────────────────
    @app.route('/api/project')
    def get_project():
        p = Project.query.first()
        if not p:
            return jsonify({'error': 'No project found'}), 404
        return jsonify(p.to_dict())

    @app.route('/api/project', methods=['PATCH'])
    def update_project():
        p = Project.query.first()
        if not p:
            return jsonify({'error': 'No project found'}), 404
        data = request.get_json()
        if 'context_doc' in data:
            p.context_doc = data['context_doc']
        db.session.commit()
        return jsonify(p.to_dict())

    # ── Auth ─────────────────────────────────────────────────────────────────
    @app.route('/api/auth/register', methods=['POST'])
    def register():
        data = request.get_json() or {}
        name = (data.get('name') or '').strip()
        email = (data.get('email') or '').strip().lower()
        password = data.get('password') or ''
        github_handle = (data.get('github_handle') or '').strip()
        slack_username = (data.get('slack_username') or '').strip()

        if not name or not email or not password:
            return jsonify({'error': 'name, email, and password are required'}), 400
        if len(password) < 6:
            return jsonify({'error': 'password must be at least 6 characters'}), 400
        if User.query.filter_by(email=email).first():
            return jsonify({'error': 'email already registered'}), 409

        # Generate a stable id and display helpers from the name
        base_id = email.split('@')[0].lower().replace('.', '-')[:30]
        user_id = base_id
        suffix = 1
        while User.query.get(user_id):
            user_id = f'{base_id}-{suffix}'
            suffix += 1

        words = name.split()
        initials = (words[0][0] + words[-1][0]).upper() if len(words) >= 2 else words[0][:2].upper()
        colors = ['#7F77DD', '#1D9E75', '#EF9F27', '#378ADD', '#E05C5C', '#5CB8E0']
        color = colors[User.query.count() % len(colors)]

        user = User(
            id=user_id,
            name=name,
            email=email,
            password_hash=generate_password_hash(password),
            github_handle=github_handle,
            slack_username=slack_username,
            color=color,
            initials=initials,
            role='employee',
        )
        db.session.add(user)
        db.session.commit()
        return jsonify(user.to_dict()), 201

    @app.route('/api/auth/login', methods=['POST'])
    def login():
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        password = data.get('password') or ''

        if not email or not password:
            return jsonify({'error': 'email and password are required'}), 400

        user = User.query.filter_by(email=email).first()
        if not user or not user.password_hash:
            return jsonify({'error': 'invalid credentials'}), 401
        if not check_password_hash(user.password_hash, password):
            return jsonify({'error': 'invalid credentials'}), 401

        return jsonify(user.to_dict())

    # ── Users ────────────────────────────────────────────────────────────────
    @app.route('/api/users')
    def get_users():
        users = User.query.all()
        return jsonify([u.to_dict() for u in users])

    # ── Branches ─────────────────────────────────────────────────────────────
    @app.route('/api/branches')
    def get_branches():
        branches = Branch.query.filter_by(archived_at=None).order_by(Branch.id).all()
        return jsonify([b.to_dict() for b in branches])

    @app.route('/api/branches', methods=['POST'])
    def create_branch():
        data = request.get_json()
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': 'name is required'}), 400
        slug = name.lower().replace(' ', '-').replace('/', '-')[:40]
        # ensure unique slug
        existing = Branch.query.filter_by(slug=slug).first()
        if existing:
            slug = f"{slug}-{Branch.query.count()}"
        b = Branch(
            name=name,
            slug=slug,
            parent_branch_id=data.get('parent_branch_id'),
            created_by=data.get('created_by', 'jensen'),
            context_doc=data.get('context_doc', ''),
        )
        db.session.add(b)
        db.session.commit()
        return jsonify(b.to_dict()), 201

    @app.route('/api/branches/<int:branch_id>', methods=['PATCH'])
    def update_branch(branch_id):
        b = Branch.query.get_or_404(branch_id)
        data = request.get_json()
        if 'context_doc' in data:
            b.context_doc = data['context_doc']
        if 'running_summary' in data:
            b.running_summary = data['running_summary']
            b.running_summary_updated_at = datetime.utcnow()
        if 'ai_context' in data:
            b.ai_context = data['ai_context']
            b.ai_context_updated_at = datetime.utcnow()
            b.nodes_since_context_sync = 0
        db.session.commit()
        return jsonify(b.to_dict())

    # ── Nodes ─────────────────────────────────────────────────────────────────
    @app.route('/api/nodes')
    def get_nodes():
        q = Node.query
        branch_id = request.args.get('branch_id', type=int)
        if branch_id:
            q = q.filter_by(branch_id=branch_id)
        user_id = request.args.get('user_id')
        if user_id:
            q = q.filter(
                (Node.created_by == user_id) | (Node.assigned_to == user_id)
            )
        nodes = q.order_by(Node.created_at).all()
        return jsonify([n.to_dict() for n in nodes])

    @app.route('/api/nodes', methods=['POST'])
    def create_node():
        data = request.get_json()
        branch_id = data.get('branch_id')
        if not branch_id:
            return jsonify({'error': 'branch_id is required'}), 400
        b = Branch.query.get_or_404(branch_id)

        node_type = data.get('type', 'note')
        meta = data.get('metadata', {})
        # Derive content from metadata title or raw content
        content = data.get('content') or meta.get('title') or 'Untitled'

        n = Node(
            branch_id=branch_id,
            created_by=data.get('created_by', 'jensen'),
            type=node_type,
            content=content,
            assigned_to=data.get('assigned_to'),
            assignment_status=data.get('assignment_status'),
            is_ai_generated=data.get('is_ai_generated', False),
        )
        n.meta = meta
        db.session.add(n)

        # Increment staleness counters (summary update is manual via Re-sync in Context tab)
        b.nodes_since_context_sync += 1
        b.node_count_since_last_summary += 1
        project = Project.query.first()
        if project:
            project.nodes_since_last_link = (project.nodes_since_last_link or 0) + 1

        db.session.commit()

        return jsonify({**n.to_dict(), 'context_updating': False}), 201

    @app.route('/api/nodes/<int:node_id>', methods=['PATCH'])
    def update_node(node_id):
        n = Node.query.get_or_404(node_id)
        data = request.get_json()
        if 'assignment_status' in data:
            n.assignment_status = data['assignment_status']
        if 'content' in data:
            n.content = data['content']
        if 'metadata' in data:
            n.meta = data['metadata']
        db.session.commit()
        return jsonify(n.to_dict())

    # ── Node links ────────────────────────────────────────────────────────────
    @app.route('/api/links')
    def get_links():
        links = NodeLink.query.all()
        return jsonify([l.to_dict() for l in links])

    @app.route('/api/links', methods=['POST'])
    def create_link():
        data = request.get_json()
        nl = NodeLink(
            from_id=data['from_id'],
            to_id=data['to_id'],
            rel=data.get('rel', 'implements'),
            is_ai=False,
        )
        db.session.add(nl)
        db.session.commit()
        return jsonify(nl.to_dict()), 201

    @app.route('/api/links/<int:link_id>', methods=['DELETE'])
    def delete_link(link_id):
        nl = NodeLink.query.get_or_404(link_id)
        db.session.delete(nl)
        db.session.commit()
        return jsonify({'ok': True})

    @app.route('/api/links/<int:link_id>/confirm', methods=['POST'])
    def confirm_link(link_id):
        nl = NodeLink.query.get_or_404(link_id)
        nl.status = 'confirmed'
        db.session.commit()
        return jsonify(nl.to_dict())

    @app.route('/api/links/<int:link_id>/reject', methods=['POST'])
    def reject_link(link_id):
        nl = NodeLink.query.get_or_404(link_id)
        db.session.delete(nl)
        db.session.commit()
        return jsonify({'ok': True})

    @app.route('/api/ai/describe-link/<int:link_id>', methods=['POST'])
    def describe_link_endpoint(link_id):
        nl = NodeLink.query.get_or_404(link_id)
        if nl.description:
            return jsonify({'description': nl.description})
        from_node = db.session.get(Node, nl.from_id)
        to_node = db.session.get(Node, nl.to_id)
        if not from_node or not to_node:
            return jsonify({'description': None})
        project = Project.query.first()
        description = ai.describe_link(
            project.to_dict() if project else {},
            from_node.to_dict(),
            to_node.to_dict(),
            nl.rel,
        )
        if description:
            nl.description = description
            db.session.commit()
        return jsonify({'description': description})

    @app.route('/api/ai/link-decisions', methods=['POST'])
    def link_all_decisions():
        """Trigger AI linking for every decision node across all branches."""
        decisions = Node.query.filter_by(type='decision').all()
        project = Project.query.first()
        if project:
            project.nodes_since_last_link = 0
            project.last_linked_at = datetime.utcnow()
            db.session.commit()
        for n in decisions:
            _trigger_decision_links(app, ai, n.id)
        return jsonify({'ok': True, 'count': len(decisions),
                        'status': f'linking started for {len(decisions)} decision(s)'})

    @app.route('/api/ai/link-decisions/<int:node_id>', methods=['POST'])
    def relink_decision(node_id):
        n = Node.query.get_or_404(node_id)
        if n.type != 'decision':
            return jsonify({'error': 'not a decision node'}), 400
        _trigger_decision_links(app, ai, n.id)
        return jsonify({'ok': True, 'status': 'linking started'})

    # ── Contacts ──────────────────────────────────────────────────────────────
    @app.route('/api/contacts')
    def get_contacts():
        p = Project.query.first()
        if not p:
            return jsonify([])
        contacts = Contact.query.filter_by(project_id=p.id).order_by(Contact.name).all()
        return jsonify([c.to_dict() for c in contacts])

    @app.route('/api/contacts', methods=['POST'])
    def create_contact():
        data = request.get_json()
        p = Project.query.first()
        if not p:
            return jsonify({'error': 'No project'}), 400
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': 'name is required'}), 400
        c = Contact(
            project_id=p.id,
            name=name,
            company=data.get('company', '').strip(),
            role=data.get('role', '').strip(),
            email=data.get('email', '').strip(),
            notes=data.get('notes', '').strip(),
        )
        db.session.add(c)
        db.session.commit()
        return jsonify(c.to_dict()), 201

    @app.route('/api/contacts/<int:contact_id>', methods=['PATCH'])
    def update_contact(contact_id):
        c = Contact.query.get_or_404(contact_id)
        data = request.get_json()
        for field in ['name', 'company', 'role', 'email', 'notes']:
            if field in data:
                setattr(c, field, data[field].strip() if data[field] else '')
        db.session.commit()
        return jsonify(c.to_dict())

    @app.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
    def delete_contact(contact_id):
        c = Contact.query.get_or_404(contact_id)
        db.session.delete(c)
        db.session.commit()
        return jsonify({'ok': True})

    # ── Inbox suggestions ─────────────────────────────────────────────────────
    @app.route('/api/inbox')
    def get_inbox():
        items = InboxSuggestion.query.filter_by(dismissed=False).order_by(InboxSuggestion.created_at).all()
        return jsonify([i.to_dict() for i in items])

    @app.route('/api/inbox/<int:item_id>/dismiss', methods=['POST'])
    def dismiss_inbox(item_id):
        item = InboxSuggestion.query.get_or_404(item_id)
        item.dismissed = True
        db.session.commit()
        return jsonify({'ok': True})

    # ── Webhooks ──────────────────────────────────────────────────────────────
    @app.route('/api/webhook/github', methods=['POST'])
    def webhook_github():
        payload = request.get_json(silent=True) or {}
        if not payload.get('ref') or not payload.get('head_commit') or not payload.get('pusher'):
            return jsonify({'error': 'ref, head_commit, and pusher are required'}), 400

        head = payload['head_commit']
        sha = head.get('id', '')
        message = head.get('message', '')
        first_line = message.splitlines()[0] if message else ''

        # user may be None if no match — still create the suggestion
        User.query.filter_by(github_handle=payload['pusher'].get('name', '')).first()

        suggestion = InboxSuggestion(
            source='git',
            title=f"[{sha[:7]}] {first_line}"[:200],
            raw_text=message,
            nodes_json='[]',
            branch_slug='',
        )
        db.session.add(suggestion)
        db.session.commit()
        return jsonify({'ok': True, 'id': suggestion.id}), 201

    def _verify_slack_signature(req):
        """Slack request signing (https://api.slack.com/authentication/verifying-requests-from-slack).
        Skipped when SLACK_SIGNING_SECRET is not configured (local dev / curl testing)."""
        secret = os.environ.get('SLACK_SIGNING_SECRET')
        if not secret:
            return True
        ts = req.headers.get('X-Slack-Request-Timestamp', '')
        sig = req.headers.get('X-Slack-Signature', '')
        if not ts or not sig:
            return False
        try:
            if abs(time.time() - float(ts)) > 60 * 5:
                return False  # replay protection
        except ValueError:
            return False
        base = f'v0:{ts}:'.encode() + req.get_data()
        expected = 'v0=' + hmac.new(secret.encode(), base, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, sig)

    def _store_slack_message(channel, slack_user, text, ts, display_name=None):
        user = User.query.filter_by(slack_username=slack_user).first()
        m = SlackMessage(
            channel=channel,
            user_id=user.id if user else None,
            display_name=user.name if user else (display_name or slack_user),
            text=text,
            ts=ts,
        )
        db.session.add(m)
        db.session.commit()
        return m

    @app.route('/api/webhook/slack', methods=['POST'])
    def webhook_slack():
        if not _verify_slack_signature(request):
            return jsonify({'error': 'invalid slack signature'}), 401
        payload = request.get_json(silent=True) or {}

        # Slack Events API: URL verification handshake
        if payload.get('type') == 'url_verification':
            return jsonify({'challenge': payload.get('challenge', '')})

        # Slack Events API: message event callback
        if payload.get('type') == 'event_callback':
            event = payload.get('event') or {}
            # skip non-messages, edits/joins (subtype) and bot echoes to avoid loops
            if event.get('type') != 'message' or event.get('subtype') or event.get('bot_id'):
                return jsonify({'ok': True, 'ignored': True})
            channel = event.get('channel', '')
            slack_user = event.get('user', '')
            text = (event.get('text') or '').strip()
            if not channel or not slack_user or not text:
                return jsonify({'ok': True, 'ignored': True})
            ts = datetime.utcnow()
            try:
                ts = datetime.utcfromtimestamp(float(event.get('ts')))
            except (TypeError, ValueError):
                pass
            m = _store_slack_message(channel, slack_user, text, ts)
            return jsonify({'ok': True, 'id': m.id}), 201

        # Simplified custom schema (docs/slack-webhook-spec.md)
        channel = (payload.get('channel') or '').strip()
        slack_user = (payload.get('user') or '').strip()
        text = (payload.get('text') or '').strip()
        if not channel or not slack_user or not text:
            return jsonify({'error': 'channel, user, and text are required'}), 400

        ts = datetime.utcnow()
        if payload.get('ts'):
            try:
                ts = datetime.fromisoformat(payload['ts'])
            except (ValueError, TypeError):
                pass

        m = _store_slack_message(channel, slack_user, text, ts,
                                 display_name=payload.get('display_name'))
        return jsonify({'ok': True, 'id': m.id}), 201

    @app.route('/api/inbox/slack/pending')
    def slack_pending():
        rows = (db.session.query(SlackMessage.channel, db.func.count(SlackMessage.id))
                .filter(SlackMessage.processed == False)
                .group_by(SlackMessage.channel)
                .all())
        return jsonify([{'channel': c, 'count': n} for c, n in rows])

    @app.route('/api/inbox/slack/interpret', methods=['POST'])
    def interpret_slack():
        data = request.get_json(silent=True) or {}
        channel = data.get('channel', '')
        branch = Branch.query.filter_by(slug=data.get('branch_slug', '')).first_or_404()

        messages = (SlackMessage.query
                    .filter_by(channel=channel, processed=False)
                    .order_by(SlackMessage.ts)
                    .all())
        if not messages:
            return jsonify({'error': 'no pending messages for this channel'}), 400

        def fmt_time(dt):
            return dt.strftime('%I:%M %p').lstrip('0')

        # Format must match the parseSlackMessages regex in personal-log.jsx
        raw_text = '\n'.join(
            f"{m.display_name} [{fmt_time(m.ts)}]: {m.text}"
            for m in messages
        )

        project = Project.query.first()
        nodes = ai.parse_log(project.to_dict() if project else {}, branch.to_dict(), raw_text)

        suggestion = InboxSuggestion(
            source='slack',
            title=f"#{channel} · {len(messages)} messages",
            raw_text=raw_text,
            nodes_json=json.dumps(nodes),
            branch_slug=branch.slug,
        )
        db.session.add(suggestion)
        for m in messages:
            m.processed = True
        db.session.commit()
        return jsonify({'ok': True, 'id': suggestion.id}), 201

    # ── Activity feed ─────────────────────────────────────────────────────────
    @app.route('/api/activity')
    def get_activity():
        limit = request.args.get('limit', 20, type=int)
        nodes = Node.query.order_by(Node.created_at.desc()).limit(limit).all()
        result = []
        for n in nodes:
            d = n.to_dict()
            branch = db.session.get(Branch, n.branch_id)
            user = db.session.get(User, n.created_by)
            d['branch_name'] = branch.name if branch else '?'
            d['branch_slug'] = branch.slug if branch else str(n.branch_id)
            d['user_name'] = user.name if user else '?'
            d['user_color'] = user.color if user else '#7F77DD'
            d['user_initials'] = user.initials if user else '?'
            result.append(d)
        return jsonify(result)

    # ── AI endpoints ──────────────────────────────────────────────────────────
    @app.route('/api/ai/sync-context/<int:branch_id>', methods=['POST'])
    def sync_context(branch_id):
        b = Branch.query.get_or_404(branch_id)
        project = Project.query.first()
        nodes = [n.to_dict() for n in b.nodes if n.type != 'task']
        result = ai.sync_context(
            project.to_dict() if project else {},
            b.to_dict(),
            nodes,
        )
        b.ai_context = result
        b.ai_context_updated_at = datetime.utcnow()
        b.nodes_since_context_sync = 0
        db.session.commit()
        return jsonify(b.to_dict())

    @app.route('/api/ai/parse-log', methods=['POST'])
    def parse_log():
        data = request.get_json()
        branch_id = data.get('branch_id')
        text = data.get('text', '')
        if not text.strip():
            return jsonify([])
        b = Branch.query.get_or_404(branch_id)
        project = Project.query.first()
        parsed = ai.parse_log(
            project.to_dict() if project else {},
            b.to_dict(),
            text,
        )
        return jsonify(parsed)

    @app.route('/api/ai/weekly-digest', methods=['POST'])
    def weekly_digest():
        data = request.get_json()
        user_id = data.get('user_id', 'jensen')
        user = User.query.get_or_404(user_id)
        project = Project.query.first()

        # Nodes from past 7 days for this user
        since = datetime.utcnow() - timedelta(days=7)
        nodes = (Node.query
                 .filter(Node.created_by == user_id)
                 .filter(Node.created_at >= since)
                 .filter(Node.type != 'task')
                 .order_by(Node.created_at)
                 .all())

        # Group by branch
        branch_map = {}
        for n in nodes:
            branch_map.setdefault(n.branch_id, []).append(n.to_dict())

        branch_nodes = []
        for bid, ns in branch_map.items():
            b = Branch.query.get(bid)
            if b:
                branch_nodes.append({'branch_name': b.name, 'nodes': ns})

        result = ai.generate_weekly_digest(
            project.to_dict() if project else {},
            user.to_dict(),
            branch_nodes,
        )
        return jsonify(result)

    @app.route('/api/ai/handover', methods=['POST'])
    def handover():
        data = request.get_json()
        user_id = data.get('user_id', 'jensen')
        user = User.query.get_or_404(user_id)
        project = Project.query.first()
        branches = Branch.query.filter_by(archived_at=None).order_by(Branch.id).all()

        branch_data = []
        for b in branches:
            entry_nodes = [n.to_dict() for n in b.nodes if n.type != 'task']
            task_nodes = [n.to_dict() for n in b.nodes if n.type == 'task']
            branch_data.append({
                'branch': b.to_dict(),
                'nodes': entry_nodes,
                'tasks': task_nodes,
            })

        ai_result = ai.generate_handover(
            project.to_dict() if project else {},
            user.to_dict(),
            branch_data,
        )

        # Return either AI result or raw branch data for client-side heuristics
        if ai_result:
            return jsonify({'source': 'ai', 'sections': ai_result})
        else:
            return jsonify({'source': 'heuristic', 'branch_data': branch_data})

    return app


def _trigger_decision_links(app, ai, decision_node_id):
    """Background: scout branches then generate causal links for a decision node."""
    def run():
        with app.app_context():
            n = db.session.get(Node, decision_node_id)
            if not n or n.type != 'decision':
                return
            project = Project.query.first()
            branches = Branch.query.filter_by(archived_at=None).all()
            proj_dict = project.to_dict() if project else {}
            decision_dict = n.to_dict()

            branch_summaries = [
                {'slug': b.slug, 'name': b.name,
                 'summary': (b.ai_context or b.running_summary or '')[:800]}
                for b in branches
            ]

            # Pass 1: scout which branches to scan in detail
            relevant_slugs = set(
                ai.scout_decision_branches(proj_dict, decision_dict, branch_summaries) or
                [b.slug for b in branches]
            )
            # Always include the decision's own branch
            own_branch = next((b for b in branches if b.id == n.branch_id), None)
            if own_branch:
                relevant_slugs.add(own_branch.slug)

            # Pass 2: link against full node lists from relevant branches
            nodes_by_branch = {
                b.slug: [nd.to_dict() for nd in b.nodes if nd.type != 'task' and nd.id != n.id]
                for b in branches if b.slug in relevant_slugs
            }

            links = ai.link_decision_to_nodes(proj_dict, decision_dict, nodes_by_branch)

            # Replace existing AI links for this decision
            NodeLink.query.filter_by(from_id=n.id, is_ai=True).delete()
            for lnk in (links or []):
                db.session.add(NodeLink(
                    from_id=lnk['from_id'],
                    to_id=lnk['to_id'],
                    rel=lnk.get('rel', 'implements'),
                    is_ai=True,
                    status='pending',
                ))
            db.session.commit()
            logger.info('Decision links for node %d: %d links stored', n.id, len(links or []))

    threading.Thread(target=run, daemon=True).start()


def _trigger_summary_update(app, ai, branch_id):
    """Spawn background thread to update running summary after 5 new nodes."""
    def run():
        with app.app_context():
            b = Branch.query.get(branch_id)
            if not b:
                return
            project = Project.query.first()
            nodes = [n.to_dict() for n in b.nodes if n.type != 'task']
            try:
                summary = ai.update_running_summary(
                    project.to_dict() if project else {},
                    b.to_dict(),
                    nodes,
                )
                b.running_summary = summary
                b.running_summary_updated_at = datetime.utcnow()
            except Exception as e:
                print(f'Summary update failed for branch {branch_id}: {e}')
            finally:
                b.context_updating = False
                db.session.commit()

    t = threading.Thread(target=run, daemon=True)
    t.start()


if __name__ == '__main__':
    application = create_app()
    application.run(debug=True, port=5001, threaded=True)
