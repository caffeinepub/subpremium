import { getAuthToken } from "../hooks/useAuth";
import { getBackendActor } from "./backendActor";
import { syncWatchLaterToBackend } from "./userDataSync";

const KEY = (userId: string) => `subpremium_watchlater_${userId}`;

export function getWatchLater(userId: string): string[] {
  if (!userId) return [];
  try {
    return JSON.parse(localStorage.getItem(KEY(userId)) ?? "[]");
  } catch {
    return [];
  }
}

export function addToWatchLater(userId: string, videoId: string): void {
  if (!userId) return;
  const list = getWatchLater(userId);
  if (!list.includes(videoId)) {
    list.unshift(videoId);
    localStorage.setItem(KEY(userId), JSON.stringify(list));
    // Fire-and-forget backend sync
    const token = getAuthToken();
    if (token) {
      getBackendActor()
        .then((actor) => syncWatchLaterToBackend(userId, token, actor))
        .catch(() => {});
    }
  }
}

export function removeFromWatchLater(userId: string, videoId: string): void {
  if (!userId) return;
  const list = getWatchLater(userId).filter((id) => id !== videoId);
  localStorage.setItem(KEY(userId), JSON.stringify(list));
  // Fire-and-forget backend sync
  const token = getAuthToken();
  if (token) {
    getBackendActor()
      .then((actor) => syncWatchLaterToBackend(userId, token, actor))
      .catch(() => {});
  }
}

export function isInWatchLater(userId: string, videoId: string): boolean {
  if (!userId) return false;
  return getWatchLater(userId).includes(videoId);
}
