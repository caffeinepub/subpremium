import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  Film,
  ImageIcon,
  Plus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useUploadManager } from "../hooks/useUploadManager";
import { formatDuration, formatFileSize } from "../utils/format";

interface CaptionEntry {
  id: string;
  lang: string;
  file: File | null;
}

interface UploadViewProps {
  onDone: () => void;
  onLoginClick?: () => void;
}

async function generateThumbnail(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    let resolved = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxW = 640;
        const scale = Math.min(1, maxW / (video.videoWidth || 640));
        canvas.width = Math.round((video.videoWidth || 640) * scale);
        canvas.height = Math.round((video.videoHeight || 360) * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
          resolved = true;
          cleanup();
          resolve(dataUrl);
        } else {
          cleanup();
          resolve(undefined);
        }
      } catch {
        cleanup();
        resolve(undefined);
      }
    };

    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration * 0.1);
    };

    video.onerror = () => {
      if (!resolved) {
        cleanup();
        resolve(undefined);
      }
    };

    setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolve(undefined);
      }
    }, 8000);

    video.load();
  });
}

async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      const dur = video.duration || 0;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(dur) ? dur : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.load();
  });
}

export function UploadView({ onDone, onLoginClick }: UploadViewProps) {
  const { user, isLoading } = useAuth();
  const { startUpload } = useUploadManager();
  const isLoggedIn = !!user;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState("");
  const [captionEntries, setCaptionEntries] = useState<CaptionEntry[]>([]);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | undefined>(
    undefined,
  );
  const [isGeneratingThumb, setIsGeneratingThumb] = useState(false);

  // Revoke object URL on unmount or when file changes
  useEffect(() => {
    return () => {
      if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    };
  }, [videoObjectUrl]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setValidationError("");

      // Validate file size (2GB max)
      const MAX_SIZE = 2 * 1024 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        setValidationError("File is too large. Maximum size is 2GB.");
        e.target.value = "";
        return;
      }

      // Validate video format
      const supportedTypes = [
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime",
        "video/x-msvideo",
        "video/mpeg",
      ];
      if (
        file.type &&
        !supportedTypes.includes(file.type) &&
        !file.type.startsWith("video/")
      ) {
        setValidationError(
          `Unsupported video format: ${file.type}. Please use MP4, WebM, or MOV.`,
        );
        e.target.value = "";
        return;
      }

      const dur = await getVideoDuration(file);
      if (dur > 3600) {
        setValidationError("Video must be 1 hour or less.");
        e.target.value = "";
        return;
      }

      // Revoke previous object URL
      setVideoObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });

      setSelectedFile(file);
      setDuration(dur);
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));

      // Auto-generate thumbnail on file select
      setIsGeneratingThumb(true);
      const thumb = await generateThumbnail(file);
      setThumbnailDataUrl(thumb);
      setIsGeneratingThumb(false);
    },
    [title],
  );

  const handleAutoThumbnail = useCallback(async () => {
    if (!selectedFile) return;
    setIsGeneratingThumb(true);
    const thumb = await generateThumbnail(selectedFile);
    setThumbnailDataUrl(thumb);
    setIsGeneratingThumb(false);
  }, [selectedFile]);

  const handleCustomThumbnail = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setThumbnailDataUrl(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [],
  );

  const addCaptionEntry = useCallback(() => {
    setCaptionEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), lang: "", file: null },
    ]);
  }, []);

  const removeCaptionEntry = useCallback((index: number) => {
    setCaptionEntries((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateCaptionLang = useCallback((index: number, lang: string) => {
    setCaptionEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, lang } : entry)),
    );
  }, []);

  const updateCaptionFile = useCallback((index: number, file: File | null) => {
    setCaptionEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, file } : entry)),
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedFile || !title.trim() || !user) return;

    const validCaptions = captionEntries
      .filter((e) => e.lang.trim() && e.file)
      .map((e) => ({ lang: e.lang.trim(), file: e.file as File }));

    startUpload({
      file: selectedFile,
      title,
      description,
      thumbnailDataUrl,
      duration,
      captions: validCaptions,
      userId: user.userId,
      displayName: user.displayName || user.email,
    });

    onDone();
  }, [
    selectedFile,
    title,
    description,
    thumbnailDataUrl,
    duration,
    captionEntries,
    user,
    startUpload,
    onDone,
  ]);

  const canUpload = !!selectedFile && !!title.trim() && !!user;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div
        data-ocid="upload.login.section"
        className="flex flex-col items-center justify-center py-20 px-6 gap-5 text-center animate-fade-in"
      >
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
          <Upload
            className="w-7 h-7 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div>
          <h2 className="text-lg font-bold">Login to Upload</h2>
          <p className="text-sm text-muted-foreground mt-1">
            You need to be logged in to upload videos.
          </p>
        </div>
        <Button
          data-ocid="upload.login.button"
          onClick={onLoginClick}
          className="bg-primary text-white hover:opacity-90 w-full max-w-xs"
        >
          Login
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-6 animate-fade-in pb-28">
      <h1 className="text-lg font-bold">Upload Video</h1>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={thumbnailInputRef}
        type="file"
        accept="image/jpeg,image/png,image/*"
        className="hidden"
        onChange={handleCustomThumbnail}
      />

      {validationError && (
        <div
          data-ocid="upload.error_state"
          className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {validationError}
        </div>
      )}

      {/* ── Section 1: Video ── */}
      <section className="flex flex-col gap-3">
        <Label className="text-sm font-semibold text-foreground tracking-wide uppercase text-xs">
          Video
        </Label>

        {/* Video preview card */}
        <div className="w-full aspect-video rounded-2xl overflow-hidden bg-secondary flex items-center justify-center relative">
          {videoObjectUrl ? (
            <video
              src={videoObjectUrl}
              className="w-full h-full object-contain bg-black"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Film className="w-10 h-10 opacity-40" aria-hidden="true" />
              <p className="text-xs opacity-60">No video selected</p>
            </div>
          )}
        </div>

        {/* File info after selection */}
        {selectedFile && (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground truncate">
              {selectedFile.name}
            </span>
            <span className="shrink-0">&middot;</span>
            <span className="shrink-0">
              {formatFileSize(selectedFile.size)}
            </span>
            <span className="shrink-0">&middot;</span>
            <span className="shrink-0">{formatDuration(duration)}</span>
          </div>
        )}

        <Button
          type="button"
          data-ocid="upload.dropzone"
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-11 text-sm font-semibold"
        >
          {selectedFile ? "Change Video" : "Select Video"}
        </Button>
      </section>

      {/* ── Section 2: Thumbnail ── */}
      <section className="flex flex-col gap-3">
        <Label className="text-sm font-semibold tracking-wide uppercase text-xs text-foreground">
          Thumbnail
          <span className="ml-2 text-muted-foreground font-normal normal-case">
            optional
          </span>
        </Label>

        {/* Thumbnail preview card */}
        <div className="w-full aspect-video rounded-2xl overflow-hidden bg-secondary flex items-center justify-center relative">
          {thumbnailDataUrl ? (
            <>
              <img
                src={thumbnailDataUrl}
                alt="Thumbnail preview"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setThumbnailDataUrl(undefined)}
                className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                aria-label="Remove thumbnail"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          ) : isGeneratingThumb ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs opacity-60">Generating...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageIcon className="w-10 h-10 opacity-40" aria-hidden="true" />
              <p className="text-xs opacity-60">No thumbnail</p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            data-ocid="upload.thumbnail.custom.upload_button"
            variant="outline"
            className="flex-1 h-10 text-sm"
            onClick={() => thumbnailInputRef.current?.click()}
          >
            Select Thumbnail
          </Button>
          <Button
            type="button"
            data-ocid="upload.thumbnail.auto.button"
            variant="outline"
            className="flex-1 h-10 text-sm"
            onClick={handleAutoThumbnail}
            disabled={!selectedFile || isGeneratingThumb}
          >
            {isGeneratingThumb ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            )}
            Generate from video
          </Button>
        </div>
      </section>

      {/* ── Section 3: Details ── */}
      <section className="flex flex-col gap-4">
        <Label className="text-sm font-semibold tracking-wide uppercase text-xs text-foreground">
          Details
        </Label>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="video-title"
            className="text-sm font-medium text-foreground"
          >
            Title <span className="text-primary">*</span>
          </Label>
          <Input
            data-ocid="upload.title.input"
            id="video-title"
            placeholder="Enter a title for your video"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="video-desc"
            className="text-sm font-medium text-foreground"
          >
            Description
          </Label>
          <Textarea
            data-ocid="upload.description.textarea"
            id="video-desc"
            placeholder="Describe your video (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary resize-none"
            rows={3}
          />
        </div>

        {/* Captions */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-foreground">
            Captions{" "}
            <span className="text-muted-foreground font-normal">
              (Optional)
            </span>
          </Label>
          <p className="text-xs text-muted-foreground -mt-1">
            Upload .srt or .vtt subtitle files for each language
          </p>

          {captionEntries.length > 0 && (
            <div className="flex flex-col gap-2">
              {captionEntries.map((entry, index) => (
                <CaptionRow
                  key={entry.id}
                  index={index}
                  entry={entry}
                  onLangChange={updateCaptionLang}
                  onFileChange={updateCaptionFile}
                  onRemove={removeCaptionEntry}
                />
              ))}
            </div>
          )}

          <Button
            type="button"
            data-ocid="upload.captions.button"
            variant="outline"
            size="sm"
            onClick={addCaptionEntry}
            className="self-start flex items-center gap-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Caption
          </Button>
        </div>
      </section>

      {/* ── Section 4: Upload ── */}
      <section className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
          ✦ Upload starts immediately in the background. You can navigate freely
          while your video uploads. Supports files up to 2GB.
        </p>

        <Button
          data-ocid="upload.submit_button"
          onClick={handleSubmit}
          disabled={!canUpload}
          className="w-full h-12 text-sm font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-40"
        >
          Upload Video
        </Button>
      </section>
    </div>
  );
}

function CaptionRow({
  index,
  entry,
  onLangChange,
  onFileChange,
  onRemove,
}: {
  index: number;
  entry: CaptionEntry;
  onLangChange: (i: number, lang: string) => void;
  onFileChange: (i: number, file: File | null) => void;
  onRemove: (i: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Language, e.g. English"
        value={entry.lang}
        onChange={(e) => onLangChange(index, e.target.value)}
        className="flex-1 h-8 text-sm bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="h-8 px-3 rounded-md bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 truncate max-w-[120px]"
      >
        {entry.file ? entry.file.name : "Pick .srt/.vtt"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          onFileChange(index, f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors shrink-0"
        aria-label="Remove caption"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
