import React, { useEffect, useState } from 'react';
import { IconSparkles, IconCheck, IconPlus, IconWand, IconFlask, IconBooks, IconShieldCheck } from '@tabler/icons-react';
import { get, post, put } from '../lib/api.js';
import { ago, fmtWhen, fmtMoney, LANG_NAME } from '../lib/format.js';
import { Card, Body, Pill, Empty, usePoll, useAction, Modal, Field, Seg } from '../components/ui.jsx';
import { MetricTile, HBars, TrendChart, StackBar } from '../components/dash.jsx';

export const GOAL_LABEL = { thank_you: 'Thank-you', review: 'Review request', welcome: 'Welcome', aftercare: 'Aftercare', birthday: 'Birthday' };
const EXAMPLES = ['Remind patients their 6-month cleaning is due', 'Wish everyone a happy Diwali in Hindi', 'Win back patients who have not visited in over a year', '20% off teeth whitening this November, valid till the 30th', 'Ask happy patients to refer a family member'];
const num = (n) => Number(n || 0).toLocaleString('en-IN');

/* ---------- Ask AI: describe a goal, get a ready draft ---------- */
export function AskAI({ onSaved }) {
  const [ask, setAsk] = useState('');
  const [lang, setLang] = useState('en');
  const [plan, setPlan] = useState(null);
  const [run, busy] = useAction();
  const make = (text = ask) => run(async () => { setPlan(await post('/api/marketing/plan', { ask: text, lang })); }, null);
  const save = () => run(async () => {
    const c = await post('/api/marketing/campaigns', { name: plan.name, goal: plan.goal, segment: plan.segment, lang: plan.lang, brief: plan.brief, festival: plan.festival, body: plan.body, notes: plan.notes, engine: plan.engine });
    setPlan(null); setAsk(''); onSaved(c.id);
  }, 'Saved as a draft. Read it, then submit it for approval.');
  return (
    <Card title="Tell Clinovara what you want to achieve" className="mb-16">
      <Body className="col gap-12">
        <div className="row gap-8 wrap">
          <input className="input grow" style={{ minWidth: 260 }} value={ask} maxLength={500} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask.trim().length > 3 && make()} placeholder="e.g. Bring back patients who have not visited this year" />
          <select className="input" style={{ width: 130 }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language"><option value="en">English</option><option value="hi">हिन्दी</option><option value="kn">ಕನ್ನಡ</option></select>
          <button className="btn primary" disabled={busy || ask.trim().length < 4} onClick={() => make()}><IconSparkles size={16} />Plan it</button>
        </div>
        {!plan && <div className="row gap-6 wrap">{EXAMPLES.map((x) => <button key={x} className="btn sm ghost" onClick={() => { setAsk(x); make(x); }}>{x}</button>)}</div>}
        {plan && <div className="plan">
          <div className="row between wrap"><div className="strong">{plan.name}</div><span className="tiny muted">{plan.engine === 'claude' ? 'Planned by Claude' : 'Planned from keywords. Connect Claude for smarter plans'}</span></div>
          <div className="small muted" style={{ margin: '4px 0 10px' }}>{plan.why}</div>
          <div className="row gap-6 wrap mb-8"><Pill tone="outline">{plan.segmentName}</Pill><Pill tone="info">{plan.eligibleCount} will receive it</Pill>{plan.audienceCount !== plan.eligibleCount && <Pill tone="warn">{plan.audienceCount - plan.eligibleCount} paused: messaged recently</Pill>}<Pill tone="outline">{LANG_NAME[plan.lang] || plan.lang}</Pill></div>
          <textarea className="input" style={{ minHeight: 130 }} value={plan.body} onChange={(e) => setPlan({ ...plan, body: e.target.value })} />
          {plan.notes && <div className="callout warn small mt-8"><b>Check before approving:</b> {plan.notes}</div>}
          <div className="row gap-8 wrap mt-8">
            <button className="btn primary" disabled={busy || !plan.body.trim()} onClick={save}><IconCheck size={16} />Save as draft</button>
            <button className="btn" disabled={busy} onClick={() => make()}>Plan again</button>
            <button className="btn ghost" onClick={() => setPlan(null)}>Discard</button>
            <span className="tiny muted">Best time to send: {fmtWhen(plan.suggestedWhen)}. Nothing is sent until an owner approves.</span>
          </div>
        </div>}
      </Body>
    </Card>
  );
}

