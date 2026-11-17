import Logo from './components/Logo.jsx';
import React, { useEffect, useState } from 'react';
import { IconWorld, IconPhoneCall, IconEye, IconLayoutDashboard, IconMessages, IconCalendarEvent, IconClipboardText, IconDeviceDesktop, IconDental, IconSend, IconChartBar, IconSettings, IconPhone, IconUsers, IconStethoscope, IconDeviceTv, IconBuildingHospital, IconSpeakerphone, IconRocket, IconLogout, IconChevronDown, IconHeadset, IconHome, IconSunrise, IconMessageCircle } from '@tabler/icons-react';
import { ToastProvider } from './components/ui.jsx';
import PublicSite from './pages/PublicSite.jsx';
import { get, post, getToken, setToken, setTenant } from './lib/api.js';
import { setLocale } from './lib/format.js';
import { useBranch } from './lib/branch.js';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Schedule from './pages/Schedule.jsx';
import Patients from './pages/Patients.jsx';
import MyDay from './pages/MyDay.jsx';
import DoctorDashboard, { DOCTOR_TABS } from './pages/DoctorDashboard.jsx';
import PreVisit from './pages/PreVisit.jsx';
import Treatment from './pages/Treatment.jsx';
import Communications from './pages/Communications.jsx';
import Marketing from './pages/Marketing.jsx';
import Callbacks from './pages/Callbacks.jsx';
import Calls from './pages/Calls.jsx';
import Insights from './pages/Insights.jsx';
import Settings from './pages/Settings.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Setup from './pages/Setup.jsx';
import Legal from './pages/Legal.jsx';
import Overview from './pages/Overview.jsx';
import Assistant from './components/Assistant.jsx';
import FrontDeskHome from './pages/FrontDeskHome.jsx';
import Kiosk from './pages/Kiosk.jsx';
import Board from './pages/Board.jsx';
import PatientPortal from './pages/PatientPortal.jsx';
import Forms from './pages/Forms.jsx';
import Auth from './pages/Auth.jsx';
import Landing from './pages/Landing.jsx';

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}
export const navigate = (to) => { window.location.hash = to; };

/** Three workspaces. `admin` (owner/admin) sees everything; `front_desk` runs the day; `doctor` sees their own patients and plans. */
const WORKSPACES = { owner: 'admin', admin: 'admin', front_desk: 'front_desk', dentist: 'doctor', hygienist: 'doctor' };
const NAV = [
  { to: '#/overview', label: 'Overview', icon: IconHome, page: Overview, ws: ['admin'] },
  { to: '#/home', label: 'Today', icon: IconSunrise, page: FrontDeskHome, ws: ['front_desk', 'admin'], sidebarWs: ['front_desk'] },
  { to: '#/doctor', label: 'My home', icon: IconStethoscope, page: DoctorDashboard, ws: ['doctor', 'admin'] },
  { group: 'Front desk', to: '#/dashboard', label: 'Arrivals & queue', icon: IconLayoutDashboard, page: Dashboard, ws: ['front_desk', 'admin'] },
  { group: 'Front desk', to: '#/callbacks', label: 'Callbacks', icon: IconPhoneCall, page: Callbacks, ws: ['front_desk', 'admin'], badge: 'callbacks' },
  { group: 'Front desk', to: '#/calls', label: 'Calls', icon: IconHeadset, page: Calls, ws: ['front_desk', 'admin'] },
  // These three stay routable for the doctor workspace (My home links straight into one conversation or
  // question), but are left out of the doctor's own sidebar via sidebarWs — his sidebar is "My home" only,
  // never the whole clinic's inbox, schedule or patient list.
  { group: 'Front desk', to: '#/inbox', label: 'Front desk inbox', icon: IconMessages, page: Inbox, ws: ['front_desk', 'admin', 'doctor'], sidebarWs: ['front_desk', 'admin'], badge: 'inbox' },
  { group: 'Front desk', to: '#/schedule', label: 'Schedule', icon: IconCalendarEvent, page: Schedule, ws: ['front_desk', 'admin', 'doctor'], sidebarWs: ['front_desk', 'admin'] },
  { group: 'Patients and care', to: '#/patients', label: 'Patients', icon: IconUsers, page: Patients, ws: ['front_desk', 'admin', 'doctor'], sidebarWs: ['front_desk', 'admin'] },
  { group: 'Patients and care', to: '#/myday', label: "Dentist's day", icon: IconCalendarEvent, page: MyDay, ws: ['admin', 'front_desk'] },
  { group: 'Patients and care', to: '#/previsit', label: 'Pre-visit forms', icon: IconClipboardText, page: PreVisit, ws: ['front_desk', 'admin'] },
  { group: 'Patients and care', to: '#/treatment', label: 'Treatment plans', icon: IconDental, page: Treatment, ws: ['admin', 'front_desk', 'doctor'], sidebarWs: ['admin', 'front_desk'] },
  { group: 'Grow', to: '#/messages', label: 'Patient messages', icon: IconSend, page: Communications, ws: ['front_desk', 'admin'] },
  { group: 'Grow', to: '#/marketing', label: 'Marketing', icon: IconSpeakerphone, page: Marketing, ws: ['admin', 'front_desk'], badge: 'approvals' },
  { group: 'Grow', to: '#/insights', label: 'Insights', icon: IconChartBar, page: Insights, ws: ['admin'] },
  { group: 'Clinic', to: '#/settings', label: 'Settings', icon: IconSettings, page: Settings, ws: ['admin'], manage: true },
];
const WS_HOME = { admin: '#/overview', front_desk: '#/home', doctor: '#/doctor' };
const WS_LABEL = { admin: 'Admin — everything', front_desk: 'Front desk', doctor: 'Doctor' };
const ROLE_HOME = { dentist: '#/doctor', hygienist: '#/doctor' };

