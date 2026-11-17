import React, { useEffect, useState } from 'react';
import { IconSparkles, IconCheck, IconX, IconSend, IconPlus, IconPencil, IconTrash, IconShieldCheck, IconClock, IconRefresh, IconUsers } from '@tabler/icons-react';
import { get, post, put, patch, del } from '../lib/api.js';
import { fullName, ago, fmtWhen, LANG_NAME } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, useAction, Modal, Field, Seg, Stat, useToast } from '../components/ui.jsx';
import { MetricTile, HBars } from '../components/dash.jsx';
import { fmtMoney } from '../lib/format.js';
import { AskAI, Analytics, Automations, PatientsTab, PromptEditor, PromptLibrary, LibraryButton, GOAL_LABEL } from './MarketingExtras.jsx';

const STATUS_TONE = { draft: 'outline', pending_approval: 'warn', approved: 'info', sent: 'good', rejected: 'bad' };
const STATUS_LABEL = { draft: 'Draft', pending_approval: 'Awaiting approval', approved: 'Approved', sent: 'Sent', rejected: 'Rejected' };

export default function Marketing({ me, locations }) {
  const { data, reload } = usePoll(() => get('/api/marketing'), [], 10000);
  const [tab, setTab] = useState('growth');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(null);
  const [run, busy] = useAction();
  if (!data) return <div className="skeleton" />;
  const act = (fn, msg) => run(async () => { await fn(); await reload(); }, msg);
  const pendingQ = data.queue.filter((q) => q.status === 'pending_approval');
  const pendingC = data.campaigns.filter((c) => c.status === 'pending_approval');
  const campaign = data.campaigns.find((c) => c.id === open);

  return (
    <>
      <div className="page-head">
        <div><h1>Marketing & patient engagement</h1><p>AI drafts thank-yous, review requests, recalls and campaigns. A person approves every message, prompt and campaign before it reaches a patient.</p></div>
        <div className="row"><button className="btn primary" onClick={() => setCreating(true)}><IconSparkles size={16} />New campaign</button></div>
      </div>
      <div className="mb-16"><Seg value={tab} onChange={setTab} options={[{ value: 'growth', label: 'Growth' }, { value: 'analytics', label: 'Analytics' }, { value: 'queue', label: `Approval queue (${pendingQ.length + pendingC.length})` }, { value: 'campaigns', label: 'Campaigns' }, { value: 'automations', label: 'Automations' }, { value: 'patients', label: 'Patients' }, { value: 'prompts', label: 'AI prompts' }, { value: 'settings', label: 'Settings' }]} /></div>
      {!['growth', 'analytics'].includes(tab) && <div className="grid four mb-16">
        <Stat value={pendingQ.length + pendingC.length} label="Awaiting your approval" tone={pendingQ.length + pendingC.length ? 'warn' : 'good'} hint={data.canApprove ? 'You can approve' : 'An owner or admin approves'} />
        <Stat value={data.optedIn} label="Patients opted in" hint={`${data.optedOut} opted out`} />
        <Stat value={data.campaigns.filter((c) => c.status === 'sent').length} label="Campaigns sent" />
        <Stat value={data.queue.filter((q) => q.status === 'sent').length} label="Thank-yous & reviews sent (30 d)" tone="good" />
      </div>}
      {!['growth', 'analytics'].includes(tab) && !data.settings.googleReviewUrl && <div className="callout warn small mb-16">Add your Google review link under Settings to enable review requests.</div>}

      {tab === 'growth' && <AskAI onSaved={(id) => { reload(); setTab('campaigns'); setOpen(id); }} />}
      {tab === 'analytics' && <Analytics me={me} />}
      {tab === 'automations' && <Automations data={data} act={act} />}
      {tab === 'patients' && <PatientsTab data={data} act={act} />}
      {tab === 'growth' && <Growth data={data} pending={pendingQ.length + pendingC.length} go={(t, id) => { setTab(t); if (id) setOpen(id); }} reload={reload} canApprove={data.canApprove} />}

      {tab === 'queue' && (
        <div className="grid side">
          <Card title="Per-visit messages waiting for approval" actions={pendingQ.length > 0 && data.canApprove && <button className="btn sm primary" onClick={() => act(() => post('/api/marketing/queue/approve-all'), 'All approved')}><IconCheck size={14} />Approve all {pendingQ.length}</button>}>
            <div className="list">
              {data.queue.filter((q) => q.status !== 'sent' && q.status !== 'rejected').map((q) => <QueueRow key={q.id} q={q} canApprove={data.canApprove} act={act} />)}
              {data.queue.filter((q) => q.status !== 'sent' && q.status !== 'rejected').length === 0 && <Empty icon={<IconShieldCheck size={28} />}>Nothing waiting. Thank-yous, welcomes, aftercare check-ins and birthday wishes appear here when they come due.</Empty>}
            </div>
          </Card>
          <Card title="Campaigns awaiting approval">
            <div className="list">{pendingC.map((c) => <div className="list-item clickable" key={c.id} onClick={() => setOpen(c.id)}><div className="grow"><div className="small strong">{c.name}</div><div className="tiny muted">{data.segments.find((s) => s.id === c.segment)?.name} · {c.audienceCount} patients · by {c.createdBy} {ago(c.updatedAt)}</div></div><Pill tone="warn">Review</Pill></div>)}{pendingC.length === 0 && <div className="empty small">None.</div>}</div>
            <div className="divider" style={{ margin: 0 }} />
            <Body className="tiny muted">Recently sent: {data.queue.filter((q) => q.status === 'sent').slice(0, 5).map((q) => `${(GOAL_LABEL[q.goal] || 'message').toLowerCase()} to ${fullName(q.patient)}`).join(', ') || 'nothing yet'}.</Body>
          </Card>
        </div>
      )}

      {tab === 'campaigns' && (
        <Card>
          <table className="table">
            <thead><tr><th>Campaign</th><th>Goal</th><th>Audience</th><th>Language</th><th>Status</th><th>By</th><th>Sent</th></tr></thead>
            <tbody>{data.campaigns.map((c) => <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(c.id)}><td className="small strong">{c.name}</td><td className="small">{data.goals.find((g) => g.id === c.goal)?.name}</td><td className="small">{data.segments.find((s) => s.id === c.segment)?.name} · {c.status === 'sent' ? c.sentCount : c.eligibleCount ?? c.audienceCount}</td><td className="small">{LANG_NAME[c.lang] || c.lang}</td><td><Pill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Pill></td><td className="tiny muted">{c.createdBy} · {ago(c.createdAt)}</td><td className="small">{c.status === 'sent' ? `${c.sentCount} · ${ago(c.sentAt)}` : '—'}</td></tr>)}{data.campaigns.length === 0 && <tr><td colSpan={7}><Empty>No campaigns yet. Try a Diwali greeting or a recall push.</Empty></td></tr>}</tbody>
          </table>
        </Card>
      )}

      {tab === 'prompts' && <Prompts data={data} act={act} busy={busy} />}
      {tab === 'settings' && <MarketingSettings data={data} act={act} />}

      {creating && <NewCampaign data={data} locations={locations} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {campaign && <CampaignModal c={campaign} data={data} me={me} onClose={() => setOpen(null)} act={act} busy={busy} />}
    </>
  );
}

