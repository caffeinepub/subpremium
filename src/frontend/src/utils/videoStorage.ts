import { getAuthToken } from "../hooks/useAuth";
import type { Video } from "../types/video";
import { getBackendActor } from "./backendActor";
import { syncHistoryToBackend } from "./userDataSync";

const STORAGE_KEY = "subpremium_videos";
// History key is now user-scoped. We also keep the legacy key in sync
// for components that read it without a userId.
const HISTORY_KEY = "subpremium_history";
const USER_HISTORY_KEY = (userId: string) => `subpremium_history_${userId}`;

export function getVideos(): Video[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Video[]) : [];
  } catch {
    return [];
  }
}

export function saveVideos(videos: Video[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  } catch (e) {
    console.error("Failed to save videos:", e);
  }
}

export function deleteVideo(videoId: string): void {
  const videos = getVideos();
  saveVideos(videos.filter((v) => v.id !== videoId));
}

export function getHistory(
  userId?: string,
): Array<{ videoId: string; watchedAt: number }> {
  try {
    // Prefer user-scoped key if userId is provided
    if (userId) {
      const userRaw = localStorage.getItem(USER_HISTORY_KEY(userId));
      if (userRaw) return JSON.parse(userRaw);
    }
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addToHistory(videoId: string): void {
  try {
    const raw = localStorage.getItem("subpremium_session");
    const session = raw ? JSON.parse(raw) : null;
    const userId: string | undefined = session?.user?.userId;

    // Write to both generic and user-scoped key
    const history = getHistory(userId);
    const existing = history.findIndex((h) => h.videoId === videoId);
    if (existing >= 0) history.splice(existing, 1);
    history.unshift({ videoId, watchedAt: Date.now() });
    history.splice(100);

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    if (userId) {
      localStorage.setItem(USER_HISTORY_KEY(userId), JSON.stringify(history));
    }

    // Fire-and-forget backend sync
    const token = getAuthToken();
    if (userId && token) {
      getBackendActor()
        .then((actor) => syncHistoryToBackend(userId, token, actor))
        .catch(() => {});
    }
  } catch {
    // Silent
  }
}

export function incrementViews(videoId: string): void {
  const videos = getVideos();
  const video = videos.find((v) => v.id === videoId);
  if (video) {
    video.views++;
    saveVideos(videos);
  }
}

export function updateVideo(updated: Video): void {
  const videos = getVideos();
  const idx = videos.findIndex((v) => v.id === updated.id);
  if (idx >= 0) {
    videos[idx] = updated;
    saveVideos(videos);
  }
}