/** Session state for the staff app. */
export function useSession() {
  const [state, setState] = useState({ loading: !!getToken(), me: null });
  const refresh = async () => {
    if (!getToken()) { setState({ loading: false, me: null }); return null; }
    try { const me = await get('/api/auth/me'); setState({ loading: false, me }); return me; }
    catch { setToken(''); setState({ loading: false, me: null }); return null; }
  };
  useEffect(() => { refresh(); }, []); // eslint-disable-line
  const login = (me) => { setToken(me.token); setState({ loading: false, me }); };
  const logout = async () => { try { await post('/api/auth/logout'); } catch { /* ignore */ } setToken(''); setState({ loading: false, me: null }); navigate('#/'); };
  return { ...state, refresh, login, logout };
}

function Shell({ hash, session }) {
  const { me, logout, refresh } = session;
  const [health, setHealth] = useState(null);
  const [counts, setCounts] = useState({ inbox: 0, approvals: 0, callbacks: 0 });
  const realWs = WORKSPACES[me.role] || 'front_desk';
  const [viewAs, setViewAs] = useState(() => { try { return localStorage.getItem('clinovara.viewAs') || ''; } catch { return ''; } });
  const ws = realWs === 'admin' && viewAs ? viewAs : realWs;
  const [onboarding, setOnboarding] = useState(null);
  const [branch, setBranch] = useBranch();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [h, s, convs, ob] = await Promise.all([get('/api/health'), get('/api/settings'), get('/api/conversations'), me.canManage ? get('/api/onboarding') : Promise.resolve(null)]);
        if (!alive) return;
        setLocale(s.locale);
        setHealth({ ...h, practice: s.practice.name, locations: s.locations.map((l) => ({ id: l.id, name: l.name })) });
        setOnboarding(ob);
        let approvals = 0; let callbacks = 0;
        if (me.canManage) { try { const m = await get('/api/marketing'); approvals = m.pendingApprovals; } catch { /* ignore */ } }
        try { const cb = await get('/api/callbacks'); callbacks = cb.items.length; } catch { /* ignore */ }
        setCounts({ inbox: convs.filter((c) => c.status === 'needs_staff' || (c.unread && c.status !== 'closed')).length, approvals, callbacks });
      } catch { if (alive) setHealth({ ok: false }); }
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [hash, me.tenant?.id]); // eslint-disable-line

  const route = hash.split('?')[0];
  if (route === '#/onboarding') return hash.includes('all=1') ? <Onboarding session={session} /> : <Setup session={session} />;
  const visible = NAV.filter((n) => n.ws.includes(ws) && (!n.manage || me.canManage));
  const sidebarItems = NAV.filter((n) => (n.sidebarWs || n.ws).includes(ws) && (!n.manage || me.canManage));
  const item = visible.find((n) => route === n.to || route.startsWith(n.to + '/')) || NAV.find((n) => (route === n.to) && me.canManage) || visible.find((n) => n.to === WS_HOME[ws]) || visible[0];
  const Page = item.page;
  const locations = health?.locations || [];
  const showSetup = onboarding && !onboarding.completed && me.canManage;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Logo /></div>
          <div><div className="brand-name">Clinovara</div><div className="brand-sub">{me.tenant?.name}</div></div>
        </div>
        {ws !== 'doctor' && locations.length > 1 && (
          <div className="row gap-6" style={{ padding: '0 8px 10px' }} title="Branch shown on Arrivals, Schedule, Patients and Insights">
            <IconBuildingHospital size={16} className="muted" />
            <select className="input" style={{ padding: '5px 8px', fontSize: 12.5 }} value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">All branches</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        {realWs === 'admin' && (
          <div className="row gap-6" style={{ padding: '0 8px 10px' }} title="Preview what the front desk or a doctor sees">
            <IconEye size={16} className="muted" />
            <select className="input" style={{ padding: '5px 8px', fontSize: 12.5 }} value={viewAs} onChange={(e) => { setViewAs(e.target.value); try { localStorage.setItem('clinovara.viewAs', e.target.value); } catch { /* ignore */ } navigate(WS_HOME[e.target.value || 'admin']); }}>
              {['admin', 'front_desk', 'doctor'].map((k) => <option key={k} value={k === 'admin' ? '' : k}>{WS_LABEL[k]}</option>)}
            </select>
          </div>
        )}
        {showSetup && <a href="#/onboarding" className="setup-banner"><IconRocket size={16} /><div><div className="strong">Finish setup · {onboarding.percent}%</div><div className="tiny">Go live checklist</div></div></a>}
        <button className="assist-nav" onClick={() => window.dispatchEvent(new Event('clinovara:assistant'))}><IconMessageCircle size={18} /><span>Ask assistant</span><kbd>Ctrl /</kbd></button>
        <nav className="nav col gap-4">
          {ws === 'doctor' && DOCTOR_TABS.map((x) => { const cur = new URLSearchParams(hash.split('?')[1] || '').get('tab') || 'today'; const on = route === '#/doctor' && cur === x.id; return <a key={x.id} href={`#/doctor?tab=${x.id}`} className={on ? 'active' : ''}><x.icon size={18} />{x.label}</a>; })}
          {sidebarItems.filter((n) => !(ws === 'doctor' && n.to === '#/doctor')).map((n, idx, arr) => (
            <React.Fragment key={n.to}>
              {ws !== 'doctor' && n.group && n.group !== arr[idx - 1]?.group && <div className="nav-section">{n.group}</div>}
              <a href={n.to} className={n === item ? 'active' : ''}>
                <n.icon size={18} />{n.label}
                {n.badge && counts[n.badge] > 0 && <span className="badge">{counts[n.badge]}</span>}
              </a>
            </React.Fragment>
          ))}
          {ws !== 'doctor' && <>
            <div className="nav-section">Patient-facing</div>
            <a href={`#/kiosk?t=${me.tenant.slug}${branch ? `&location=${branch}` : ''}`} target="_blank" rel="noreferrer"><IconDeviceDesktop size={18} />Kiosk</a>
            <a href={`#/board?t=${me.tenant.slug}${branch ? `&location=${branch}` : ''}`} target="_blank" rel="noreferrer"><IconDeviceTv size={18} />Waiting-room display</a>
            <a href={`#/patient?t=${me.tenant.slug}`} target="_blank" rel="noreferrer"><IconPhone size={18} />Patient chat demo</a>
            <a href={`#/book?t=${me.tenant.slug}`} target="_blank" rel="noreferrer"><IconWorld size={18} />Clinic website &amp; booking</a>
          </>}
        </nav>
        <div className="sidebar-foot">
          <div className="account" onClick={() => setMenu(!menu)}>
            <div className="avatar">{(me.user.name || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</div>
            <div className="grow"><div className="small strong truncate">{me.user.name}</div><div className="tiny muted">{me.roles.find((r) => r.id === me.role)?.label || me.role}{me.tenant.demo ? ' · demo' : me.tenant.plan === 'trial' ? ' · trial' : ''}</div></div>
            <IconChevronDown size={14} className="muted" />
          </div>
          {menu && (
            <div className="card" style={{ padding: 6 }}>
              {me.memberships.length > 1 && <>
                <div className="tiny muted" style={{ padding: '4px 8px' }}>Switch clinic</div>
                {me.memberships.map((m) => <button key={m.tenantId} className={`btn ghost sm block ${m.tenantId === me.tenant.id ? 'soft' : ''}`} style={{ justifyContent: 'flex-start' }} onClick={async () => { const next = await post('/api/auth/switch', { tenantId: m.tenantId }); setToken(next.token); await refresh(); setMenu(false); navigate('#/dashboard'); }}>{m.name}</button>)}
                <div className="divider" style={{ margin: '4px 0' }} />
              </>}
              <a className="btn ghost sm block" style={{ justifyContent: 'flex-start' }} href="#/settings?tab=account" onClick={() => setMenu(false)}>My account</a>
              <button className="btn ghost sm block" style={{ justifyContent: 'flex-start' }} onClick={logout}><IconLogout size={14} />Log out</button>
            </div>
          )}
          <div className="tiny faint">
            {health === null ? 'Connecting…' : health.ok ? <>AI: <b>{health.ai === 'claude' ? 'Claude' : 'rule engine'}</b></> : <span style={{ color: 'var(--bad)' }}>Backend offline — start it with npm run dev</span>}
          </div>
        </div>
      </aside>
      <main className="main"><Page hash={hash} branch={branch} locations={locations} me={me} session={session} workspace={ws} /></main>
      <Assistant role={me.role} />
    </div>
  );
}

