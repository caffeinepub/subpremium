import { getAuthToken } from "../hooks/useAuth";
import { getBackendActor } from "./backendActor";
import { syncWatchProgressToBackend } from "./userDataSync";

const KEY = (userId: string, videoId: string) =>
  `subpremium_progress_${userId}_${videoId}`;

export interface ProgressData {
  progressTime: number;
  durationSeconds: number;
}

export function saveProgress(
  userId: string,
  videoId: string,
  progressTime: number,
  durationSeconds: number,
): void {
  if (!userId || !videoId) return;
  const data: ProgressData = { progressTime, durationSeconds };
  localStorage.setItem(KEY(userId, videoId), JSON.stringify(data));
  // Fire-and-forget backend sync
  const token = getAuthToken();
  if (token) {
    getBackendActor()
      .then((actor) =>
        syncWatchProgressToBackend(
          userId,
          token,
          videoId,
          progressTime,
          durationSeconds,
          actor,
        ),
      )
      .catch(() => {});
  }
}

export function getProgress(
  userId: string,
  videoId: string,
): ProgressData | null {
  if (!userId || !videoId) return null;
  try {
    const raw = localStorage.getItem(KEY(userId, videoId));
    if (!raw) return null;
    return JSON.parse(raw) as ProgressData;
  } catch {
    return null;
  }
}

export function getWatchedPercent(userId: string, videoId: string): number {
  const p = getProgress(userId, videoId);
  if (!p || !p.durationSeconds || p.durationSeconds === 0) return 0;
  return Math.min(100, Math.round((p.progressTime / p.durationSeconds) * 100));
}
