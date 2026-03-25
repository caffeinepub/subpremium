import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import type { VideoRecord } from "../backend";
import { useActor } from "../hooks/useActor";
import type { Video } from "../types/video";
import { formatViewsShort } from "../utils/format";

interface CreatorProfileViewProps {
  creatorId: string;
  creatorName: string;
  onBack: () => void;
  onVideoClick: (video: Video) => void;
}

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

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getUsername(name: string): string {
  return `@${name.toLowerCase().replace(/\s+/g, "")}`;
}

export function CreatorProfileView({
  creatorId,
  creatorName,
  onBack,
  onVideoClick,
}: CreatorProfileViewProps) {
  const { actor, isFetching } = useActor();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isFetching || !actor) return;
    setLoading(true);
    setError(false);
    actor
      .getVideosByCreator(creatorId)
      .then((records) => {
        const mapped = records
          .map(videoRecordToVideo)
          .filter((v) => v.status === "ready");
        setVideos(mapped);
      })
      .catch((e) => {
        console.error("[profile] failed to fetch creator videos:", e);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [actor, isFetching, creatorId]);

  const initials = getInitials(creatorName);
  const username = getUsername(creatorName);

  return (
    <div className="animate-fade-in min-h-screen bg-background">
      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-3 py-3 max-w-md mx-auto">
          <button
            type="button"
            data-ocid="profile.back.button"
            onClick={onBack}
            aria-label="Go back"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <h1 className="text-base font-bold">Profile</h1>
        </div>
      </header>

      <div className="max-w-md mx-auto" style={{ paddingTop: "56px" }}>
        {/* Profile section */}
        <div
          data-ocid="profile.section"
          className="flex flex-col items-center gap-3 px-4 pt-8 pb-6"
        >
          {/* Avatar */}
          <div
            data-ocid="profile.card"
            className="w-[72px] h-[72px] rounded-full bg-primary/20 flex items-center justify-center shrink-0"
            aria-label={`${creatorName} avatar`}
          >
            <span className="text-2xl font-bold text-primary">{initials}</span>
          </div>

          {/* Name + username */}
          <div className="text-center">
            <p className="text-lg font-bold text-foreground leading-tight">
              {creatorName}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">{username}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border mx-4" />

        {/* Videos section */}
        <div className="px-4 pt-4 pb-24">
          <h2 className="text-sm font-semibold text-foreground mb-3">Videos</h2>

          {loading ? (
            <div
              data-ocid="profile.loading_state"
              className="grid grid-cols-2 gap-2"
            >
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="w-full aspect-video rounded-lg" />
                  <Skeleton className="w-3/4 h-3 rounded" />
                  <Skeleton className="w-1/2 h-3 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div
              data-ocid="profile.error_state"
              className="flex flex-col items-center py-12 gap-2 text-center"
            >
              <p className="text-sm text-muted-foreground">
                Failed to load videos
              </p>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  setLoading(true);
                  setError(false);
                  if (actor) {
                    actor
                      .getVideosByCreator(creatorId)
                      .then((records) => {
                        setVideos(
                          records
                            .map(videoRecordToVideo)
                            .filter((v) => v.status === "ready"),
                        );
                      })
                      .catch(() => setError(true))
                      .finally(() => setLoading(false));
                  }
                }}
              >
                Retry
              </button>
            </div>
          ) : videos.length === 0 ? (
            <div
              data-ocid="profile.empty_state"
              className="flex flex-col items-center py-16 gap-2 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-1">
                <svg
                  viewBox="0 0 48 48"
                  className="w-7 h-7 text-muted-foreground opacity-50"
                  aria-hidden="true"
                >
                  <polygon points="16,12 36,24 16,36" fill="currentColor" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-foreground">
                No videos yet
              </p>
              <p className="text-xs text-muted-foreground">
                {creatorName} hasn't uploaded any videos
              </p>
            </div>
          ) : (
            <div data-ocid="profile.list" className="grid grid-cols-2 gap-3">
              {videos.map((video, i) => (
                <button
                  key={video.id}
                  type="button"
                  data-ocid={`profile.item.${i + 1}`}
                  onClick={() => onVideoClick(video)}
                  className="text-left group"
                >
                  {/* Thumbnail */}
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-secondary">
                    {video.thumbnailDataUrl ? (
                      <img
                        src={video.thumbnailDataUrl}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg
                          viewBox="0 0 48 48"
                          className="w-8 h-8 text-muted-foreground opacity-30"
                          aria-hidden="true"
                        >
                          <polygon
                            points="16,12 36,24 16,36"
                            fill="currentColor"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="mt-1.5">
                    <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                      {video.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatViewsShort(video.views)} views
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
