import { Toaster } from "@/components/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { Header } from "./components/Header";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { AuthProvider } from "./hooks/useAuth";
import { useAuth } from "./hooks/useAuth";
import {
  type AppNotification,
  useNotifications,
} from "./hooks/useNotifications";
import {
  SettingsProvider,
  applySettings,
  useSettings,
} from "./hooks/useSettings";
import { UploadManagerProvider } from "./hooks/useUploadManager";
import type { Video, ViewName } from "./types/video";
import { getVideos } from "./utils/videoStorage";
import { DisplayView } from "./views/DisplayView";
import { HistoryView } from "./views/HistoryView";
import { HomeView } from "./views/HomeView";
import { LanguageView } from "./views/LanguageView";
import { LoginView } from "./views/LoginView";
import { MenuView } from "./views/MenuView";
import { PreferencesView } from "./views/PreferencesView";
import { PrivacyView } from "./views/PrivacyView";
import { SignupView } from "./views/SignupView";
import { UploadView } from "./views/UploadView";
import { VideoDetailView } from "./views/VideoDetailView";

const SETTINGS_VIEWS: ViewName[] = [
  "privacy",
  "preferences",
  "language",
  "display",
];

// Animated in-app notification popup
function NotificationPopup({
  notif,
  onTap,
  onDismiss,
}: {
  notif: AppNotification;
  onTap: () => void;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Slide in
    const t = setTimeout(() => setVisible(true), 10);
    // Auto hide after 4s
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 350);
    }, 4000);
    return () => {
      clearTimeout(t);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  return (
    <div
      style={{
        transform: visible
          ? "translateY(0) translateX(-50%)"
          : "translateY(-110%) translateX(-50%)",
        opacity: visible ? 1 : 0,
        transition:
          "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease",
        left: "50%",
      }}
      className="fixed top-4 z-[9999] w-[calc(100%-2rem)] max-w-sm"
    >
      <button
        type="button"
        onClick={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          setVisible(false);
          setTimeout(onTap, 200);
        }}
        className="w-full flex items-start gap-3 bg-secondary border border-border rounded-2xl px-4 py-3 shadow-lg text-left hover:bg-secondary/80 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-base">
            {notif.type === "upload"
              ? "✅"
              : notif.type === "like"
                ? "👍"
                : "💬"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {notif.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {notif.message}
          </p>
        </div>
      </button>
    </div>
  );
}

function AppInner() {
  const [currentView, setCurrentView] = useState<ViewName>("home");
  const [prevView, setPrevView] = useState<ViewName>("home");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videos, setVideos] = useState<Video[]>(() => getVideos());
  const [searchQuery, setSearchQuery] = useState("");
  const { settings } = useSettings();
  const { user } = useAuth();
  const { notifications, markAllRead, unreadCount } = useNotifications(
    user?.userId ?? "",
  );
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  // In-app notification popup queue
  const [popupNotif, setPopupNotif] = useState<AppNotification | null>(null);
  const lastNotifIdRef = useRef<string | null>(null);

  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  // Listen for new notifications to show popup
  useEffect(() => {
    const handler = () => {
      // Get latest notification
      const latest = notifications[0];
      if (latest && latest.id !== lastNotifIdRef.current) {
        lastNotifIdRef.current = latest.id;
        setPopupNotif(latest);
      }
    };
    window.addEventListener("notif-added", handler);
    return () => window.removeEventListener("notif-added", handler);
  }, [notifications]);

  const handleVideoClick = useCallback((video: Video) => {
    setSelectedVideo(video);
    setCurrentView("video");
    window.scrollTo(0, 0);
  }, []);

  const handleBack = useCallback(() => {
    setCurrentView("home");
    setSelectedVideo(null);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { videoId } = (e as CustomEvent).detail as { videoId: string };
      const v = videos.find((x) => x.id === videoId);
      if (v) handleVideoClick(v);
    };
    window.addEventListener("open-video", handler);
    return () => window.removeEventListener("open-video", handler);
  }, [videos, handleVideoClick]);

  const handleNavChange = useCallback(
    (view: ViewName) => {
      if (view === currentView && view !== "video") return;
      if (view !== "video") setSelectedVideo(null);
      if (view === "login" || view === "signup") {
        setPrevView(currentView as ViewName);
      }
      setCurrentView(view);
      window.scrollTo(0, 0);
    },
    [currentView],
  );

  const handleVideoUpdate = useCallback((updated: Video) => {
    setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    setSelectedVideo((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

  const handleVideoAdded = useCallback((video: Video) => {
    setVideos((prev) => [video, ...prev]);
  }, []);

  const handleVideoRemoved = useCallback((id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const handleLoginSuccess = useCallback(() => {
    const dest =
      prevView === "login" || prevView === "signup" ? "home" : prevView;
    setCurrentView(dest);
    window.scrollTo(0, 0);
  }, [prevView]);

  const goToLogin = useCallback(
    () => handleNavChange("login"),
    [handleNavChange],
  );

  const isAuthView = currentView === "login" || currentView === "signup";
  const isSettingsView = SETTINGS_VIEWS.includes(currentView);
  const showHeader =
    currentView !== "video" &&
    currentView !== "upload" &&
    !isAuthView &&
    !isSettingsView;
  const showBottomNav = !isAuthView && !isSettingsView;

  return (
    <UploadManagerProvider
      onVideoAdded={handleVideoAdded}
      onVideoUpdate={handleVideoUpdate}
      onVideoRemoved={handleVideoRemoved}
    >
      <div className="min-h-screen bg-background text-foreground">
        {showHeader && (
          <Header
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onProfileClick={() => handleNavChange("menu")}
            onLoginClick={goToLogin}
            onBellClick={() => setNotifPanelOpen(true)}
            unreadCount={unreadCount}
          />
        )}

        {currentView === "upload" && (
          <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
            <div className="flex items-center gap-3 px-3 py-3 max-w-md mx-auto">
              <button
                type="button"
                data-ocid="upload.back.button"
                onClick={() => handleNavChange("home")}
                aria-label="Go back"
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    d="M19 12H5M12 5l-7 7 7 7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <h1 className="text-base font-bold">Upload Video</h1>
            </div>
          </header>
        )}

        <main
          className="max-w-md mx-auto"
          style={{
            paddingTop:
              currentView === "video" || isAuthView || isSettingsView
                ? "0px"
                : "104px",
            paddingBottom: "0px",
            minHeight: "100vh",
          }}
        >
          {currentView === "home" && (
            <HomeView
              videos={videos}
              searchQuery={searchQuery}
              onVideoClick={handleVideoClick}
              onUploadClick={() => handleNavChange("upload")}
            />
          )}

          {currentView === "video" && selectedVideo && (
            <VideoDetailView
              video={selectedVideo}
              onBack={handleBack}
              onVideoUpdate={handleVideoUpdate}
              onLoginClick={goToLogin}
              allVideos={videos}
              onVideoSelect={handleVideoClick}
            />
          )}

          {currentView === "upload" && (
            <UploadView
              onDone={() => handleNavChange("home")}
              onLoginClick={goToLogin}
            />
          )}

          {currentView === "history" && (
            <HistoryView videos={videos} onVideoClick={handleVideoClick} />
          )}

          {currentView === "menu" && (
            <MenuView
              onLoginClick={goToLogin}
              onSettingsClick={(page) => handleNavChange(page)}
            />
          )}

          {currentView === "login" && (
            <LoginView
              onSuccess={handleLoginSuccess}
              onSignupClick={() => handleNavChange("signup")}
              onBack={() =>
                setCurrentView(prevView === "login" ? "home" : prevView)
              }
            />
          )}

          {currentView === "signup" && (
            <SignupView
              onSuccess={handleLoginSuccess}
              onLoginClick={() => handleNavChange("login")}
              onBack={() =>
                setCurrentView(prevView === "signup" ? "home" : prevView)
              }
            />
          )}

          {currentView === "privacy" && (
            <PrivacyView onBack={() => handleNavChange("menu")} />
          )}

          {currentView === "preferences" && (
            <PreferencesView onBack={() => handleNavChange("menu")} />
          )}

          {currentView === "language" && (
            <LanguageView onBack={() => handleNavChange("menu")} />
          )}

          {currentView === "display" && (
            <DisplayView onBack={() => handleNavChange("menu")} />
          )}
        </main>

        {showBottomNav && (
          <BottomNav current={currentView} onChange={handleNavChange} />
        )}

        <NotificationsPanel
          open={notifPanelOpen}
          onClose={() => setNotifPanelOpen(false)}
          notifications={notifications}
          onNotificationClick={(videoId) => {
            const v = videos.find((x) => x.id === videoId);
            if (v) {
              handleVideoClick(v);
              setNotifPanelOpen(false);
            }
          }}
          onOpen={markAllRead}
        />

        {/* Animated notification popup */}
        {popupNotif && (
          <NotificationPopup
            key={popupNotif.id}
            notif={popupNotif}
            onDismiss={() => setPopupNotif(null)}
            onTap={() => {
              setPopupNotif(null);
              const v = videos.find((x) => x.id === popupNotif.videoId);
              if (v) handleVideoClick(v);
            }}
          />
        )}

        <Toaster richColors position="top-center" />
      </div>
    </UploadManagerProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppInner />
      </SettingsProvider>
    </AuthProvider>
  );
}
