import React, { useState } from 'react';
import { IconUserCheck, IconAlertTriangle, IconHandStop, IconArmchair, IconCheck, IconClock, IconDeviceDesktop, IconRefresh, IconPlayerPlay, IconCash, IconBellRinging } from '@tabler/icons-react';
import { get, post, patch } from '../lib/api.js';
import { fmtTime, fmtDateLong, fullName, minutesSince, ago, fmtMoney } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Stat, Empty, usePoll, useAction, Modal, Field } from '../components/ui.jsx';
import { navigate } from '../App.jsx';

const LANES = [
  { key: 'expected', title: 'Expected', icon: IconClock, match: (r) => r.stage === 'expected' },
  { key: 'checking', title: 'Arrived / checking in', icon: IconDeviceDesktop, match: (r) => ['arrived', 'checking_in'].includes(r.stage) },
  { key: 'attention', title: 'Needs attention', icon: IconAlertTriangle, match: (r) => r.stage === 'needs_attention' },
  { key: 'ready', title: 'Ready / called', icon: IconUserCheck, match: (r) => ['ready', 'called'].includes(r.stage) },
  { key: 'chair', title: 'In chair / done', icon: IconArmchair, match: (r) => ['brought_back', 'done', 'no_show'].includes(r.stage) },
];

