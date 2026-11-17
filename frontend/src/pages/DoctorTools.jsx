import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconPlus, IconArrowRight, IconAlertTriangle, IconArchive } from '@tabler/icons-react';
import { get, post, put, patch } from '../lib/api.js';
import { fmtDate, fmtWhen } from '../lib/format.js';
import { Card, Body, Pill, Empty, usePoll, useAction, Modal, Field } from '../components/ui.jsx';

const q = (providerId) => (providerId ? `&providerId=${providerId}` : '');

/* ---------------- Tooth chart ---------------- */
const STATUS = {
  healthy: { label: 'Healthy', bg: '#ffffff', fg: '#16232a' },
  watch: { label: 'Watch', bg: '#fbf0dc', fg: '#8a5a10' },
  caries: { label: 'Decay', bg: '#f6d9d4', fg: '#9a2f22' },
  filled: { label: 'Filled', bg: '#dbe6f2', fg: '#1f4e79' },
  crown: { label: 'Crown', bg: '#e6dff2', fg: '#4b3a7a' },
  rct: { label: 'Root canal', bg: '#d8ecdf', fg: '#256040' },
  implant: { label: 'Implant', bg: '#cfe3e6', fg: '#1d5a63' },
  fracture: { label: 'Fractured', bg: '#f3d2e0', fg: '#8a2a56' },
  extraction: { label: 'To extract', bg: '#f0c7c0', fg: '#7a1f14' },
  missing: { label: 'Missing', bg: '#e4e8e6', fg: '#8d9a9e' },
};
const UPPER = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
const LOWER = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];
const toothKind = (n) => { const d = Number(n[1]); return d <= 2 ? 'incisor' : d === 3 ? 'canine' : d <= 5 ? 'premolar' : 'molar'; };
const toothW = { incisor: 30, canine: 32, premolar: 34, molar: 42 };

export function ToothChart({ patientId, providerId }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState('');
  const [run, busy] = useAction();
  const load = () => get(`/api/doctor/teeth/${patientId}`).then(setData).catch(() => {});
  useEffect(() => { load(); }, [patientId]); // eslint-disable-line
  if (!data) return <div className="skeleton" />;
  const teeth = data.teeth;
  const pick = (n) => { setSel(n); setNote(teeth[n]?.note || ''); };
  const set = (status) => run(async () => { await put(`/api/doctor/teeth/${patientId}`, { tooth: sel, status, note }); await load(); }, `Tooth ${sel} saved`);
  const Row = ({ list, flip }) => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 3, alignItems: flip ? 'flex-start' : 'flex-end' }}>
      {list.map((n, i) => {
        const st = STATUS[teeth[n]?.status || 'healthy']; const k = toothKind(n);
        return (
          <React.Fragment key={n}>
            {i === 8 && <div style={{ width: 2, background: 'var(--border-strong)', margin: '0 4px' }} />}
            <button onClick={() => pick(n)} title={`${n} · ${st.label}${teeth[n]?.note ? ` · ${teeth[n].note}` : ''}`}
              style={{ width: toothW[k], height: k === 'molar' ? 40 : 46, background: st.bg, color: st.fg, border: sel === n ? '2px solid var(--accent)' : '1px solid var(--border-strong)', borderRadius: k === 'molar' ? '6px 6px 10px 10px' : k === 'canine' ? '50% 50% 8px 8px' : '5px 5px 12px 12px', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer', textDecoration: teeth[n]?.status === 'missing' ? 'line-through' : 'none', padding: 0, display: 'flex', alignItems: flip ? 'flex-start' : 'flex-end', justifyContent: 'center', paddingBottom: flip ? 0 : 3, paddingTop: flip ? 3 : 0 }}>{n}</button>
          </React.Fragment>
        );
      })}
    </div>
  );
  return (
    <div className="col gap-16">
      <div className="small muted">Adult teeth in FDI numbering (upper right 11–18, upper left 21–28, lower left 31–38, lower right 41–48). Click a tooth to mark it. Every change is kept in the history.</div>
      <div className="card soft" style={{ padding: 14, overflowX: 'auto' }}>
        <div className="tiny muted" style={{ textAlign: 'center', marginBottom: 4 }}>UPPER · patient's right ← → patient's left</div>
        <Row list={UPPER} /><div style={{ height: 14 }} /><Row list={LOWER} flip />
        <div className="tiny muted" style={{ textAlign: 'center', marginTop: 4 }}>LOWER</div>
      </div>
      <div className="row wrap gap-6">{Object.entries(STATUS).map(([k, v]) => <span key={k} className="tiny" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, background: v.bg, border: '1px solid var(--border-strong)', borderRadius: 3 }} />{v.label}</span>)}</div>
      {sel && (
        <Card title={`Tooth ${sel}${teeth[sel] ? ` · ${STATUS[teeth[sel].status].label}` : ''}`}>
          <Body className="col gap-8">
            <div className="row wrap gap-6">{data.statuses.map((s) => <button key={s} className="btn sm" disabled={busy} style={{ background: STATUS[s].bg, color: STATUS[s].fg }} onClick={() => set(s)}>{STATUS[s].label}</button>)}</div>
            <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. deep distal caries, sensitive to cold" /></Field>
            <ToothPlan patientId={patientId} providerId={providerId} tooth={sel} />
            {teeth[sel]?.updatedAt && <div className="tiny muted">Last changed {fmtWhen(teeth[sel].updatedAt)} by {teeth[sel].by}</div>}
          </Body>
        </Card>
      )}
      {data.history.length > 0 && <Card title="Recent changes"><div className="list">{data.history.slice(0, 8).map((h, i) => <div className="list-item" key={i}><span className="mono small" style={{ width: 36 }}>{h.tooth}</span><div className="grow small">{STATUS[h.from]?.label || h.from} → <b>{STATUS[h.to]?.label || h.to}</b>{h.note ? <span className="muted"> · {h.note}</span> : null}</div><span className="tiny muted">{fmtWhen(h.at)}</span></div>)}</div></Card>}
    </div>
  );
}

