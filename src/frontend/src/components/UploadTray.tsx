import { Loader2, Pause, Play, RefreshCw, X } from "lucide-react";
import { useUploadManager } from "../hooks/useUploadManager";

export function UploadTray() {
  const {
    uploadTasks,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    retryFinalize,
  } = useUploadManager();

  // Show all tasks except silently-processing ones (progress=100 stage=processing means
  // we already transitioned — removeTask fires right after so this is a brief flash state)
  const activeTasks = [...uploadTasks.values()].filter(
    (t) =>
      t.stage === "uploading" ||
      t.stage === "finalizing" ||
      t.stage === "processing" ||
      t.stage === "failed",
  );

  if (activeTasks.length === 0) return null;

  const activeCount = activeTasks.filter(
    (t) => t.stage === "uploading" || t.stage === "finalizing",
  ).length;

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
            {activeCount > 0
              ? activeCount === 1
                ? "Uploading 1 video"
                : `Uploading ${activeCount} videos`
              : "Upload complete"}
          </span>
        </div>

        {/* Task list */}
        <div className="divide-y divide-border/30 max-h-48 overflow-y-auto">
          {activeTasks.map((task, idx) => {
            const isFinalizing = task.stage === "finalizing";
            const isProcessing = task.stage === "processing";
            const isFailed = task.stage === "failed";
            const isPaused = task.isPaused ?? false;
            const pct = Math.min(
              Math.max(Math.round(task.progress ?? 0), 0),
              100,
            );
            const title = task.title || "Untitled video";

            // Progress bar fill
            const barPct = isFinalizing ? 99 : isProcessing ? 100 : pct;
            const barColor = isFailed
              ? "hsl(var(--destructive))"
              : isFinalizing || isProcessing
                ? "hsl(var(--primary))"
                : "hsl(var(--primary))";
            const barOpacity = isProcessing ? 0.6 : isFailed ? 0.5 : 1;

            // Status label
            let statusLabel: string;
            if (isProcessing) statusLabel = "Processing...";
            else if (isFinalizing) statusLabel = "Finalizing...";
            else if (isFailed) statusLabel = task.statusMsg ?? "Failed";
            else if (isPaused) statusLabel = "Paused";
            else statusLabel = task.statusMsg ?? `${pct}%`;

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
                    <span
                      className={`text-[10px] ml-2 shrink-0 ${
                        isFailed ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFinalizing ? "animate-pulse" : ""
                      }`}
                      style={{
                        width: `${barPct}%`,
                        background: barColor,
                        opacity: barOpacity,
                      }}
                    />
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Finalizing: spinner only, no controls */}
                  {isFinalizing && (
                    <Loader2
                      className="w-3.5 h-3.5 text-primary animate-spin"
                      aria-label="Finalizing"
                    />
                  )}

                  {/* Processing: no controls */}

                  {/* Failed: retry (if canRetryFinalize) + cancel */}
                  {isFailed && (
                    <>
                      {task.canRetryFinalize && (
                        <button
                          type="button"
                          aria-label="Retry finalize"
                          data-ocid={`upload.retry.button.${idx + 1}`}
                          onClick={() => retryFinalize(task.videoId)}
                          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-primary/20 text-primary transition-colors"
                          title="Retry finalization"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
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
                    </>
                  )}

                  {/* Uploading: pause / resume + cancel */}
                  {!isFinalizing && !isProcessing && !isFailed && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