/* ---------- Analytics ---------- */
export function Analytics({ me }) {
  const [days, setDays] = useState(30);
  const { data: a } = usePoll(() => get(`/api/marketing/analytics?days=${days}`), [days], 60000);
  if (!a) return <div className="skeleton" />;
  const r = a.revenue; const m = a.marketing; const rc = a.reach; const s = a.site;
  const dayLabels = (xs) => xs.map((x) => x.day);
  const slug = me?.tenant?.slug; const base = `${window.location.origin}${window.location.pathname}#/site?t=${slug}`;
  return (
    <>
      <div className="row between wrap mb-16"><div className="small muted">Every figure is worked out from your own appointments, payments and messages.</div><Seg value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} /></div>

      <h3 className="section-h">Revenue</h3>
      <div className="mgrid">
        <MetricTile label="Collected" value={fmtMoney(r.total)} cur={r.total} prev={r.previous} series={r.series.map((x) => x.value)} />
        <MetricTile label="Paid visits" value={num(r.visits)} cur={r.visits} prev={r.previousVisits} />
        <MetricTile label="Average per visit" value={fmtMoney(r.averageVisit)} hint="paid visits only" />
        <MetricTile label="Still to collect" value={fmtMoney(r.outstanding)} hint={`${r.outstandingVisits} completed visit${r.outstandingVisits === 1 ? '' : 's'} unpaid`} invert />
      </div>
      <Card title="Collected each day" className="mb-16"><Body><TrendChart days={dayLabels(r.series)} values={r.series.map((x) => x.value)} format={fmtMoney} unit="collected" /></Body></Card>
      <div className="grid three mb-16">
        <Card title="New and returning patients"><Body>{r.total ? <StackBar parts={[{ label: 'Returning patients', value: r.fromReturning }, { label: 'New this period', value: r.fromNewPatients }]} format={fmtMoney} /> : <div className="small muted">No payments in this period.</div>}<div className="tiny muted mt-8">{fmtMoney(r.fromMarketing)} ({r.marketingShare}%) followed a recall, campaign or treatment message.</div></Body></Card>
        <Card title="By kind of visit"><Body>{r.byType.length ? <HBars rows={r.byType.map((x) => ({ label: x.name, value: x.revenue, visits: x.visits }))} format={fmtMoney} second={(x) => `${x.visits} visit${x.visits === 1 ? '' : 's'}`} /> : <div className="small muted">Nothing yet.</div>}</Body></Card>
        <Card title="By how patients found you"><Body>{r.bySource.length ? <HBars rows={r.bySource.map((x) => ({ label: x.source, value: x.value }))} format={fmtMoney} /> : <div className="small muted">Nothing yet.</div>}</Body></Card>
      </div>

      <h3 className="section-h">Marketing results</h3>
      <div className="mgrid">
        <MetricTile label="Messages that ask for a visit" value={num(m.messages)} cur={m.messages} prev={m.previousMessages} />
        <MetricTile label="Bookings that followed" value={num(m.bookings)} cur={m.bookings} prev={m.previousBookings} hint={`within ${m.attributionDays} days`} />
        <MetricTile label="Collected from those" value={fmtMoney(m.revenue)} hint={`${m.conversion}% of messages`} />
        <MetricTile label="Patients who replied" value={`${rc.replyRate}%`} hint={`${num(rc.replies)} of ${num(rc.pushSent)} messages`} />
      </div>
      <div className="grid side mb-16">
        <Card title="What each campaign led to">
          <table className="table">
            <thead><tr><th>Campaign</th><th style={{ textAlign: 'right' }}>Sent</th><th style={{ textAlign: 'right' }}>Replied</th><th style={{ textAlign: 'right' }}>Bookings</th><th style={{ textAlign: 'right' }}>Collected</th></tr></thead>
            <tbody>
              {m.campaigns.length === 0 && <tr><td colSpan="5" className="small muted" style={{ padding: 18 }}>No campaigns sent in this period.</td></tr>}
              {m.campaigns.map((c) => <tr key={c.id}><td><span className="strong">{c.name}</span><div className="tiny muted">{c.goalName}</div></td><td className="mono" style={{ textAlign: 'right' }}>{c.sent}</td><td className="mono" style={{ textAlign: 'right' }}>{c.replies} <span className="muted">({c.replyRate}%)</span></td><td className="mono" style={{ textAlign: 'right' }}>{c.bookings} <span className="muted">({c.conversion}%)</span></td><td className="mono" style={{ textAlign: 'right' }}>{fmtMoney(c.revenue)}</td></tr>)}
            </tbody>
          </table>
          <div className="tiny muted" style={{ padding: '10px 16px 14px' }}>A booking is counted when a patient with nothing booked makes one within {m.attributionDays} days after a message. It shows what followed, not proof the message caused it.</div>
        </Card>
        <Card title="Which kind of message earns most"><Body>{m.byGoal.length ? <HBars rows={m.byGoal.map((x) => ({ label: x.goal, value: x.revenue, sent: x.sent }))} format={fmtMoney} second={(x) => `${x.sent} sent`} /> : <div className="small muted">Send a campaign to see this.</div>}</Body></Card>
      </div>

      <h3 className="section-h">Reach-out</h3>
      <div className="mgrid">
        <MetricTile label="Messages sent" value={num(rc.sent)} cur={rc.sent} prev={rc.previous} />
        <MetricTile label="Patients reached" value={num(rc.patientsReached)} hint={`${rc.reachPercent}% of all patients`} />
        <MetricTile label="Sent automatically" value={`${rc.automatedShare}%`} hint="reminders, recalls and approved follow-ups" />
        <MetricTile label="Can be messaged" value={`${rc.consent.percent}%`} hint={`${rc.consent.optedIn} of ${rc.consent.total} patients opted in`} />
      </div>
      <div className="grid side mb-16">
        <Card title="Messages each day"><Body><TrendChart days={dayLabels(rc.series)} values={rc.series.map((x) => x.marketing + x.care)} unit="messages" /></Body></Card>
        <Card title="What was sent"><Body><HBars rows={rc.byType.slice(0, 8).map((x) => ({ label: x.label, value: x.count }))} /></Body></Card>
      </div>
      <div className="callout small mb-16">
        {rc.deliveryTracked ? `Delivered and read receipts come from ${rc.provider}.` : 'Delivered and read counts need WhatsApp or SMS connected. Until then this shows what was sent and who wrote back.'}
        {rc.capDays ? ` Campaigns skip anyone messaged in the last ${rc.capDays} days (${rc.cappedNow} patients are paused right now${rc.skippedByCap ? `, ${rc.skippedByCap} skipped in this period` : ''}).` : ''}
      </div>

      <h3 className="section-h">Website views and bookings</h3>
      <div className="mgrid">
        <MetricTile label="Booking page views" value={num(s.views)} cur={s.views} prev={s.previousViews} series={s.series.map((x) => x.value)} />
        <MetricTile label="Looked at times" value={num(s.slotChecks)} hint="opened the slot picker" />
        <MetricTile label="Chats started" value={num(s.chats)} hint="website chat" />
        <MetricTile label="Booked online" value={num(s.bookings)} hint={s.views ? `${s.viewToBooking}% of views` : ''} />
      </div>
      <div className="grid side mb-16">
        <Card title="Page views each day"><Body>{s.tracked ? <TrendChart days={dayLabels(s.series)} values={s.series.map((x) => x.value)} unit="views" /> : <div className="small muted">Views appear here once someone opens your booking page.</div>}</Body></Card>
        <Card title="Where views come from"><Body className="col gap-8">
          {s.sources.length ? <HBars rows={s.sources.map((x) => ({ label: x.source, value: x.count }))} /> : <div className="small muted">No tagged links used yet.</div>}
          <div className="tiny muted">This counts loads of your own booking page, not Google or Instagram impressions. Tag the link you put in each place so you can tell them apart:</div>
          {['google', 'maps', 'instagram', 'whatsapp'].map((k) => <div key={k} className="row gap-6 tiny"><span style={{ width: 70 }} className="muted">{k}</span><code className="mono grow" style={{ overflowWrap: 'anywhere' }}>{`${base}&src=${k}`}</code></div>)}
        </Body></Card>
      </div>
    </>
  );
}

