import type { Video } from "../types/video";
import {
  formatDuration,
  formatTimeAgo,
  formatViewsShort,
} from "../utils/format";

interface VideoCardProps {
  video: Video;
  onClick: (video: Video) => void;
  index: number;
  watchedPercent?: number;
  onCreatorClick?: (creatorId: string, creatorName: string) => void;
}

function isProcessingStatus(status: string): boolean {
  return status === "processing" || status === "PROCESSING";
}

export function VideoCard({
  video,
  onClick,
  index,
  watchedPercent = 0,
  onCreatorClick,
}: VideoCardProps) {
  const isProcessing = isProcessingStatus(video.status);

  return (
    <button
      type="button"
      data-ocid={`feed.item.${index}`}
      onClick={() => onClick(video)}
      className="w-full text-left group animate-fade-in"
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-surface-raised">
        {video.thumbnailDataUrl ? (
          <img
            src={video.thumbnailDataUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full bg-gradient-to-br from-surface-raised to-secondary flex items-center justify-center"
            aria-label={`${video.title} thumbnail placeholder`}
          >
            <svg
              viewBox="0 0 48 48"
              className="w-12 h-12 text-muted-foreground opacity-40"
              aria-hidden="true"
              focusable="false"
            >
              <polygon points="16,12 36,24 16,36" fill="currentColor" />
            </svg>
          </div>
        )}
        {/* Processing badge (top-left) — visible but tappable */}
        {isProcessing && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded-full">
            <div className="w-2 h-2 border border-white/40 border-t-white rounded-full animate-spin" />
            <span className="text-white text-[9px] font-semibold tracking-wide">
              Processing
            </span>
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-[10px] font-semibold text-white">
          {formatDuration(video.durationSeconds)}
        </div>
        {/* Watch progress bar */}
        {watchedPercent > 0 && (
          <div
            className="absolute bottom-0 left-0 h-[3px] bg-red-500 rounded-r"
            style={{ width: `${watchedPercent}%` }}
          />
        )}
      </div>

      {/* Metadata */}
      <div className="mt-2 px-0.5">
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {video.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {onCreatorClick ? (
            <button
              type="button"
              data-ocid="feed.creator.button"
              onClick={(e) => {
                e.stopPropagation();
                onCreatorClick(video.creatorId, video.creatorName);
              }}
              className="text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors"
            >
              {video.creatorName}
            </button>
          ) : (
            video.creatorName
          )}{" "}
          &middot; {formatViewsShort(video.views)} views &middot;{" "}
          {formatTimeAgo(video.createdAt)}
        </p>
      </div>
    </button>
  );
}
