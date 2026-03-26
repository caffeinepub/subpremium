import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileVideo, Pause, Play, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { DeleteVideoButton } from "../components/DeleteVideoButton";
import { VideoCard } from "../components/VideoCard";
import { useAuth } from "../hooks/useAuth";
import { useUploadManager } from "../hooks/useUploadManager";
import type { Video } from "../types/video";
import { getSubscriptions } from "../utils/subscriptions";
import { getWatchedPercent } from "../utils/watchProgress";

interface HomeViewProps {
  videos: Video[];
  searchQuery: string;
  onVideoClick: (video: Video) => void;
  onUploadClick: () => void;
  onCreatorClick?: (creatorId: string, creatorName: string) => void;
  onVideoDeleted?: (videoId: string) => void;
}

export function HomeView({
  videos,
  searchQuery,
  onVideoClick,
  onUploadClick,
  onCreatorClick,
  onVideoDeleted,
}: HomeViewProps) {
  const { uploadTasks, cancelUpload, pauseUpload, resumeUpload } =
    useUploadManager();
  const { user } = useAuth();
  const userId = user?.userId ?? "";

  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const pendingVideos = useMemo(
    () => videos.filter((v) => v.status !== "ready"),
    [videos],
  );

  const readyVideos = useMemo(
    () => videos.filter((v) => v.status === "ready"),
    [videos],
  );

  const filteredReady = useMemo(() => {
    if (!searchQuery.trim()) return readyVideos;
    const q = searchQuery.toLowerCase();
    return readyVideos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.creatorName.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q),
    );
  }, [readyVideos, searchQuery]);

  // Continue Watching: videos between 3% and 95% watched
  const continueWatching = useMemo(() => {
    if (!userId) return [];
    return readyVideos.filter((v) => {
      const pct = getWatchedPercent(userId, v.id);
      return pct > 3 && pct < 95;
    });
  }, [readyVideos, userId]);

  // Subscriptions feed
  const subscriptionVideos = useMemo(() => {
    if (!userId) return [];
    const subs = getSubscriptions(userId);
    if (subs.length === 0) return [];
    const subIds = new Set(subs.map((s) => s.creatorId));
    return readyVideos
      .filter((v) => subIds.has(v.creatorId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
  }, [readyVideos, userId]);

  const allEmpty = pendingVideos.length === 0 && filteredReady.length === 0;

  return (
    <div className="animate-fade-in">
      <div className="px-3 pt-3 pb-4">
        {allEmpty ? (
          <div
            data-ocid="feed.empty_state"
            className="flex flex-col items-center justify-center py-20 gap-4 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
              <Upload className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">
                {searchQuery
                  ? "No videos found"
                  : "No videos yet \u2014 upload your first video"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery
                  ? "Try a different search term"
                  : "Be the first to upload"}
              </p>
            </div>
            {!searchQuery && (
              <Button
                data-ocid="feed.upload.button"
                onClick={onUploadClick}
                className="bg-primary text-white hover:opacity-90"
              >
                Upload Video
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Queue header */}
            {pendingVideos.length > 0 && (
              <p className="text-xs font-medium text-muted-foreground mb-2 px-0.5">
                Uploading ({pendingVideos.length})
              </p>
            )}

            {/* Pending/uploading videos at top */}
            {pendingVideos.map((video, i) => {
              const task = uploadTasks.get(video.id);
              const progress = task?.progress ?? 0;
              const stage = task?.stage ?? "uploading";
              const statusMsg = task?.statusMsg;
              const isPaused = task?.isPaused ?? false;

              const isCancelled =
                stage === "error" && statusMsg === "Upload cancelled";
              const isWaiting = false;
              const isProcessing = stage === "processing";

              const displayText = statusMsg
                ? statusMsg
                : isProcessing
                  ? "Processing..."
                  : `Uploading... ${progress}%`;

              const badgeClass = isCancelled
                ? "bg-red-500/90 text-white"
                : isPaused
                  ? "bg-zinc-600/90 text-white"
                  : isWaiting
                    ? "bg-amber-500/90 text-white"
                    : "bg-black/75 text-white";

              const dotClass = isCancelled
                ? "bg-white"
                : isPaused
                  ? "bg-zinc-400"
                  : isWaiting
                    ? "bg-white animate-pulse"
                    : "bg-primary animate-pulse";

              const isConfirming = confirmCancelId === video.id;

              return (
                <div key={video.id}>
                  {i > 0 && <Separator className="bg-border my-2" />}
                  <div
                    data-ocid={`feed.uploading.item.${i + 1}`}
                    className="px-0 py-2"
                  >
                    <div className="relative rounded-xl overflow-hidden bg-secondary aspect-video mb-2">
                      {video.thumbnailDataUrl ? (
                        <img
                          src={video.thumbnailDataUrl}
                          alt={video.title}
                          className="w-full h-full object-cover opacity-70"
                        />
                      ) : (
                        <div className="w-full h-full bg-secondary flex items-center justify-center">
                          <FileVideo
                            className="w-10 h-10 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </div>
                      )}

                      {!isCancelled && (
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40">
                          <div
                            className={`h-full transition-all duration-500 ease-out ${
                              isPaused
                                ? "bg-zinc-400"
                                : isWaiting
                                  ? "bg-amber-400"
                                  : "bg-primary"
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}

                      <div
                        className={`absolute top-2 left-2 text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 max-w-[70%] ${
                          badgeClass
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`}
                        />
                        <span className="truncate">{displayText}</span>
                      </div>

                      {!isCancelled && !isConfirming && (
                        <div className="absolute top-2 right-2 flex gap-1">
                          {!isPaused && !isProcessing && (
                            <Button
                              data-ocid={`feed.uploading.pause.${i + 1}`}
                              size="sm"
                              variant="secondary"
                              className="h-7 w-7 p-0 bg-black/75 hover:bg-black/90 text-white border-0"
                              onClick={() => pauseUpload(video.id)}
                            >
                              <Pause className="w-3 h-3" />
                            </Button>
                          )}

                          {isPaused && (
                            <Button
                              data-ocid={`feed.uploading.resume.${i + 1}`}
                              size="sm"
                              variant="secondary"
                              className="h-7 w-7 p-0 bg-black/75 hover:bg-black/90 text-white border-0"
                              onClick={() => resumeUpload(video.id)}
                            >
                              <Play className="w-3 h-3" />
                            </Button>
                          )}

                          <Button
                            data-ocid={`feed.uploading.cancel.${i + 1}`}
                            size="sm"
                            variant="secondary"
                            className="h-7 w-7 p-0 bg-black/75 hover:bg-black/90 text-white border-0"
                            onClick={() => setConfirmCancelId(video.id)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}

                      {isConfirming && (
                        <div
                          data-ocid={`feed.uploading.dialog.${i + 1}`}
                          className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2 px-4"
                        >
                          <p className="text-white text-sm font-medium">
                            Cancel upload?
                          </p>
                          <div className="flex gap-2">
                            <Button
                              data-ocid={`feed.uploading.confirm_button.${i + 1}`}
                              size="sm"
                              className="h-7 px-3 bg-red-600 hover:bg-red-700 text-white border-0 text-xs rounded-full"
                              onClick={() => {
                                cancelUpload(video.id);
                                setConfirmCancelId(null);
                              }}
                            >
                              Yes, cancel
                            </Button>
                            <Button
                              data-ocid={`feed.uploading.cancel_button.${i + 1}`}
                              size="sm"
                              variant="secondary"
                              className="h-7 px-3 bg-black/75 hover:bg-black/90 text-white border-0 text-xs rounded-full"
                              onClick={() => setConfirmCancelId(null)}
                            >
                              No
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <p className="text-sm font-semibold truncate text-foreground">
                      {video.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {video.creatorName}
                    </p>
                  </div>
                </div>
              );
            })}

            {pendingVideos.length > 0 &&
              (continueWatching.length > 0 ||
                subscriptionVideos.length > 0 ||
                filteredReady.length > 0) && (
                <Separator className="bg-border my-2" />
              )}

            {/* Continue Watching */}
            {userId && continueWatching.length > 0 && (
              <div data-ocid="continue_watching.section" className="mb-4">
                <p className="text-sm font-semibold text-foreground mb-2">
                  Continue Watching
                </p>
                <div
                  className="flex gap-3 overflow-x-auto pb-2"
                  style={{
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                  }}
                >
                  {continueWatching.map((video, i) => {
                    const pct = getWatchedPercent(userId, video.id);
                    return (
                      <button
                        key={video.id}
                        type="button"
                        data-ocid={`continue_watching.item.${i + 1}`}
                        onClick={() => onVideoClick(video)}
                        className="flex-none w-[120px] text-left group"
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
                              <FileVideo className="w-5 h-5 text-muted-foreground opacity-40" />
                            </div>
                          )}
                          {/* Red progress bar */}
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                            <div
                              className="h-full bg-red-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <DeleteVideoButton
                            video={video}
                            currentUserId={userId}
                            onDelete={(id) => onVideoDeleted?.(id)}
                          />
                        </div>
                        <p className="text-xs text-foreground mt-1 truncate leading-snug">
                          {video.title}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Subscriptions */}
            {userId && subscriptionVideos.length > 0 && !searchQuery.trim() && (
              <>
                <div data-ocid="subscriptions.section" className="mb-4">
                  <p className="text-sm font-semibold text-foreground mb-2">
                    Subscriptions
                  </p>
                  {subscriptionVideos.map((video, i) => (
                    <div key={video.id} className="relative">
                      {i > 0 && <Separator className="bg-border my-2" />}
                      <VideoCard
                        video={video}
                        onClick={onVideoClick}
                        index={i + 1}
                        watchedPercent={getWatchedPercent(userId, video.id)}
                        onCreatorClick={onCreatorClick}
                      />
                      <div className="absolute top-2 right-2 z-10">
                        <DeleteVideoButton
                          video={video}
                          currentUserId={userId}
                          onDelete={(id) => onVideoDeleted?.(id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="bg-border my-3" />
              </>
            )}

            {filteredReady.map((video, i) => (
              <div key={video.id} className="relative">
                {(i > 0 || pendingVideos.length > 0) && (
                  <Separator className="bg-border my-2" />
                )}
                <VideoCard
                  video={video}
                  onClick={onVideoClick}
                  index={i + 1}
                  watchedPercent={getWatchedPercent(userId, video.id)}
                  onCreatorClick={onCreatorClick}
                />
                <div className="absolute top-2 right-2 z-10">
                  <DeleteVideoButton
                    video={video}
                    currentUserId={userId}
                    onDelete={(id) => onVideoDeleted?.(id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