export default function App() {
  const hash = useHash();
  const session = useSession();
  const params = new URLSearchParams(hash.split('?')[1] || '');
  if (params.get('t')) setTenant(params.get('t'));
  // Login-by-link (invites shared on WhatsApp, kiosk provisioning): a session token in the URL is stored once and removed.
  if (params.get('token') && params.get('token') !== getToken()) { setToken(params.get('token')); params.delete('token'); window.location.replace(`${hash.split('?')[0]}${params.toString() ? '?' + params.toString() : ''}`); }
  let page = null;
  if (hash === '#/terms' || hash === '#/privacy') page = <Legal kind={hash.slice(2)} />;
  else if (hash.startsWith('#/kiosk')) page = <Kiosk locationId={params.get('location')} kioskCode={params.get('code')} tenant={params.get('t')} />;
  else if (hash.startsWith('#/board')) page = <Board locationId={params.get('location')} tenant={params.get('t')} />;
  else if (hash === '#/book' || hash.startsWith('#/book?') || hash === '#/site' || hash.startsWith('#/site?')) page = <PublicSite />;
  else if (hash === '#/patient' || hash.startsWith('#/patient?')) page = <PatientPortal tenant={params.get('t')} />;
  else if (hash.startsWith('#/forms/')) page = <Forms token={hash.slice('#/forms/'.length).split('?')[0]} />;
  else if (hash.startsWith('#/invite/')) page = <Auth mode="invite" inviteToken={hash.slice('#/invite/'.length).split('?')[0]} session={session} />;
  else if (hash.startsWith('#/login') || hash.startsWith('#/signup') || hash.startsWith('#/forgot')) page = session.me ? <Shell hash="#/dashboard" session={session} /> : <Auth mode={hash.startsWith('#/signup') ? 'signup' : hash.startsWith('#/forgot') ? 'forgot' : 'login'} session={session} />;
  else if (session.loading) page = <div className="portal"><div className="spin" /></div>;
  else if (!session.me) page = <Landing hash={hash} />;
  else page = <Shell hash={hash === '#/' || hash === '' ? (session.me.tenant?.onboarding?.completed === false && session.me.canManage ? '#/onboarding' : (ROLE_HOME[session.me.role] || (session.me.canManage ? '#/overview' : '#/home'))) : hash} session={session} />;
  return <ToastProvider>{page}</ToastProvider>;
}