function QueueRow({ q, canApprove, act }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(q.body);
  return (
    <div className="list-item start">
      <Avatar patient={q.patient} />
      <div className="grow">
        <div className="row gap-6 wrap"><span className="small strong">{fullName(q.patient)}</span><Pill tone={q.goal === 'review' ? 'info' : 'accent'}>{GOAL_LABEL[q.goal] || 'Message'}</Pill><Pill tone={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Pill><span className="tiny faint">{LANG_NAME[q.lang]} · {q.status === 'approved' ? <><IconClock size={11} /> sends {fmtWhen(q.sendAfter)}</> : `created ${ago(q.createdAt)}`}</span></div>
        {editing ? <textarea className="input mt-8" value={body} onChange={(e) => setBody(e.target.value)} /> : <div className="small muted pre" style={{ marginTop: 4 }}>{q.body}</div>}
      </div>
      {q.status === 'pending_approval' && <div className="col gap-4">
        {canApprove && <button className="btn sm primary" onClick={() => act(() => post(`/api/marketing/queue/${q.id}/approve`, editing ? { body } : {}), 'Approved')}><IconCheck size={14} />Approve</button>}
        <button className="btn sm ghost" onClick={() => setEditing(!editing)}><IconPencil size={14} />{editing ? 'Keep' : 'Edit'}</button>
        {canApprove && <button className="btn sm ghost" onClick={() => act(() => post(`/api/marketing/queue/${q.id}/reject`), 'Rejected')}><IconX size={14} /></button>}
      </div>}
    </div>
  );
}

function Prompts({ data, act, busy }) {
  const [edit, setEdit] = useState(null);
  const [lib, setLib] = useState(false);
  return (
    <Card title="Prompts the AI writes from" actions={<div className="row gap-6"><LibraryButton onClick={() => setLib(true)} /><button className="btn sm" onClick={() => setEdit({ name: '', goal: 'custom', body: '' })}><IconPlus size={14} />New prompt</button>{data.canApprove && <button className="btn sm ghost" onClick={() => act(() => post('/api/marketing/prompts/reset'), 'Defaults restored')}><IconRefresh size={14} />Reset defaults</button>}</div>}>
      <Body className="col gap-16">
        <div className="callout small">A prompt is the brief the AI follows. Editing a prompt puts it back into draft; an owner or admin must approve it again before the AI can use it. Placeholders like {'{{firstName}}'}, {'{{practice}}'}, {'{{provider}}'}, {'{{treatment}}'}, {'{{festival}}'}, {'{{brief}}'} and {'{{reviewLink}}'} are filled in per patient.</div>
        {data.prompts.map((p) => <div className="card soft" style={{ padding: 12 }} key={p.id}>
          <div className="row between wrap"><div className="row gap-6"><span className="small strong">{p.name}</span><Pill tone="outline">{data.goals.find((g) => g.id === p.goal)?.name || p.goal}</Pill>{p.status === 'approved' ? <Pill tone="good"><IconShieldCheck size={12} />Approved by {p.approvedBy || 'owner'}{p.approvedAt ? ` · ${ago(p.approvedAt)}` : ''}</Pill> : <Pill tone="warn">Draft — not usable yet</Pill>}</div>
            <div className="row gap-6">{p.status !== 'approved' && data.canApprove && <button className="btn sm primary" disabled={busy} onClick={() => act(() => post(`/api/marketing/prompts/${p.id}/approve`), 'Prompt approved')}><IconCheck size={14} />Approve</button>}{p.status === 'approved' && data.canApprove && <button className="btn sm ghost" onClick={() => act(() => post(`/api/marketing/prompts/${p.id}/revoke`), 'Approval revoked')}>Revoke</button>}<button className="btn sm ghost" onClick={() => setEdit(p)}><IconPencil size={14} /></button>{data.canApprove && <button className="btn sm ghost icon" onClick={() => act(() => del(`/api/marketing/prompts/${p.id}`), 'Deleted')}><IconTrash size={14} /></button>}</div></div>
          <div className="small muted mt-8">{p.body}</div>
        </div>)}
      </Body>
      {edit && <PromptEditor edit={edit} setEdit={setEdit} goals={data.goals} onClose={() => setEdit(null)} onSave={() => act(async () => { if (edit.id) await patch(`/api/marketing/prompts/${edit.id}`, { name: edit.name, body: edit.body }); else await post('/api/marketing/prompts', edit); setEdit(null); }, 'Saved as draft. It needs approval')} />}
      {lib && <PromptLibrary goals={data.goals} onClose={() => setLib(false)} onAdd={async (p) => { await post('/api/marketing/prompts', { name: p.name, goal: p.goal, body: p.body }); await act(async () => {}); }} />}
    </Card>
  );
}

function MarketingSettings({ data, act }) {
  const [st, setSt] = useState(data.settings);
  const [fest, setFest] = useState({ date: '', name: '' });
  useEffect(() => setSt(data.settings), [data.settings]);
  const save = (p) => act(() => put('/api/marketing/settings', p), 'Saved');
  return (
    <div className="grid two">
      <Card title="Automatic messages"><Body className="col">
        <Field label="Google review link"><input className="input mono" value={st.googleReviewUrl || ''} onChange={(e) => setSt({ ...st, googleReviewUrl: e.target.value })} onBlur={() => save({ googleReviewUrl: st.googleReviewUrl })} placeholder="https://g.page/r/…/review" /></Field>
        <label className="check small"><input type="checkbox" checked={!!st.autoThankYou?.enabled} onChange={(e) => save({ autoThankYou: { enabled: e.target.checked } })} />Thank-you after every completed visit</label>
        <label className="check small"><input type="checkbox" checked={!!st.autoReview?.enabled} onChange={(e) => save({ autoReview: { enabled: e.target.checked } })} />Google review request after visits</label>
        <Field label="Approval mode"><div className="col gap-4"><label className="check small"><input type="radio" checked={st.autoThankYou?.mode !== 'auto'} onChange={() => save({ autoThankYou: { mode: 'queue' }, autoReview: { mode: 'queue' } })} />Queue each message for an owner/admin to approve</label><label className="check small"><input type="radio" checked={st.autoThankYou?.mode === 'auto'} onChange={() => save({ autoThankYou: { mode: 'auto' }, autoReview: { mode: 'auto' } })} />Send automatically from the approved prompt (the approval of the prompt is recorded on every message)</label></div></Field>
        <div className="grid two"><Field label="Thank-you delay (minutes)"><input className="input" type="number" value={st.autoThankYou?.delayMinutes || 60} onChange={(e) => setSt({ ...st, autoThankYou: { ...st.autoThankYou, delayMinutes: Number(e.target.value) } })} onBlur={() => save({ autoThankYou: { delayMinutes: st.autoThankYou.delayMinutes } })} /></Field><Field label="Review request delay (hours)"><input className="input" type="number" value={st.autoReview?.delayHours || 4} onChange={(e) => setSt({ ...st, autoReview: { ...st.autoReview, delayHours: Number(e.target.value) } })} onBlur={() => save({ autoReview: { delayHours: st.autoReview.delayHours } })} /></Field></div>
      </Body></Card>
      <Card title="How your messages sound"><Body className="col">
        <Field label="Tone" hint="Used whenever the AI writes for you."><select className="input" value={st.voice?.tone || 'warm'} onChange={(e) => { setSt({ ...st, voice: { ...st.voice, tone: e.target.value } }); save({ voice: { tone: e.target.value } }); }}>{Object.keys(data.tones).map((k) => <option key={k} value={k}>{{ warm: 'Warm and personal', professional: 'Professional', playful: 'Light and cheerful', brief: 'Very short' }[k] || k}</option>)}</select></Field>
        <Field label="About your clinic" hint="One or two lines the AI can draw on, such as your specialities."><textarea className="input" value={st.voice?.about || ''} onChange={(e) => setSt({ ...st, voice: { ...st.voice, about: e.target.value } })} onBlur={() => save({ voice: { about: st.voice.about } })} placeholder="Family dentistry in Indiranagar. Known for painless root canals and gentle care for children." /></Field>
        <Field label="Never say"><input className="input" value={st.voice?.avoid || ''} onChange={(e) => setSt({ ...st, voice: { ...st.voice, avoid: e.target.value } })} onBlur={() => save({ voice: { avoid: st.voice.avoid } })} placeholder="e.g. cheapest, painless, guaranteed" /></Field>
        <Field label="Sign off with"><input className="input" value={st.voice?.signoff || ''} onChange={(e) => setSt({ ...st, voice: { ...st.voice, signoff: e.target.value } })} onBlur={() => save({ voice: { signoff: st.voice.signoff } })} placeholder="Team SmileCare" /></Field>
        <Field label="Limit campaigns per patient" hint="A patient who got a campaign within this many days is skipped. 0 turns it off."><div className="row gap-6"><input className="input" type="number" min="0" max="60" style={{ width: 90 }} value={st.frequencyCapDays ?? 7} onChange={(e) => setSt({ ...st, frequencyCapDays: e.target.value })} onBlur={() => save({ frequencyCapDays: st.frequencyCapDays })} /><span className="small muted">days</span></div></Field>
      </Body></Card>
      <Card title="Rules & festivals"><Body className="col">
        <div className="grid two"><Field label="Send window start"><input className="input" type="time" value={st.quietHours?.start || '09:00'} onChange={(e) => setSt({ ...st, quietHours: { ...st.quietHours, start: e.target.value } })} onBlur={() => save({ quietHours: st.quietHours })} /></Field><Field label="Send window end"><input className="input" type="time" value={st.quietHours?.end || '20:00'} onChange={(e) => setSt({ ...st, quietHours: { ...st.quietHours, end: e.target.value } })} onBlur={() => save({ quietHours: st.quietHours })} /></Field></div>
        <Field label="Opt-out line appended to every marketing message"><input className="input" value={st.optOutText || ''} onChange={(e) => setSt({ ...st, optOutText: e.target.value })} onBlur={() => save({ optOutText: st.optOutText })} /></Field>
        <Field label="Festivals to greet"><div className="tag-list">{(st.festivals || []).map((f, i) => <span key={i} className="pill outline">{f.date} · {f.name}<button className="btn ghost icon sm" style={{ padding: 0, marginLeft: 4 }} onClick={() => save({ festivals: st.festivals.filter((_, j) => j !== i) })}><IconTrash size={11} /></button></span>)}</div><div className="row mt-8"><input className="input" type="date" style={{ width: 160 }} value={fest.date} onChange={(e) => setFest({ ...fest, date: e.target.value })} /><input className="input" placeholder="Diwali" value={fest.name} onChange={(e) => setFest({ ...fest, name: e.target.value })} /><button className="btn sm" disabled={!fest.date || !fest.name} onClick={() => { save({ festivals: [...(st.festivals || []), fest] }); setFest({ date: '', name: '' }); }}><IconPlus size={14} /></button></div></Field>
        <div className="tiny muted">Marketing on WhatsApp needs the patient's opt-in (captured on the consent form) and Meta-approved templates once the Business API is connected. Transactional reminders are not affected by these rules.</div>
      </Body></Card>
    </div>
  );
}

function NewCampaign({ data, locations, onClose, onDone }) {
  const [f, setF] = useState({ goal: 'recall', segment: 'overdue_recall', locationId: '', lang: 'en', brief: '', festival: '', name: '' });
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState('');
  const [audience, setAudience] = useState(null);
  const [run, busy] = useAction();
  const prompt = data.prompts.find((p) => p.goal === f.goal);
  useEffect(() => { get(`/api/marketing/segments/${f.segment}${f.locationId ? `?locationId=${f.locationId}` : ''}`).then(setAudience).catch(() => {}); }, [f.segment, f.locationId]);
  useEffect(() => { if (draft?.body) post('/api/marketing/preview', { body: draft.body, festival: f.festival, brief: f.brief, lang: f.lang }).then((r) => setPreview(r.body)).catch(() => {}); }, [draft?.body, f.festival, f.brief, f.lang]);
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title="New campaign" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !draft?.body} onClick={() => run(async () => { await post('/api/marketing/campaigns', { ...f, name: f.name || undefined, body: draft.body, notes: draft.notes, promptId: draft.promptId, engine: draft.engine }); onDone(); }, 'Saved as draft. Submit it for approval when ready.')}>Save draft</button></>}>
      <div className="grid three">
        <Field label="Goal"><select className="input" value={f.goal} onChange={(e) => { const g = e.target.value; set('goal', g); setDraft(null); if (g === 'recall') set('segment', 'overdue_recall'); }}>{data.goals.filter((g) => !['thank_you', 'review', 'aftercare', 'welcome'].includes(g.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        <Field label="Audience"><select className="input" value={f.segment} onChange={(e) => set('segment', e.target.value)}>{data.segments.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}</select></Field>
        <Field label="Branch"><select className="input" value={f.locationId} onChange={(e) => set('locationId', e.target.value)}><option value="">All branches</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Language"><select className="input" value={f.lang} onChange={(e) => set('lang', e.target.value)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="kn">ಕನ್ನಡ</option></select></Field>
        {f.goal === 'festival' && <Field label="Festival"><input className="input" value={f.festival} onChange={(e) => set('festival', e.target.value)} placeholder="Diwali" /></Field>}
        {['offer', 'referral', 'custom'].includes(f.goal) && <Field label="Brief"><input className="input" value={f.brief} onChange={(e) => set('brief', e.target.value)} placeholder="e.g. 20% off whitening in November, valid till 30 Nov" /></Field>}
        <Field label="Campaign name (optional)"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
      </div>
      <div className="row between wrap">
        <div className="small muted"><IconUsers size={14} /> {audience ? `${audience.length} opted-in patients` : '…'}{prompt ? <> · Prompt: <b>{prompt.name}</b> {prompt.status === 'approved' ? <Pill tone="good">approved</Pill> : <Pill tone="warn">not approved — ask an owner</Pill>}</> : null}</div>
        <button className="btn soft" disabled={busy || (prompt && prompt.status !== 'approved')} onClick={() => run(async () => setDraft(await post('/api/marketing/draft', { goal: f.goal, promptId: prompt?.id, lang: f.lang, brief: f.brief, festival: f.festival })), 'Draft ready — please read it')}><IconSparkles size={16} />{draft ? 'Draft again' : 'Draft with AI'}</button>
      </div>
      {draft && <>
        <Field label={`Message (${draft.engine === 'claude' ? 'written by Claude' : 'rule-based draft'}) — edit freely`}><textarea className="input" style={{ minHeight: 140 }} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></Field>
        {draft.notes && <div className="callout warn small"><b>Reviewer note:</b> {draft.notes}</div>}
        {preview && <div className="callout small"><div className="tiny muted mb-8">Preview for the first patient</div><div className="pre">{preview}</div></div>}
      </>}
      {!draft && <div className="callout small">Tap "Draft with AI" or write your own message below.<textarea className="input mt-8" placeholder="Or type the message yourself…" onChange={(e) => setDraft({ body: e.target.value, engine: 'manual', notes: '' })} /></div>}
    </Modal>
  );
}

function CampaignModal({ c, data, me, onClose, act, busy }) {
  const [body, setBody] = useState(c.body);
  const [reason, setReason] = useState('');
  const editable = ['draft', 'rejected'].includes(c.status);
  return (
    <Modal title={c.name} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="row wrap gap-6"><Pill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Pill><Pill tone="outline">{data.goals.find((g) => g.id === c.goal)?.name}</Pill><Pill tone="outline">{data.segments.find((s) => s.id === c.segment)?.name} · {c.audienceCount} patients</Pill><Pill tone="outline">{LANG_NAME[c.lang]}</Pill><Pill tone="outline">{c.engine === 'claude' ? 'Claude draft' : c.engine === 'rules' ? 'Rule draft' : 'Written by staff'}</Pill></div>
      {editable ? <Field label="Message"><textarea className="input" style={{ minHeight: 140 }} value={body} onChange={(e) => setBody(e.target.value)} /></Field> : <div className="callout"><div className="pre">{c.body}</div></div>}
      {c.notes && <div className="callout warn small"><b>Reviewer note:</b> {c.notes}</div>}
      {c.status !== 'sent' && c.eligibleCount < c.audienceCount && <div className="callout small">{c.audienceCount - c.eligibleCount} of {c.audienceCount} patients were messaged in the last {data.settings.frequencyCapDays} days, so they will be skipped. You can change this limit under Settings.</div>}
      {c.status === 'sent' && c.skippedRecent > 0 && <div className="callout small">{c.skippedRecent} patients were skipped because they had a campaign within {data.settings.frequencyCapDays} days.</div>}
      <div className="row wrap gap-6">
        {editable && body !== c.body && <button className="btn" disabled={busy} onClick={() => act(() => patch(`/api/marketing/campaigns/${c.id}`, { body }), 'Saved')}>Save edits</button>}
        {editable && <button className="btn primary" disabled={busy} onClick={() => act(async () => { if (body !== c.body) await patch(`/api/marketing/campaigns/${c.id}`, { body }); await post(`/api/marketing/campaigns/${c.id}/submit`); }, 'Submitted for approval')}><IconSend size={16} />Submit for approval</button>}
        {c.status === 'pending_approval' && data.canApprove && <button className="btn primary" disabled={busy} onClick={() => act(() => post(`/api/marketing/campaigns/${c.id}/approve`), 'Approved')}><IconCheck size={16} />Approve</button>}
        {c.status === 'approved' && c.scheduledFor && <div className="callout small" style={{ flex: '1 1 100%' }}>Scheduled to send {fmtWhen(c.scheduledFor)}.{c.scheduleError ? ` Last attempt: ${c.scheduleError}` : ''}{data.canApprove && <button className="btn sm ghost" style={{ marginLeft: 8 }} disabled={busy} onClick={() => act(() => post(`/api/marketing/campaigns/${c.id}/unschedule`), 'Schedule cancelled')}>Cancel schedule</button>}</div>}
        {c.status === 'approved' && data.canApprove && !c.scheduledFor && <button className="btn" disabled={busy} onClick={() => act(() => post(`/api/marketing/campaigns/${c.id}/schedule`), 'Scheduled. It will go out when the send window opens.')}><IconClock size={16} />Schedule for the next send window</button>
        }
        {c.status === 'approved' && data.canApprove && <button className="btn primary" disabled={busy} onClick={() => act(() => post(`/api/marketing/campaigns/${c.id}/send`), 'Campaign sent')}><IconSend size={16} />Send to {c.eligibleCount ?? c.audienceCount} patients now</button>}
        {['pending_approval', 'approved'].includes(c.status) && data.canApprove && <div className="row"><input className="input" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 200 }} /><button className="btn danger" disabled={busy} onClick={() => act(() => post(`/api/marketing/campaigns/${c.id}/reject`, { reason }), 'Rejected')}><IconX size={16} />Reject</button></div>}
        {['pending_approval', 'approved'].includes(c.status) && <button className="btn ghost" disabled={busy} onClick={() => act(() => post(`/api/marketing/campaigns/${c.id}/withdraw`), 'Back to draft')}>Withdraw to draft</button>}
        <button className="btn ghost" disabled={busy} onClick={() => act(async () => { await post(`/api/marketing/campaigns/${c.id}/duplicate`); onClose(); }, 'Copied as a new draft')}>Copy as new draft</button>
        {c.status !== 'sent' && <button className="btn ghost" disabled={busy} onClick={() => act(async () => { await del(`/api/marketing/campaigns/${c.id}`); onClose(); }, 'Deleted')}><IconTrash size={16} /></button>}
      </div>
      {c.status === 'pending_approval' && !data.canApprove && <div className="tiny muted">Waiting for an owner or admin ({me.role} cannot approve).</div>}
      <Card soft title="Audit trail"><div className="list">{c.history.slice().reverse().map((h, i) => <div className="list-item" key={i} style={{ padding: '6px 16px' }}><span className="tiny muted" style={{ width: 150 }}>{fmtWhen(h.at)}</span><span className="small"><b>{h.by}</b> {h.action}{h.reason ? ` — ${h.reason}` : ''}</span></div>)}</div></Card>
    </Modal>
  );
}


