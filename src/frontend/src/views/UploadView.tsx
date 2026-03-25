import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { HttpAgent } from "@icp-sdk/core/agent";
import { AlertCircle, CheckCircle2, FileVideo, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadConfig } from "../config";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import type { Video } from "../types/video";
import { StorageClient } from "../utils/StorageClient";
import { formatDuration, formatFileSize } from "../utils/format";
import { getVideos, saveVideos } from "../utils/videoStorage";

type UploadStage = "idle" | "uploading" | "processing" | "ready" | "error";

interface UploadViewProps {
  onDone: () => void;
  onVideoAdded: (video: Video) => void;
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
        const maxW = 320;
        const scale = Math.min(1, maxW / (video.videoWidth || 320));
        canvas.width = Math.round((video.videoWidth || 320) * scale);
        canvas.height = Math.round((video.videoHeight || 180) * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
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

export function UploadView({ onDone, onVideoAdded }: UploadViewProps) {
  const { identity, login, loginStatus, isInitializing } =
    useInternetIdentity();
  const isLoggedIn = loginStatus === "success" && !!identity;
  const isLoggingIn = loginStatus === "logging-in";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [validationError, setValidationError] = useState("");

  // Animate progress smoothly from upload value → 100 during processing
  useEffect(() => {
    if (stage !== "processing") return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return Math.min(prev + 2, 100);
      });
    }, 100);
    return () => clearInterval(interval);
  }, [stage]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setValidationError("");

      const dur = await getVideoDuration(file);
      if (dur > 3600) {
        setValidationError("Video must be 1 hour or less.");
        e.target.value = "";
        return;
      }

      setSelectedFile(file);
      setDuration(dur);
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
    },
    [title],
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !title.trim()) return;
    setStage("uploading");
    setProgress(0);
    setErrorMsg("");

    try {
      const config = await loadConfig();
      const agentOptions: Record<string, unknown> = {
        host: config.backend_host,
      };
      if (identity) agentOptions.identity = identity;
      const agent = new HttpAgent(agentOptions as any);
      if (config.backend_host?.includes("localhost")) {
        await agent.fetchRootKey().catch(console.error);
      }
      const sc = new StorageClient(
        config.bucket_name,
        config.storage_gateway_url,
        config.backend_canister_id,
        config.project_id,
        agent,
      );

      const { hash } = await sc.putFile(selectedFile, (pct) =>
        setProgress(pct),
      );

      setStage("processing");

      const thumbnailDataUrl = await generateThumbnail(selectedFile);

      const video: Video = {
        id: crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        creatorName: identity
          ? `${identity.getPrincipal().toString().slice(0, 8)}...`
          : "Anonymous",
        creatorId: identity ? identity.getPrincipal().toString() : "anonymous",
        blobHash: hash,
        thumbnailDataUrl,
        durationSeconds: Math.round(duration),
        fileSizeBytes: selectedFile.size,
        views: 0,
        likes: 0,
        dislikes: 0,
        createdAt: Date.now(),
        status: "ready",
        comments: [],
      };

      const videos = getVideos();
      videos.unshift(video);
      saveVideos(videos);

      onVideoAdded(video);
      setStage("ready");

      setTimeout(() => onDone(), 1500);
    } catch (err) {
      console.error("Upload failed:", err);
      setStage("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    }
  }, [
    selectedFile,
    title,
    description,
    duration,
    identity,
    onDone,
    onVideoAdded,
  ]);

  const isUploading = stage === "uploading" || stage === "processing";
  const canUpload =
    !!selectedFile && !!title.trim() && !isUploading && stage !== "ready";

  const triggerFilePicker = () => fileInputRef.current?.click();

  if (isInitializing) {
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
        <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center">
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
          onClick={login}
          disabled={isLoggingIn}
          className="bg-primary text-white hover:opacity-90 w-full max-w-xs"
        >
          {isLoggingIn ? "Connecting..." : "Login"}
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-4 animate-fade-in pb-24">
      <h1 className="text-lg font-bold">Upload Video</h1>

      {/* File picker */}
      <button
        type="button"
        data-ocid="upload.dropzone"
        onClick={triggerFilePicker}
        className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary transition-colors w-full"
      >
        {selectedFile ? (
          <>
            <FileVideo className="w-8 h-8 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground text-center">
              {selectedFile.name}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{formatFileSize(selectedFile.size)}</span>
              <span>&middot;</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </>
        ) : (
          <>
            <Upload
              className="w-8 h-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-foreground">
              Select Video
            </p>
            <p className="text-xs text-muted-foreground">
              MP4, MOV, WebM &middot; Max 1 hour duration
            </p>
          </>
        )}
      </button>
      <input
        data-ocid="upload.upload_button"
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelect}
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

      {/* Title */}
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
          disabled={isUploading}
        />
      </div>

      {/* Description */}
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
          disabled={isUploading}
        />
      </div>

      {/* Progress */}
      {(stage === "uploading" || stage === "processing") && (
        <div data-ocid="upload.loading_state" className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground font-medium">
              {stage === "uploading" ? "Uploading..." : "Processing..."}
            </span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {stage === "ready" && (
        <div
          data-ocid="upload.success_state"
          className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary text-sm"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          Ready
        </div>
      )}

      {stage === "error" && (
        <div
          data-ocid="upload.error_state"
          className="flex flex-col gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
        >
          <span>{errorMsg}</span>
          <Button
            data-ocid="upload.retry.button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStage("idle");
              setProgress(0);
            }}
            className="self-start text-xs"
          >
            Try Again
          </Button>
        </div>
      )}

      <Button
        data-ocid="upload.submit_button"
        onClick={handleUpload}
        disabled={!canUpload}
        className="w-full h-12 text-sm font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-40"
      >
        {isUploading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {stage === "processing" ? "Processing..." : "Uploading..."}
          </span>
        ) : (
          "Upload Video"
        )}
      </Button>
    </div>
  );
}
