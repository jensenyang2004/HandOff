import json
from datetime import datetime
from models import db, Project, User, Branch, Node, Contact, NodeLink, InboxSuggestion


def dt(s):
    return datetime.strptime(s, '%Y-%m-%dT%H:%M:%S')


def seed_if_empty():
    if Project.query.count() > 0:
        return

    # ── Project ────────────────────────────────────────────────────────────
    project = Project(
        name='Receipts OCR',
        context_doc=(
            'Building an end-to-end OCR pipeline for receipt processing. '
            'Target: 90% char-level F1 on the internal receipts dataset by end of Q2 2026. '
            'Three-stage pipeline: detector (CRAFT-based) → recognizer (beam-search) → post-processing. '
            'Team: Jensen Park (ML Engineer, departing Jun 6), Maya Chen (ML Engineer), '
            'Diego Torres (ML Engineer), Priya Rao (Engineering Manager).'
        ),
    )
    db.session.add(project)

    # ── Users ──────────────────────────────────────────────────────────────
    users = [
        User(id='jensen', name='Jensen Park', email='jensen@example.com',
             role='employee', color='#7F77DD', initials='JP', departing=True, last_day='Jun 6'),
        User(id='maya', name='Maya Chen', email='maya@example.com',
             role='employee', color='#1D9E75', initials='MC'),
        User(id='diego', name='Diego Torres', email='diego@example.com',
             role='employee', color='#EF9F27', initials='DT'),
        User(id='priya', name='Priya Rao', email='priya@example.com',
             role='manager', color='#378ADD', initials='PR'),
    ]
    for u in users:
        db.session.add(u)

    # ── Branches ───────────────────────────────────────────────────────────
    ocr = Branch(slug='ocr', name='OCR Pipeline', created_by='jensen',
                 created_at=dt('2026-05-02T09:00:00'),
                 context_doc=(
                     'Three-stage pipeline: detector → recognizer → post-processing. '
                     'Detector based on CRAFT (character region awareness). '
                     'Recognizer uses beam-search decoding. '
                     'Goal: 90% char-F1 on receipts by Q2 close.'
                 ),
                 running_summary=(
                     'The OCR pipeline has progressed significantly. The detector backbone was '
                     'switched from ResNet50 to EfficientNet-B3, yielding 87.2% char-F1 vs 84.1% '
                     'baseline. A test-time augmentation scaffold has been landed but not yet evaluated. '
                     'Crop caching cut epoch time by 22%. Key dead end: batch size 512 causes gradient '
                     'explosion — reverted to 128. Bounding shrink ratio raised from 0.4 to 0.6 to fix '
                     'edge-character dropout; watch for upstream merge conflicts with mmocr.'
                 ),
                 running_summary_updated_at=dt('2026-05-31T14:00:00'))

    data = Branch(slug='data', name='Data Preprocessing', created_by='maya',
                  created_at=dt('2026-05-02T09:00:00'),
                  context_doc=(
                      'Preprocessing pipeline for training data. '
                      'Handles rare-glyph augmentation, DALI-based GPU decode, '
                      'and CJK locale handling. Sources: real receipts + SynthText synthetic.'
                  ),
                  running_summary=(
                      'Synthetic text augmentation added via SynthText, yielding +2.1% on the '
                      'rare-glyph subset. DALI GPU decode removed input pipeline as bottleneck. '
                      'NFKC normalization was disabled for CJK locales after it broke full-width '
                      'punctuation. Label noise (~3%) found in receipts-v2; using v1 splits for now.'
                  ),
                  running_summary_updated_at=dt('2026-05-19T16:00:00'))

    train = Branch(slug='train', name='Model Training', created_by='jensen',
                   created_at=dt('2026-05-02T09:00:00'),
                   context_doc=(
                       'Training configuration for the full detector+recognizer stack. '
                       'Mixed-precision (fp16) training with AMP autocast. '
                       'Cosine LR schedule with 500-step linear warmup.'
                   ),
                   running_summary=(
                       'Mixed-precision training (fp16) cut wall time 38% with no accuracy loss. '
                       'Cosine LR schedule outperforms step decay (86.0% vs 85.2%). '
                       'LR warmup of 500 steps is load-bearing — without it, recognizer loss spikes. '
                       'Weight EMA added by Maya, giving a steady +0.4% on eval. '
                       'Gradient checkpointing enables 2x batch size on A100.'
                   ),
                   running_summary_updated_at=dt('2026-05-27T17:00:00'))

    deploy = Branch(slug='deploy', name='Deployment Pipeline', created_by='jensen',
                    created_at=dt('2026-05-02T09:00:00'),
                    context_doc=(
                        'CI/CD and serving infrastructure for the OCR model. '
                        'Target: single-replica Triton serving on staging, then production. '
                        'Recognizer not yet wired to serving stack.'
                    ))

    errors = Branch(slug='errors', name='Error Handling Logic', created_by='jensen',
                    created_at=dt('2026-05-02T09:00:00'),
                    context_doc=(
                        'Error handling, fallback logic, and confidence thresholding '
                        'for the OCR pipeline output. Not yet started.'
                    ))

    for b in [ocr, data, train, deploy, errors]:
        db.session.add(b)
    db.session.flush()  # get IDs

    # ── Nodes (entries) ────────────────────────────────────────────────────
    def node(branch, author, ts, ntype, content, **meta):
        return Node(
            branch_id=branch.id,
            created_by=author,
            created_at=dt(ts),
            type=ntype,
            content=content,
            _metadata=json.dumps(meta),
        )

    # ── OCR Pipeline ───────────────────────
    nodes = [
        node(ocr, 'jensen', '2026-05-03T10:12:00', 'commit',
             'Initial OCR pipeline skeleton',
             hash='7c1e4b0',
             title='Initial OCR pipeline skeleton',
             body='Scaffolds detector → recognizer → post-proc stages with a config registry.',
             note='Baseline architecture in place — three-stage pipeline.'),

        node(ocr, 'jensen', '2026-05-04T09:40:00', 'note',
             'Decision: target 90% accuracy by end of Q2',
             title='Decision: target 90% accuracy by end of Q2',
             body='Agreed with Priya. Accuracy measured as char-level F1 on the internal receipts set.',
             note='Goal locked: 90% char-F1 on receipts by Q2 close.'),

        node(ocr, 'jensen', '2026-05-06T14:05:00', 'link',
             'CRAFT: Character Region Awareness for Text Detection',
             refKind='Paper',
             title='CRAFT: Character Region Awareness for Text Detection',
             body='Baek et al., 2019. Region + affinity maps for detecting individual characters; '
                  'basis for our detector head.',
             note='Detector design follows CRAFT region/affinity maps.'),

        node(ocr, 'jensen', '2026-05-08T11:20:00', 'link',
             'open-mmlab/mmocr',
             refKind='Repo',
             title='open-mmlab/mmocr',
             body='Reference implementation we vendored the data loaders and eval harness from.',
             note='Vendored loaders + eval harness from mmocr.'),

        node(ocr, 'jensen', '2026-05-11T10:00:00', 'link',
             'EfficientNet — timm model card',
             refKind='Docs',
             title='EfficientNet — timm model card',
             body='Config reference for the B3 variant + pretrained weights we initialize from.',
             note='Init from timm B3 pretrained weights.'),

        node(ocr, 'jensen', '2026-05-15T16:30:00', 'note',
             'Batch size 512 caused gradient explosion — reverted to 128',
             title='Batch size 512 caused gradient explosion — reverted to 128',
             body='Loss went NaN within 40 steps at bs=512 even with grad clipping. '
                  '128 is stable. Worth revisiting with LAMB.',
             note='Dead end: bs=512 → NaN. Reverted to 128.'),

        node(ocr, 'jensen', '2026-05-20T13:15:00', 'note',
             'Bounding shrink ratio 0.4 caused edge character dropout — changed to 0.6',
             title='Bounding shrink ratio 0.4 caused edge character dropout — changed to 0.6',
             body='Characters at receipt edges were being clipped. Shrink 0.6 recovers them. '
                  'NOTE: upstream mmocr default is 0.4 — merge conflict risk if we pull.',
             note='Shrink ratio 0.4 → 0.6 to fix edge dropout. Watch upstream merges.'),

        node(ocr, 'jensen', '2026-05-24T09:05:00', 'commit',
             'Cache detector crops to disk',
             hash='5f0aa31',
             title='Cache detector crops to disk',
             body='Recognizer stage was recomputing crops every epoch — caching cut epoch time 22%.',
             note='Crop caching: -22% epoch time.'),

        node(ocr, 'jensen', '2026-05-28T18:42:00', 'commit',
             'Switch ResNet50 → EfficientNet backbone',
             hash='a3f9c2d',
             title='Switch ResNet50 → EfficientNet backbone',
             body='Replaces the detector backbone. EfficientNet-B3 is more stable on the '
                  'edge-case set and ~20% lighter.',
             note='Backbone swap: ResNet50 → EfficientNet-B3.'),

        node(ocr, 'jensen', '2026-05-28T21:10:00', 'idea',
             'EfficientNet-B3 — 87.2% char-F1, stable on edge cases',
             metric='87.2% char-F1',
             title='EfficientNet-B3 — 87.2% char-F1, stable on edge cases',
             body='Up from 84.1% (ResNet50). Edge-case subset jumped 84.1 → 87.2. '
                  'No instability across 3 seeds.',
             note='EfficientNet-B3 hits 87.2% — +3.1 over baseline.'),

        node(ocr, 'jensen', '2026-05-30T15:25:00', 'commit',
             'Add test-time augmentation scaffold (WIP)',
             hash='d81b6fa',
             title='Add test-time augmentation scaffold (WIP)',
             body='Multi-scale + horizontal flip TTA hooks. Wired but not yet benchmarked.',
             note='TTA scaffold landed — not evaluated yet.'),

        node(ocr, 'jensen', '2026-05-31T12:00:00', 'idea',
             'TTA not yet evaluated — placeholder run',
             metric='pending',
             title='TTA not yet evaluated — placeholder run',
             body='Single smoke run completed; full sweep across scales still owed.',
             note='TTA: still in progress.'),

        # ── Data Preprocessing ─────────────
        node(data, 'maya', '2026-05-09T11:00:00', 'link',
             'SynthText dataset',
             refKind='Repo',
             title='SynthText dataset',
             body='Synthetic text-in-the-wild generator used to bootstrap rare glyph coverage.',
             note='Using SynthText for rare-glyph augmentation.'),

        node(data, 'maya', '2026-05-10T14:30:00', 'commit',
             'Add synthetic text augmentation',
             hash='b2c7e90',
             title='Add synthetic text augmentation',
             body='Generates ~50k synthetic receipts emphasizing rare glyphs and rotated text.',
             note='Synthetic aug pipeline online.'),

        node(data, 'maya', '2026-05-13T09:30:00', 'link',
             'A survey of data augmentation for OCR',
             refKind='Article',
             title='A survey of data augmentation for OCR',
             body='Used to choose the augmentation mix (perspective, blur, synthetic).',
             note='Aug mix chosen from this survey.'),

        node(data, 'maya', '2026-05-14T16:45:00', 'idea',
             'Synthetic aug +2.1% on rare glyphs',
             metric='+2.1% rare glyphs',
             title='Synthetic aug +2.1% on rare glyphs',
             body='Rare-glyph subset accuracy 71.4 → 73.5. No regression on common set.',
             note='Synthetic aug: +2.1% on rare glyphs.'),

        node(data, 'maya', '2026-05-16T10:20:00', 'note',
             'Dropped NFKC normalization — broke CJK',
             title='Dropped NFKC normalization — broke CJK',
             body='NFKC was collapsing full-width CJK punctuation into ASCII. '
                  'Disabled for CJK locales.',
             note='Dead end: NFKC broke CJK punctuation. Disabled.'),

        node(data, 'maya', '2026-05-18T13:00:00', 'commit',
             'Parallelize image decode with DALI',
             hash='9ad34c1',
             title='Parallelize image decode with DALI',
             body='Moved JPEG decode + resize onto GPU via DALI. '
                  'Input pipeline no longer the bottleneck.',
             note='DALI decode — input pipeline unblocked.'),

        node(data, 'maya', '2026-05-19T15:10:00', 'note',
             'Label noise in receipts-v2 — ~3% mislabeled',
             title='Label noise in receipts-v2 — ~3% mislabeled',
             body='Spot-checked 500 samples. Filed for relabeling; using v1 splits for now.',
             note='receipts-v2 has ~3% label noise.'),

        # ── Model Training ─────────────────
        node(train, 'jensen', '2026-05-11T08:50:00', 'link',
             'Mixed Precision Training (Micikevicius et al.)',
             refKind='Paper',
             title='Mixed Precision Training (Micikevicius et al.)',
             body='Loss-scaling recipe we follow for fp16.',
             note='fp16 loss-scaling follows this paper.'),

        node(train, 'jensen', '2026-05-12T12:15:00', 'commit',
             'Add mixed-precision training',
             hash='c0d9e22',
             title='Add mixed-precision training',
             body='AMP autocast + dynamic loss scaling across detector and recognizer.',
             note='AMP fp16 training enabled.'),

        node(train, 'jensen', '2026-05-12T19:40:00', 'idea',
             'fp16 cut training time 38%, no accuracy loss',
             metric='-38% wall time',
             title='fp16 cut training time 38%, no accuracy loss',
             body='Epoch 14m → 8.7m. Char-F1 within noise of fp32 across 3 seeds.',
             note='fp16: -38% time, no acc loss.'),

        node(train, 'jensen', '2026-05-18T11:05:00', 'note',
             'LR warmup 500 steps stabilizes early training',
             title='LR warmup 500 steps stabilizes early training',
             body='Without warmup, recognizer loss spikes in first epoch. '
                  '500-step linear warmup fixes it.',
             note='500-step LR warmup is load-bearing.'),

        node(train, 'maya', '2026-05-22T17:30:00', 'commit',
             'Add EMA of model weights',
             hash='1e7b8d4',
             title='Add EMA of model weights',
             body='Exponential moving average of weights; eval uses EMA copy. +0.4% steady gain.',
             note='Weight EMA: +0.4% on eval.'),

        node(train, 'jensen', '2026-05-25T10:10:00', 'link',
             'PyTorch — torch.optim.lr_scheduler',
             refKind='Docs',
             title='PyTorch — torch.optim.lr_scheduler',
             body='Reference for the cosine-with-restarts config.',
             note='Scheduler config reference.'),

        node(train, 'jensen', '2026-05-26T14:20:00', 'idea',
             'Cosine schedule beats step decay',
             metric='86.0% char-F1',
             title='Cosine schedule beats step decay',
             body='Cosine annealing 85.2 → 86.0 vs step decay. Adopted as default.',
             note='Cosine LR schedule adopted.'),

        node(train, 'maya', '2026-05-27T16:00:00', 'note',
             'Gradient checkpointing lets us 2x batch on A100',
             title='Gradient checkpointing lets us 2x batch on A100',
             body='~18% slower per step but doubles effective batch — net win for convergence.',
             note='Grad checkpointing → 2x batch.'),

        # ── Deployment Pipeline ─────────────
        node(deploy, 'jensen', '2026-05-09T15:00:00', 'note',
             'Spun up staging Triton server — no load test yet',
             title='Spun up staging Triton server — no load test yet',
             body='Single-replica Triton on staging serving the B3 detector. '
                  'No load testing, no autoscaling, no recognizer wired.',
             note='Staging Triton up — untested, recognizer not wired.'),
    ]

    for n in nodes:
        db.session.add(n)
    db.session.flush()  # assign IDs so we can reference them in NodeLinks

    # ── Look up key nodes for decision linking ─────────────────────────────
    def _find(branch, ntype, keyword):
        for n in nodes:
            if n.branch_id == branch.id and n.type == ntype and keyword.lower() in n.content.lower():
                return n
        return None

    commit_backbone  = _find(ocr,   'commit', 'EfficientNet')       # a3f9c2d
    idea_backbone    = _find(ocr,   'idea',   'EfficientNet-B3')    # 87.2%
    idea_tta         = _find(ocr,   'idea',   'TTA not yet')        # pending
    commit_fp16      = _find(train, 'commit', 'mixed-precision')    # c0d9e22
    idea_fp16        = _find(train, 'idea',   'fp16 cut')           # -38%
    idea_cosine      = _find(train, 'idea',   'Cosine schedule')    # 86.0%
    note_nfkc        = _find(data,  'note',   'NFKC')              # dropped NFKC
    commit_synthtext = _find(data,  'commit', 'synthetic text')     # b2c7e90
    idea_synthtext   = _find(data,  'idea',   'Synthetic aug')      # +2.1%
    commit_initial   = _find(ocr,   'commit', 'skeleton')           # 7c1e4b0

    # ── Decision nodes ─────────────────────────────────────────────────────
    dec_backbone = node(ocr, 'jensen', '2026-05-22T08:00:00', 'decision',
        'Switch detector backbone from ResNet50 to EfficientNet-B3',
        title='Switch detector backbone from ResNet50 to EfficientNet-B3',
        body='ResNet50 was showing instability on edge-case receipts (torn corners, low contrast). '
             'EfficientNet-B3 is ~20% lighter and more stable on our hard subset.',
        rationale='EfficientNet-B3 more stable on edge receipts and 20% lighter — better trade-off for our target hardware.',
        alternatives='MobileNetV3 (too small), ViT-Tiny (too slow to fine-tune), keep ResNet50',
        note='Backbone swap: ResNet50 → EfficientNet-B3.')

    dec_fp16 = node(train, 'jensen', '2026-05-11T08:00:00', 'decision',
        'Enable mixed-precision fp16 training via AMP',
        title='Enable mixed-precision fp16 training via AMP',
        body='fp16 cuts epoch time by ~38% with no measurable accuracy loss. '
             'Critical for iteration speed given we are running ablations daily.',
        rationale='38% wall-time reduction with no accuracy loss — essential for daily ablation cadence.',
        alternatives='Full fp32 training (baseline), bfloat16 (not supported on V100)',
        note='fp16 AMP enabled — 38% faster, no accuracy hit.')

    dec_cosine = node(train, 'jensen', '2026-05-25T09:00:00', 'decision',
        'Use cosine annealing LR schedule instead of step decay',
        title='Use cosine annealing LR schedule instead of step decay',
        body='Ablation showed cosine 85.2 → 86.0% vs step decay. '
             'Cosine also avoids the sensitivity of picking the right step epochs.',
        rationale='+0.8% char-F1 over step decay in ablation. Simpler to configure, no epoch thresholds to tune.',
        alternatives='Step decay (drop ×0.1 at fixed epochs), OneCycleLR, constant LR with warmup only',
        note='Cosine LR adopted — +0.8% and easier to configure.')

    dec_nfkc = node(data, 'maya', '2026-05-16T10:00:00', 'decision',
        'Disable NFKC normalization for CJK locales',
        title='Disable NFKC normalization for CJK locales',
        body='NFKC normalization was collapsing full-width CJK punctuation (e.g. ！→!) '
             'into ASCII equivalents, causing accuracy regression on CJK vendor receipts.',
        rationale='NFKC broke CJK full-width chars — accuracy regression was immediately visible in eval.',
        alternatives='Selective NFKC (ASCII range only), apply NFKC then restore full-width with lookup',
        note='NFKC disabled for CJK — full-width punctuation preserved.')

    dec_synthtext = node(data, 'maya', '2026-05-09T10:00:00', 'decision',
        'Use SynthText for rare-glyph augmentation instead of manual curation',
        title='Use SynthText for rare-glyph augmentation instead of manual curation',
        body='Rare glyphs are underrepresented in the real receipt dataset. '
             'SynthText can generate arbitrarily many synthetic samples targeting specific character sets.',
        rationale='Manual curation would take weeks; SynthText generates 50k targeted samples overnight.',
        alternatives='Manual data collection, CycleGAN-based style transfer, skip rare-glyph aug',
        note='SynthText chosen for rare-glyph coverage — scale over manual effort.')

    for d in [dec_backbone, dec_fp16, dec_cosine, dec_nfkc, dec_synthtext]:
        db.session.add(d)
    db.session.flush()  # assign IDs to decision nodes

    # ── Pre-seeded NodeLinks (confirmed, non-AI) ───────────────────────────
    def link(from_node, to_node, rel):
        if from_node and to_node:
            db.session.add(NodeLink(
                from_id=from_node.id, to_id=to_node.id,
                rel=rel, is_ai=False, status='confirmed',
                description='',
            ))

    link(dec_backbone,  commit_backbone,  'implements')
    link(dec_backbone,  idea_backbone,    'validates')
    link(dec_fp16,      commit_fp16,      'implements')
    link(dec_fp16,      idea_fp16,        'validates')
    link(dec_cosine,    idea_cosine,      'validates')
    link(dec_nfkc,      note_nfkc,        'triggered_by')
    link(dec_synthtext, commit_synthtext,  'implements')
    link(dec_synthtext, idea_synthtext,   'validates')

    # ── Tasks ──────────────────────────────────────────────────────────────
    tasks = [
        Node(branch_id=ocr.id, created_by='priya', created_at=dt('2026-05-10T00:00:00'),
             type='task', content='Optimize to 90% accuracy',
             assigned_to='jensen', assignment_status='pending',
             _metadata=json.dumps({'due': '2026-05-29'})),

        Node(branch_id=ocr.id, created_by='priya', created_at=dt('2026-05-21T00:00:00'),
             type='task', content='Ship EfficientNet swap',
             assigned_to='jensen', assignment_status='done',
             _metadata=json.dumps({'due': '2026-05-28'})),

        Node(branch_id=train.id, created_by='priya', created_at=dt('2026-05-23T00:00:00'),
             type='task', content='Benchmark vs. baseline',
             assigned_to='jensen', assignment_status='pending',
             _metadata=json.dumps({'due': '2026-06-04'})),

        Node(branch_id=data.id, created_by='priya', created_at=dt('2026-05-12T00:00:00'),
             type='task', content='Validate CJK handling',
             assigned_to='maya', assignment_status='done',
             _metadata=json.dumps({'due': '2026-05-17'})),

        Node(branch_id=deploy.id, created_by='priya', created_at=dt('2026-05-14T00:00:00'),
             type='task', content='Set up CI/CD',
             assigned_to='jensen', assignment_status='pending',
             _metadata=json.dumps({'due': '2026-05-25'})),

        Node(branch_id=data.id, created_by='priya', created_at=dt('2026-05-26T00:00:00'),
             type='task', content='Document aug pipeline',
             assigned_to='maya', assignment_status='pending',
             _metadata=json.dumps({'due': '2026-06-08'})),
    ]
    for t in tasks:
        db.session.add(t)

    # ── Contacts ───────────────────────────────────────────────────────────
    contacts = [
        Contact(project_id=project.id,
                name='Alex Kim', company='Acme Corp', role='Head of Finance',
                email='alex.kim@acme.com',
                notes='Primary stakeholder for receipt OCR rollout. Needs 90% accuracy by Q2 close.'),
        Contact(project_id=project.id,
                name='Sarah Lee', company='Acme Corp', role='Product Manager',
                email='sarah.lee@acme.com',
                notes='Coordinates feature requirements. Attends bi-weekly syncs.'),
        Contact(project_id=project.id,
                name='Tom Watkins', company='LabelStudio', role='Support Engineer',
                email='twatkins@labelstudio.io',
                notes='Point of contact for annotation tooling issues and data labeling pipeline.'),
    ]
    for c in contacts:
        db.session.add(c)

    db.session.commit()
    print('Database seeded with OCR scenario.')


