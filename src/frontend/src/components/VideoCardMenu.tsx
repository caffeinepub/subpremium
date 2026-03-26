import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Video } from "../types/video";
import { EditVideoModal } from "./EditVideoModal";

interface VideoCardMenuProps {
  video: Video;
  currentUserId: string | undefined;
  saving: boolean;
  onDelete: (videoId: string) => void;
  onEdit: (title: string, description: string, thumbnailUrl: string) => void;
}

export function VideoCardMenu({
  video,
  currentUserId,
  saving,
  onDelete,
  onEdit,
}: VideoCardMenuProps) {
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const isOwner =
    currentUserId &&
    currentUserId !== "" &&
    currentUserId === video.creatorId &&
    video.status === "ready";

  if (!isOwner) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-ocid="video.menu_button"
            onClick={(e) => e.stopPropagation()}
            aria-label="Video options"
            className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
          className="min-w-[130px]"
        >
          <DropdownMenuItem
            data-ocid="video.menu.edit"
            onClick={(e) => {
              e.stopPropagation();
              setShowEdit(true);
            }}
            className="gap-2 cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            data-ocid="video.menu.delete"
            onClick={(e) => {
              e.stopPropagation();
              setShowDelete(true);
            }}
            className="gap-2 text-destructive focus:text-destructive cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this video?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The video and all associated data
              will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="video.delete.cancel_button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-ocid="video.delete.confirm_button"
              onClick={() => {
                setShowDelete(false);
                onDelete(video.id);
              }}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit modal */}
      {showEdit && (
        <EditVideoModal
          key={video.id}
          video={video}
          open={showEdit}
          saving={saving}
          onClose={() => setShowEdit(false)}
          onSave={(title, description, thumbnailUrl) => {
            onEdit(title, description, thumbnailUrl);
            setShowEdit(false);
          }}
        />
      )}
    </>
  );
}
