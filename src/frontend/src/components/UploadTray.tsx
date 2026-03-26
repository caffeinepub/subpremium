import { Pause, Play, X } from "lucide-react";
import { useUploadManager } from "../hooks/useUploadManager";

export function UploadTray() {
  const { uploadTasks, cancelUpload, pauseUpload, resumeUpload } =
    useUploadManager();

  // Only show tasks that are actively uploading or processing
  const activeTasks = [...uploadTasks.values()].filter(
    (t) => t.stage === "uploading" || t.stage === "processing",
  );

  if (activeTasks.length === 0) return null;

  return (
    <div
      className="fixed left-0 right-0 z-40 px-2"
      style={{ bottom: "64px" }}
      data-ocid="upload.tray.panel"
    >
      <div className="max-w-md mx-auto bg-secondary/95 backdrop-blur-md border border-border rounded-t-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 border-b border-border/50 flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">
            {activeTasks.length === 1
              ? "Uploading 1 video"
              : `Uploading ${activeTasks.length} videos`}
          </span>
        </div>

        {/* Task list */}
        <div className="divide-y divide-border/30 max-h-48 overflow-y-auto">
          {activeTasks.map((task, idx) => {
            const isProcessing = task.stage === "processing";
            const isPaused = task.isPaused ?? false;
            const pct = Math.min(
              Math.max(Math.round(task.progress ?? 0), 0),
              100,
            );
            const title = task.title || "Untitled video";

            return (
              <div
                key={task.videoId}
                className="flex items-center gap-3 px-4 py-2.5"
                data-ocid={`upload.item.${idx + 1}`}
              >
                {/* Title + progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-xs font-medium text-foreground truncate max-w-[160px]"
                      title={title}
                    >
                      {title}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                      {isProcessing
                        ? "Processing..."
                        : isPaused
                          ? "Paused"
                          : (task.statusMsg ?? `${pct}%`)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${isProcessing ? 100 : pct}%`,
                        background: isProcessing
                          ? "hsl(var(--muted-foreground))"
                          : "hsl(var(--primary))",
                        opacity: isProcessing ? 0.5 : 1,
                      }}
                    />
                  </div>
                </div>

                {/* Controls */}
                {!isProcessing && (
                  <div className="flex items-center gap-1 shrink-0">
                    {isPaused ? (
                      <button
                        type="button"
                        aria-label="Resume upload"
                        data-ocid={`upload.resume.button.${idx + 1}`}
                        onClick={() => resumeUpload(task.videoId)}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-primary/20 text-primary transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label="Pause upload"
                        data-ocid={`upload.pause.button.${idx + 1}`}
                        onClick={() => pauseUpload(task.videoId)}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Cancel upload"
                      data-ocid={`upload.cancel.button.${idx + 1}`}
                      onClick={() => cancelUpload(task.videoId)}
                      className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
