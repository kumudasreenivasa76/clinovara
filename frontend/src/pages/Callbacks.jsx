import React, { useState } from 'react';
import { IconPhoneOff, IconMoon, IconCalendarX, IconCheck, IconPhoneCall, IconPlus, IconCalendarPlus } from '@tabler/icons-react';
import { get, post } from '../lib/api.js';
import { fullName, fmtPhone, ago, fmtWhen } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, useAction, Seg, Stat, Field, Modal } from '../components/ui.jsx';
import { navigate } from '../App.jsx';

const SRC = { after_hours: { label: 'After-hours message', icon: IconMoon, tone: 'violet' }, missed_call: { label: 'Missed call', icon: IconPhoneOff, tone: 'bad' }, no_show: { label: 'Missed appointment', icon: IconCalendarX, tone: 'warn' }, lab_case: { label: 'Lab work arrived', icon: IconCalendarX, tone: 'warn' } };

/** The morning list: who wrote or called while the clinic was closed, who did not turn up, and who we could not answer. */
export default function Callbacks() {
  const { data, reload } = usePoll(() => get('/api/callbacks'), [], 8000);
  const [filter, setFilter] = useState('all');
  const [logging, setLogging] = useState(false);
  const [note, setNote] = useState({});
  const [run] = useAction();
  const act = (fn, msg) => run(async () => { await fn(); reload(); }, msg);
  if (!data) return <div className="skeleton" />;
  const items = data.items.filter((c) => filter === 'all' || c.source === filter).sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1) || a.createdAt.localeCompare(b.createdAt));
  return (
    <>
      <div className="page-head">
        <div><h1>Callbacks</h1><p>{data.open ? 'The clinic is open.' : `The clinic is closed; opens ${data.opensLabel}.`} After-hours messages, missed calls and missed appointments land here so nobody is forgotten. Work top to bottom; high priority first.</p></div>
        <div className="row"><Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: `All (${data.items.length})` }, { value: 'after_hours', label: `After hours (${data.counts.after_hours})` }, { value: 'missed_call', label: `Missed calls (${data.counts.missed_call})` }, { value: 'no_show', label: `Missed visits (${data.counts.no_show})` }]} /><button className="btn" onClick={() => setLogging(true)}><IconPlus size={16} />Log a missed call</button></div>
      </div>
      <div className="grid four mb-16">
        <Stat value={data.counts.after_hours} label="Wrote while we were closed" tone={data.counts.after_hours ? 'warn' : ''} />
        <Stat value={data.counts.missed_call} label="Calls we did not answer" tone={data.counts.missed_call ? 'bad' : ''} />
        <Stat value={data.counts.no_show} label="Missed appointments to rebook" tone={data.counts.no_show ? 'warn' : ''} />
        <Stat value={data.items.filter((c) => c.priority === 'high').length} label="High priority (pain, clinical)" tone={data.items.some((c) => c.priority === 'high') ? 'bad' : 'good'} />
      </div>
      <Card>
        <div className="list">
          {items.map((c) => { const S = SRC[c.source] || SRC.after_hours; return (
            <div className="list-item start" key={c.id}>
              <Avatar patient={c.patient} name={c.contactName} />
              <div className="grow">
                <div className="row gap-6 wrap"><span className="strong">{c.contactName || fmtPhone(c.contactPhone)}</span><Pill tone={S.tone}><S.icon size={12} />{S.label}</Pill>{c.priority === 'high' && <Pill tone="bad">High priority</Pill>}<span className="tiny faint">{fmtPhone(c.contactPhone)} · {ago(c.createdAt)}{c.appointment ? ` · was ${fmtWhen(c.appointment.start)}` : ''}</span></div>
                <div className="small muted" style={{ marginTop: 4 }}>{c.reason}</div>
                {c.attempts.length > 0 && <div className="tiny faint" style={{ marginTop: 4 }}>{c.attempts.map((a, i) => <span key={i}>{a.by}: {a.outcome} {ago(a.at)}{a.note ? ` — ${a.note}` : ''}{i < c.attempts.length - 1 ? ' · ' : ''}</span>)}</div>}
                <div className="row gap-6 mt-8"><input className="input" style={{ maxWidth: 320, padding: '4px 8px' }} placeholder="Note (optional)" value={note[c.id] || ''} onChange={(e) => setNote({ ...note, [c.id]: e.target.value })} /></div>
              </div>
              <div className="col gap-4">
                {c.conversationId && <a className="btn sm" href="#/inbox"><IconPhoneCall size={14} />Open chat</a>}
                {c.patientId && <button className="btn sm" onClick={() => navigate(`#/schedule?patient=${c.patientId}`)}><IconCalendarPlus size={14} />{c.source === 'no_show' ? 'Rebook' : c.source === 'lab_case' ? 'Book fitting' : 'Book'}</button>}
                <button className="btn sm ghost" onClick={() => act(() => post(`/api/callbacks/${c.id}/attempt`, { outcome: 'no answer', note: note[c.id] || '' }), 'Attempt logged')}>Tried, no answer</button>
                <button className="btn sm primary" onClick={() => act(() => post(`/api/callbacks/${c.id}/done`, { note: note[c.id] || '' }), 'Done')}><IconCheck size={14} />Done</button>
              </div>
            </div>
          ); })}
          {items.length === 0 && <Empty icon={<IconCheck size={28} />}>Nothing waiting. Missed calls from your phone system arrive here automatically once it is connected; until then, log them with the button above.</Empty>}
        </div>
      </Card>
      {logging && <LogMissedCall onClose={() => setLogging(false)} onDone={() => { setLogging(false); reload(); }} />}
    </>
  );
}

function LogMissedCall({ onClose, onDone }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [run, busy] = useAction();
  return (
    <Modal title="Log a missed call" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || phone.replace(/\D/g, '').length < 10} onClick={() => run(async () => { await post('/api/callbacks/missed-call', { phone, contactName: name }); onDone(); }, 'Logged and patient messaged')}>Log call</button></>}>
      <Field label="Mobile number"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98450 12345" autoFocus /></Field>
      <Field label="Name (if not a patient on file)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="tiny muted">The patient gets the approved "sorry we missed your call" message on WhatsApp, and a callback is added here. A phone system can post the same thing to <span className="mono">POST /api/callbacks/missed-call</span>.</div>
    </Modal>
  );
}