export default function Dashboard({ branch, locations }) {
  const { data, reload } = usePoll(() => get(`/api/arrivals${branch ? `?locationId=${branch}` : ''}`), [branch], 5000);
  const activity = usePoll(() => get('/api/admin/activity?limit=12'), [], 8000);
  const settings = usePoll(() => get('/api/settings'), []);
  const [run] = useAction();
  const [detail, setDetail] = useState(null);
  const [paying, setPaying] = useState(null);
  const board = data?.board || [];
  const now = Date.now();
  const act = (fn, msg) => run(async () => { await fn(); await reload(); activity.reload(); }, msg);
  const waiting = board.filter((r) => r.visit && ['arrived', 'checking_in', 'needs_attention', 'ready', 'called'].includes(r.stage));
  const longest = waiting.reduce((m, r) => Math.max(m, minutesSince(r.visit.arrivedAt, now)), 0);
  const providers = (settings.data?.providers || []).filter((p) => !branch || !p.locationIds?.length || p.locationIds.includes(branch));
  const branchName = locations.find((l) => l.id === branch)?.name;

  return (
    <>
      <div className="page-head">
        <div><h1>Live arrivals{branchName ? ` · ${branchName}` : ''}</h1><p>{fmtDateLong(new Date().toISOString())} · Kiosk, front desk and the dentist's screen all update the same visit. Tokens show on the waiting-room display.</p></div>
        <div className="row"><a className="btn" href={`#/board${branch ? `?location=${branch}` : ''}`} target="_blank" rel="noreferrer"><IconBellRinging size={16} />Open display</a><button className="btn" onClick={() => { reload(); activity.reload(); }}><IconRefresh size={16} />Refresh</button></div>
      </div>

      <div className="grid four mb-16">
        <Stat value={board.filter((r) => r.stage === 'expected').length} label="Still expected today" />
        <Stat value={waiting.length} label="In the waiting room" hint={waiting.length ? `Longest wait ${longest} min` : ''} tone={longest > 20 ? 'warn' : ''} />
        <Stat value={board.filter((r) => r.stage === 'needs_attention').length + (data?.helpRequests?.length || 0)} label="Need attention" tone={board.some((r) => r.stage === 'needs_attention') || data?.helpRequests?.length ? 'bad' : ''} />
        <Stat value={fmtMoney(data?.collected || 0)} label="Collected today" hint={`${board.filter((r) => r.appointment.paymentStatus === 'unpaid' && ['brought_back', 'done'].includes(r.stage)).length} visits unpaid`} tone="accent" />
      </div>

      {data && !data.open && <div className="callout mb-16 row between"><span><b>Closed now.</b> The AI is answering after-hours; opens {data.opensLabel}. {data.callbacks ? `${data.callbacks} callback${data.callbacks === 1 ? '' : 's'} waiting.` : ''}</span><a className="btn sm" href="#/callbacks">Open callbacks</a></div>}
      {data?.open && (data.callbacks > 0 || data.missedToday > 0) && <div className="callout warn mb-16 row between"><span>{data.callbacks ? <><b>{data.callbacks}</b> callback{data.callbacks === 1 ? '' : 's'} to make. </> : null}{data.missedToday ? <><b>{data.missedToday}</b> missed appointment{data.missedToday === 1 ? '' : 's'} today, patients messaged to rebook.</> : null}</span><a className="btn sm" href="#/callbacks">Open callbacks</a></div>}
      {data?.helpRequests?.length > 0 && (
        <div className="callout bad mb-16 row between">
          <div className="row"><IconHandStop size={18} />{data.helpRequests.map((h) => <span key={h.id}>{h.text} · {ago(h.at, now)}</span>)}</div>
          <button className="btn sm" onClick={() => act(() => post(`/api/kiosk/help/${data.helpRequests[0].id}/resolve`), 'Help request resolved')}>Resolved</button>
        </div>
      )}

      <Card className="mb-16"><Body className="row wrap gap-6">
        <span className="small muted">Call next for:</span>
        {providers.map((p) => { const n = board.filter((r) => r.appointment.providerId === p.id && r.visit && ['ready', 'arrived', 'checking_in', 'needs_attention'].includes(r.stage)).length; return <button key={p.id} className="btn sm" disabled={!n} onClick={() => act(() => post('/api/arrivals/call-next', { providerId: p.id, locationId: branch || undefined }), `Called next for ${p.name}`)}><IconPlayerPlay size={13} />{p.name.replace('Dr. ', '')}{n ? <span className="badge soft">{n}</span> : null}</button>; })}
      </Body></Card>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        {LANES.map((lane) => {
          const rows = board.filter(lane.match);
          return (
            <div className="lane" key={lane.key}>
              <div className="lane-head"><lane.icon size={15} className="muted" />{lane.title}<span className="badge soft">{rows.length}</span></div>
              {rows.length === 0 && <div className="card soft" style={{ padding: 16, textAlign: 'center' }}><span className="tiny faint">Nobody here</span></div>}
              {rows.map((r) => <ArrivalCard key={r.appointment.id} row={r} now={now} onOpen={() => setDetail(r)} act={act} onPay={() => setPaying(r)} showBranch={!branch && locations.length > 1} />)}
            </div>
          );
        })}
      </div>

      <div className="grid side mt-16">
        <Card title="Today's visit list">
          <table className="table">
            <thead><tr><th>Token</th><th>Time</th><th>Patient</th><th>Visit</th><th>Dentist</th><th>Forms</th><th>Insurance</th><th>Payment</th><th>Status</th></tr></thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.appointment.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>
                  <td>{r.visit?.token ? <span className="token-chip">{r.visit.token}</span> : <span className="faint">—</span>}</td>
                  <td className="mono">{fmtTime(r.appointment.start)}</td>
                  <td className="strong">{fullName(r.patient)}{!branch && locations.length > 1 && <div className="tiny muted" style={{ fontWeight: 400 }}>{r.location?.name}</div>}</td>
                  <td>{r.visitType?.name}</td>
                  <td className="muted">{r.provider?.name}</td>
                  <td><Pill status={r.packet?.status || 'created'} /></td>
                  <td>{r.insurance?.type === 'self' && r.packet?.status ? <Pill>Self-pay</Pill> : r.insurance?.carrier ? <Pill tone={r.insurance.verified ? 'good' : r.insurance.cardScannedAt ? 'info' : 'warn'}>{r.insurance.verified ? 'Verified' : r.insurance.cardScannedAt ? 'Scanned' : 'Unverified'}</Pill> : <Pill tone="warn">Missing</Pill>}</td>
                  <td>{r.appointment.fee ? <Pill status={r.appointment.paymentStatus || 'unpaid'}>{fmtMoney(r.appointment.paidAmount ?? r.appointment.fee)}</Pill> : <span className="faint">—</span>}</td>
                  <td><Pill status={r.stage} /></td>
                </tr>
              ))}
              {board.length === 0 && <tr><td colSpan={9}><Empty>No appointments today.</Empty></td></tr>}
            </tbody>
          </table>
        </Card>
        <Card title="Activity">
          <div className="list">
            {(activity.data || []).map((a) => (
              <div className="list-item" key={a.id}><span className={`dot ${a.type === 'escalation' || a.type === 'kiosk_help' ? 'bad' : a.type === 'kiosk' ? 'accent' : a.type === 'ai' ? 'info' : a.type === 'payment' ? 'good' : ''}`} /><div className="grow"><div className="small">{a.text}</div><div className="tiny faint">{ago(a.at, now)}</div></div></div>
            ))}
          </div>
        </Card>
      </div>

      {detail && <VisitDetail row={board.find((r) => r.appointment.id === detail.appointment.id) || detail} onClose={() => setDetail(null)} act={act} onPay={() => { setPaying(detail); }} />}
      {paying && settings.data && <PaymentModal row={paying} modes={settings.data.paymentModes || ['UPI', 'Cash', 'Card']} onClose={() => setPaying(null)} onDone={() => { setPaying(null); reload(); }} />}
    </>
  );
}

