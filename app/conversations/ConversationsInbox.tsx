'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export type ConversationMode = 'ai' | 'human';
export type MessageActor = 'ai' | 'owner' | 'operator' | 'system' | 'unknown';
export type ConversationMessage = { id: string; direction: 'inbound' | 'outbound'; text: string; createdAt: string; actor: MessageActor };
export type JobContext = { urgency: string; tyreSize: string; quantity: string; location: string; vehicleRegistration: string; requestedTime: string; customerPrice: string; paymentStatus: string; fitterName: string; dispatchStatus: string };
export type Conversation = { id: string; jobId: string | null; customerName: string; phone: string; publicJobId: string; jobStatus: string; jobHint: string; mode: ConversationMode; needsAttention: boolean; attentionReason: string; latestText: string; latestAt: string; messages: ConversationMessage[]; jobContext: JobContext | null };
type InboxFilter = 'all' | 'attention' | 'human' | 'ai';
type MobileView = 'inbox' | 'conversation' | 'context';

const timestampFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false });
const LIVE_REFRESH_INTERVAL_MS = 5000;

function timestamp(value: string, compact = false) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  const now = new Date();
  const londonDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' });
  return londonDay.format(date) === londonDay.format(now) && compact ? timeFormatter.format(date) : timestampFormatter.format(date);
}

function actorLabel(actor: MessageActor) {
  return actor === 'unknown' ? 'Legacy / unknown' : actor;
}

function money(value: string) {
  if (!value) return 'Not recorded';
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount) : value;
}

function contextValue(value: string) {
  return value || 'Not recorded';
}

function usablePhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 ? digits : '';
}

function telHref(value: string) {
  const cleaned = String(value || '').replace(/[^+0-9]/g, '');
  return cleaned ? `tel:${cleaned}` : '';
}

function waHref(value: string) {
  const digits = usablePhone(value);
  return digits ? `https://wa.me/${digits}` : '';
}