/* ---------------- Lab cases ---------------- */
const FLOW_LABEL = { to_send: 'To send', at_lab: 'At the lab', received: 'Back from lab', fitted: 'Fitted' };
const NEXT_LABEL = { to_send: 'Sent to lab', at_lab: 'Received back', received: 'Fitted' };
const NEXT = { to_send: 'at_lab', at_lab: 'received', received: 'fitted' };

export function LabCases({ providerId }) {
  const { data, reload } = usePoll(() => get(`/api/doctor/lab?x=1${q(providerId)}`), [providerId], 15000);
  const patients = usePoll(() => get(`/api/doctor/patients?x=1${q(providerId)}`), [providerId], 0);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ patientId: '', kind: 'Crown', tooth: '', shade: '', lab: '', dueDate: '', notes: '' });
  const [run, busy] = useAction();
  if (!data) return <div className="skeleton" />;
  const move = (c, status) => run(async () => { await patch(`/api/doctor/lab/${c.id}`, { status }); reload(); }, status === 'received' ? 'Marked back from lab. The front desk will call the patient to book the fitting.' : 'Updated');
  const overdue = data.cases.filter((c) => c.overdue).length;
  return (
    <>
      <div className="row between wrap mb-16">
        <div className="small muted">Crowns, bridges, dentures and aligners you sent out. When one comes back, the front desk gets a callback to book the fitting.{overdue > 0 && <b style={{ color: 'var(--marigold, #c8811a)' }}> {overdue} overdue.</b>}</div>
        <button className="btn primary" onClick={() => setAdding(true)}><IconPlus size={16} />New lab case</button>
      </div>
      <div className="grid four">
        {data.flow.map((st) => {
          const cases = data.cases.filter((c) => c.status === st && (st !== 'fitted' || true));
          return (
            <Card key={st} title={<span>{FLOW_LABEL[st]} <span className="muted">· {cases.length}</span></span>}>
              <div className="list">{cases.map((c) => (
                <div className="list-item start" key={c.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div className="small strong">{c.kind}{c.tooth ? ` · tooth ${c.tooth}` : ''}</div>
                  <div className="small">{c.patient}</div>
                  <div className="tiny muted">{[c.lab, c.shade && `shade ${c.shade}`].filter(Boolean).join(' · ')}</div>
                  {c.dueDate && <div className="tiny" style={{ color: c.overdue ? '#9a2f22' : 'var(--muted)' }}>{c.overdue && <IconAlertTriangle size={11} />} due {fmtDate(c.dueDate)}</div>}
                  {c.notes && <div className="tiny muted">{c.notes}</div>}
                  <div className="row gap-6">{NEXT[st] && <button className="btn sm primary" disabled={busy} onClick={() => move(c, NEXT[st])}><IconArrowRight size={12} />{NEXT_LABEL[st]}</button>}{st === 'fitted' && <button className="btn sm ghost" onClick={() => run(async () => { await patch(`/api/doctor/lab/${c.id}`, { archive: true }); reload(); }, 'Archived')}><IconArchive size={12} />Archive</button>}</div>
                </div>
              ))}{cases.length === 0 && <div className="empty small">None</div>}</div>
            </Card>
          );
        })}
      </div>
      {adding && (
        <Modal title="New lab case" onClose={() => setAdding(false)} footer={<><button className="btn" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary" disabled={busy || !f.patientId} onClick={() => run(async () => { await post(`/api/doctor/lab?x=1${q(providerId)}`, f); setAdding(false); setF({ ...f, tooth: '', shade: '', notes: '' }); reload(); }, 'Lab case created')}>Create</button></>}>
          <div className="grid two">
            <Field label="Patient"><select className="input" value={f.patientId} onChange={(e) => setF({ ...f, patientId: e.target.value })}><option value="">Choose…</option>{(patients.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="What is being made"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{data.kinds.map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Tooth (FDI)"><input className="input" value={f.tooth} onChange={(e) => setF({ ...f, tooth: e.target.value })} placeholder="e.g. 36" /></Field>
            <Field label="Shade"><input className="input" value={f.shade} onChange={(e) => setF({ ...f, shade: e.target.value })} placeholder="e.g. A2" /></Field>
            <Field label="Lab"><input className="input" value={f.lab} onChange={(e) => setF({ ...f, lab: e.target.value })} /></Field>
            <Field label="Due back"><input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          </div>
          <Field label="Notes for the lab"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}

/* ---------------- Quick search (Ctrl+K) ---------------- */
export function CommandBar({ providerId, tabs, onTab, onChart, onClose }) {
  const [text, setText] = useState('');
  const [patients, setPatients] = useState([]);
  const [idx, setIdx] = useState(0);
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { get(`/api/doctor/patients?q=${encodeURIComponent(text)}${q(providerId)}`).then((r) => setPatients(r.slice(0, 6))).catch(() => setPatients([])); }, [text, providerId]);
  const items = useMemo(() => {
    const t = text.trim().toLowerCase();
    const goTabs = tabs.filter((x) => !t || x.label.toLowerCase().includes(t)).map((x) => ({ key: `t-${x.id}`, label: `Go to ${x.label}`, hint: 'tab', run: () => onTab(x.id) }));
    const pts = patients.map((p) => ({ key: `p-${p.id}`, label: p.name, hint: p.lastVisit ? `last seen ${fmtDate(p.lastVisit)}` : 'patient', run: () => onChart(p.id) }));
    return [...(t ? pts : []), ...goTabs, ...(t ? [] : pts)].slice(0, 10);
  }, [text, patients, tabs]); // eslint-disable-line
  const go = (it) => { if (it) { it.run(); onClose(); } };
  return (
    <div className="modal-back" onClick={onClose} style={{ alignItems: 'flex-start', paddingTop: 90 }}>
      <div className="card" style={{ width: 'min(560px, 92vw)', margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}><IconSearch size={16} className="faint" />
          <input ref={input} className="input" style={{ border: 'none', boxShadow: 'none' }} placeholder="Find a patient or jump to a tab…" value={text}
            onChange={(e) => { setText(e.target.value); setIdx(0); }}
            onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); } else if (e.key === 'Enter') go(items[idx]); else if (e.key === 'Escape') onClose(); }} /></div>
        <div className="list">{items.map((it, i) => <div key={it.key} className="list-item" style={{ cursor: 'pointer', background: i === idx ? 'var(--accent-soft)' : undefined }} onMouseEnter={() => setIdx(i)} onClick={() => go(it)}><div className="grow small">{it.label}</div><span className="tiny muted">{it.hint}</span></div>)}{items.length === 0 && <Empty>No match.</Empty>}</div>
        <div className="tiny muted" style={{ padding: '8px 14px' }}>↑↓ to move · Enter to open · Esc to close</div>
      </div>
    </div>
  );
}

/* ---------------- Plan treatment from the tooth chart ---------------- */
function ToothPlan({ patientId, providerId, tooth }) {
  const [cat, setCat] = useState(null);
  const [proc, setProc] = useState('');
  const [run, busy] = useAction();
  useEffect(() => { get('/api/doctor/catalogue').then(setCat).catch(() => {}); }, []);
  if (!cat) return null;
  const p = cat.procedures.find((x) => x.id === proc);
  const groups = [...new Set(cat.procedures.map((x) => x.category))];
  return (
    <div className="row wrap gap-6" style={{ alignItems: 'flex-end' }}>
      <Field label={`Plan treatment for tooth ${tooth}`}>
        <select className="input" style={{ minWidth: 260 }} value={proc} onChange={(e) => setProc(e.target.value)}>
          <option value="">Choose a procedure…</option>
          {groups.map((g) => <optgroup key={g} label={g}>{cat.procedures.filter((x) => x.category === g).map((x) => <option key={x.id} value={x.id}>{x.name} · ₹{x.fee}</option>)}</optgroup>)}
        </select>
      </Field>
      <button className="btn primary" disabled={!p || busy} onClick={() => run(async () => { await post(`/api/doctor/teeth/${patientId}/plan${providerId ? `?providerId=${providerId}` : ''}`, { tooth, procedureId: p.id }); setProc(''); }, `${p.name} added to the treatment plan for tooth ${tooth}`)}><IconPlus size={16} />Add to treatment plan</button>
    </div>
  );
}
