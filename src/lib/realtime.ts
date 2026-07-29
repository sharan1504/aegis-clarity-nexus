import { useSyncExternalStore } from "react";

import {
  changeRecords as seedRecords,
  notifications as seedNotifications,
  CHANGE_STAGES,
  type ChangeRecord,
  type Notification,
} from "@/lib/change-data";

export interface RealtimeState {
  records: ChangeRecord[];
  notifications: Notification[];
  lastEventAt: number | null;
  connected: boolean;
}

const initialState: RealtimeState = {
  records: seedRecords,
  notifications: seedNotifications,
  lastEventAt: null,
  connected: false,
};

let state: RealtimeState = initialState;
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function setState(next: Partial<RealtimeState>) {
  state = { ...state, ...next };
  subscribers.forEach((fn) => fn());
}

/** Simulated event stream. Replace with a websocket / SSE feed when a backend exists. */
function tick() {
  const pending = state.records.filter((r) =>
    r.approvals.some((a) => a.status === "pending"),
  );
  if (pending.length === 0) return;

  const target = pending[Math.floor(Math.random() * pending.length)];
  const nextApprover = target.approvals.find((a) => a.status === "pending");
  if (!nextApprover) return;

  const now = new Date().toISOString();
  const records = state.records.map((r) => {
    if (r.id !== target.id) return r;
    const approvals = r.approvals.map((a) =>
      a.id === nextApprover.id
        ? {
            ...a,
            status: "approved" as const,
            timestamp: now,
            comment: a.comment || "Approved via ITSM sync",
          }
        : a,
    );
    const allDone = approvals.every((a) => a.status === "approved");
    const idx = CHANGE_STAGES.indexOf(r.stage);
    const stage =
      allDone && idx < CHANGE_STAGES.length - 1 ? CHANGE_STAGES[idx + 1] : r.stage;
    return {
      ...r,
      approvals,
      stage,
      timeline: [
        {
          ts: now,
          actor: nextApprover.approver,
          event: `Approval recorded — ${nextApprover.group}`,
          detail: allDone ? `All approvals complete · stage ${stage}` : undefined,
        },
        ...r.timeline,
      ],
    };
  });

  const notification: Notification = {
    id: `N-${Date.now()}`,
    kind: "approval_deadline",
    title: `Approval recorded on ${target.id}`,
    body: `${nextApprover.approver} (${nextApprover.group}) signed off on "${target.title}".`,
    ts: "just now",
    unread: true,
    href: `/approvals/${target.id}`,
  };

  setState({
    records,
    notifications: [notification, ...state.notifications].slice(0, 30),
    lastEventAt: Date.now(),
  });
}

function start() {
  if (timer || typeof window === "undefined") return;
  timer = setInterval(tick, 15000);
  setState({ connected: true });
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  setState({ connected: false });
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  start();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) stop();
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => initialState;

export function useRealtime() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function updateRecords(fn: (records: ChangeRecord[]) => ChangeRecord[]) {
  setState({ records: fn(state.records), lastEventAt: Date.now() });
}

export function pushNotification(n: Notification) {
  setState({ notifications: [n, ...state.notifications].slice(0, 30) });
}

export function markNotificationRead(id: string) {
  setState({
    notifications: state.notifications.map((n) => (n.id === id ? { ...n, unread: false } : n)),
  });
}

export function markAllNotificationsRead() {
  setState({ notifications: state.notifications.map((n) => ({ ...n, unread: false })) });
}