function ArrivalCard({ row, now, onOpen, act, onPay, showBranch }) {
  const v = row.visit;
  const cls = v?.helpRequested ? 'help' : row.stage === 'needs_attention' ? 'attention' : ['ready', 'called'].includes(row.stage) ? 'ready' : '';
  return (
    <div className={`lane-card ${cls}`}>
      <div className="row" style={{ cursor: 'pointer' }} onClick={onOpen}>
        {v?.token ? <span className="token-chip" style={{ fontSize: 14, padding: '6px 8px' }}>{v.token}</span> : <Avatar patient={row.patient} />}
        <div className="grow">
          <div className="strong truncate">{fullName(row.patient)}</div>
          <div className="tiny muted">{fmtTime(row.appointment.start)} · {row.visitType?.name}{showBranch ? ` · ${row.location?.name}` : ''}</div>
        </div>
      </div>
      {v?.helpRequested && <div className="tiny" style={{ color: 'var(--bad)' }}><IconHandStop size={12} /> Asked for help{v.helpNote ? `: ${v.helpNote}` : ''}</div>}
      {row.missing.length > 0 && row.stage !== 'done' && <div className="tiny" style={{ color: 'var(--warn)' }}>Missing: {row.missing.join(', ')}</div>}
      {v && row.stage !== 'done' && <div className="tiny faint">{row.stage === 'called' ? `Called ${ago(v.calledAt, now)}` : `Waiting ${minutesSince(v.arrivedAt, now)} min`} · {v.checkInSource === 'kiosk' ? 'kiosk' : 'front desk'}</div>}
      <div className="row gap-6 wrap">
        {row.stage === 'expected' && <button className="btn sm" onClick={() => act(() => post(`/api/arrivals/${row.appointment.id}/arrive`), 'Marked arrived, token issued')}>Arrived</button>}
        {v?.helpRequested && <button className="btn sm primary" onClick={() => act(() => patch(`/api/arrivals/visits/${v.id}`, { resolveHelp: true }), 'Help resolved')}>Helped</button>}
        {row.stage === 'needs_attention' && !v?.helpRequested && <button className="btn sm" onClick={() => act(() => patch(`/api/arrivals/visits/${v.id}`, { status: 'ready' }), 'Marked ready')}>Mark ready anyway</button>}
        {row.stage === 'ready' && <button className="btn sm" onClick={() => act(() => patch(`/api/arrivals/visits/${v.id}`, { status: 'called' }), `Called ${v.token}`)}><IconPlayerPlay size={13} />Call</button>}
        {['ready', 'called'].includes(row.stage) && <button className="btn sm primary" onClick={() => act(() => patch(`/api/arrivals/visits/${v.id}`, { status: 'brought_back' }), 'In chair')}><IconArmchair size={14} />In chair</button>}
        {row.stage === 'brought_back' && <button className="btn sm" onClick={() => act(() => patch(`/api/arrivals/visits/${v.id}`, { status: 'done' }), 'Visit completed')}><IconCheck size={14} />Done</button>}
        {['brought_back', 'done'].includes(row.stage) && row.appointment.fee > 0 && row.appointment.paymentStatus === 'unpaid' && <button className="btn sm soft" onClick={onPay}><IconCash size={14} />Collect {fmtMoney(row.appointment.fee)}</button>}
      </div>
    </div>
  );
}

