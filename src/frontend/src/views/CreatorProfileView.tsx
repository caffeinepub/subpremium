import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import type { VideoRecord } from "../backend";
import { DeleteVideoButton } from "../components/DeleteVideoButton";
import { useActor } from "../hooks/useActor";
import type { Video } from "../types/video";
import { formatViewsShort } from "../utils/format";
import { isSubscribed, subscribe, unsubscribe } from "../utils/subscriptions";

interface CreatorProfileViewProps {
  creatorId: string;
  creatorName: string;
  onBack: () => void;
  onVideoClick: (video: Video) => void;
  currentUserId?: string;
  onVideoDeleted?: (videoId: string) => void;
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

type TabType = "videos" | "playlists" | "community";

export function CreatorProfileView({
  creatorId,
  creatorName,
  onBack,
  onVideoClick,
  currentUserId,
  onVideoDeleted,
}: CreatorProfileViewProps) {
  const { actor, isFetching } = useActor();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("videos");
  const [subscribed, setSubscribed] = useState(() =>
    currentUserId ? isSubscribed(currentUserId, creatorId) : false,
  );

  const showSubscribeButton = !!currentUserId && currentUserId !== creatorId;

  const handleSubscribeToggle = () => {
    if (!currentUserId) return;
    const next = !subscribed;
    setSubscribed(next);
    if (next) {
      subscribe(currentUserId, creatorId, creatorName);
    } else {
      unsubscribe(currentUserId, creatorId);
    }
  };

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

  const tabs: { id: TabType; label: string }[] = [
    { id: "videos", label: "Videos" },
    { id: "playlists", label: "Playlists" },
    { id: "community", label: "Community" },
  ];

  return (
    <div className="animate-fade-in min-h-screen bg-background">
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
          className="flex flex-col items-center gap-3 px-4 pt-8 pb-5"
        >
          <div
            data-ocid="profile.card"
            className="w-[72px] h-[72px] rounded-full bg-primary/20 flex items-center justify-center shrink-0"
            aria-label={`${creatorName} avatar`}
          >
            <span className="text-2xl font-bold text-primary">{initials}</span>
          </div>

          <div className="text-center">
            <p className="text-lg font-bold text-foreground leading-tight">
              {creatorName}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">{username}</p>
          </div>

          {showSubscribeButton && (
            <button
              type="button"
              data-ocid="profile.subscribe.button"
              onClick={handleSubscribeToggle}
              className={
                subscribed
                  ? "px-5 py-1.5 text-sm font-medium rounded-full border border-border text-muted-foreground hover:border-muted-foreground transition-colors"
                  : "px-5 py-1.5 text-sm font-medium rounded-full bg-primary text-white hover:opacity-90 transition-opacity"
              }
            >
              {subscribed ? "Subscribed \u2713" : "Subscribe"}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-ocid={`profile.${tab.id}.tab`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-4 pt-4 pb-24">
          {activeTab === "videos" &&
            (loading ? (
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
                    if (!actor) return;
                    setLoading(true);
                    setError(false);
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
                  {creatorName} hasn&apos;t uploaded any videos
                </p>
              </div>
            ) : (
              <div data-ocid="profile.list" className="grid grid-cols-2 gap-3">
                {videos.map((video, i) => (
                  <div key={video.id} className="relative">
                    <button
                      type="button"
                      data-ocid={`profile.item.${i + 1}`}
                      onClick={() => onVideoClick(video)}
                      className="w-full text-left group"
                    >
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
                        <DeleteVideoButton
                          video={video}
                          currentUserId={currentUserId}
                          onDelete={(id) => {
                            setVideos((prev) =>
                              prev.filter((v) => v.id !== id),
                            );
                            onVideoDeleted?.(id);
                          }}
                        />
                      </div>
                      <div className="mt-1.5">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                          {video.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatViewsShort(video.views)} views
                        </p>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            ))}

          {activeTab === "playlists" && (
            <div
              data-ocid="profile.playlists.panel"
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <p className="text-sm text-muted-foreground">
                Playlists coming soon
              </p>
            </div>
          )}

          {activeTab === "community" && (
            <div
              data-ocid="profile.community.panel"
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <p className="text-sm text-muted-foreground">
                Community coming soon
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
