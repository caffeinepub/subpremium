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
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = "subpremium_session";
const REMEMBER_KEY = "subpremium_remember";
const PROFILE_KEY = "subpremium_profile";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Session shape — no credentials stored
interface Session {
  token: string;
  user: AuthUser;
}

function getSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
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
    if (!cached?.token) {
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
          actor.validateSession(cached.token),
          2000,
        );
        if (result === null) {
          // Timed out — keep cached session, assume valid
          return;
        }

        if (result.__kind__ === "err") {
          // Token explicitly rejected — log out
          clearSession();
          setUser(null);
        }
        // result ok — session confirmed, nothing to change
      } catch {
        // Any error — keep cached session (backend unreachable)
      }
    })();
  }, []);

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
        const { token, userId, displayName } = result.ok;
        const extras = getProfileExtras(userId);
        const authUser: AuthUser = {
          userId,
          email: normalizedEmail,
          displayName,
          ...extras,
        };
        // Store session (token + user, never credentials)
        saveSession({ token, user: authUser });
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

        // Get actor with 5s timeout
        const actor = await withTimeout(getBackendActor(), 5000);
        if (!actor) {
          return "timeout";
        }

        // Register with 5s timeout
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

        // Auto-login with 5s timeout
        const loginResult = await withTimeout(
          actor.loginUser(normalizedEmail, hash),
          5000,
        );
        if (loginResult === null) {
          // Signup succeeded but auto-login timed out — still a success
          return null;
        }
        if (loginResult.__kind__ === "err") {
          // Signup succeeded, login failed — treat as success (user can log in manually)
          return null;
        }

        const { token, userId } = loginResult.ok;
        const authUser: AuthUser = {
          userId,
          email: normalizedEmail,
          displayName: displayName.trim(),
        };
        saveSession({ token, user: authUser });
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
    if (session?.token) {
      getBackendActor()
        .then((actor) => actor.logoutUser(session.token))
        .catch(() => {});
    }
    clearSession();
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
      return null;
    },
    [user, checkUsername],
  );

  // Periodic token validation every 30 minutes
  useEffect(() => {
    const interval = setInterval(
      async () => {
        if (refreshingRef.current) return;
        const session = getSession();
        if (!session?.token || !user) return;

        refreshingRef.current = true;
        try {
          const actor = await getBackendActor();
          const result = await withTimeout(
            actor.validateSession(session.token),
            5000,
          );
          if (result !== null && result.__kind__ === "err") {
            // Token invalid — logout
            clearSession();
            setUser(null);
          }
          // null = timeout = keep session
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
    const raw = localStorage.getItem("subpremium_session");
    if (!raw) return null;
    const session = JSON.parse(raw) as { token: string };
    return session?.token ?? null;
  } catch {
    return null;
  }
}
