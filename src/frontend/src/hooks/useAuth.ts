import {
  type ReactNode,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getBackendActor } from "../utils/backendActor";
import {
  hydrateUserDataFromBackend,
  syncProfileExtrasToBackend,
} from "../utils/userDataSync";

export interface AuthUser {
  userId: string;
  email: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<string | null>;
  signup: (
    displayName: string,
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<string | null>;
  logout: () => void;
  loginAsGuest: (email?: string, displayName?: string) => void;
  updateProfile: (
    displayName: string,
    username: string,
    avatarUrl?: string,
  ) => Promise<string | null>;
  checkUsername: (username: string, skipUserId?: string) => boolean;
  factoryReset: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = "subpremium_auth_v2";
const REMEMBER_KEY = "subpremium_remember";
const PROFILE_KEY = "subpremium_profile";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Persistent auth shape — no credentials stored
interface PersistentAuth {
  accessToken: string;
  refreshToken: string;
  userId: string;
  user: AuthUser;
  savedAt: number;
}

function getSession(): PersistentAuth | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as PersistentAuth;
    // Migrate from old format
    const old = localStorage.getItem("subpremium_session");
    if (old) {
      const parsed = JSON.parse(old) as { token: string; user: AuthUser };
      const migrated: PersistentAuth = {
        accessToken: parsed.token,
        refreshToken: parsed.token,
        userId: parsed.user.userId,
        user: parsed.user,
        savedAt: Date.now(),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

function saveSession(auth: PersistentAuth) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(auth));
  // Keep old key in sync so getAuthToken() still works for legacy callers
  localStorage.setItem(
    "subpremium_session",
    JSON.stringify({ token: auth.accessToken, user: auth.user }),
  );
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("subpremium_session");
  localStorage.removeItem(REMEMBER_KEY);
}

function getProfileExtras(userId: string): {
  username?: string;
  avatarUrl?: string;
} {
  try {
    const raw = localStorage.getItem(`${PROFILE_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProfileExtras(
  userId: string,
  extras: { username?: string; avatarUrl?: string },
) {
  localStorage.setItem(`${PROFILE_KEY}_${userId}`, JSON.stringify(extras));
}

/** Races a promise against a timeout. Returns null if timed out. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // isLoading is only used internally; app never blocks on it
  const isLoading = false;
  const refreshingRef = useRef(false);
  const didInitRef = useRef(false);

  useEffect(() => {
    // Run once on mount — never block the UI
    if (didInitRef.current) return;
    didInitRef.current = true;

    const cached = getSession();
    if (!cached?.accessToken) {
      // No session — already logged out, nothing to do
      return;
    }

    // Immediately restore user from cache so UI is never blocked
    const extras = getProfileExtras(cached.user.userId);
    setUser({ ...cached.user, ...extras });

    // Validate token in background with a hard 2s timeout
    (async () => {
      try {
        const actor = await withTimeout(getBackendActor(), 2000);
        if (!actor) {
          // Timeout getting actor — keep cached session (slow network)
          return;
        }

        const result = await withTimeout(
          actor.validateSession(cached.accessToken),
          2000,
        );
        if (result === null) {
          // Timed out — keep cached session, assume valid
          return;
        }

        if (result.__kind__ === "err") {
          // Validation failed — try to silently refresh the token
          if (cached.refreshToken) {
            try {
              const refreshResult = await withTimeout(
                (actor as any).refreshSession?.(cached.refreshToken) ??
                  Promise.reject("no refreshSession"),
                3000,
              );
              if ((refreshResult as any)?.__kind__ === "ok") {
                const {
                  token: newToken,
                  refreshToken: newRt,
                  userId,
                  displayName,
                } = (refreshResult as any).ok;
                const extras = getProfileExtras(userId);
                const updatedUser: AuthUser = {
                  ...cached.user,
                  displayName,
                  ...extras,
                };
                saveSession({
                  accessToken: newToken,
                  refreshToken: newRt || cached.refreshToken,
                  userId,
                  user: updatedUser,
                  savedAt: Date.now(),
                });
                setUser(updatedUser);
              }
              // If refresh also fails: keep cached session, no logout
            } catch {
              // Refresh failed silently — keep cached session
            }
          }
          return;
        }
        // result ok — session confirmed, update savedAt
        saveSession({ ...cached, savedAt: Date.now() });
      } catch {
        // Any error — keep cached session (backend unreachable)
      }
    })();
  }, []);

  // Online/offline handler — silently re-validate when back online
  useEffect(() => {
    const handleOnline = () => {
      const session = getSession();
      if (!session?.accessToken || !user) return;
      (async () => {
        try {
          const actor = await withTimeout(getBackendActor(), 3000);
          if (!actor) return;
          await withTimeout(actor.validateSession(session.accessToken), 3000);
          // Success or failure — keep session either way
        } catch {
          /* silent */
        }
      })();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [user]);

  const loginAsGuest = useCallback((email?: string, displayName?: string) => {
    const guestUser: AuthUser = {
      userId: `guest_${Date.now()}`,
      email: email || "guest@local",
      displayName: displayName || "Guest",
    };
    // Don't save to localStorage (session only)
    setUser(guestUser);
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string,
      rememberMe = false,
    ): Promise<string | null> => {
      try {
        const normalizedEmail = email.trim().toLowerCase();
        const hash = await withTimeout(hashPassword(password), 5000);
        if (hash === null) return "timeout";

        const actor = await withTimeout(getBackendActor(), 5000);
        if (!actor) return "timeout";

        const result = await withTimeout(
          actor.loginUser(normalizedEmail, hash),
          5000,
        );
        if (result === null) return "timeout";

        if (result.__kind__ === "err") {
          return result.err;
        }
        const {
          token,
          refreshToken: rt,
          userId,
          displayName,
        } = result.ok as any;

        // Hydrate all user data from backend BEFORE building authUser
        await withTimeout(
          hydrateUserDataFromBackend(userId, token, actor),
          3000,
        );

        // Now read freshly hydrated profile extras
        const extras = getProfileExtras(userId);
        const authUser: AuthUser = {
          userId,
          email: normalizedEmail,
          displayName,
          ...extras,
        };
        saveSession({
          accessToken: token,
          refreshToken: rt || token,
          userId,
          user: authUser,
          savedAt: Date.now(),
        });
        localStorage.setItem(REMEMBER_KEY, rememberMe ? "true" : "false");
        setUser(authUser);
        return null;
      } catch {
        return "timeout";
      }
    },
    [],
  );

  const signup = useCallback(
    async (
      displayName: string,
      email: string,
      password: string,
      rememberMe = true,
    ): Promise<string | null> => {
      try {
        const normalizedEmail = email.trim().toLowerCase();
        const hash = await withTimeout(hashPassword(password), 5000);
        if (hash === null) return "timeout";

        const actor = await withTimeout(getBackendActor(), 5000);
        if (!actor) {
          return "timeout";
        }

        const regResult = await withTimeout(
          actor.registerUser(normalizedEmail, hash, displayName.trim()),
          5000,
        );
        if (regResult === null) {
          return "timeout";
        }
        if (regResult.__kind__ === "err") {
          return regResult.err;
        }

        const loginResult = await withTimeout(
          actor.loginUser(normalizedEmail, hash),
          5000,
        );
        if (loginResult === null) {
          return null;
        }
        if (loginResult.__kind__ === "err") {
          return null;
        }

        const { token, refreshToken: signupRt, userId } = loginResult.ok as any;
        const authUser: AuthUser = {
          userId,
          email: normalizedEmail,
          displayName: displayName.trim(),
        };
        saveSession({
          accessToken: token,
          refreshToken: signupRt || token,
          userId,
          user: authUser,
          savedAt: Date.now(),
        });
        localStorage.setItem(REMEMBER_KEY, rememberMe ? "true" : "false");
        setUser(authUser);
        return null;
      } catch {
        return "timeout";
      }
    },
    [],
  );

  const logout = useCallback(() => {
    const session = getSession();
    if (session?.accessToken) {
      getBackendActor()
        .then((actor) => actor.logoutUser(session.accessToken))
        .catch(() => {});
    }
    clearSession();
    setUser(null);
  }, []);

  const factoryReset = useCallback(async () => {
    try {
      const session = getSession();
      if (session?.accessToken) {
        try {
          const actor = await getBackendActor();
          // deleteUserAccount may not exist on all backend versions
          const actorAny = actor as unknown as {
            deleteUserAccount?: (token: string) => Promise<boolean>;
          };
          if (actorAny.deleteUserAccount) {
            await actorAny.deleteUserAccount(session.accessToken);
          }
        } catch {
          // swallow backend errors
        }
      }
    } catch {
      // swallow
    }
    // Dispatch event so upload manager can abort active uploads
    window.dispatchEvent(new Event("factory-reset"));
    // Clear all client storage
    try {
      localStorage.clear();
    } catch {}
    try {
      sessionStorage.clear();
    } catch {}
    // Delete IndexedDB databases
    try {
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name) indexedDB.deleteDatabase(db.name);
        }
      }
    } catch {}
    try {
      indexedDB.deleteDatabase("upload-sessions");
    } catch {}
    // Clear service worker caches
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    setUser(null);
  }, []);

  const checkUsername = useCallback(
    (username: string, skipUserId?: string): boolean => {
      const normalized = username.trim().toLowerCase();
      if (!normalized) return false;
      const allProfiles: Record<string, { username?: string }> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${PROFILE_KEY}_`)) {
          try {
            const uid = key.replace(`${PROFILE_KEY}_`, "");
            if (uid !== skipUserId) {
              const val = JSON.parse(localStorage.getItem(key) || "{}");
              allProfiles[uid] = val;
            }
          } catch {
            // ignore
          }
        }
      }
      return !Object.values(allProfiles).some(
        (p) => p.username?.toLowerCase() === normalized,
      );
    },
    [],
  );

  const updateProfile = useCallback(
    async (
      displayName: string,
      username: string,
      avatarUrl?: string,
    ): Promise<string | null> => {
      if (!user) return "Not logged in";
      const trimmedName = displayName.trim();
      const trimmedUsername = username.trim();
      if (!trimmedName) return "Display name cannot be empty";
      if (trimmedUsername) {
        const isAvailable = checkUsername(trimmedUsername, user.userId);
        if (!isAvailable) return "@username is already taken";
      }
      const extras = {
        username: trimmedUsername || undefined,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : user.avatarUrl,
      };
      saveProfileExtras(user.userId, extras);
      const updatedUser: AuthUser = {
        ...user,
        displayName: trimmedName,
        ...extras,
      };
      const session = getSession();
      if (session) {
        saveSession({ ...session, user: updatedUser });
      }
      setUser(updatedUser);

      // Sync profile extras to backend in background
      if (session?.accessToken) {
        getBackendActor()
          .then((actor) =>
            syncProfileExtrasToBackend(
              user.userId,
              session.accessToken,
              trimmedUsername,
              extras.avatarUrl || "",
              actor,
            ),
          )
          .catch(() => {});
      }

      return null;
    },
    [user, checkUsername],
  );

  // Periodic token validation every 30 minutes — never log out on failure
  useEffect(() => {
    const interval = setInterval(
      async () => {
        if (refreshingRef.current) return;
        const session = getSession();
        if (!session?.accessToken || !user) return;

        refreshingRef.current = true;
        try {
          const actor = await getBackendActor();
          const result = await withTimeout(
            actor.validateSession(session.accessToken),
            5000,
          );
          if (result !== null && result.__kind__ === "ok") {
            // Token still valid — update savedAt
            saveSession({ ...session, savedAt: Date.now() });
          } else if (
            result !== null &&
            result.__kind__ === "err" &&
            session.refreshToken
          ) {
            // Try silent token refresh
            try {
              const refreshResult = await withTimeout(
                (actor as any).refreshSession?.(session.refreshToken) ??
                  Promise.reject("no refreshSession"),
                5000,
              );
              if ((refreshResult as any)?.__kind__ === "ok") {
                const { token: newToken, refreshToken: newRt } = (
                  refreshResult as any
                ).ok;
                saveSession({
                  ...session,
                  accessToken: newToken,
                  refreshToken: newRt || session.refreshToken,
                  savedAt: Date.now(),
                });
              }
            } catch {
              // Refresh failed silently — keep session
            }
          }
          // Any other failure: keep session as-is, never log out
        } catch {
          // Network issue — keep session as-is
        } finally {
          refreshingRef.current = false;
        }
      },
      30 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [user]);

  return createElement(
    AuthContext.Provider,
    {
      value: {
        user,
        isLoading,
        login,
        signup,
        logout,
        loginAsGuest,
        updateProfile,
        checkUsername,
        factoryReset,
      },
    },
    children,
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const auth = JSON.parse(raw) as PersistentAuth;
      return auth.accessToken ?? null;
    }
    const old = localStorage.getItem("subpremium_session");
    if (old) return (JSON.parse(old) as { token: string }).token ?? null;
    return null;
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const auth = JSON.parse(raw) as PersistentAuth;
      return auth.refreshToken ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
