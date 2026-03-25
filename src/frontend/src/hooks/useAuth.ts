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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const cached = getSession();
    if (!cached?.token) {
      setIsLoading(false);
      return;
    }

    // Immediately restore user from cache — no flash of logged-out state
    const extras = getProfileExtras(cached.user.userId);
    setUser({ ...cached.user, ...extras });

    // Validate token with backend in background
    getBackendActor()
      .then(async (actor) => {
        try {
          const result = await actor.validateSession(cached.token);
          if (result.__kind__ === "ok") {
            setIsLoading(false);
            return;
          }
          // Token invalid and no credentials stored — clear session
          clearSession();
          setUser(null);
        } catch {
          // Backend unreachable — keep cached session (offline/slow network)
        } finally {
          setIsLoading(false);
        }
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string,
      rememberMe = false,
    ): Promise<string | null> => {
      const normalizedEmail = email.trim().toLowerCase();
      const hash = await hashPassword(password);
      const actor = await getBackendActor();
      const result = await actor.loginUser(normalizedEmail, hash);
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
      const normalizedEmail = email.trim().toLowerCase();
      const hash = await hashPassword(password);
      const actor = await getBackendActor();
      const regResult = await actor.registerUser(
        normalizedEmail,
        hash,
        displayName.trim(),
      );
      if (regResult.__kind__ === "err") {
        return regResult.err;
      }
      // Auto-login after signup
      const loginResult = await actor.loginUser(normalizedEmail, hash);
      if (loginResult.__kind__ === "err") {
        return loginResult.err;
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
          const result = await actor.validateSession(session.token);
          if (result.__kind__ === "err") {
            // Token invalid and no credentials to refresh with — logout
            clearSession();
            setUser(null);
          }
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