/* ---------- Automations ---------- */
const KEY = { thank_you: 'autoThankYou', review: 'autoReview' };
export function Automations({ data, act }) {
  const prompts = data.prompts; const st = data.settings;
  const cfg = (id) => (KEY[id] ? st[KEY[id]] : st.automations?.[id]) || {};
  const save = (id, patch) => act(() => put('/api/marketing/settings', KEY[id] ? { [KEY[id]]: patch } : { automations: { [id]: patch } }), 'Saved');
  const count = (id, status) => data.queue.filter((q) => q.goal === id && q.status === status).length;
  return (
    <Card title="Messages that go out on their own">
      <Body className="col gap-12">
        <div className="callout small">Each one is written for a single patient when something happens, such as a visit finishing or a birthday. Choose whether every message waits for you to approve it, or goes out by itself from a prompt you have already approved.</div>
        {data.automations.map((a) => {
          const c = cfg(a.id); const p = prompts.find((x) => x.goal === a.id); const approved = p?.status === 'approved';
          return (
            <div className="auto" key={a.id}>
              <label className="check"><input type="checkbox" checked={!!c.enabled} onChange={(e) => save(a.id, { enabled: e.target.checked })} /><span className="strong">{a.name}</span></label>
              <div className="small muted">{a.when}.{a.needsOptIn ? ' Only patients who opted in.' : ' Sent as care, so it also goes to patients who opted out of marketing.'}</div>
              <div className="row gap-8 wrap mt-8">
                <select className="input" style={{ width: 'auto' }} value={c.mode === 'auto' ? 'auto' : 'queue'} disabled={!c.enabled} onChange={(e) => save(a.id, { mode: e.target.value })}>
                  <option value="queue">Wait for my approval</option>
                  <option value="auto" disabled={!approved}>Send automatically{approved ? '' : ' (approve the prompt first)'}</option>
                </select>
                {count(a.id, 'pending_approval') > 0 && <Pill tone="warn">{count(a.id, 'pending_approval')} waiting</Pill>}
                {count(a.id, 'sent') > 0 && <Pill tone="good">{count(a.id, 'sent')} sent (30 days)</Pill>}
                {p ? (approved ? <Pill tone="good"><IconShieldCheck size={12} />Prompt approved</Pill> : <Pill tone="outline">Prompt is a draft</Pill>) : null}
              </div>
            </div>
          );
        })}
      </Body>
    </Card>
  );
}

