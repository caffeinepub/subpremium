import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Video } from "../types/video";

interface UseVideoDeleteOptions {
  actor: { deleteVideo: (id: string) => Promise<boolean> } | null;
  onDeleted: (videoId: string) => void;
  onRestored: (video: Video) => void;
}

export function useVideoDelete({
  actor,
  onDeleted,
  onRestored,
}: UseVideoDeleteOptions) {
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const deleteVideo = useCallback(
    async (video: Video) => {
      const { id: videoId } = video;

      // Optimistic remove
      onDeleted(videoId);
      setDeletingIds((prev) => new Set([...prev, videoId]));

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
          // Restore on failure
          onRestored(video);
          toast.error("Failed to delete video. Please try again.");
        }
      }

      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
    },
    [actor, onDeleted, onRestored],
  );

  return {
    deleteVideo,
    isDeleting: (videoId: string) => deletingIds.has(videoId),
  };
}
