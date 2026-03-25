/**
 * userDataSync.ts
 * Syncs user data between the backend canister and localStorage.
 * All backend calls are fire-and-forget unless explicitly awaited.
 */

const PROFILE_KEY = "subpremium_profile";
const WATCHLATER_KEY = (userId: string) => `subpremium_watchlater_${userId}`;
const HISTORY_KEY = "subpremium_history";
const PROGRESS_KEY = (userId: string, videoId: string) =>
  `subpremium_progress_${userId}_${videoId}`;

/** Races a promise against a timeout, returns null on timeout. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Hydrate localStorage from backend UserData.
 * Should be awaited (with external timeout) in the login flow BEFORE setUser.
 */
export async function hydrateUserDataFromBackend(
  userId: string,
  _token: string,
  actor: any,
): Promise<void> {
  try {
    // Fetch all user data
    const result = await withTimeout(
      (actor as any).getUserAllData(userId),
      3000,
    );
    if (result && Array.isArray(result) && result.length > 0) {
      const data = result[0];

      // Restore profile extras
      if (data.username !== undefined || data.avatarUrl !== undefined) {
        const existing = (() => {
          try {
            const raw = localStorage.getItem(`${PROFILE_KEY}_${userId}`);
            return raw ? JSON.parse(raw) : {};
          } catch {
            return {};
          }
        })();
        localStorage.setItem(
          `${PROFILE_KEY}_${userId}`,
          JSON.stringify({
            ...existing,
            username: data.username || existing.username,
            avatarUrl: data.avatarUrl || existing.avatarUrl,
          }),
        );
      }

      // Restore watch later
      if (Array.isArray(data.watchLater)) {
        localStorage.setItem(
          WATCHLATER_KEY(userId),
          JSON.stringify(data.watchLater),
        );
      }

      // Restore history
      if (Array.isArray(data.history) && data.history.length > 0) {
        const historyMapped = data.history.map(
          (h: { videoId: string; watchedAt: bigint }) => ({
            videoId: h.videoId,
            watchedAt: Number(h.watchedAt),
          }),
        );
        localStorage.setItem(HISTORY_KEY, JSON.stringify(historyMapped));
      }

      // Restore playlists
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        localStorage.setItem(
          `subpremium_playlists_${userId}`,
          JSON.stringify(data.playlists),
        );
      }
    }

    // Restore watch progress
    try {
      const progressResult = await withTimeout(
        (actor as any).getWatchProgressAll(userId),
        3000,
      );
      if (Array.isArray(progressResult)) {
        for (const entry of progressResult as Array<{
          videoId: string;
          progressTime: number;
          durationSeconds: number;
        }>) {
          if (entry.videoId) {
            localStorage.setItem(
              PROGRESS_KEY(userId, entry.videoId),
              JSON.stringify({
                progressTime: entry.progressTime,
                durationSeconds: entry.durationSeconds,
              }),
            );
          }
        }
      }
    } catch {
      // Progress fetch failed silently
    }
  } catch {
    // Entire hydration failed silently — don't break login
  }
}

/** Fire-and-forget: sync watchLater list to backend */
export async function syncWatchLaterToBackend(
  userId: string,
  token: string,
  actor: any,
): Promise<void> {
  try {
    const raw = localStorage.getItem(WATCHLATER_KEY(userId));
    const watchLater: string[] = raw ? JSON.parse(raw) : [];
    const history = (() => {
      try {
        const h = localStorage.getItem(HISTORY_KEY);
        return h ? JSON.parse(h) : [];
      } catch {
        return [];
      }
    })();
    const playlists = (() => {
      try {
        const p = localStorage.getItem(`subpremium_playlists_${userId}`);
        return p ? JSON.parse(p) : [];
      } catch {
        return [];
      }
    })();
    await (actor as any).saveUserData(token, watchLater, history, playlists);
  } catch {
    // Silent
  }
}

/** Fire-and-forget: sync history to backend */
export async function syncHistoryToBackend(
  userId: string,
  token: string,
  actor: any,
): Promise<void> {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history: Array<{ videoId: string; watchedAt: number }> = raw
      ? JSON.parse(raw)
      : [];
    const watchLater = (() => {
      try {
        const w = localStorage.getItem(WATCHLATER_KEY(userId));
        return w ? JSON.parse(w) : [];
      } catch {
        return [];
      }
    })();
    const playlists = (() => {
      try {
        const p = localStorage.getItem(`subpremium_playlists_${userId}`);
        return p ? JSON.parse(p) : [];
      } catch {
        return [];
      }
    })();
    const historyForBackend = history.map((h) => ({
      videoId: h.videoId,
      watchedAt: BigInt(h.watchedAt),
    }));
    await (actor as any).saveUserData(
      token,
      watchLater,
      historyForBackend,
      playlists,
    );
  } catch {
    // Silent
  }
}

/** Fire-and-forget: sync a single watch progress entry to backend */
export async function syncWatchProgressToBackend(
  _userId: string,
  token: string,
  videoId: string,
  progressTime: number,
  durationSeconds: number,
  actor: any,
): Promise<void> {
  try {
    await (actor as any).saveWatchProgress(
      token,
      videoId,
      progressTime,
      durationSeconds,
    );
  } catch {
    // Silent
  }
}

/** Fire-and-forget: sync profile extras (username, avatar) to backend */
export async function syncProfileExtrasToBackend(
  _userId: string,
  token: string,
  username: string,
  avatarUrl: string,
  actor: any,
): Promise<void> {
  try {
    await (actor as any).updateUserExtra(token, username, avatarUrl);
  } catch {
    // Silent
  }
}