/* ---------- Patients ---------- */
export function PatientsTab({ data, act }) {
  const [seg, setSeg] = useState('all'); const [q, setQ] = useState('');
  const { data: d, reload } = usePoll(() => get(`/api/marketing/patients?segment=${seg}&q=${encodeURIComponent(q)}`), [seg, q], 0);
  const toggle = (p) => act(async () => { await post(`/api/marketing/optout/${p.id}`, { optIn: !p.optIn }); await reload(); }, p.optIn ? 'Marked as opted out' : 'Opted back in');
  return (
    <Card title="Who can be messaged" actions={<div className="row gap-6"><input className="input" style={{ width: 190 }} placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} /><select className="input" style={{ width: 'auto' }} value={seg} onChange={(e) => setSeg(e.target.value)}>{data.segments.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}<option value="opted_out">Opted out ({data.optedOut})</option></select></div>}>
      {!d ? <div className="skeleton" /> : <table className="table">
        <thead><tr><th>Patient</th><th>Status</th><th>Last message</th><th style={{ textAlign: 'right' }}>30 days</th><th>Last visit</th><th /></tr></thead>
        <tbody>
          {d.rows.map((p) => <tr key={p.id}>
            <td><span className="strong">{p.name}</span><div className="tiny muted">{p.phone} · {LANG_NAME[p.lang] || p.lang}{p.source ? ` · ${p.source}` : ''}</div></td>
            <td>{!p.optIn ? <Pill tone="bad">Opted out</Pill> : p.paused ? <Pill tone="warn">Paused: messaged in last {d.capDays} days</Pill> : <Pill tone="good">Can be messaged</Pill>}</td>
            <td className="small">{p.lastMessage ? <>{GOAL_LABEL[p.lastMessage.goal] || ({ marketing: 'Campaign', recall: 'Recall', treatment: 'Treatment follow-up', thank_you: 'Thank-you', review_request: 'Review request' }[p.lastMessage.type] || 'Message')}<div className="tiny muted">{ago(p.lastMessage.at)}</div></> : <span className="muted">Never</span>}</td>
            <td className="mono" style={{ textAlign: 'right' }}>{p.messages30}</td>
            <td className="small">{p.lastVisit || <span className="muted">None</span>}</td>
            <td style={{ textAlign: 'right' }}><button className="btn sm ghost" onClick={() => toggle(p)}>{p.optIn ? 'Opt out' : 'Opt in'}</button></td>
          </tr>)}
          {d.rows.length === 0 && <tr><td colSpan={6}><Empty>No patients match.</Empty></td></tr>}
        </tbody>
      </table>}
      {d && d.total > d.shown && <div className="tiny muted" style={{ padding: '10px 16px 14px' }}>Showing {d.shown} of {d.total}. Search to narrow it.</div>}
    </Card>
  );
}

