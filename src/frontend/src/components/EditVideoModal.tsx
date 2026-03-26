import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import type { Video } from "../types/video";

interface EditVideoModalProps {
  video: Video;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (title: string, description: string, thumbnailUrl: string) => void;
}

export function EditVideoModal({
  video,
  open,
  saving,
  onClose,
  onSave,
}: EditVideoModalProps) {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description || "");
  const [thumbPreview, setThumbPreview] = useState<string>(
    video.thumbnailDataUrl || "",
  );
  const [thumbChanged, setThumbChanged] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const titleError = !title.trim();

  function handleThumbChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setThumbPreview(url);
      setThumbChanged(true);
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    if (titleError) return;
    onSave(title, description, thumbChanged ? thumbPreview : "");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
        data-ocid="video.edit.dialog"
      >
        <DialogHeader>
          <DialogTitle>Edit Video</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Thumbnail */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Thumbnail</Label>
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-secondary">
              {thumbPreview ? (
                <img
                  src={thumbPreview}
                  alt="Thumbnail preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  No thumbnail
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={saving}
              data-ocid="video.edit.upload_button"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Change Thumbnail
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleThumbChange}
            />
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-title" className="text-sm font-medium">
                Title <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs text-muted-foreground">
                {title.length}/100
              </span>
            </div>
            <Input
              id="edit-title"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              className={titleError ? "border-destructive" : ""}
              placeholder="Video title"
              data-ocid="video.edit.input"
            />
            {titleError && (
              <p
                className="text-xs text-destructive"
                data-ocid="video.edit.error_state"
              >
                Title is required
              </p>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-desc" className="text-sm font-medium">
                Description
              </Label>
              <span className="text-xs text-muted-foreground">
                {description.length}/500
              </span>
            </div>
            <Textarea
              id="edit-desc"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              placeholder="Add a description (optional)"
              rows={3}
              data-ocid="video.edit.textarea"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            data-ocid="video.edit.cancel_button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || titleError}
            className="gap-1.5"
            data-ocid="video.edit.save_button"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
