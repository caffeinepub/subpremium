import { getAuthToken } from "../hooks/useAuth";
import { getBackendActor } from "./backendActor";
import { syncSubscriptionsToBackend } from "./userDataSync";

const KEY = (userId: string) => `subpremium_subscriptions_${userId}`;

export interface Subscription {
  creatorId: string;
  creatorName: string;
}

export function getSubscriptions(userId: string): Subscription[] {
  if (!userId) return [];
  try {
    return JSON.parse(localStorage.getItem(KEY(userId)) ?? "[]");
  } catch {
    return [];
  }
}

function fireBackendSync(userId: string): void {
  const token = getAuthToken();
  if (token) {
    getBackendActor()
      .then((actor) => syncSubscriptionsToBackend(userId, token, actor))
      .catch(() => {});
  }
}

export function subscribe(
  userId: string,
  creatorId: string,
  creatorName: string,
): void {
  if (!userId || !creatorId) return;
  const list = getSubscriptions(userId);
  if (!list.find((s) => s.creatorId === creatorId)) {
    list.unshift({ creatorId, creatorName });
    localStorage.setItem(KEY(userId), JSON.stringify(list));
    fireBackendSync(userId);
  }
}

export function unsubscribe(userId: string, creatorId: string): void {
  if (!userId) return;
  const list = getSubscriptions(userId).filter(
    (s) => s.creatorId !== creatorId,
  );
  localStorage.setItem(KEY(userId), JSON.stringify(list));
  fireBackendSync(userId);
}

export function isSubscribed(userId: string, creatorId: string): boolean {
  if (!userId || !creatorId) return false;
  return getSubscriptions(userId).some((s) => s.creatorId === creatorId);
}
