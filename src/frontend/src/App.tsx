import { Toaster } from "@/components/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { VideoRecord } from "./backend";
import { BottomNav } from "./components/BottomNav";
import { Header } from "./components/Header";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { UploadTray } from "./components/UploadTray";
import { useActor } from "./hooks/useActor";
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
import { clearDemoCache } from "./utils/clearDemoCache";
import { getVideos } from "./utils/videoStorage";
import { CreatorDashboardView } from "./views/CreatorDashboardView";
import { CreatorProfileView } from "./views/CreatorProfileView";
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
import { WatchLaterView } from "./views/WatchLaterView";

const SETTINGS_VIEWS: ViewName[] = [
  "privacy",
  "preferences",
  "language",
  "display",
];

// Views that are auth-related — never use these as a "return to" destination
const AUTH_VIEWS: ViewName[] = ["login", "signup"];

function videoRecordToVideo(r: VideoRecord): Video {
  return {
    id: r.videoId,
    title: r.title,
    description: r.description,
    creatorName: r.creatorName,
    creatorId: r.creatorId,
    blobHash: r.blobHash,
    thumbnailDataUrl: r.thumbnailUrl || undefined,
    durationSeconds: Number(r.durationSeconds),
    fileSizeBytes: Number(r.fileSizeBytes),
    views: Number(r.views),
    likes: Number(r.likes),
    dislikes: Number(r.dislikes),
    createdAt: Number(r.createdAt),
    status: r.status as "uploading" | "processing" | "ready",
    comments: r.comments.map((c) => ({
      id: c.commentId,
      text: c.text,
      authorName: c.authorName,
      authorId: c.authorId,
      createdAt: Number(c.createdAt),
    })),
    likedBy: r.likedBy,
    dislikedBy: r.dislikedBy,
    sources: r.videoUrl ? [{ quality: "Auto", url: r.videoUrl }] : undefined,
  };
}

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
              ? "\u2705"
              : notif.type === "like"
                ? "\uD83D\uDC4D"
                : "\uD83D\uDCAC"}
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
  // Clear demo/seed cache on first mount
  useEffect(() => {
    clearDemoCache();
  }, []);

  const [currentView, setCurrentView] = useState<ViewName>(() => {
    try {
      const saved = localStorage.getItem(
        "subpremium_lastview",
      ) as ViewName | null;
      if (saved && !AUTH_VIEWS.includes(saved)) return saved;
    } catch {}
    return "home";
  });
  // prevView: the last non-auth view the user was on, used for post-login return
  const [prevView, setPrevView] = useState<ViewName>("home");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  // Initialize only with in-progress uploads from localStorage (not stale ready videos)
  const [videos, setVideos] = useState<Video[]>(() =>
    getVideos().filter((v) => v.status !== "ready"),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [profileCreatorId, setProfileCreatorId] = useState("");
  const [profileCreatorName, setProfileCreatorName] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { settings } = useSettings();
  const { user, factoryReset } = useAuth();
  const { actor, isFetching } = useActor();
  const { notifications, markAllRead, unreadCount } = useNotifications(
    user?.userId ?? "",
  );
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  // In-app notification popup queue
  const [popupNotif, setPopupNotif] = useState<AppNotification | null>(null);
  const lastNotifIdRef = useRef<string | null>(null);
  // Track last userId to detect login/logout and re-fetch videos
  const lastUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  // Persist current view to localStorage (skip auth views)
  useEffect(() => {
    if (!AUTH_VIEWS.includes(currentView)) {
      localStorage.setItem("subpremium_lastview", currentView);
    }
  }, [currentView]);

  // Online/offline state
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Fetch videos from backend as soon as actor is ready — never wait on auth
  useEffect(() => {
    if (isFetching || !actor) return;

    // Re-fetch when user changes (login/logout) or actor first becomes available
    const currentUserId = user?.userId ?? null;
    if (lastUserIdRef.current === currentUserId) return;
    lastUserIdRef.current = currentUserId;

    (async () => {
      try {
        const backendVideos = await actor.getAllVideos();
        const mapped = backendVideos.map(videoRecordToVideo);
        // Keep in-progress uploads from localStorage, replace ready videos with backend data
        const uploadingFromLS = getVideos().filter((v) => v.status !== "ready");
        const backendIds = new Set(mapped.map((v) => v.id));
        // Remove in-progress uploads that the backend already reports as ready (orphan guard)
        const dedupedUploading = uploadingFromLS.filter(
          (v) => !backendIds.has(v.id),
        );
        setVideos([...dedupedUploading, ...mapped]);
      } catch (e) {
        console.error("[home] failed to fetch backend videos:", e);
        // Fallback: keep localStorage videos as-is
      }
    })();
  }, [actor, isFetching, user?.userId]);

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

  const handleFactoryReset = useCallback(async () => {
    await factoryReset();
    setCurrentView("login");
    setSelectedVideo(null);
    setVideos([]);
    window.scrollTo(0, 0);
  }, [factoryReset]);

  const handleBack = useCallback(() => {
    setCurrentView("home");
    setSelectedVideo(null);
  }, []);

  const handleCreatorClick = useCallback(
    (creatorId: string, creatorName: string) => {
      setProfileCreatorId(creatorId);
      setProfileCreatorName(creatorName);
      setCurrentView("profile");
      window.scrollTo(0, 0);
    },
    [],
  );

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
      // When navigating to login/signup, remember where we came from (non-auth views only)
      if (AUTH_VIEWS.includes(view) && !AUTH_VIEWS.includes(currentView)) {
        setPrevView(currentView);
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
    setVideos((prev) => {
      if (prev.some((v) => v.id === video.id)) return prev; // duplicate guard
      return [video, ...prev];
    });
  }, []);

  const handleVideoRemoved = useCallback((id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const handleVideoDeleted = useCallback(
    async (videoId: string) => {
      // Optimistic remove
      setVideos((prev) => prev.filter((v) => v.id !== videoId));

      // Clear localStorage caches
      try {
        const keysToCheck = ["subpremium_videos", "videos"];
        for (const key of keysToCheck) {
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const arr = JSON.parse(raw);
              if (Array.isArray(arr)) {
                const filtered = arr.filter(
                  (v: { id?: string; videoId?: string }) =>
                    v.id !== videoId && v.videoId !== videoId,
                );
                localStorage.setItem(key, JSON.stringify(filtered));
              }
            } catch {}
          }
        }
      } catch {}

      // Backend delete
      if (actor) {
        try {
          await actor.deleteVideo(videoId);
        } catch (e) {
          console.error("[delete] backend delete failed:", e);
          // Refetch from backend to restore correct state
          try {
            const backendVideos = await actor.getAllVideos();
            const mapped = backendVideos.map(videoRecordToVideo);
            const uploadingFromLS = getVideos().filter(
              (v) => v.status !== "ready",
            );
            setVideos([...uploadingFromLS, ...mapped]);
          } catch {}
          toast.error("Failed to delete video. Please try again.");
        }
      }
    },
    [actor],
  );

  const handleVideoEditSave = useCallback(
    async (
      video: Video,
      title: string,
      description: string,
      thumbnailUrl: string,
    ) => {
      const updated: Video = {
        ...video,
        title: title.trim(),
        description: description.trim(),
        thumbnailDataUrl: thumbnailUrl || video.thumbnailDataUrl,
      };
      setVideos((prev) => prev.map((v) => (v.id === video.id ? updated : v)));
      setSelectedVideo((prev) => (prev?.id === video.id ? updated : prev));
      if (actor) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ok = await (actor as any).updateVideoMeta(
            video.id,
            title.trim(),
            description.trim(),
            thumbnailUrl,
            user?.userId ?? "",
          );
          if (!ok) {
            setVideos((prev) =>
              prev.map((v) => (v.id === video.id ? video : v)),
            );
            setSelectedVideo((prev) => (prev?.id === video.id ? video : prev));
            toast.error("Failed to save changes.");
          } else {
            toast.success("Video updated");
          }
        } catch {
          setVideos((prev) => prev.map((v) => (v.id === video.id ? video : v)));
          toast.error("Failed to save changes.");
        }
      } else {
        toast.success("Video updated");
      }
    },
    [actor, user],
  );
  const handleLoginSuccess = useCallback(() => {
    // Always return to a safe non-auth view
    const dest = AUTH_VIEWS.includes(prevView) ? "home" : prevView;
    setCurrentView(dest);
    window.scrollTo(0, 0);
  }, [prevView]);

  const goToLogin = useCallback(
    () => handleNavChange("login"),
    [handleNavChange],
  );

  const isAuthView = AUTH_VIEWS.includes(currentView);
  const isSettingsView = SETTINGS_VIEWS.includes(currentView);
  const isCreatorDashboard = currentView === "creatorDashboard";
  const showHeader =
    currentView !== "video" &&
    currentView !== "upload" &&
    currentView !== "profile" &&
    !isAuthView &&
    !isSettingsView &&
    !isCreatorDashboard;
  const showBottomNav =
    !isAuthView &&
    !isSettingsView &&
    currentView !== "profile" &&
    !isCreatorDashboard;

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
            onSavedClick={() => handleNavChange("watchlater")}
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
              currentView === "video" ||
              currentView === "profile" ||
              isAuthView ||
              isSettingsView ||
              isCreatorDashboard
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
              onCreatorClick={handleCreatorClick}
              onVideoDeleted={handleVideoDeleted}
              onVideoEdit={handleVideoEditSave}
            />
          )}

          {currentView === "video" && selectedVideo && (
            <VideoDetailView
              key={selectedVideo.id}
              video={selectedVideo}
              onBack={handleBack}
              onVideoUpdate={handleVideoUpdate}
              onLoginClick={goToLogin}
              allVideos={videos}
              onVideoSelect={handleVideoClick}
              onCreatorClick={handleCreatorClick}
            />
          )}

          {currentView === "profile" && (
            <CreatorProfileView
              creatorId={profileCreatorId}
              creatorName={profileCreatorName}
              onBack={() => setCurrentView("home")}
              onVideoClick={handleVideoClick}
              currentUserId={user?.userId}
              onVideoDeleted={handleVideoDeleted}
              onVideoEdit={handleVideoEditSave}
            />
          )}

          {currentView === "upload" && (
            <UploadView
              onDone={() => handleNavChange("home")}
              onLoginClick={goToLogin}
            />
          )}

          {currentView === "history" && (
            <HistoryView
              videos={videos}
              onVideoClick={handleVideoClick}
              onCreatorDashboard={() => handleNavChange("creatorDashboard")}
            />
          )}

          {currentView === "watchlater" && (
            <WatchLaterView videos={videos} onVideoClick={handleVideoClick} />
          )}

          {currentView === "menu" && (
            <MenuView
              onLoginClick={goToLogin}
              onSettingsClick={(page) => handleNavChange(page)}
              onCreatorDashboard={() => handleNavChange("creatorDashboard")}
              onFactoryReset={handleFactoryReset}
            />
          )}

          {currentView === "creatorDashboard" && (
            <CreatorDashboardView
              userId={user?.userId ?? ""}
              username={user?.username ?? user?.displayName ?? ""}
              allVideos={videos}
              onBack={() => handleNavChange("menu")}
              onVideoClick={handleVideoClick}
              onVideoDeleted={handleVideoDeleted}
              onVideoEdit={handleVideoEditSave}
            />
          )}

          {currentView === "login" && (
            <LoginView
              onSuccess={handleLoginSuccess}
              onSignupClick={() => handleNavChange("signup")}
              onBack={() => {
                // Back from login always goes to a safe non-auth view
                const dest = AUTH_VIEWS.includes(prevView) ? "home" : prevView;
                setCurrentView(dest);
              }}
            />
          )}

          {currentView === "signup" && (
            <SignupView
              onSuccess={handleLoginSuccess}
              onLoginClick={() => handleNavChange("login")}
              onBack={() => {
                const dest = AUTH_VIEWS.includes(prevView) ? "home" : prevView;
                setCurrentView(dest);
              }}
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

        {/* Offline banner \u2014 thin strip at top, non-blocking */}
        {isOffline && (
          <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none">
            <div className="bg-yellow-500/90 text-black text-xs font-medium text-center py-1">
              You&apos;re offline
            </div>
          </div>
        )}

        <UploadTray />

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
