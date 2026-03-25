import { useCallback, useEffect, useState } from "react";

export interface AppNotification {
  id: string;
  type: "upload" | "like" | "comment";
  title: string;
  message: string;
  videoId: string;
  timestamp: number;
  read: boolean;
}

const storageKey = (userId: string) => `subpremium_notifs_${userId}`;
const NOTIF_EVENT = "notif-added";

export function getNotifications(userId: string): AppNotification[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as AppNotification[]) : [];
  } catch {
    return [];
  }
}

export function addNotification(
  userId: string,
  notif: Omit<AppNotification, "id" | "timestamp" | "read">,
): AppNotification {
  const newNotif: AppNotification = {
    ...notif,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    read: false,
  };
  const existing = getNotifications(userId);
  const updated = [newNotif, ...existing];
  if (userId) {
    localStorage.setItem(storageKey(userId), JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(NOTIF_EVENT, { detail: { userId } }));
  }
  return newNotif;
}

export function markAllRead(userId: string): void {
  if (!userId) return;
  const existing = getNotifications(userId);
  const updated = existing.map((n) => ({ ...n, read: true }));
  localStorage.setItem(storageKey(userId), JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent(NOTIF_EVENT, { detail: { userId } }));
}

export function getUnreadCount(userId: string): number {
  return getNotifications(userId).filter((n) => !n.read).length;
}

export function useNotifications(userId: string) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    getNotifications(userId),
  );

  const refresh = useCallback(() => {
    setNotifications(getNotifications(userId));
  }, [userId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: userId is a primitive used inside refresh
  useEffect(() => {
    refresh();
  }, [userId, refresh]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId: string };
      if (detail?.userId === userId) {
        refresh();
      }
    };
    window.addEventListener(NOTIF_EVENT, handler);
    return () => window.removeEventListener(NOTIF_EVENT, handler);
  }, [userId, refresh]);

  const addNotif = useCallback(
    (notif: Omit<AppNotification, "id" | "timestamp" | "read">) => {
      return addNotification(userId, notif);
    },
    [userId],
  );

  const markRead = useCallback(() => {
    markAllRead(userId);
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    addNotification: addNotif,
    markAllRead: markRead,
    unreadCount,
  };
}
