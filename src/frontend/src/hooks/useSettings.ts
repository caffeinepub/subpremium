import {
  type ReactNode,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
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
  appLanguage: string;
  subtitleDefaultLanguage: string;
  darkMode: boolean;
  fontSize: "small" | "medium" | "large";
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

function loadSettings(userId?: string | null): UserSettings {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: UserSettings, userId?: string | null) {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(settings));
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(() =>
    loadSettings(user?.userId),
  );

  useEffect(() => {
    const loaded = loadSettings(user?.userId);
    setSettings(loaded);
    applySettings(loaded);
  }, [user?.userId]);

  const updateSetting = useCallback(
    <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        saveSettings(next, user?.userId);
        if (key === "darkMode") applyDarkMode(value as boolean);
        if (key === "fontSize")
          applyFontSize(value as UserSettings["fontSize"]);
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
