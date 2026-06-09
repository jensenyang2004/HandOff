// app.jsx — shell: persistent NavBar, role-based routing, user switcher
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "timelineStyle": "railway",
  "accent": "#7F77DD"
}/*EDITMODE-END*/;

// ── Auth screen (login + register) ────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '', github_handle: '', slack_username: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password, github_handle: form.github_handle, slack_username: form.slack_username };
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); return; }
      onLogin(data);
    } catch (err) {
      setError('Cannot reach server');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { fontSize: 11.5, color: 'var(--muted)', marginBottom: 4, display: 'block' };

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ width: 380, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff' }}>H</div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>HandOff</span>
        </div>

        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 24 }}>
          {mode === 'login' ? 'Welcome back. Enter your credentials.' : 'Fill in your details to get started.'}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'register' && (
            <div>
              <label style={labelStyle}>Full name</label>
              <input style={inputStyle} value={form.name} onChange={set('name')} placeholder="Jensen Park" required />
            </div>
          )}
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input style={inputStyle} type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required />
          </div>
          {mode === 'register' && (
            <>
              <div>
                <label style={labelStyle}>GitHub username <span style={{ color: 'var(--muted)' }}>(optional)</span></label>
                <input style={inputStyle} value={form.github_handle} onChange={set('github_handle')} placeholder="jensen-park" />
              </div>
              <div>
                <label style={labelStyle}>Slack username <span style={{ color: 'var(--muted)' }}>(optional)</span></label>
                <input style={inputStyle} value={form.slack_username} onChange={set('slack_username')} placeholder="jensen" />
              </div>
            </>
          )}

          {error && (
            <div style={{ fontSize: 12.5, color: 'var(--red)', background: '#ef4b4b18', border: '1px solid #ef4b4b44', borderRadius: 7, padding: '8px 12px' }}>{error}</div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '10px', fontSize: 13.5, marginTop: 4 }}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, padding: 0 }}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </div>

        {mode === 'login' && (
          <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, fontSize: 11.5, color: 'var(--muted)' }}>
            Demo accounts: <span style={{ color: 'var(--text)' }}>jensen@example.com</span> (or maya / diego / priya) · password: <span style={{ color: 'var(--text)' }}>demo</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── User switcher popover ──────────────────────────────────────────────────
