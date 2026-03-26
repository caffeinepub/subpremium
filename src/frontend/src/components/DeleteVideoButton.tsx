import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import type { Video } from "../types/video";

interface DeleteVideoButtonProps {
  video: Video;
  currentUserId: string | undefined;
  onDelete: (videoId: string) => void;
  isDeleting?: boolean;
}

export function DeleteVideoButton({
  video,
  currentUserId,
  onDelete,
  isDeleting = false,
}: DeleteVideoButtonProps) {
  // Only render for owner of ready videos
  if (!currentUserId || currentUserId !== video.creatorId) return null;
  if (video.status !== "ready") return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          data-ocid="video.delete_button"
          disabled={isDeleting}
          onClick={(e) => e.stopPropagation()}
          aria-label="Delete video"
          className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-red-600/90 text-white transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent
        data-ocid="video.delete.dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this video?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The video and all associated data will
            be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-ocid="video.delete.cancel_button">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            data-ocid="video.delete.confirm_button"
            onClick={() => onDelete(video.id)}
            className="bg-red-600 hover:bg-red-700 text-white focus:ring-red-600"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
