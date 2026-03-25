import { Clock } from "lucide-react";
import { useMemo } from "react";
import { VideoCard } from "../components/VideoCard";
import type { Video } from "../types/video";
import { getHistory } from "../utils/videoStorage";

interface HistoryViewProps {
  videos: Video[];
  onVideoClick: (video: Video) => void;
}

export function HistoryView({ videos, onVideoClick }: HistoryViewProps) {
  const history = useMemo(() => getHistory(), []);

  const historyVideos = useMemo(() => {
    return history
      .map((h) => {
        const video = videos.find((v) => v.id === h.videoId);
        return video ? { video, watchedAt: h.watchedAt } : null;
      })
      .filter(Boolean) as Array<{ video: Video; watchedAt: number }>;
  }, [history, videos]);

  return (
    <div className="px-3 pt-4 pb-24 animate-fade-in">
      <h1 className="text-lg font-bold mb-4">Watch History</h1>

      {historyVideos.length === 0 ? (
        <div
          data-ocid="history.empty_state"
          className="flex flex-col items-center justify-center py-20 gap-3 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center">
            <Clock className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-base font-semibold">No watch history yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Videos you watch will appear here
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {historyVideos.map(({ video }, i) => (
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
  );
}
