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
import { useAuth } from "./useAuth";

export interface UserSettings {
  accountPublic: boolean;
  allowComments: boolean;
  allowDownloads: boolean;
  autoplayVideos: boolean;
  videoQuality: "auto" | "720p" | "1080p";
  videoQualityWifi: "auto" | "higher" | "datasaver";
  videoQualityMobile: "auto" | "higher" | "datasaver";
  subtitlesLanguage: string;
  subtitleDefaultLanguage: string;
  appLanguage: string;
  darkMode: boolean;
  fontSize: "small" | "medium" | "large";
  preferredLanguages: string[];
}

const DEFAULT_SETTINGS: UserSettings = {
  accountPublic: true,
  allowComments: true,
  allowDownloads: true,
  autoplayVideos: true,
  videoQuality: "auto",
  videoQualityWifi: "auto",
  videoQualityMobile: "auto",
  subtitlesLanguage: "none",
  appLanguage: "English",
  subtitleDefaultLanguage: "none",
  darkMode: true,
  fontSize: "medium",
  preferredLanguages: [],
};

interface SettingsContextValue {
  settings: UserSettings;
  updateSetting: <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function getStorageKey(userId?: string | null) {
  return userId ? `subpremium_settings_${userId}` : "subpremium_settings_guest";
}

function loadSettingsFromCache(userId?: string | null): UserSettings {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettingsToCache(settings: UserSettings, userId?: string | null) {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(settings));
}

const SESSION_KEY = "subpremium_session";
function getToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as { token: string };
    return session?.token ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget: push settings to backend */
async function pushSettingsToBackend(
  settings: UserSettings,
  token: string,
): Promise<void> {
  try {
    const actor = await getBackendActor();
    await (actor as any).saveUserSettings(token, {
      accountPublic: settings.accountPublic,
      allowComments: settings.allowComments,
      allowDownloads: settings.allowDownloads,
      autoplayVideos: settings.autoplayVideos,
      videoQuality: settings.videoQuality,
      videoQualityWifi: settings.videoQualityWifi,
      videoQualityMobile: settings.videoQualityMobile,
      subtitlesLanguage: settings.subtitlesLanguage,
      subtitleDefaultLanguage: settings.subtitleDefaultLanguage,
      appLanguage: settings.appLanguage,
      darkMode: settings.darkMode,
      fontSize: settings.fontSize,
      preferredLanguages: settings.preferredLanguages,
    });
  } catch {
    // Silent — offline or backend unavailable
  }
}

/** Fetch settings from backend, returns null if unavailable */
async function fetchSettingsFromBackend(
  userId: string,
): Promise<UserSettings | null> {
  try {
    const actor = await getBackendActor();
    const result = await Promise.race([
      (actor as any).getUserSettings(userId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (!result || !Array.isArray(result) || result.length === 0) return null;
    const raw = result[0];
    return {
      ...DEFAULT_SETTINGS,
      accountPublic: raw.accountPublic ?? DEFAULT_SETTINGS.accountPublic,
      allowComments: raw.allowComments ?? DEFAULT_SETTINGS.allowComments,
      allowDownloads: raw.allowDownloads ?? DEFAULT_SETTINGS.allowDownloads,
      autoplayVideos: raw.autoplayVideos ?? DEFAULT_SETTINGS.autoplayVideos,
      videoQuality: raw.videoQuality ?? DEFAULT_SETTINGS.videoQuality,
      videoQualityWifi:
        raw.videoQualityWifi ?? DEFAULT_SETTINGS.videoQualityWifi,
      videoQualityMobile:
        raw.videoQualityMobile ?? DEFAULT_SETTINGS.videoQualityMobile,
      subtitlesLanguage:
        raw.subtitlesLanguage ?? DEFAULT_SETTINGS.subtitlesLanguage,
      subtitleDefaultLanguage:
        raw.subtitleDefaultLanguage ?? DEFAULT_SETTINGS.subtitleDefaultLanguage,
      appLanguage: raw.appLanguage ?? DEFAULT_SETTINGS.appLanguage,
      darkMode: raw.darkMode ?? DEFAULT_SETTINGS.darkMode,
      fontSize:
        (raw.fontSize as UserSettings["fontSize"]) ?? DEFAULT_SETTINGS.fontSize,
      preferredLanguages: Array.isArray(raw.preferredLanguages)
        ? raw.preferredLanguages
        : DEFAULT_SETTINGS.preferredLanguages,
    };
  } catch {
    return null;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(() =>
    loadSettingsFromCache(null),
  );
  const pendingSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On userId change (login/logout): load cached settings immediately, then
  // fetch from backend and apply/save if found.
  useEffect(() => {
    const cached = loadSettingsFromCache(user?.userId);
    setSettings(cached);
    applySettings(cached);

    if (!user?.userId) return;

    // Background fetch from backend
    fetchSettingsFromBackend(user.userId).then((backendSettings) => {
      if (!backendSettings) return;
      // Backend wins — apply and cache
      setSettings(backendSettings);
      applySettings(backendSettings);
      saveSettingsToCache(backendSettings, user.userId);
    });
  }, [user?.userId]);

  const updateSetting = useCallback(
    <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        saveSettingsToCache(next, user?.userId);
        if (key === "darkMode") applyDarkMode(value as boolean);
        if (key === "fontSize")
          applyFontSize(value as UserSettings["fontSize"]);

        // Debounced backend sync
        if (pendingSyncRef.current) clearTimeout(pendingSyncRef.current);
        pendingSyncRef.current = setTimeout(() => {
          const token = getToken();
          if (token) pushSettingsToBackend(next, token);
        }, 500);

        return next;
      });
    },
    [user?.userId],
  );

  return createElement(
    SettingsContext.Provider,
    { value: { settings, updateSetting } },
    children,
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export function applyDarkMode(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  } else {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  }
}

export function applyFontSize(size: UserSettings["fontSize"]) {
  document.documentElement.removeAttribute("data-font-size");
  document.documentElement.setAttribute("data-font-size", size);
}

export function applySettings(s: UserSettings) {
  applyDarkMode(s.darkMode);
  applyFontSize(s.fontSize);
}