export default function ConversationsInbox({ conversations, notices = [], initialJobId = null }: { conversations: Conversation[]; notices?: string[]; initialJobId?: string | null }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(() => {
    if (initialJobId) {
      const match = conversations.find(conversation => conversation.jobId === initialJobId);
      if (match) return match.id;
    }
    return conversations[0]?.id || '';
  });
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [search, setSearch] = useState('');
  const [mobileView, setMobileView] = useState<MobileView>('inbox');
  const [pendingAction, setPendingAction] = useState<'takeover' | 'return_to_ai' | null>(null);
  const [modeOverrides, setModeOverrides] = useState<Record<string, ConversationMode>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState(false);
  const [feedback, setFeedback] = useState<{ threadId: string; type: 'success' | 'error'; text: string } | null>(null);
  const historyEnd = useRef<HTMLDivElement>(null);
  const requestInFlight = useRef(false);
  const replyInFlight = useRef(false);
  const refreshGuard = useRef(false);

  const filtered = useMemo(() => conversations.filter(conversation => {
    const mode = modeOverrides[conversation.id] || conversation.mode;
    if (filter === 'attention' && !conversation.needsAttention) return false;
    if (filter === 'human' && mode !== 'human') return false;
    if (filter === 'ai' && mode !== 'ai') return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [conversation.customerName, conversation.phone, conversation.publicJobId, conversation.latestText, conversation.jobHint]
      .some(value => value.toLowerCase().includes(query));
  }), [conversations, filter, modeOverrides, search]);

  const selected = conversations.find(conversation => conversation.id === selectedId) || filtered[0] || conversations[0];
  const selectedMode = selected ? modeOverrides[selected.id] || selected.mode : 'ai';
  const attentionCount = conversations.filter(conversation => conversation.needsAttention).length;
  const humanCount = conversations.filter(conversation => (modeOverrides[conversation.id] || conversation.mode) === 'human').length;

  useEffect(() => {
    if (selectedId && !conversations.some(conversation => conversation.id === selectedId)) setSelectedId(conversations[0]?.id || '');
  }, [conversations, selectedId]);

  useEffect(() => {
    if (!initialJobId) return;
    const match = conversations.find(conversation => conversation.jobId === initialJobId);
    if (match) {
      setSelectedId(match.id);
      setMobileView('conversation');
    }
  }, [initialJobId, conversations]);

  useEffect(() => {
    setModeOverrides(current => {
      const next = { ...current };
      let changed = false;
      for (const [threadId, mode] of Object.entries(current)) {
        const authoritative = conversations.find(conversation => conversation.id === threadId)?.mode;
        if (!authoritative || authoritative === mode) {
          delete next[threadId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [conversations]);

  useEffect(() => { historyEnd.current?.scrollIntoView({ block: 'end' }); }, [selected?.id, selected?.messages.length]);

  useEffect(() => {
    let guardTimer: number | undefined;

    function refreshAuthoritativeData() {
      if (document.visibilityState !== 'visible' || refreshGuard.current || requestInFlight.current || replyInFlight.current) return;
      refreshGuard.current = true;
      router.refresh();
      guardTimer = window.setTimeout(() => { refreshGuard.current = false; }, 1500);
    }

    const interval = window.setInterval(refreshAuthoritativeData, LIVE_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshAuthoritativeData();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      if (guardTimer !== undefined) window.clearTimeout(guardTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router]);

  function selectConversation(id: string) {
    setSelectedId(id);
    setFeedback(null);
    setMobileView('conversation');
  }

  async function changeMode(action: 'takeover' | 'return_to_ai') {
    if (!selected?.jobId || requestInFlight.current || replyInFlight.current) return;
    requestInFlight.current = true;
    setPendingAction(action);
    setFeedback(null);

    try {
      const response = await fetch('/api/conversation-control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, job_id: selected.jobId }) });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Conversation control failed. Please try again.');

      const mode = action === 'takeover' ? 'human' : 'ai';
      setModeOverrides(current => ({ ...current, [selected.id]: mode }));
      setFeedback({ threadId: selected.id, type: 'success', text: mode === 'human' ? 'Human takeover is active.' : 'Conversation returned to AI.' });
      router.refresh();
    } catch (error) {
      setFeedback({ threadId: selected.id, type: 'error', text: error instanceof Error ? error.message : 'Conversation control failed. Please try again.' });
    } finally {
      requestInFlight.current = false;
      setPendingAction(null);
    }
  }

  async function sendOwnerReply() {
    if (!selected?.jobId || selectedMode !== 'human' || replyInFlight.current || requestInFlight.current) return;
    const draft = drafts[selected.id] || '';
    const message = draft.trim();
    if (!message || message.length > 2000) return;

    replyInFlight.current = true;
    setSendingReply(true);
    setFeedback(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch('/api/owner-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: selected.jobId, message }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; idempotent?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        if (response.status === 409) {
          setModeOverrides(current => ({ ...current, [selected.id]: 'ai' }));
          router.refresh();
        }
        throw new Error(result?.error || 'Reply could not be sent. Your draft has been preserved.');
      }

      setDrafts(current => ({ ...current, [selected.id]: '' }));
      setFeedback({ threadId: selected.id, type: 'success', text: result.idempotent ? 'Duplicate reply suppressed. Refreshing the conversation.' : 'Reply sent. Refreshing the conversation.' });
      router.refresh();
    } catch (error) {
      const text = error instanceof Error && error.name === 'AbortError'
        ? 'Reply status is uncertain. Your draft is preserved; refresh the conversation before retrying.'
        : error instanceof Error
          ? error.message
          : 'Reply could not be sent. Your draft has been preserved.';
      setFeedback({ threadId: selected.id, type: 'error', text });
    } finally {
      window.clearTimeout(timeout);
      replyInFlight.current = false;
      setSendingReply(false);
    }
  }

  const filters: Array<[InboxFilter, string, number | null]> = [
    ['all', 'All', conversations.length],
    ['attention', 'Needs You', attentionCount],
    ['human', 'Human', humanCount],
    ['ai', 'AI', conversations.length - humanCount],
  ];

  return <div className={`operationsInbox mobile-${mobileView}`}>
    {notices.length ? <div className="conversationNotices" role="status">{notices.map(notice => <span key={notice}>{notice}</span>)}</div> : null}
    <div className="inboxShell">
      <aside className="conversationList inboxPanel" aria-label="Customer conversations">
        <div className="inboxHeader">
          <div className="inboxTitle"><div><h1>Conversations</h1><p>{conversations.length} customer thread{conversations.length === 1 ? '' : 's'}</p></div>{attentionCount ? <span className="needsCount">{attentionCount} needs you</span> : null}</div>
          <input className="conversationSearch" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customer, phone or job…" aria-label="Search conversations" />
          <div className="inboxFilters" aria-label="Conversation filters">{filters.map(([value, label, count]) => <button type="button" className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{label}{count !== null ? <span>{count}</span> : null}</button>)}</div>
        </div>
        <div className="threadScroller">
          {!filtered.length ? <div className="threadEmpty"><strong>No matching conversations</strong><span>Try another filter or search.</span></div> : filtered.map(conversation => {
            const mode = modeOverrides[conversation.id] || conversation.mode;
            return <button type="button" className={`conversationItem ${selected?.id === conversation.id ? 'selected' : ''} ${conversation.needsAttention ? 'needsYou' : ''}`} key={conversation.id} onClick={() => selectConversation(conversation.id)}>
              <div className="conversationItemTop"><strong>{conversation.customerName === 'Unknown customer' ? conversation.phone : conversation.customerName}</strong><time>{timestamp(conversation.latestAt, true)}</time></div>
              <div className="conversationPreview">{conversation.latestText}</div>
              <div className="threadMeta"><span className={`modeBadge ${mode}`}>{mode === 'human' ? 'Human' : 'AI'}</span>{conversation.needsAttention ? <span className="attentionFlag">Needs You</span> : null}<span className="jobHint">{conversation.jobHint}</span></div>
            </button>;
          })}
        </div>
      </aside>

      {selected ? <main className="conversationCentre">
        <header className="conversationHeader">
          <button className="mobileBack" type="button" onClick={() => setMobileView('inbox')}>← Inbox</button>
          <div className="conversationIdentity"><h2>{selected.customerName === 'Unknown customer' ? selected.phone : selected.customerName}</h2><p><span>{selected.phone}</span><span>{selected.publicJobId}</span><span>Active {timestamp(selected.latestAt)}</span></p></div>
          <div className="conversationHeaderActions"><span className={`modeBadge prominent ${selectedMode}`}>{selectedMode === 'human' ? 'Human takeover' : 'AI handling'}</span>{telHref(selected.phone) ? <a className="controlAction" href={telHref(selected.phone)}>Call</a> : null}{waHref(selected.phone) ? <a className="controlAction" href={waHref(selected.phone)} target="_blank" rel="noreferrer">WhatsApp</a> : null}<button className="contextToggle" type="button" onClick={() => setMobileView('context')}>Job details</button>{selectedMode === 'ai' ? <button className="controlAction takeover" disabled={pendingAction !== null || sendingReply || !selected.jobId} onClick={() => changeMode('takeover')}>{pendingAction === 'takeover' ? 'Taking over…' : 'Take over'}</button> : <button className="controlAction return" disabled={pendingAction !== null || sendingReply || !selected.jobId} onClick={() => changeMode('return_to_ai')}>{pendingAction === 'return_to_ai' ? 'Returning…' : 'Return to AI'}</button>}</div>
        </header>
        {selected.needsAttention ? <div className="attentionBanner"><strong>Needs your attention</strong><span>{selected.attentionReason}</span></div> : null}
        <div className="messageHistory">
          {selected.messages.map(message => <article className={`messageRow ${message.direction}`} key={message.id}><div className="messageBubble"><div className="messageMeta"><strong>{message.direction === 'inbound' ? 'Customer' : actorLabel(message.actor)}</strong></div><p>{message.text}</p><time>{timestamp(message.createdAt)}</time></div></article>)}
          <div ref={historyEnd} />
        </div>
        <footer className={`conversationComposer ${selectedMode}`}>
          {selectedMode === 'ai' ? <><div className="composerState"><i></i><div><strong>{pendingAction === 'takeover' ? 'Taking over now...' : 'AI is handling this conversation'}</strong><span>{pendingAction === 'takeover' ? 'Waiting for TyreOps to pause AI and confirm HUMAN mode.' : 'Take over before replying as the business owner.'}</span></div></div><button className="controlAction takeover" disabled={pendingAction !== null || sendingReply || !selected.jobId} onClick={() => changeMode('takeover')}>{pendingAction === 'takeover' ? 'Taking over...' : 'Take over'}</button></> : <><div className="composerState"><i></i><div><strong>{pendingAction === 'return_to_ai' ? 'Returning to AI...' : 'You are handling this conversation'}</strong><span>{pendingAction === 'return_to_ai' ? 'Waiting for TyreOps to resume AI mode.' : 'Your reply will be sent through the TyreOps owner channel.'}</span></div></div><div className="ownerReplyComposer"><textarea aria-label="Owner reply" maxLength={2000} rows={2} value={drafts[selected.id] || ''} disabled={sendingReply || pendingAction !== null || !selected.jobId} placeholder="Reply to the customer…" onChange={event => setDrafts(current => ({ ...current, [selected.id]: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendOwnerReply(); } }} /><button type="button" onClick={() => void sendOwnerReply()} disabled={sendingReply || pendingAction !== null || !selected.jobId || !(drafts[selected.id] || '').trim()}>{sendingReply ? 'Sending…' : 'Send'}</button><span>{(drafts[selected.id] || '').length}/2000</span></div></>}
          {!selected.jobId ? <span className="controlFeedback error">No linked job is available for conversation control.</span> : null}
          {pendingAction ? <span className="controlFeedback success">{pendingAction === 'takeover' ? 'Takeover request sent. Confirming with TyreOps...' : 'Return-to-AI request sent. Confirming with TyreOps...'}</span> : null}
          {feedback?.threadId === selected.id ? <span className={`controlFeedback ${feedback.type}`}>{feedback.text}</span> : null}
        </footer>
      </main> : <main className="conversationCentre conversationEmpty"><strong>Select a conversation</strong><span>Choose a customer thread from the inbox.</span></main>}

      <aside className="jobContextPanel">
        <div className="jobContextHead"><button className="mobileBack" type="button" onClick={() => setMobileView('conversation')}>← Conversation</button><span>Job context</span>{selected?.jobId ? <Link href={`/jobs/${selected.jobId}`}>Open full job →</Link> : null}</div>
        {selected?.jobContext ? <div className="jobContextBody">
          <div className="jobContextHero"><span>Current job</span><strong>{selected.publicJobId}</strong><em className={`badge ${selected.jobStatus}`}>{selected.jobStatus.replaceAll('_', ' ')}</em></div>
          <dl className="contextList">
            <div><dt>Urgency</dt><dd>{contextValue(selected.jobContext.urgency)}</dd></div>
            <div><dt>Tyres</dt><dd>{selected.jobContext.tyreSize || selected.jobContext.quantity ? `${contextValue(selected.jobContext.tyreSize)} × ${contextValue(selected.jobContext.quantity)}` : 'Not recorded'}</dd></div>
            <div><dt>Location</dt><dd>{contextValue(selected.jobContext.location)}</dd></div>
            <div><dt>Vehicle</dt><dd>{contextValue(selected.jobContext.vehicleRegistration)}</dd></div>
            <div><dt>Requested time</dt><dd>{contextValue(selected.jobContext.requestedTime)}</dd></div>
            <div><dt>Customer price</dt><dd>{money(selected.jobContext.customerPrice)}</dd></div>
            <div><dt>Payment</dt><dd>{contextValue(selected.jobContext.paymentStatus).replaceAll('_', ' ')}</dd></div>
            <div><dt>Assigned fitter</dt><dd>{contextValue(selected.jobContext.fitterName)}</dd></div>
            <div><dt>Dispatch</dt><dd>{contextValue(selected.jobContext.dispatchStatus).replaceAll('_', ' ')}</dd></div>
          </dl>
          <Link className="openJobButton" href={`/jobs/${selected.jobId}`}>Open full job</Link>
        </div> : <div className="jobContextEmpty"><strong>No linked job</strong><span>This customer thread remains readable, but job controls are unavailable.</span></div>}
      </aside>
    </div>
  </div>;
}