function UserSwitcher({ currentUser, onSwitch, onLogout }) {
  const { PEOPLE } = window.HANDOFF;
  const [open, setOpen] = useState(false);
  const me = PEOPLE[currentUser];
  if (!me) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(s => !s)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 9px', border: '1px solid var(--border)', borderRadius: 8, background: open ? 'var(--surface)' : 'transparent', cursor: 'pointer', color: 'var(--text)' }}>
        <Avatar person={me} size={20} ring />
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{me.name.split(' ')[0]}</span>
        <Icon name="chevDown" size={12} color="var(--muted)" />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
          <div className="pop-in" style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 230, zIndex: 201,
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
            padding: 8, boxShadow: '0 14px 40px rgba(0,0,0,.5)',
          }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', padding: '4px 8px 8px' }}>View as</div>
            {Object.values(PEOPLE).map(p => (
              <button key={p.id} onClick={() => { onSwitch(p.id); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 8px', background: p.id === currentUser ? '#ffffff10' : 'none', border: 'none', borderRadius: 7, cursor: 'pointer', color: 'var(--text)', fontSize: 12.5 }}
                onMouseEnter={e => e.currentTarget.style.background = '#ffffff0d'}
                onMouseLeave={e => e.currentTarget.style.background = p.id === currentUser ? '#ffffff10' : 'none'}>
                <Avatar person={p} size={22} ring={p.id === currentUser} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: p.id === currentUser ? 600 : 400 }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                    {p.isManager ? 'Manager' : 'Employee'}{p.departing ? ' · departing' : ''}
                  </div>
                </div>
                {p.id === currentUser && <Icon name="check" size={14} color="var(--purple)" />}
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
            <button onClick={() => { setOpen(false); onLogout(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 8px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', color: 'var(--red)', fontSize: 12.5 }}>
              <Icon name="exit" size={15} color="var(--red)" />
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Overdue badge on My Tasks tab ──────────────────────────────────────────
function OverdueBadge({ currentUser }) {
  const count = (window.HANDOFF.TASKS || []).filter(t => t.assigned_to === currentUser && t.state === 'overdue').length;
  if (!count) return null;
  return (
    <span style={{ marginLeft: 5, width: 16, height: 16, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>
  );
}

// ── Persistent nav bar ─────────────────────────────────────────────────────
function NavBar({ currentUser, onSwitchUser, onLogout, screen, onGoTo }) {
  const { PEOPLE, PROJECT } = window.HANDOFF;
  const me = PEOPLE[currentUser];
  const isManager = me && me.isManager;

  const tabs = isManager
    ? [
        { id: 'timeline', label: 'Timeline'  },
        { id: 'manager',  label: 'Dashboard' },
        { id: 'context',  label: 'Context'   },
      ]
    : [
        { id: 'timeline', label: 'Timeline'  },
        { id: 'log',      label: 'My Log'    },
        { id: 'tasks',    label: 'My Tasks'  },
        { id: 'context',  label: 'Context'   },
      ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 44, borderBottom: '1px solid var(--border)', padding: '0 22px', flex: '0 0 auto', gap: 10, background: 'var(--bg)', position: 'relative', zIndex: 100 }}>
      {/* Logo + project */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>H</div>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{PROJECT ? PROJECT.name : 'Handoff'}</span>
      </div>

      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />

      {/* Role-based tabs */}
      <div style={{ display: 'flex', gap: 2 }}>
        {tabs.map(tab => {
          const active = screen === tab.id;
          return (
            <button key={tab.id} onClick={() => onGoTo(tab.id)} style={{
              display: 'inline-flex', alignItems: 'center', padding: '5px 12px', border: 'none',
              borderRadius: 7, fontSize: 12.5, fontWeight: active ? 600 : 400, cursor: 'pointer',
              background: active ? 'var(--surface-2)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--muted)',
            }}>
              {tab.label}
              {tab.id === 'tasks' && <OverdueBadge currentUser={currentUser} />}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Role pill */}
      <Pill color={isManager ? 'var(--blue)' : me && me.departing ? 'var(--red)' : 'var(--teal)'} style={{ fontSize: 10.5 }}>
        {isManager ? 'Manager' : me && me.departing ? 'Departing' : 'Employee'}
      </Pill>

      <UserSwitcher currentUser={currentUser} onSwitch={onSwitchUser} onLogout={onLogout} />
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = useState('timeline');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => { document.documentElement.style.setProperty('--purple', t.accent); }, [t.accent]);

  useEffect(() => {
    setLoading(true);
    loadHandoffData()
      .then(() => {
        if (currentUser) window.HANDOFF.CURRENT_USER = currentUser;
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dataVersion]);

  const refresh = () => setDataVersion(v => v + 1);

  const handleLogin = (user) => {
    // Ensure the user is in PEOPLE (important for newly registered users)
    if (!window.HANDOFF.PEOPLE) window.HANDOFF.PEOPLE = {};
    window.HANDOFF.PEOPLE[user.id] = { ...user, isManager: user.role === 'manager' };
    window.HANDOFF.CURRENT_USER = user.id;
    setCurrentUser(user.id);
    setScreen('timeline');
    refresh();
  };

  const handleLogout = () => {
    setCurrentUser(null);
    window.HANDOFF.CURRENT_USER = null;
  };

  const switchUser = (userId) => {
    setCurrentUser(userId);
    window.HANDOFF.CURRENT_USER = userId;
    const person = window.HANDOFF?.PEOPLE?.[userId];
    const isManager = person?.isManager;
    if (isManager && (screen === 'log' || screen === 'tasks')) setScreen('manager');
    if (!isManager && screen === 'manager') setScreen('timeline');
  };

  const goTo = (screenId) => setScreen(screenId);

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--purple)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>Loading Handoff…</span>
    </div>
  );

  if (error) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <Icon name="warn" size={24} color="var(--red)" />
      <span style={{ fontSize: 13, color: 'var(--muted-2)', maxWidth: 360, textAlign: 'center' }}>Could not connect to backend: {error}</span>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Make sure <span className="mono">python app.py</span> is running on port 5001.</span>
      <button className="btn btn-primary" onClick={refresh}>Retry</button>
    </div>
  );

  if (!currentUser) return <AuthScreen onLogin={handleLogin} />;

  const me = window.HANDOFF.PEOPLE[currentUser];
  const isManager = me?.isManager;
  const canHandover = isManager || me?.departing;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavBar currentUser={currentUser} onSwitchUser={switchUser} onLogout={handleLogout} screen={screen} onGoTo={goTo} />

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {screen === 'timeline' && (
          <TimelineScreen
            styleVariant={t.timelineStyle}
            currentUser={currentUser}
            onGenerateHandover={canHandover ? () => setScreen('handover') : null}
            onRefresh={refresh} />
        )}
        {screen === 'log' && !isManager && (
          <PersonalLogScreen currentUser={currentUser} onRefresh={refresh} />
        )}
        {screen === 'tasks' && !isManager && (
          <TaskListScreen currentUser={currentUser} onRefresh={refresh} />
        )}
        {screen === 'manager' && isManager && (
          <ManagerDashboard currentUser={currentUser} onRefresh={refresh} />
        )}
        {screen === 'context' && (
          <ContextScreen currentUser={currentUser} />
        )}
        {screen === 'handover' && (
          <HandoverScreen currentUser={currentUser} onClose={() => goTo(isManager ? 'manager' : 'timeline')} />
        )}
      </div>

      <TweaksPanel>
        <TweakSection label="Timeline style" />
        <TweakRadio label="Layout" value={t.timelineStyle}
          options={['railway', 'dense', 'bands']}
          onChange={v => setTweak('timelineStyle', v)} />
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, padding: '2px 2px 4px' }}>
          {t.timelineStyle === 'railway' && 'Railway map — thin tracks, circular entry nodes, tasks hanging below.'}
          {t.timelineStyle === 'dense'   && 'Dense — compact lanes and smaller nodes to fit more on screen.'}
          {t.timelineStyle === 'bands'   && 'Bands — alternating lane shading and heavier tracks for scannability.'}
        </div>
        <TweakSection label="Theme" />
        <TweakColor label="Accent" value={t.accent}
          options={['#7F77DD', '#378ADD', '#1D9E75', '#EF9F27']}
          onChange={v => setTweak('accent', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