/* ---------- Prompt tools ---------- */
export function PromptEditor({ edit, setEdit, goals, onSave, onClose }) {
  const [run, busy] = useAction();
  const [improved, setImproved] = useState(null);
  const [tested, setTested] = useState(null);
  const improve = () => run(async () => { const r = await post('/api/marketing/prompts/improve', { goal: edit.goal, body: edit.body }); setImproved(r); }, null);
  const test = () => run(async () => { setTested(await post('/api/marketing/prompts/test', { goal: edit.goal, body: edit.body, brief: 'Example offer text', festival: 'Diwali' })); }, null);
  return (
    <Modal title={edit.id ? 'Edit prompt' : 'New prompt'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!edit.name || !edit.body} onClick={onSave}>Save</button></>}>
      <div className="grid two">
        <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Goal"><select className="input" value={edit.goal} onChange={(e) => setEdit({ ...edit, goal: e.target.value })}>{goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
      </div>
      <Field label="Brief for the AI" hint="Say who the message is from and to, its one purpose, what to include, a word limit and what to avoid."><textarea className="input" style={{ minHeight: 150 }} value={edit.body} onChange={(e) => { setEdit({ ...edit, body: e.target.value }); setImproved(null); setTested(null); }} /></Field>
      <div className="row gap-8 wrap">
        <button className="btn soft" disabled={busy || edit.body.trim().length < 10} onClick={improve}><IconWand size={16} />Improve this prompt</button>
        <button className="btn soft" disabled={busy || edit.body.trim().length < 10} onClick={test}><IconFlask size={16} />Try it on a patient</button>
        <span className="tiny muted">Trying a prompt sends nothing to anyone and works before it is approved.</span>
      </div>
      {improved && <div className="callout small"><div className="tiny muted mb-8">{improved.engine === 'claude' ? 'Suggested by Claude' : 'Suggested checks'}</div><ul style={{ margin: '0 0 8px 18px', padding: 0 }}>{improved.changes.map((c, i) => <li key={i}>{c}</li>)}</ul><div className="pre small">{improved.body}</div><div className="row gap-6 mt-8"><button className="btn sm primary" onClick={() => { setEdit({ ...edit, body: improved.body }); setImproved(null); }}>Use this version</button><button className="btn sm ghost" onClick={() => setImproved(null)}>Keep mine</button></div></div>}
      {tested && <div className="callout small"><div className="tiny muted mb-8">What a patient{tested.patientFirstName ? ` like ${tested.patientFirstName}` : ''} would read ({tested.engine === 'claude' ? 'written by Claude' : 'built-in wording'})</div><div className="pre">{tested.body}</div>{tested.notes && <div className="tiny muted mt-8">{tested.notes}</div>}</div>}
    </Modal>
  );
}

export function PromptLibrary({ goals, onClose, onAdd }) {
  const { data } = usePoll(() => get('/api/marketing/prompts/library'), [], 0);
  const [run, busy] = useAction();
  return (
    <Modal title="Prompt library" onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="small muted">Ready-made briefs. Adding one saves it as a draft. An owner or admin approves it before the AI can use it.</div>
      {!data ? <div className="skeleton" /> : <div className="col gap-8">
        {data.map((p) => <div key={p.key} className="card soft" style={{ padding: 12 }}>
          <div className="row between wrap"><div><span className="small strong">{p.name}</span> <Pill tone="outline">{goals.find((g) => g.id === p.goal)?.name || p.goal}</Pill><div className="tiny muted">{p.about}</div></div>
            {p.added ? <Pill tone="good"><IconCheck size={12} />Added</Pill> : <button className="btn sm" disabled={busy} onClick={() => run(async () => { await onAdd(p); }, 'Added as a draft')}><IconPlus size={14} />Add</button>}</div>
          <div className="small muted mt-8">{p.body}</div>
        </div>)}
      </div>}
    </Modal>
  );
}

export const LibraryButton = ({ onClick }) => <button className="btn sm" onClick={onClick}><IconBooks size={14} />Library</button>;