def seed_inbox_if_empty():
    if InboxSuggestion.query.count() > 0:
        return

    items = [
        # ── Git commit ──────────────────────────────────────────────────────
        InboxSuggestion(
            source='git',
            title='e4b9f01 — Add recognizer beam-search decoder',
            raw_text='pushed just now to ocr branch',
            branch_slug='ocr',
            nodes_json=json.dumps([{
                'type': 'commit',
                'content': 'Add recognizer beam-search decoder',
                'metadata': {
                    'hash': 'e4b9f01',
                    'title': 'Add recognizer beam-search decoder',
                    'body': 'Replaces the greedy CTC decoder with a beam-search decoder (width=10). '
                            'Improves low-confidence character predictions on smudged receipts.',
                    'note': 'Beam-search decoder (width=10) replaces greedy CTC — better on noisy inputs.',
                },
            }]),
        ),

        # ── Slack batch 1: #ml-team ─────────────────────────────────────────
        InboxSuggestion(
            source='slack',
            title='#ml-team · 5 messages',
            branch_slug='data',
            raw_text=(
                'Diego Torres [3:47 PM]: finished the DALI stress test — 94k samples/sec on V100, no OOM after 6 hours\n'
                'Diego Torres [3:48 PM]: full run log: https://wandb.ai/ocr-team/receipts/runs/dali-stress-v3\n'
                'Maya Chen [3:51 PM]: nice!! also pushed the weight EMA patch, commit 9d1c4fe — ablations showed +0.4% on eval\n'
                'Diego Torres [3:53 PM]: on the CJK locale issue — we decided to go with ICU tokenizer instead of NFKC, handles full-width chars way better\n'
                'Jensen Park [3:55 PM]: +1. ref doc: https://unicode.org/reports/tr29/'
            ),
            nodes_json=json.dumps([
                {
                    'type': 'idea',
                    'content': 'DALI stress test — 94k samples/sec on V100, stable after 6h',
                    'metadata': {
                        'title': 'DALI stress test — 94k samples/sec on V100, stable after 6h',
                        'metric': '94k samples/sec',
                        'body': 'Input pipeline benchmarked at 94k samples/sec on V100. No OOM observed after a 6-hour stress run. Bottleneck has been eliminated.',
                        'note': 'DALI pipeline no longer a bottleneck — stable over 6h stress run.',
                    },
                },
                {
                    'type': 'link',
                    'content': 'https://wandb.ai/ocr-team/receipts/runs/dali-stress-v3',
                    'metadata': {
                        'title': 'W&B — DALI stress test v3',
                        'refKind': 'Docs',
                        'note': 'Full DALI stress test report.',
                    },
                },
                {
                    'type': 'commit',
                    'content': 'Add weight EMA to model checkpointing',
                    'metadata': {
                        'hash': '9d1c4fe',
                        'title': 'Add weight EMA to model checkpointing',
                        'body': 'Exponential moving average of weights added to the checkpoint callback. Ablation shows +0.4% on eval — confirmed across 3 seeds.',
                        'note': '+0.4% on eval — EMA weights confirmed by ablation.',
                    },
                },
                {
                    'type': 'decision',
                    'content': 'Use ICU tokenizer for CJK locale instead of NFKC',
                    'metadata': {
                        'title': 'Use ICU tokenizer for CJK locale instead of NFKC',
                        'rationale': 'NFKC normalization was collapsing full-width punctuation incorrectly. ICU boundary rules handle CJK full-width chars correctly.',
                        'alternatives': 'NFKC normalization (broken for full-width chars)',
                        'note': 'CJK locale fix — ICU tokenizer over NFKC.',
                    },
                },
                {
                    'type': 'link',
                    'content': 'https://unicode.org/reports/tr29/',
                    'metadata': {
                        'title': 'Unicode TR29 — Unicode Text Segmentation',
                        'refKind': 'Docs',
                        'note': 'Word boundary rules used by the ICU tokenizer we adopted.',
                    },
                },
            ]),
        ),

        # ── Slack batch 2: #ml-standup ──────────────────────────────────────
        InboxSuggestion(
            source='slack',
            title='#ml-standup · 5 messages',
            branch_slug='ocr',
            raw_text=(
                'Priya Rao [9:04 AM]: standup — any update on TTA evaluation? Jensen you said it was WIP last week\n'
                'Jensen Park [9:06 AM]: running it now — prelim with 3-scale + flip TTA looks like +1.4% char-F1, still need the full sweep\n'
                'Jensen Park [9:07 AM]: prelim log here: https://wandb.ai/ocr-team/receipts/runs/tta-prelim-01\n'
                'Maya Chen [9:09 AM]: found a useful reference for scale selection: https://arxiv.org/abs/2009.12666\n'
                'Maya Chen [9:10 AM]: section 3.2 covers scale ratios for document OCR specifically — worth a read before finalizing the sweep'
            ),
            nodes_json=json.dumps([
                {
                    'type': 'idea',
                    'content': 'TTA preliminary — +1.4% char-F1 with 3-scale flip augmentation',
                    'metadata': {
                        'title': 'TTA preliminary — +1.4% char-F1 with 3-scale flip augmentation',
                        'metric': '+1.4% char-F1',
                        'body': 'Preliminary TTA result using 3-scale + horizontal flip. Full sweep (more scales, elastic) still in progress.',
                        'note': 'TTA prelim: +1.4% char-F1 — full sweep still running.',
                    },
                },
                {
                    'type': 'link',
                    'content': 'https://wandb.ai/ocr-team/receipts/runs/tta-prelim-01',
                    'metadata': {
                        'title': 'W&B — TTA preliminary run 01',
                        'refKind': 'Docs',
                        'note': 'Preliminary TTA run log.',
                    },
                },
                {
                    'type': 'link',
                    'content': 'https://arxiv.org/abs/2009.12666',
                    'metadata': {
                        'title': 'Revisiting Data Augmentation for Document Understanding (arXiv 2009.12666)',
                        'refKind': 'Paper',
                        'note': 'Sec 3.2 covers scale ratio selection for document OCR TTA.',
                    },
                },
                {
                    'type': 'note',
                    'content': 'Section 3.2 of TTA paper has analysis of scale ratios for document OCR — read before finalizing sweep',
                    'metadata': {
                        'title': 'TTA scale ratios — read section 3.2 before finalizing sweep',
                        'note': 'Action item from Maya in standup.',
                    },
                },
            ]),
        ),
    ]

    for item in items:
        db.session.add(item)
    db.session.commit()
    print('Inbox seeded with git + Slack suggestions.')