const OPP_ICON = { recall: 'Check-up reminder', unscheduled: 'Treatment follow-up', reactivation: 'Win-back', festival: 'Greeting' };
/** Results first, then what to do next: every opportunity is one tap from a draft that still needs approval. */
function Growth({ data, pending, go, reload, canApprove }) {
  const [days, setDays] = useState(30);
  const [run, busy] = useAction();
  const toast = useToast();
  const { data: g } = usePoll(() => get(`/api/marketing/growth?days=${days}`), [days], 30000);
  if (!g) return <div className="skeleton" />;
  const n = g.now; const p = g.previous;
  const draft = (o) => run(async () => { const c = await post('/api/marketing/opportunity', { goal: o.goal, segment: o.segment }); await reload(); go('campaigns', c.id); }, 'Draft created. Review it, then submit it for approval.');
  const sourceRows = g.sources.map((x) => ({ label: x.source, value: x.count }));
  return (
    <>
      <div className="row between wrap mb-16">
        <div className="small muted">{pending > 0 ? <a href="#/marketing" onClick={(e) => { e.preventDefault(); go('queue'); }}><b>{pending}</b> item{pending === 1 ? '' : 's'} waiting for approval{canApprove ? '' : ' (an owner or admin approves)'}</a> : 'Nothing is waiting for approval.'}</div>
        <Seg value={days} onChange={setDays} options={[{ value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
      </div>

      <div className="mgrid">
        <MetricTile label="Messages sent" value={n.messages} cur={n.messages} prev={p.messages} hint={`to ${n.reached} patient${n.reached === 1 ? '' : 's'}`} />
        <MetricTile label="Bookings that followed" value={n.bookings} cur={n.bookings} prev={p.bookings} hint={`within ${g.attributionDays} days`} />
        <MetricTile label="Collected from those" value={fmtMoney(n.revenue)} cur={n.revenue} prev={p.revenue} hint={g.conversion ? `${g.conversion}% of messages` : ''} />
        <MetricTile label="Review requests" value={n.reviewRequests} cur={n.reviewRequests} prev={p.reviewRequests} hint={g.reviews.linkSet ? 'Google link set' : 'No Google link yet'} />
      </div>

      <Card title="Worth messaging now" className="mb-16">
        <Body>
          {g.opportunities.length === 0 && <Empty>Nobody needs a nudge right now. New opportunities appear here as patients become due.</Empty>}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {g.opportunities.map((o) => <div key={o.id} className="opp">
              <div className="tiny muted">{OPP_ICON[o.goal] || 'Message'}</div>
              <div className="opp-n">{o.count}</div>
              <div className="strong small">{o.title}</div>
              <div className="tiny muted" style={{ marginBottom: 10 }}>{o.hint}{o.value ? ` · ${fmtMoney(o.value)} recommended` : ''}</div>
              <button className="btn sm primary" disabled={busy} onClick={() => draft(o)}><IconSparkles size={14} />Draft a message</button>
            </div>)}
          </div>
          <div className="tiny muted" style={{ marginTop: 12 }}>A draft is never sent on its own. It goes to the approval queue first, and only opted-in patients receive it, inside your quiet hours.</div>
        </Body>
      </Card>

      <div className="grid side mb-16">
        <Card title="What each campaign led to">
          <table className="table">
            <thead><tr><th>Campaign</th><th style={{ textAlign: 'right' }}>Sent</th><th style={{ textAlign: 'right' }}>Bookings</th><th style={{ textAlign: 'right' }}>Collected</th></tr></thead>
            <tbody>
              {g.campaigns.length === 0 && <tr><td colSpan="4" className="muted small" style={{ padding: 18 }}>No campaigns sent yet. Start one from "Worth messaging now".</td></tr>}
              {g.campaigns.map((c) => <tr key={c.id}><td><span className="strong">{c.name}</span><div className="tiny muted">{c.goalName}{c.sentAt ? ` · ${fmtWhen(c.sentAt)}` : ''}</div></td><td className="mono" style={{ textAlign: 'right' }}>{c.sent}</td><td className="mono" style={{ textAlign: 'right' }}>{c.bookings}</td><td className="mono" style={{ textAlign: 'right' }}>{fmtMoney(c.revenue)}</td></tr>)}
            </tbody>
          </table>
          <div className="tiny muted" style={{ padding: '10px 16px 14px' }}>A booking is counted when a patient who had nothing booked makes one within {g.attributionDays} days after a message. It shows what followed, not proof the message caused it. Greetings and thank-yous are not credited.</div>
        </Card>
        <div className="col gap-16">
          <Card title="Where new patients come from"><Body>
            {g.newPatients === 0 ? <div className="small muted">No new patients in this period.</div> : <HBars rows={sourceRows} />}
            {sourceRows.some((x) => x.label === 'Not recorded') && <div className="tiny muted" style={{ marginTop: 10 }}>"Not recorded" patients were added without a source. The website booking and Add patient forms now ask.</div>}
          </Body></Card>
          <Card title="Reviews and consent"><Body className="col gap-8 small">
            <div className="row between"><span className="muted">Google review link</span>{g.reviews.linkSet ? <Pill tone="good">Set</Pill> : <button className="btn sm" onClick={() => go('settings')}>Add it</button>}</div>
            <div className="row between"><span className="muted">Automatic review requests</span><Pill tone={g.reviews.auto ? 'good' : 'warn'}>{g.reviews.auto ? 'On' : 'Off'}</Pill></div>
            <div className="row between"><span className="muted">Thank-yous sent</span><b className="mono">{n.thankYous}</b></div>
            <div className="row between"><span className="muted">Patients who can be messaged</span><b className="mono">{g.consent.optedIn} of {g.consent.total} ({g.consent.percent}%)</b></div>
          </Body></Card>
        </div>
      </div>
    </>
  );
}
