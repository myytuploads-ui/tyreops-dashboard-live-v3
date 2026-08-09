'use client';

import { useEffect, useRef, useState } from 'react';

export type ConversationMode = 'ai' | 'human';
export type MessageActor = 'ai' | 'owner' | 'operator' | 'system' | 'unknown';
export type ConversationMessage = { id: string; direction: 'inbound' | 'outbound'; text: string; createdAt: string; actor: MessageActor };
export type Conversation = { id: string; customerName: string; phone: string; publicJobId: string; jobStatus: string; mode: ConversationMode; needsAttention: boolean; latestText: string; latestAt: string; messages: ConversationMessage[] };

function timestamp(value: string) {
  if (!value) return 'Time unavailable';
  return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function actorLabel(actor: MessageActor) {
  return actor === 'unknown' ? 'Legacy / unknown' : actor;
}

export default function ConversationsInbox({ conversations }: { conversations: Conversation[] }) {
  const [selectedId, setSelectedId] = useState(conversations[0]?.id || '');
  const selected = conversations.find(conversation => conversation.id === selectedId) || conversations[0];
  const historyEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { historyEnd.current?.scrollIntoView({ block: 'end' }); }, [selected?.id]);

  return <>
    <div className="topbar">
      <div className="headline"><div><h1>Conversations</h1><p>WhatsApp inbox and live AI or human ownership.</p></div></div>
      <div className="topActions"><span className="conversationCount">{conversations.length} active threads</span></div>
    </div>
    {!conversations.length ? <div className="panel emptyState"><strong>No conversations found.</strong><span>Messages linked to jobs will appear here.</span></div> :
      <div className="inboxShell">
        <aside className="conversationList" aria-label="Customer conversations">
          <div className="inboxSectionHead"><strong>Operations inbox</strong><span>Most relevant first</span></div>
          {conversations.map(conversation => <button type="button" className={`conversationItem ${selected?.id === conversation.id ? 'selected' : ''}`} key={conversation.id} onClick={() => setSelectedId(conversation.id)}>
            <div className="conversationItemTop"><strong>{conversation.customerName}</strong><time>{timestamp(conversation.latestAt)}</time></div>
            <div className="conversationRef">{conversation.publicJobId} · {conversation.phone}</div>
            <div className="conversationPreview">{conversation.latestText}</div>
            <div className="conversationItemFoot"><span className={`modeBadge ${conversation.mode}`}>{conversation.mode === 'human' ? 'Human takeover' : 'AI mode'}</span>{conversation.needsAttention ? <span className="attentionFlag">Needs reply</span> : null}</div>
          </button>)}
        </aside>
        {selected ? <section className="conversationDetail" aria-label={`Conversation with ${selected.customerName}`}>
          <header className="conversationHeader">
            <div><h2>{selected.customerName}</h2><p>{selected.phone} · {selected.publicJobId}</p><div className="conversationHeaderBadges"><span className={`modeBadge ${selected.mode}`}>{selected.mode === 'human' ? 'Human takeover' : 'AI mode'}</span><span className="jobState">{selected.jobStatus.replaceAll('_', ' ')}</span></div></div>
            <div className="conversationControls"><button className="readonlyAction" disabled title="Backend control endpoint not connected yet.">Take over</button><button className="readonlyAction" disabled title="Backend control endpoint not connected yet.">Return to AI</button><span>Backend control endpoint not connected yet.</span></div>
          </header>
          <div className="messageHistory">
            {selected.messages.map(message => <article className={`messageRow ${message.direction}`} key={message.id}><div className="messageBubble"><div className="messageMeta"><strong>{message.direction === 'inbound' ? 'Customer' : actorLabel(message.actor)}</strong><span>{message.direction}</span></div><p>{message.text || 'Empty message'}</p><time>{timestamp(message.createdAt)}</time></div></article>)}
            <div ref={historyEnd} />
          </div>
        </section> : null}
      </div>}
  </>;
}
