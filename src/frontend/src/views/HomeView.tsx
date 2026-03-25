import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useMemo } from "react";
import { CategoryTabs } from "../components/CategoryTabs";
import { VideoCard } from "../components/VideoCard";
import type { Video } from "../types/video";

interface HomeViewProps {
  videos: Video[];
  searchQuery: string;
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
  onVideoClick: (video: Video) => void;
  onUploadClick: () => void;
}

export function HomeView({
  videos,
  searchQuery,
  activeCategory,
  onCategoryChange,
  onVideoClick,
  onUploadClick,
}: HomeViewProps) {
  const readyVideos = useMemo(
    () => videos.filter((v) => v.status === "ready"),
    [videos],
  );

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return readyVideos;
    const q = searchQuery.toLowerCase();
    return readyVideos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.creatorName.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q),
    );
  }, [readyVideos, searchQuery]);

  return (
    <div className="animate-fade-in">
      <CategoryTabs active={activeCategory} onChange={onCategoryChange} />

      <div className="px-3 pt-3 pb-4">
        {filtered.length === 0 ? (
          <div
            data-ocid="feed.empty_state"
            className="flex flex-col items-center justify-center py-20 gap-4 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center">
              <Upload className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">
                {searchQuery ? "No videos found" : "No videos yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery
                  ? "Try a different search term"
                  : "Upload the first video to get started"}
              </p>
            </div>
            {!searchQuery && (
              <Button
                data-ocid="feed.upload.button"
                onClick={onUploadClick}
                className="bg-primary text-white hover:bg-brand-dim"
              >
                Upload Video
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {filtered.map((video, i) => (
              <VideoCard
                key={video.id}
                video={video}
                onClick={onVideoClick}
                index={i + 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
