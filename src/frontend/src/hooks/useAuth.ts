import {
  type ReactNode,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface AuthUser {
  userId: string;
  email: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
}

interface StoredUser {
  userId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  username?: string;
  avatarUrl?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  signup: (
    displayName: string,
    email: string,
    password: string,
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

const USERS_KEY = "subpremium_users";
const SESSION_KEY = "subpremium_session";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

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
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (session) {
      setUser(session.user);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const normalizedEmail = email.trim().toLowerCase();
      const users = getUsers();
      const found = users.find((u) => u.email === normalizedEmail);
      if (!found) {
        return "Invalid email or password";
      }
      const hash = await hashPassword(password);
      if (found.passwordHash !== hash) {
        return "Invalid email or password";
      }
      const authUser: AuthUser = {
        userId: found.userId,
        email: found.email,
        displayName: found.displayName,
        username: found.username,
        avatarUrl: found.avatarUrl,
      };
      const token = generateToken();
      saveSession({ token, user: authUser });
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
    ): Promise<string | null> => {
      const normalizedEmail = email.trim().toLowerCase();
      const users = getUsers();
      if (users.find((u) => u.email === normalizedEmail)) {
        return "An account with this email already exists";
      }
      const hash = await hashPassword(password);
      const newUser: StoredUser = {
        userId: generateId(),
        email: normalizedEmail,
        displayName: displayName.trim(),
        passwordHash: hash,
      };
      saveUsers([...users, newUser]);
      const authUser: AuthUser = {
        userId: newUser.userId,
        email: newUser.email,
        displayName: newUser.displayName,
      };
      const token = generateToken();
      saveSession({ token, user: authUser });
      setUser(authUser);
      return null;
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const checkUsername = useCallback(
    (username: string, skipUserId?: string): boolean => {
      const normalized = username.trim().toLowerCase();
      if (!normalized) return false;
      const users = getUsers();
      return !users.some(
        (u) =>
          u.username?.toLowerCase() === normalized && u.userId !== skipUserId,
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
      const users = getUsers();
      const updatedUsers = users.map((u) => {
        if (u.userId !== user.userId) return u;
        return {
          ...u,
          displayName: trimmedName,
          username: trimmedUsername || undefined,
          avatarUrl: avatarUrl !== undefined ? avatarUrl : u.avatarUrl,
        };
      });
      saveUsers(updatedUsers);
      const updatedUser: AuthUser = {
        ...user,
        displayName: trimmedName,
        username: trimmedUsername || undefined,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : user.avatarUrl,
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
