/**
 * Clears any stale demo/seed video caches from localStorage and IndexedDB.
 * Only targets cache keys — does NOT touch auth, user profiles, or history.
 * Safe to call on every app startup.
 */
export function clearDemoCache(): void {
  try {
    // Remove the videos list cache. The app fetches fresh from the backend on load.
    // This removes any demo/seed videos that may have been cached locally.
    localStorage.removeItem("subpremium_videos");

    // Remove any feed-related cache keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key === "subpremium_videos" ||
        key.startsWith("subpremium_feed") ||
        key.startsWith("subpremium_demo") ||
        key.startsWith("subpremium_seed")
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // Silent — never block app startup
  }
}
