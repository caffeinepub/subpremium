import { Toaster } from "@/components/ui/sonner";
import { useCallback, useEffect, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { Header } from "./components/Header";
import type { Video, ViewName } from "./types/video";
import { getVideos } from "./utils/videoStorage";
import { HistoryView } from "./views/HistoryView";
import { HomeView } from "./views/HomeView";
import { MenuView } from "./views/MenuView";
import { UploadView } from "./views/UploadView";
import { VideoDetailView } from "./views/VideoDetailView";

export default function App() {
  const [currentView, setCurrentView] = useState<ViewName>("home");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videos, setVideos] = useState<Video[]>(() => getVideos());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("For You");

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }, []);

  const handleVideoClick = useCallback((video: Video) => {
    setSelectedVideo(video);
    setCurrentView("video");
    window.scrollTo(0, 0);
  }, []);

  const handleBack = useCallback(() => {
    setCurrentView("home");
    setSelectedVideo(null);
  }, []);

  const handleNavChange = useCallback(
    (view: ViewName) => {
      if (view === currentView && view !== "video") return;
      if (view !== "video") setSelectedVideo(null);
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

  const showHeader = currentView !== "video" && currentView !== "upload";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {showHeader && (
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onProfileClick={() => handleNavChange("menu")}
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
          paddingTop: currentView === "video" ? "0px" : "112px",
          paddingBottom: "0px",
          minHeight: "100vh",
        }}
      >
        {currentView === "home" && (
          <HomeView
            videos={videos}
            searchQuery={searchQuery}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            onVideoClick={handleVideoClick}
            onUploadClick={() => handleNavChange("upload")}
          />
        )}

        {currentView === "video" && selectedVideo && (
          <VideoDetailView
            video={selectedVideo}
            onBack={handleBack}
            onVideoUpdate={handleVideoUpdate}
          />
        )}

        {currentView === "upload" && (
          <UploadView
            onDone={() => handleNavChange("home")}
            onVideoAdded={handleVideoAdded}
          />
        )}

        {currentView === "history" && (
          <HistoryView videos={videos} onVideoClick={handleVideoClick} />
        )}

        {currentView === "menu" && <MenuView />}
      </main>

      <BottomNav current={currentView} onChange={handleNavChange} />

      <Toaster richColors position="top-center" />
    </div>
  );
}
