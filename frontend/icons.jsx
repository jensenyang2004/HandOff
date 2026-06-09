// icons.jsx — minimal stroke-icon set + small shared UI bits. Exposed on window.
const Icon = ({ name, size = 16, color = 'currentColor', strokeWidth = 1.6, style }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', style };
  switch (name) {
    case 'exit':     return <svg {...p}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>;
    case 'commit':   return <svg {...p}><circle cx="12" cy="12" r="3.2"/><line x1="3" y1="12" x2="8.8" y2="12"/><line x1="15.2" y1="12" x2="21" y2="12"/></svg>;
    case 'flask':    return <svg {...p}><path d="M9 3h6"/><path d="M10 3v5.5L5.2 17a2 2 0 0 0 1.8 3h10a2 2 0 0 0 1.8-3L14 8.5V3"/><line x1="7.5" y1="14" x2="16.5" y2="14"/></svg>;
    case 'link':     return <svg {...p}><path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5"/></svg>;
    case 'note':     return <svg {...p}><path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2z"/><line x1="8.5" y1="9" x2="15.5" y2="9"/><line x1="8.5" y1="13" x2="13" y2="13"/></svg>;
    case 'filter':   return <svg {...p}><path d="M3 5h18l-7 8v5l-4 2v-7z"/></svg>;
    case 'paperclip':return <svg {...p}><path d="M20 11l-8.5 8.5a4.5 4.5 0 0 1-6.4-6.4l9-9a3 3 0 0 1 4.3 4.3l-9 9a1.5 1.5 0 0 1-2.1-2.1l8.1-8.1"/></svg>;
    case 'plus':     return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case 'edit':     return <svg {...p}><path d="M4 20h4l10-10-4-4L4 16z"/><line x1="13.5" y1="6.5" x2="17.5" y2="10.5"/></svg>;
    case 'close':    return <svg {...p}><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>;
    case 'warn':     return <svg {...p}><path d="M12 3l9 16H3z"/><line x1="12" y1="9" x2="12" y2="14"/><circle cx="12" cy="17" r="0.4" fill={color} stroke="none"/></svg>;
    case 'check':    return <svg {...p}><path d="M5 12.5l4.5 4.5L19 7"/></svg>;
    case 'sparkle':  return <svg {...p}><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/><path d="M18 4.5l.6 1.8 1.8.6-1.8.6L18 9.3l-.6-1.8L15.6 7l1.8-.6z"/></svg>;
    case 'arrowRight':return <svg {...p}><line x1="4" y1="12" x2="19" y2="12"/><path d="M13 6l6 6-6 6"/></svg>;
    case 'chevDown': return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case 'chevRight':return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case 'copy':     return <svg {...p}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>;
    case 'download': return <svg {...p}><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>;
    case 'doc':      return <svg {...p}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>;
    case 'github':   return <svg {...p} strokeWidth="0" fill={color}><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>;
    case 'clock':    return <svg {...p}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>;
    case 'menu':     return <svg {...p}><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>;
    case 'notion':   return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 16V9l6 7V9"/></svg>;
    case 'person':    return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
    case 'decision':  return <svg {...p}><path d="M12 2l10 10-10 10L2 12z"/></svg>;
    case 'meeting':   return <svg {...p}><circle cx="8" cy="7" r="3"/><path d="M3 20c0-3.3 2.2-6 5-6h1"/><circle cx="16" cy="7" r="3"/><path d="M21 20c0-3.3-2.2-6-5-6h-1"/></svg>;
    case 'milestone': return <svg {...p}><line x1="5" y1="3" x2="5" y2="21"/><path d="M5 4l12 5-12 5"/></svg>;
    case 'slack':     return <svg {...p}><path d="M9 4v8"/><path d="M15 12v8"/><path d="M4 9h8"/><path d="M12 15h8"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17.5" cy="6.5" r="2"/></svg>;
    default: return null;
  }
};

const Avatar = ({ person, size = 26, ring }) => (
  <div title={person.name} style={{
    width: size, height: size, borderRadius: '50%', flex: '0 0 auto',
    background: person.color + '22', color: person.color,
    border: ring ? `1.5px solid ${person.color}` : `1px solid ${person.color}55`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.4, fontWeight: 600, letterSpacing: '0.02em',
  }}>{person.initials}</div>
);

// pill tag for lane / status
const Pill = ({ children, color = '#6B6B7A', solid, style }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
    borderRadius: 999, fontSize: 11.5, fontWeight: 500, lineHeight: 1.4,
    color: solid ? '#fff' : color,
    background: solid ? color : color + '1A',
    border: solid ? 'none' : `1px solid ${color}33`,
    whiteSpace: 'nowrap', ...style,
  }}>{children}</span>
);

Object.assign(window, { Icon, Avatar, Pill });