function PaymentModal({ row, modes, onClose, onDone }) {
  const [mode, setMode] = useState(modes[0]);
  const [amount, setAmount] = useState(row.appointment.fee || 0);
  const [reference, setReference] = useState('');
  const [run, busy] = useAction();
  return (
    <Modal title={`Collect payment · ${fullName(row.patient)}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => run(async () => { await post(`/api/arrivals/${row.appointment.id}/payment`, { amount: Number(amount), mode, reference }); onDone(); }, 'Payment recorded')}><IconCheck size={16} />Record {fmtMoney(amount)}</button></>}>
      <div className="row wrap gap-6">{modes.map((m) => <button key={m} className={`btn ${mode === m ? 'primary' : ''}`} onClick={() => setMode(m)}>{m}</button>)}</div>
      <div className="grid two">
        <Field label="Amount"><input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={mode === 'UPI' ? 'UPI transaction ID' : mode === 'Insurance / cashless' ? 'Pre-auth / claim number' : 'Reference'}><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" /></Field>
      </div>
      <div className="tiny muted">Recorded against the visit and included in Insights. Connect a payment gateway or your billing software through Settings → Integrations to sync receipts.</div>
    </Modal>
  );
}

function VisitDetail({ row, onClose, act, onPay }) {
  const v = row.visit;
  return (
    <Modal title={`${v?.token ? v.token + ' · ' : ''}${fullName(row.patient)}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="row wrap gap-6"><Pill status={row.stage} /><Pill tone="outline">{row.visitType?.name}</Pill><Pill tone="outline">{fmtTime(row.appointment.start)} · {row.provider?.name}</Pill><Pill tone="outline">{row.location?.name}</Pill>{row.appointment.fee ? <Pill status={row.appointment.paymentStatus || 'unpaid'}>{fmtMoney(row.appointment.fee)} · {row.appointment.paymentStatus || 'unpaid'}{row.appointment.paymentMode ? ` · ${row.appointment.paymentMode}` : ''}</Pill> : null}</div>
      <div className="grid two">
        <Card soft><Body>
          <div className="small muted mb-8">Pre-visit forms</div>
          <div className="row between"><Pill status={row.packet?.status || 'created'} />{row.packet && <a className="small" href={`#/previsit?packet=${row.packet.id}`} onClick={onClose}>Open</a>}</div>
          {row.missing.length > 0 && <div className="small mt-8" style={{ color: 'var(--warn)' }}>Missing: {row.missing.join(', ')}</div>}
          {row.packet && !row.packet.sentAt && <button className="btn sm mt-8" onClick={() => act(() => post('/api/forms/send', { appointmentId: row.appointment.id }), 'Forms sent')}>Send forms link</button>}
        </Body></Card>
        <Card soft><Body>
          <div className="small muted mb-8">Insurance / scheme</div>
          <div className="strong">{row.insurance?.carrier || (row.insurance?.type === 'self' ? 'Self-pay' : 'None on file')}</div>
          {row.insurance?.memberId && <div className="small mono">{row.insurance.memberId}{row.insurance.tpa ? ` · TPA ${row.insurance.tpa}` : ''}</div>}
          <div className="tiny muted mt-8">{row.insurance?.verified ? 'Verified' : row.insurance?.cardScannedAt ? `Card scanned ${ago(row.insurance.cardScannedAt)}` : 'Not verified'}{row.patient?.abhaNumber ? ` · ABHA ${row.patient.abhaNumber}` : ''}</div>
          {v && row.insurance?.carrier && !row.insurance.verified && <button className="btn sm mt-8" onClick={() => act(() => patch(`/api/arrivals/visits/${v.id}`, { insuranceVerified: true }), 'Insurance verified')}>Mark verified / pre-auth received</button>}
        </Body></Card>
      </div>
      {v && (
        <Card soft><Body>
          <div className="small muted mb-8">Visit timeline</div>
          <div className="col gap-4 small">
            <div>Arrived {fmtTime(v.arrivedAt)} via {v.checkInSource} · token {v.token}</div>
            {v.insuranceScannedAt && <div>Insurance card scanned {fmtTime(v.insuranceScannedAt)}</div>}
            {v.consentSignedAt && <div>Consent signed {fmtTime(v.consentSignedAt)}</div>}
            {v.readyAt && <div>Ready {fmtTime(v.readyAt)}</div>}
            {v.calledAt && <div>Called {fmtTime(v.calledAt)}</div>}
            {v.broughtBackAt && <div>In chair {fmtTime(v.broughtBackAt)}</div>}
            {v.doneAt && <div>Done {fmtTime(v.doneAt)}</div>}
            {row.appointment.paidAt && <div>Paid {fmtMoney(row.appointment.paidAmount)} by {row.appointment.paymentMode} {fmtTime(row.appointment.paidAt)}</div>}
          </div>
        </Body></Card>
      )}
      <div className="row gap-6 wrap">
        {row.stage === 'expected' && <><button className="btn primary" onClick={() => act(() => post(`/api/arrivals/${row.appointment.id}/arrive`), 'Marked arrived').then(onClose)}>Mark arrived</button><button className="btn danger" onClick={() => act(() => post(`/api/arrivals/${row.appointment.id}/no-show`), 'Marked no-show').then(onClose)}>No-show</button></>}
        {v && ['arrived', 'checking_in', 'needs_attention'].includes(row.stage) && <button className="btn" onClick={() => act(() => patch(`/api/arrivals/visits/${v.id}`, { status: 'ready' }), 'Marked ready').then(onClose)}>Mark ready</button>}
        {v && ['ready', 'called'].includes(row.stage) && <button className="btn primary" onClick={() => act(() => patch(`/api/arrivals/visits/${v.id}`, { status: 'brought_back' }), 'In chair').then(onClose)}>In chair</button>}
        {v && row.stage === 'brought_back' && <button className="btn primary" onClick={() => act(() => patch(`/api/arrivals/visits/${v.id}`, { status: 'done' }), 'Visit completed').then(onClose)}>Mark done</button>}
        {row.appointment.fee > 0 && row.appointment.paymentStatus === 'unpaid' && <button className="btn soft" onClick={() => { onClose(); onPay(); }}><IconCash size={16} />Collect payment</button>}
        <button className="btn ghost" onClick={() => { onClose(); navigate(`#/schedule?appointment=${row.appointment.id}`); }}>Open in schedule</button>
        <button className="btn ghost" onClick={() => { onClose(); navigate(`#/patients?id=${row.patient.id}`); }}>Patient record</button>
      </div>
    </Modal>
  );
}
