// App shell. Wires the surfaces against an injected ApiClient (fixture by default).
// Keyboard note: there is NO global keydown handler in this app. Approval is only
// reachable by focusing the Approve button in the verdict panel and clicking/Enter
// ON that button. Opening a submission is a separate, explicit action.
import { useEffect, useRef, useState } from 'react';
import type { ApiClient } from './api/client';
import { createFixtureClient } from './api/fixtures';
import type {
  TriageItem,
  QueueEmptyReason,
  SubmissionDetail,
  AmplificationArtefact,
  KnowledgeResponse,
  OperatorDashboardData,
  WhatChangedReport as WhatChangedType,
} from './types/view';
import { TriageQueue } from './queue/TriageQueue';
import { VerdictPanel } from './verdict/VerdictPanel';
import { AmplificationPanel } from './amplification/AmplificationPanel';
import { KnowledgePanel } from './knowledge/KnowledgePanel';
import { OperatorDashboard } from './operator/OperatorDashboard';
import { WhatChangedReport } from './reports/WhatChangedReport';
import { StaleDataBanner } from './banners/Banners';

type Route = 'queue' | 'amplification' | 'knowledge' | 'operator' | 'whatchanged';

// The id of the heading a keyboard/AT user should land on for the current view.
// Each surface renders exactly one <h2> with a stable id; the queue toggles
// between the queue list and the opened submission's verdict panel.
function headingIdForView(route: Route, hasSelection: boolean): string {
  switch (route) {
    case 'queue':
      return hasSelection ? 'verdict-heading' : 'queue-heading';
    case 'amplification':
      return 'amp-heading';
    case 'knowledge':
      return 'knowledge-heading';
    case 'operator':
      return 'op-heading';
    case 'whatchanged':
      return 'wc-heading';
  }
}

const ROUTE_TITLES: Record<Route, string> = {
  queue: 'Review queue',
  amplification: 'Amplification',
  knowledge: 'Knowledge',
  operator: 'Operator dashboard',
  whatchanged: 'What changed',
};

