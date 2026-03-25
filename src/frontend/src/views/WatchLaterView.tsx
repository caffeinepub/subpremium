import { Bookmark, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../hooks/useAuth";
import type { Video } from "../types/video";
import { formatTimeAgo, formatViewsShort } from "../utils/format";
import { getWatchLater, removeFromWatchLater } from "../utils/watchLater";
import { getWatchedPercent } from "../utils/watchProgress";

interface WatchLaterViewProps {
  videos: Video[];
  onVideoClick: (video: Video) => void;
}

export function WatchLaterView({ videos, onVideoClick }: WatchLaterViewProps) {
  const { user } = useAuth();
  const userId = user?.userId ?? "";
  const [refreshKey, setRefreshKey] = useState(0);

  const savedIds = useMemo(() => {
    // eslint-disable-next-line no-unused-expressions
    refreshKey; // trigger re-compute
    return getWatchLater(userId);
  }, [userId, refreshKey]);

  const savedVideos = useMemo(
    () =>
      savedIds
        .map((id) => videos.find((v) => v.id === id))
        .filter(Boolean) as Video[],
    [savedIds, videos],
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent, videoId: string) => {
      e.stopPropagation();
      removeFromWatchLater(userId, videoId);
      setRefreshKey((k) => k + 1);
      toast("Removed from Watch Later");
    },
    [userId],
  );

  if (!userId) {
    return (
      <div className="px-4 pt-6 pb-24 animate-fade-in">
        <h1 className="text-lg font-bold mb-6">Watch Later</h1>
        <div
          data-ocid="watchlater.empty_state"
          className="flex flex-col items-center justify-center py-20 gap-3 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center">
            <Bookmark className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-base font-semibold">Login to use Watch Later</p>
            <p className="text-sm text-muted-foreground mt-1">
              Save videos to watch them later
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 pt-4 pb-24 animate-fade-in">
      <h1 className="text-lg font-bold mb-4">Watch Later</h1>

      {savedVideos.length === 0 ? (
        <div
          data-ocid="watchlater.empty_state"
          className="flex flex-col items-center justify-center py-20 gap-3 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center">
            <Bookmark className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-base font-semibold">No saved videos yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tap the 🔖 button on any video to save it
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {savedVideos.map((video, i) => {
            const pct = getWatchedPercent(userId, video.id);
            return (
              <button
                key={video.id}
                type="button"
                data-ocid={`watchlater.item.${i + 1}`}
                onClick={() => onVideoClick(video)}
                className="flex gap-3 items-start text-left hover:bg-secondary/50 rounded-lg p-1.5 -mx-1.5 transition-colors w-full"
              >
                {/* Thumbnail */}
                <div className="relative w-28 h-16 rounded-lg bg-secondary shrink-0 overflow-hidden">
                  {video.thumbnailDataUrl ? (
                    <img
                      src={video.thumbnailDataUrl}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground">
                        No thumb
                      </span>
                    </div>
                  )}
                  {pct > 0 && (
                    <div
                      className="absolute bottom-0 left-0 h-[3px] bg-red-500 rounded-r"
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
                    {video.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {video.creatorName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatViewsShort(video.views)} views &middot;{" "}
                    {formatTimeAgo(video.createdAt)}
                  </p>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  data-ocid={`watchlater.delete_button.${i + 1}`}
                  onClick={(e) => handleRemove(e, video.id)}
                  className="mt-0.5 p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                  aria-label="Remove from Watch Later"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
