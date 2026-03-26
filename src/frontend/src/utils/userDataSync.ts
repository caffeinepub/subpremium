/**
 * userDataSync.ts
 * Syncs user data between the backend canister and localStorage.
 * All backend calls are fire-and-forget unless explicitly awaited.
 */

const PROFILE_KEY = "subpremium_profile";
const WATCHLATER_KEY = (userId: string) => `subpremium_watchlater_${userId}`;
const HISTORY_KEY = (userId: string) => `subpremium_history_${userId}`;
const PROGRESS_KEY = (userId: string, videoId: string) =>
  `subpremium_progress_${userId}_${videoId}`;
const PLAYLISTS_KEY = (userId: string) => `playlists_${userId}`;
const SUBSCRIPTIONS_KEY = (userId: string) =>
  `subpremium_subscriptions_${userId}`;

/** Races a promise against a timeout, returns null on timeout. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Safely convert bigint or number to JS number */
function toNumber(val: unknown): number {
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "number") return val;
  return 0;
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
      4000,
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

      // Restore history (user-scoped key + legacy key)
      if (Array.isArray(data.history) && data.history.length > 0) {
        const historyMapped = data.history.map(
          (h: { videoId: string; watchedAt: bigint | number }) => ({
            videoId: h.videoId,
            watchedAt: toNumber(h.watchedAt),
          }),
        );
        localStorage.setItem(
          HISTORY_KEY(userId),
          JSON.stringify(historyMapped),
        );
        localStorage.setItem(
          "subpremium_history",
          JSON.stringify(historyMapped),
        );
      }

      // Restore playlists — normalize type from backend PlaylistRecord
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        try {
          const normalized = data.playlists.map(
            (p: {
              playlistId: string;
              name: string;
              videoIds: string[];
              createdAt: bigint | number;
            }) => ({
              id: p.playlistId,
              name: p.name,
              videoIds: Array.isArray(p.videoIds) ? p.videoIds : [],
              isDefault: p.name === "Watch Later" || p.name === "Favorites",
              createdAt: toNumber(p.createdAt),
            }),
          );
          localStorage.setItem(
            PLAYLISTS_KEY(userId),
            JSON.stringify(normalized),
          );
        } catch {
          // Silent — don't break hydration
        }
      }
    }

    // Restore subscriptions from separate map
    try {
      const subs = await withTimeout(
        (actor as any).getUserSubscriptions(userId),
        3000,
      );
      if (Array.isArray(subs) && subs.length > 0) {
        localStorage.setItem(SUBSCRIPTIONS_KEY(userId), JSON.stringify(subs));
      }
    } catch {
      // Silent
    }

    // Restore watch progress
    try {
      const progressResult = await withTimeout(
        (actor as any).getWatchProgressAll(userId),
        4000,
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
                progressTime: Number(entry.progressTime),
                durationSeconds: Number(entry.durationSeconds),
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

/** Bundle watchLater + history + playlists and save to backend */
async function pushCoreUserDataToBackend(
  userId: string,
  token: string,
  actor: any,
): Promise<void> {
  try {
    const watchLater: string[] = (() => {
      try {
        const raw = localStorage.getItem(WATCHLATER_KEY(userId));
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })();

    const history = (() => {
      try {
        const raw =
          localStorage.getItem(HISTORY_KEY(userId)) ||
          localStorage.getItem("subpremium_history");
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })();

    const playlists = (() => {
      try {
        const raw = localStorage.getItem(PLAYLISTS_KEY(userId));
        const items = raw ? JSON.parse(raw) : [];
        return items.map(
          (p: {
            id?: string;
            playlistId?: string;
            name: string;
            videoIds?: string[];
            createdAt?: number;
          }) => ({
            playlistId: p.id || p.playlistId || `pl_${Date.now()}`,
            name: p.name,
            videoIds: Array.isArray(p.videoIds) ? p.videoIds : [],
            createdAt: BigInt(p.createdAt || Date.now()),
          }),
        );
      } catch {
        return [];
      }
    })();

    const historyForBackend = history.map(
      (h: { videoId: string; watchedAt: number }) => ({
        videoId: h.videoId,
        watchedAt: BigInt(Math.floor(h.watchedAt)),
      }),
    );

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

/** Fire-and-forget: sync watchLater list to backend */
export async function syncWatchLaterToBackend(
  userId: string,
  token: string,
  actor: any,
): Promise<void> {
  await pushCoreUserDataToBackend(userId, token, actor);
}

/** Fire-and-forget: sync history to backend */
export async function syncHistoryToBackend(
  userId: string,
  token: string,
  actor: any,
): Promise<void> {
  await pushCoreUserDataToBackend(userId, token, actor);
}

/** Fire-and-forget: sync subscriptions to backend (separate map) */
export async function syncSubscriptionsToBackend(
  userId: string,
  token: string,
  actor: any,
): Promise<void> {
  try {
    const raw = localStorage.getItem(SUBSCRIPTIONS_KEY(userId));
    const subscriptions = raw ? JSON.parse(raw) : [];
    await (actor as any).saveUserSubscriptions(token, subscriptions);
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