export function App({ client = createFixtureClient() }: { client?: ApiClient }): JSX.Element {
  const [route, setRoute] = useState<Route>('queue');
  const [items, setItems] = useState<TriageItem[]>([]);
  const [emptyReason, setEmptyReason] = useState<QueueEmptyReason | null>(null);
  const [queueDown, setQueueDown] = useState(false);
  const [queueAsOf, setQueueAsOf] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubmissionDetail | null>(null);
  const [c2Down, setC2Down] = useState(false);

  const [amp, setAmp] = useState<AmplificationArtefact | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeResponse | null>(null);
  const [operator, setOperator] = useState<OperatorDashboardData | null>(null);
  const [c3Down, setC3Down] = useState(false);
  const [whatChanged, setWhatChanged] = useState<WhatChangedType | null>(null);
  const [whatChangedDown, setWhatChangedDown] = useState(false);

  useEffect(() => {
    void (async () => {
      const q = await client.getQueue();
      if (q.status === 'down') {
        setQueueDown(true);
        setQueueAsOf(q.last_as_of);
      } else {
        setItems(q.data.items);
        setEmptyReason(q.data.empty_reason);
        setQueueAsOf(q.as_of);
        setQueueDown(q.stale);
      }
    })();
  }, [client]);

  async function openSubmission(id: string): Promise<void> {
    const r = await client.getSubmission(id);
    if (r.status === 'down') {
      setC2Down(true);
      setSelected(null);
      return;
    }
    setC2Down(false);
    setSelected(r.data);
  }

  async function approve(id: string): Promise<void> {
    const r = await client.approve(id);
    if (r.status === 'down') {
      setC2Down(true); // fail closed: nothing recorded
      return;
    }
    setSelected((s) => (s && s.submission_id === id ? { ...s, human_approved_at: r.data.human_approved_at } : s));
  }

  async function override(id: string, target: string, reason: string): Promise<boolean> {
    const r = await client.override(id, target, reason);
    if (r.status === 'down') {
      setC2Down(true); // fail closed: nothing recorded, report failure to the panel
      return false;
    }
    // Re-open to reflect the recorded override; kept simple for the fixture.
    await openSubmission(id);
    return true;
  }

  async function loadAmp(): Promise<void> {
    const r = await client.getAmplification('camp-summer-glow');
    if (r.status === 'down') {
      setC2Down(true);
      setAmp(null);
      return;
    }
    setAmp(r.data);
  }

  async function signOff(campaignId: string, name: string, mods: string[]): Promise<void> {
    const r = await client.signOff(campaignId, name, mods);
    if (r.status === 'down') {
      setC2Down(true);
      return;
    }
    setAmp((a) => (a ? { ...a, signoff: r.data } : a));
  }

  useEffect(() => {
    if (route === 'amplification' && !amp) void loadAmp();
    if (route === 'knowledge' && !knowledge) {
      void client.getKnowledge('beauty', 'tiktok').then(setKnowledge);
    }
    if (route === 'operator' && !operator && !c3Down) {
      void client.getOperatorDashboard().then((r) => {
        if (r.status === 'down') setC3Down(true);
        else setOperator(r.data);
      });
    }
    if (route === 'whatchanged' && !whatChanged) {
      void client.getWhatChanged('beauty', 'tiktok').then((r) => {
        if (r.status === 'down') setWhatChangedDown(true);
        else setWhatChanged(r.data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // R5-T4 (#22): reflect the current view in the document title per route.
  useEffect(() => {
    const base = 'UGC Intelligence — Manager Console';
    const section =
      route === 'queue' && selected ? `Review ${selected.creator_handle}` : ROUTE_TITLES[route];
    document.title = `${section} — ${base}`;
  }, [route, selected]);

  // R5-T1 (#9): on a view transition (route change, open submission, back to queue)
  // move focus to the destination section's heading so keyboard/AT users know where
  // they landed. Focus is NOT moved on initial page load (would steal the browser's
  // starting focus), and the target heading must exist before we call .focus().
  const lastFocusedViewRef = useRef<string | null>(null);
  const didMountRef = useRef(false);
  useEffect(() => {
    const viewKey = `${route}:${selected?.submission_id ?? ''}`;
    if (!didMountRef.current) {
      // First render: record the view but do not move focus.
      didMountRef.current = true;
      lastFocusedViewRef.current = viewKey;
      return;
    }
    if (lastFocusedViewRef.current === viewKey) return;
    const heading = document.getElementById(headingIdForView(route, selected != null));
    if (heading) {
      // A programmatically-focusable, non-tab-stop heading (WCAG 2.4.3).
      heading.setAttribute('tabindex', '-1');
      heading.focus();
      // Only mark this view handled once we actually landed focus, so async
      // surfaces (amplification/knowledge) still get focus when their heading mounts.
      lastFocusedViewRef.current = viewKey;
    }
    // Data deps included so focus lands when an async surface's heading appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, selected, amp, knowledge, operator, whatChanged]);

  return (
    <main>
      <h1>UGC Intelligence — Manager Console</h1>
      <nav aria-label="Surfaces">
        <ul style={{ display: 'flex', gap: '1rem', listStyle: 'none', padding: 0 }}>
          {(
            [
              ['queue', 'Queue'],
              ['amplification', 'Amplification'],
              ['knowledge', 'Knowledge'],
              ['operator', 'Operator'],
              ['whatchanged', 'What changed'],
            ] as [Route, string][]
          ).map(([r, label]) => (
            <li key={r}>
              <button
                type="button"
                aria-current={route === r ? 'page' : undefined}
                onClick={() => setRoute(r)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {route === 'queue' ? (
        <>
          {queueDown ? (
            <StaleDataBanner asOf={queueAsOf} message="The review service (C2) is unreachable." />
          ) : null}
          {selected ? (
            <>
              <button type="button" onClick={() => setSelected(null)}>
                ← Back to queue
              </button>
              <VerdictPanel
                detail={selected}
                apiDown={c2Down || queueDown}
                onApprove={approve}
                onOverride={override}
              />
            </>
          ) : (
            <TriageQueue items={items} emptyReason={emptyReason} onOpen={openSubmission} />
          )}
        </>
      ) : null}

      {route === 'amplification' ? (
        amp ? (
          <AmplificationPanel artefact={amp} apiDown={c2Down} onSignOff={signOff} />
        ) : (
          <p role="status">Loading amplification…</p>
        )
      ) : null}

      {route === 'knowledge' ? (
        knowledge ? (
          <KnowledgePanel response={knowledge} />
        ) : (
          <p role="status">Loading knowledge…</p>
        )
      ) : null}

      {route === 'operator' ? <OperatorDashboard data={operator} c3Down={c3Down} /> : null}

      {route === 'whatchanged' ? (
        <WhatChangedReport report={whatChanged} unreachable={whatChangedDown} />
      ) : null}
    </main>
  );
}
