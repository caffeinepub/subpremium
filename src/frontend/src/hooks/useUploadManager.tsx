import { HttpAgent } from "@icp-sdk/core/agent";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { loadConfig } from "../config";
import type { Video } from "../types/video";
import { StorageClient } from "../utils/StorageClient";
import { getBackendActor } from "../utils/backendActor";
import {
  clearUploadFailureCount,
  deleteSession,
  getUploadFailureCount,
  incrementUploadFailureCount,
  isUploadDeleted,
  loadAllSessions,
  loadSession,
  markUploadDeleted,
  saveFinalizePending,
  saveSession,
  updateUploadProgress,
} from "../utils/uploadPersistence";
import {
  deleteVideo,
  getVideos,
  saveVideos,
  updateVideo,
} from "../utils/videoStorage";
import { addNotification } from "./useNotifications";

export interface UploadTask {
  videoId: string;
  progress: number;
  stage: "uploading" | "finalizing" | "processing" | "failed" | "error";
  statusMsg?: string;
  isSlowNetwork?: boolean;
  isPaused?: boolean;
  title?: string;
  canRetryFinalize?: boolean;
}

interface StartUploadParams {
  file: File;
  title: string;
  description: string;
  thumbnailDataUrl: string | undefined;
  duration: number;
  captions: Array<{ lang: string; file: File }>;
  userId: string;
  displayName: string;
}

interface UploadManagerContextValue {
  uploadTasks: Map<string, UploadTask>;
  startUpload: (params: StartUploadParams) => void;
  cancelUpload: (videoId: string) => void;
  pauseUpload: (videoId: string) => void;
  resumeUpload: (videoId: string) => void;
  retryFinalize: (videoId: string) => void;
}

const UploadManagerContext = createContext<UploadManagerContextValue | null>(
  null,
);

interface UploadManagerProviderProps {
  children: React.ReactNode;
  onVideoAdded: (video: Video) => void;
  onVideoUpdate: (video: Video) => void;
  onVideoRemoved?: (videoId: string) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CHUNK_SIZE = 1024 * 1024; // 1 MB
const FINALIZE_TIMEOUT_MS = 30_000; // 30s hard timeout for finalize call
const FORCE_CHECK_AFTER_MS = 60_000; // if stuck at finalizing >60s, poll backend
const PENDING_RETRY_AFTER_MS = 60_000; // retry pending finalize after 1 min
const MAX_FINALIZE_FAILURES = 3;

function computeChunkBytes(
  chunkIndex: number,
  totalChunks: number,
  fileSize: number,
): number {
  return chunkIndex === totalChunks - 1
    ? fileSize - chunkIndex * CHUNK_SIZE
    : CHUNK_SIZE;
}

function bytesToProgress(uploadedBytes: number, totalFileSize: number): number {
  if (totalFileSize <= 0) return 100;
  return Math.min(Math.floor((uploadedBytes * 100) / totalFileSize), 100);
}

function isValidFile(file: unknown): file is File {
  return (
    file instanceof File && file.size > 0 && typeof file.slice === "function"
  );
}

export function UploadManagerProvider({
  children,
  onVideoAdded,
  onVideoUpdate,
  onVideoRemoved,
}: UploadManagerProviderProps) {
  const [uploadTasks, setUploadTasks] = useState<Map<string, UploadTask>>(
    new Map(),
  );

  const onVideoAddedRef = useRef(onVideoAdded);
  const onVideoUpdateRef = useRef(onVideoUpdate);
  const onVideoRemovedRef = useRef(onVideoRemoved);
  onVideoAddedRef.current = onVideoAdded;
  onVideoUpdateRef.current = onVideoUpdate;
  onVideoRemovedRef.current = onVideoRemoved;

  const uploadParamsRef = useRef<Map<string, StartUploadParams>>(new Map());
  const cancelledRef = useRef<Set<string>>(new Set());
  const pausedByUserRef = useRef<Set<string>>(new Set());
  const networkPausedRef = useRef<Set<string>>(new Set());
  const runnerActiveRef = useRef<Set<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const lastProgressUpdateRef = useRef<Map<string, number>>(new Map());
  const uploadStartTimeRef = useRef<Map<string, number>>(new Map());
  const finalizingStartTimeRef = useRef<Map<string, number>>(new Map());
  const uploadedBytesRef = useRef<Map<string, number>>(new Map());
  const currentProgressRef = useRef<Map<string, number>>(new Map());
  const finalizeDataRef = useRef<
    Map<
      string,
      {
        finalHash: string;
        sc: StorageClient;
        params: StartUploadParams;
        video: Video;
      }
    >
  >(new Map());
  const forceCheckInFlightRef = useRef<Set<string>>(new Set());
  const forceCheckCountRef = useRef<Map<string, number>>(new Map());

  // ─── helpers ──────────────────────────────────────────────────────────────

  const updateTask = useCallback(
    (videoId: string, patch: Partial<UploadTask>) => {
      setUploadTasks((prev) => {
        const existing = prev.get(videoId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(videoId, { ...existing, ...patch });
        return next;
      });
    },
    [],
  );

  const removeTask = useCallback((videoId: string) => {
    setUploadTasks((prev) => {
      const next = new Map(prev);
      next.delete(videoId);
      return next;
    });
    cancelledRef.current.delete(videoId);
    pausedByUserRef.current.delete(videoId);
    networkPausedRef.current.delete(videoId);
    runnerActiveRef.current.delete(videoId);
    lastProgressUpdateRef.current.delete(videoId);
    uploadStartTimeRef.current.delete(videoId);
    finalizingStartTimeRef.current.delete(videoId);
    abortControllersRef.current.delete(videoId);
    uploadedBytesRef.current.delete(videoId);
    currentProgressRef.current.delete(videoId);
    uploadParamsRef.current.delete(videoId);
    finalizeDataRef.current.delete(videoId);
    forceCheckInFlightRef.current.delete(videoId);
    forceCheckCountRef.current.delete(videoId);
  }, []);

  // ─── completion helper ────────────────────────────────────────────────────
  // Called from both runFinalize (success path) and forceStatusCheck.
  // Marks the video ready in local state and removes the upload card.

  const completeUpload = useCallback(
    (videoId: string, readyVideo: Video, title: string, userId?: string) => {
      currentProgressRef.current.set(videoId, 100);
      updateTask(videoId, {
        progress: 100,
        stage: "processing",
        statusMsg: "Processing...",
      });
      updateVideo(readyVideo);
      onVideoUpdateRef.current(readyVideo);
      deleteSession(videoId).catch(() => {});
      clearUploadFailureCount(videoId);
      finalizeDataRef.current.delete(videoId);
      finalizingStartTimeRef.current.delete(videoId);
      forceCheckCountRef.current.delete(videoId);
      removeTask(videoId);

      if (userId) {
        addNotification(userId, {
          type: "upload",
          title: "Upload complete",
          message: `Your video "${title}" is ready to watch`,
          videoId,
        });
      }

      toast.success("Upload complete", {
        description: `"${title}" is ready to watch`,
        duration: 4000,
        action: {
          label: "Watch",
          onClick: () =>
            window.dispatchEvent(
              new CustomEvent("open-video", { detail: { videoId } }),
            ),
        },
      });
    },
    [updateTask, removeTask],
  );

  // ─── forceStatusCheck ────────────────────────────────────────────────────
  // Query getVideo(videoId). If backend already has it ready, force-complete.
  // Returns true if completed, false otherwise.

  const forceStatusCheck = useCallback(
    async (videoId: string): Promise<boolean> => {
      if (forceCheckInFlightRef.current.has(videoId)) return false;
      forceCheckInFlightRef.current.add(videoId);
      try {
        const backendActor = await getBackendActor();
        const result = await backendActor.getVideo(videoId);
        const record =
          Array.isArray(result) && result.length > 0 ? result[0] : null;
        if (
          record &&
          (record.status === "ready" || record.status === "READY")
        ) {
          const params = uploadParamsRef.current.get(videoId);
          const vids = getVideos();
          const existingVideo = vids.find((v) => v.id === videoId);
          const readyVideo: Video = {
            ...(existingVideo ?? {
              id: videoId,
              title: record.title ?? "",
              description: record.description ?? "",
              creatorName: record.creatorName ?? "Anonymous",
              creatorId: record.creatorId ?? "anonymous",
              blobHash: record.blobHash ?? "",
              durationSeconds: Number(record.durationSeconds ?? 0),
              fileSizeBytes: Number(record.fileSizeBytes ?? 0),
              views: Number(record.views ?? 0),
              likes: Number(record.likes ?? 0),
              dislikes: Number(record.dislikes ?? 0),
              createdAt: Number(record.createdAt ?? Date.now()),
              comments: [],
            }),
            status: "ready",
            sources: [{ quality: "Auto", url: record.videoUrl ?? "" }],
          };
          completeUpload(
            videoId,
            readyVideo,
            record.title ?? params?.title ?? "Video",
            params?.userId,
          );
          return true;
        }
      } catch (e) {
        console.warn("[upload] forceStatusCheck failed:", e);
      } finally {
        forceCheckInFlightRef.current.delete(videoId);
      }
      return false;
    },
    [completeUpload],
  );

  // ─── runFinalize ─────────────────────────────────────────────────────────
  // PRIMARY rule: call immediately after chunks are done.
  // saveFinalizePending is ONLY called if this fails (network/timeout).

  const runFinalize = useCallback(
    async (
      videoId: string,
      finalHash: string,
      sc: StorageClient,
      params: StartUploadParams,
      video: Video,
    ) => {
      // Store for retry (in-session)
      finalizeDataRef.current.set(videoId, { finalHash, sc, params, video });

      finalizingStartTimeRef.current.set(videoId, Date.now());
      updateTask(videoId, {
        stage: "finalizing",
        progress: 99,
        statusMsg: "Processing video...",
        isSlowNetwork: false,
        canRetryFinalize: false,
      });

      const doFinalize = async () => {
        // Captions
        const captionsMeta: Array<{ lang: string; url: string }> = [];
        for (const entry of params.captions) {
          if (!entry.lang.trim() || !entry.file) continue;
          try {
            const text = await entry.file.text();
            const langKey = entry.lang.trim();
            localStorage.setItem(`caption_content_${videoId}_${langKey}`, text);
            captionsMeta.push({
              lang: langKey,
              url: `local:${videoId}:${langKey}`,
            });
          } catch (_e) {
            // ignore caption errors
          }
        }

        let url = "";
        try {
          url = await sc.getDirectURL(finalHash);
        } catch (_e) {
          // non-fatal — proceed with empty URL
        }

        const backendActor = await getBackendActor();
        await backendActor.updateVideoStatus({
          videoId,
          status: "ready",
          videoUrl: url,
        });

        return { url, captionsMeta };
      };

      try {
        const { url, captionsMeta } = await Promise.race([
          doFinalize(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("finalize_timeout")),
              FINALIZE_TIMEOUT_MS,
            ),
          ),
        ]);

        // ── SUCCESS — do NOT call saveFinalizePending on this path ──
        finalizingStartTimeRef.current.delete(videoId);
        const readyVideo: Video = {
          ...video,
          blobHash: finalHash,
          status: "ready",
          captions: captionsMeta.length > 0 ? captionsMeta : undefined,
          sources: [{ quality: "Auto", url }],
        };
        completeUpload(videoId, readyVideo, params.title, params.userId);
      } catch (err) {
        // ── FAILURE / TIMEOUT ──
        const isTimeout =
          err instanceof Error && err.message === "finalize_timeout";
        console.error(
          `[upload] finalize ${isTimeout ? "timed out" : "failed"} for ${videoId}:`,
          err,
        );

        // Before recording failure, check if backend already processed it
        const alreadyReady = await forceStatusCheck(videoId);
        if (alreadyReady) {
          runnerActiveRef.current.delete(videoId);
          return;
        }

        // Only now — save pending so reload can retry
        await saveFinalizePending(videoId, finalHash).catch(() => {});

        incrementUploadFailureCount(videoId);
        const failCount = getUploadFailureCount(videoId);
        runnerActiveRef.current.delete(videoId);
        finalizingStartTimeRef.current.delete(videoId);

        if (failCount >= MAX_FINALIZE_FAILURES) {
          markUploadDeleted(videoId);
          await deleteSession(videoId);
          finalizeDataRef.current.delete(videoId);
          removeTask(videoId);
          onVideoRemovedRef.current?.(videoId);
          toast.error("Upload failed", {
            description: `"${params.title}" could not be finalized after multiple attempts.`,
          });
        } else {
          const left = MAX_FINALIZE_FAILURES - failCount;
          updateTask(videoId, {
            stage: "failed",
            progress: 99,
            statusMsg: isTimeout
              ? `Timed out — ${left} ${left === 1 ? "retry" : "retries"} left`
              : `Failed — ${left} ${left === 1 ? "retry" : "retries"} left`,
            canRetryFinalize: true,
          });
        }
      }
    },
    [updateTask, removeTask, completeUpload, forceStatusCheck],
  );

  // ─── runUpload ────────────────────────────────────────────────────────────

  const runUpload = useCallback(
    (
      videoId: string,
      params: StartUploadParams,
      video: Video,
      skipToFinalize?: { finalHash: string; sc: StorageClient },
    ) => {
      if (runnerActiveRef.current.has(videoId)) return;
      runnerActiveRef.current.add(videoId);
      cancelledRef.current.delete(videoId);

      (async () => {
        try {
          if (isUploadDeleted(videoId) || cancelledRef.current.has(videoId)) {
            runnerActiveRef.current.delete(videoId);
            return;
          }

          // Fast path: skip chunk upload, jump straight to finalize
          if (skipToFinalize) {
            await runFinalize(
              videoId,
              skipToFinalize.finalHash,
              skipToFinalize.sc,
              params,
              video,
            );
            runnerActiveRef.current.delete(videoId);
            return;
          }

          const initialSession = await loadSession(videoId);
          if (!initialSession) {
            runnerActiveRef.current.delete(videoId);
            removeTask(videoId);
            return;
          }

          const restoredBytes = initialSession.uploadedBytes ?? 0;
          uploadedBytesRef.current.set(videoId, restoredBytes);
          const clampedProgress = Math.max(
            1,
            bytesToProgress(restoredBytes, params.file.size),
          );
          currentProgressRef.current.set(videoId, clampedProgress);

          updateTask(videoId, {
            stage: "uploading",
            isPaused: false,
            progress: clampedProgress,
            statusMsg: `Uploading... ${clampedProgress}%`,
          });

          lastProgressUpdateRef.current.set(videoId, Date.now());
          uploadStartTimeRef.current.set(videoId, Date.now());

          const config = await loadConfig();
          const agent = new HttpAgent({ host: config.backend_host } as any);
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

          if (cancelledRef.current.has(videoId)) {
            runnerActiveRef.current.delete(videoId);
            return;
          }

          const uploadStart = Date.now();
          let attempt = 0;
          const MAX_BACKOFF = 60_000;
          let finalHash = "";

          // ── chunk upload loop ──
          while (true) {
            if (cancelledRef.current.has(videoId)) {
              runnerActiveRef.current.delete(videoId);
              return;
            }

            try {
              const session = await loadSession(videoId);
              if (!session) {
                runnerActiveRef.current.delete(videoId);
                return;
              }

              const fromChunk =
                session.lastChunkIndex >= 0 ? session.lastChunkIndex + 1 : 0;
              const resumeState =
                session.blobHashTreeJSON && fromChunk > 0
                  ? {
                      fromChunk,
                      treeJSON: JSON.parse(session.blobHashTreeJSON),
                    }
                  : undefined;

              const controller = new AbortController();
              abortControllersRef.current.set(videoId, controller);

              const totalChunks = Math.ceil(params.file.size / CHUNK_SIZE) || 1;

              const result = await (sc as any).putBlob(
                params.file,
                (_pct: number) => {
                  if (cancelledRef.current.has(videoId)) return;
                  lastProgressUpdateRef.current.set(videoId, Date.now());
                  const elapsed = Date.now() - uploadStart;
                  if (elapsed > 60_000) {
                    updateTask(videoId, {
                      isSlowNetwork: true,
                      statusMsg: "Uploading... this may take time",
                    });
                  }
                },
                controller.signal,
                resumeState,
                async (chunkIndex: number, treeJSON?: unknown) => {
                  if (
                    cancelledRef.current.has(videoId) ||
                    isUploadDeleted(videoId)
                  )
                    return;

                  if (treeJSON !== undefined) {
                    const bytes = uploadedBytesRef.current.get(videoId) ?? 0;
                    await updateUploadProgress(
                      videoId,
                      bytes,
                      -1,
                      JSON.stringify(treeJSON),
                    );
                    return;
                  }

                  const chunkBytes = computeChunkBytes(
                    chunkIndex,
                    totalChunks,
                    params.file.size,
                  );
                  const prev = uploadedBytesRef.current.get(videoId) ?? 0;
                  const newBytes = Math.min(
                    prev + chunkBytes,
                    params.file.size,
                  );
                  uploadedBytesRef.current.set(videoId, newBytes);
                  await updateUploadProgress(videoId, newBytes, chunkIndex);

                  // Progress capped at 98 — 99 is reserved for FINALIZING
                  const newPct = Math.min(
                    bytesToProgress(newBytes, params.file.size),
                    98,
                  );
                  const cur = currentProgressRef.current.get(videoId) ?? 0;
                  if (newPct < cur) return; // monotonic guard
                  currentProgressRef.current.set(videoId, newPct);
                  lastProgressUpdateRef.current.set(videoId, Date.now());
                  updateTask(videoId, {
                    progress: newPct,
                    stage: "uploading",
                    statusMsg: `Uploading... ${newPct}%`,
                    isSlowNetwork: false,
                  });
                },
              );

              abortControllersRef.current.delete(videoId);
              finalHash = result.hash;
              break; // all chunks done
            } catch (err) {
              abortControllersRef.current.delete(videoId);

              if (err instanceof DOMException && err.name === "AbortError") {
                if (cancelledRef.current.has(videoId)) {
                  runnerActiveRef.current.delete(videoId);
                  return;
                }
                if (pausedByUserRef.current.has(videoId)) {
                  while (pausedByUserRef.current.has(videoId)) {
                    if (cancelledRef.current.has(videoId)) {
                      runnerActiveRef.current.delete(videoId);
                      return;
                    }
                    await sleep(300);
                  }
                  attempt = 0;
                  continue;
                }
              }

              if (cancelledRef.current.has(videoId)) {
                runnerActiveRef.current.delete(videoId);
                return;
              }

              attempt++;
              const delay = Math.min(
                1000 * 2 ** Math.min(attempt - 1, 6) + Math.random() * 1000,
                MAX_BACKOFF,
              );
              const retryPct = currentProgressRef.current.get(videoId) ?? 0;
              updateTask(videoId, {
                stage: "uploading",
                isSlowNetwork: false,
                statusMsg: `Uploading... ${retryPct}%`,
              });
              await sleep(delay);
            }
          }
          // ── end chunk upload loop ──

          if (cancelledRef.current.has(videoId)) {
            runnerActiveRef.current.delete(videoId);
            return;
          }

          uploadedBytesRef.current.set(videoId, params.file.size);
          // Hand off to finalization — runnerActiveRef stays set until runFinalize exits
          await runFinalize(videoId, finalHash, sc, params, video);
        } catch (err) {
          runnerActiveRef.current.delete(videoId);
          if (cancelledRef.current.has(videoId)) return;
          console.error("[upload] fatal error in runUpload:", err);
          const p = currentProgressRef.current.get(videoId) ?? 0;
          updateTask(videoId, {
            stage: "uploading",
            statusMsg: `Uploading... ${p}%`,
            isSlowNetwork: false,
          });
        }
      })();
    },
    [updateTask, removeTask, runFinalize],
  );

  // ─── failsafe interval ────────────────────────────────────────────────────
  // 1. Kill stuck-at-0% uploads after 10s
  // 2. Nudge stalled progress every 5s (capped at 98)
  // 3. Force status-check if stuck in FINALIZING for >30s

  useEffect(() => {
    const interval = setInterval(() => {
      setUploadTasks((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [videoId, task] of prev) {
          if (task.stage === "finalizing") {
            const start =
              finalizingStartTimeRef.current.get(videoId) ?? Date.now();
            if (Date.now() - start > FORCE_CHECK_AFTER_MS) {
              // Reset timer before async check so we don't fire repeatedly
              finalizingStartTimeRef.current.set(videoId, Date.now());
              const checkCount =
                (forceCheckCountRef.current.get(videoId) ?? 0) + 1;
              forceCheckCountRef.current.set(videoId, checkCount);
              forceStatusCheck(videoId).then((ready) => {
                if (!ready) {
                  if (checkCount >= 3) {
                    // After 3 failed checks (~3 minutes), mark as FAILED with retry
                    updateTask(videoId, {
                      stage: "failed",
                      progress: 99,
                      statusMsg: "Processing timed out — tap retry",
                      canRetryFinalize: true,
                    });
                    finalizingStartTimeRef.current.delete(videoId);
                    forceCheckCountRef.current.delete(videoId);
                  }
                } else {
                  // Completed — clear count
                  forceCheckCountRef.current.delete(videoId);
                }
              });
            }
            continue;
          }

          if (
            task.stage !== "uploading" ||
            task.isPaused ||
            cancelledRef.current.has(videoId)
          )
            continue;

          const lastUpdate = lastProgressUpdateRef.current.get(videoId) ?? 0;
          const startTime =
            uploadStartTimeRef.current.get(videoId) ?? lastUpdate;

          if (task.progress <= 1 && Date.now() - startTime > 10_000) {
            markUploadDeleted(videoId);
            cancelledRef.current.add(videoId);
            abortControllersRef.current.get(videoId)?.abort();
            next.set(videoId, {
              ...task,
              stage: "failed",
              statusMsg: "Upload stalled",
            });
            changed = true;
            continue;
          }

          if (Date.now() - lastUpdate > 5000 && task.progress < 98) {
            const cur =
              currentProgressRef.current.get(videoId) ?? task.progress;
            const nudged = Math.min(cur + 0.5, 98);
            if (nudged <= cur) continue;
            currentProgressRef.current.set(videoId, nudged);
            next.set(videoId, {
              ...task,
              progress: nudged,
              statusMsg: `Uploading... ${Math.round(nudged)}%`,
            });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [forceStatusCheck, updateTask]);

  // ─── mount: restore sessions ──────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    (async () => {
      const sessions = await loadAllSessions();

      // Remove ghost video cards (status=uploading, no valid session)
      const validIds = new Set(sessions.map((s) => s.videoId));
      const stored = getVideos();
      const ghosts = stored
        .filter((v) => v.status === "uploading" && !validIds.has(v.id))
        .map((v) => v.id);
      if (ghosts.length > 0) {
        saveVideos(stored.filter((v) => !ghosts.includes(v.id)));
        for (const id of ghosts) {
          onVideoRemovedRef.current?.(id);
          markUploadDeleted(id);
        }
      }

      if (sessions.length === 0) return;

      const freshVideos = getVideos();

      for (const session of sessions) {
        const { videoId } = session;

        if (isUploadDeleted(videoId)) continue;
        if (!isValidFile(session.file)) {
          markUploadDeleted(videoId);
          deleteSession(videoId).catch(() => {});
          continue;
        }
        if (runnerActiveRef.current.has(videoId)) continue;

        const params: StartUploadParams = {
          file: session.file,
          title: session.title,
          description: session.description,
          thumbnailDataUrl: session.thumbnailDataUrl,
          duration: session.duration,
          captions: session.captions,
          userId: session.userId,
          displayName: session.displayName,
        };

        let video = freshVideos.find((v) => v.id === videoId);
        if (!video) {
          video = {
            id: videoId,
            title: session.title,
            description: session.description,
            creatorName: session.displayName || "Anonymous",
            creatorId: session.userId || "anonymous",
            blobHash: "",
            thumbnailDataUrl: session.thumbnailDataUrl,
            durationSeconds: Math.round(session.duration),
            fileSizeBytes: session.file.size,
            views: 0,
            likes: 0,
            dislikes: 0,
            createdAt: session.createdAt,
            status: "uploading",
            comments: [],
          };
          saveVideos([video, ...getVideos()]);
          onVideoAddedRef.current(video);
        }

        uploadParamsRef.current.set(videoId, params);

        // Startup READY check: if backend already has the video as READY,
        // delete the leftover session and skip restoration entirely.
        try {
          const backendActor = await getBackendActor();
          const result = await backendActor.getVideo(videoId);
          const record =
            Array.isArray(result) && result.length > 0 ? result[0] : null;
          if (
            record &&
            (record.status === "ready" || record.status === "READY")
          ) {
            // Video is already ready — clean up any stale session
            markUploadDeleted(videoId);
            deleteSession(videoId).catch(() => {});
            clearUploadFailureCount(videoId);
            // Remove the video from local uploading list if present
            const stored2 = getVideos();
            const existing = stored2.find((v) => v.id === videoId);
            if (existing && existing.status !== "ready") {
              saveVideos(
                stored2.map((v) =>
                  v.id === videoId ? { ...v, status: "ready" as const } : v,
                ),
              );
            }
            continue;
          }
        } catch (_e) {
          // Backend check failed — proceed with normal restore
        }

        const isFinalizePending =
          session.finalizePending === true && !!session.finalHash;

        // If pending longer than 1 minute, stale — retry even if failure count is 0
        const pendingAge = Date.now() - (session.createdAt ?? 0);
        const shouldRetryImmediately =
          isFinalizePending && pendingAge > PENDING_RETRY_AFTER_MS;

        const restoredBytes = session.uploadedBytes ?? 0;
        const resumePct = isFinalizePending
          ? 99
          : Math.max(1, bytesToProgress(restoredBytes, session.file.size));

        uploadedBytesRef.current.set(videoId, restoredBytes);
        currentProgressRef.current.set(videoId, resumePct);
        uploadStartTimeRef.current.set(videoId, Date.now());
        if (isFinalizePending) {
          finalizingStartTimeRef.current.set(videoId, Date.now());
        }

        setUploadTasks((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            videoId,
            progress: resumePct,
            // Show "Processing video..." for pending, never "Uploading 99%"
            stage: isFinalizePending ? "finalizing" : "uploading",
            statusMsg: isFinalizePending
              ? "Processing video..."
              : `Uploading... ${resumePct}%`,
            title: session.title,
          });
          return next;
        });

        const delay = 300 + Math.random() * 400;

        if (isFinalizePending) {
          setTimeout(
            async () => {
              // First: check if backend already processed during downtime
              const alreadyReady = await forceStatusCheck(videoId);
              if (alreadyReady) return;

              // Not ready yet — re-run finalization
              try {
                const config = await loadConfig();
                const agent = new HttpAgent({
                  host: config.backend_host,
                } as any);
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
                runUpload(videoId, params, video!, {
                  finalHash: session.finalHash!,
                  sc,
                });
              } catch (e) {
                console.error("[upload] finalize resume setup failed:", e);
              }
            },
            shouldRetryImmediately ? 500 : delay,
          );
        } else {
          setTimeout(() => runUpload(videoId, params, video!), delay);
        }
      }
    })();
  }, []);

  // ─── online / offline ─────────────────────────────────────────────────────

  useEffect(() => {
    const handleOffline = () => {
      setUploadTasks((prev) => {
        const next = new Map(prev);
        for (const [id, task] of prev) {
          if (task.stage === "uploading" && !task.isPaused) {
            networkPausedRef.current.add(id);
            const p = currentProgressRef.current.get(id) ?? task.progress;
            next.set(id, {
              ...task,
              statusMsg: `Uploading... ${Math.round(p)}%`,
            });
          }
        }
        return next;
      });
    };

    const handleOnline = () => {
      for (const videoId of Array.from(networkPausedRef.current)) {
        if (pausedByUserRef.current.has(videoId)) continue;
        networkPausedRef.current.delete(videoId);
        runnerActiveRef.current.delete(videoId);
        const params = uploadParamsRef.current.get(videoId);
        const video = getVideos().find((v) => v.id === videoId);
        if (!params || !video) continue;
        const p = currentProgressRef.current.get(videoId) ?? 0;
        updateTask(videoId, {
          stage: "uploading",
          statusMsg: `Uploading... ${p}%`,
        });
        setTimeout(() => runUpload(videoId, params, video), 1500);
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [runUpload, updateTask]);

  // ─── public API ───────────────────────────────────────────────────────────

  const startUpload = useCallback(
    (params: StartUploadParams) => {
      if (!params.file) return;

      // Deduplicate by name + size
      if (
        [...uploadParamsRef.current.values()].some(
          (p) =>
            p.file.name === params.file.name &&
            p.file.size === params.file.size,
        )
      ) {
        console.warn("[upload] duplicate upload prevented");
        return;
      }

      const totalChunks = Math.ceil(params.file.size / CHUNK_SIZE) || 1;

      (async () => {
        let videoId: string = crypto.randomUUID();
        try {
          const actor = await getBackendActor();
          const rec = await actor.addVideo({
            title: params.title.trim(),
            description: params.description.trim(),
            creatorId: params.userId || "anonymous",
            creatorName: params.displayName || "Anonymous",
            blobHash: "",
            thumbnailUrl: params.thumbnailDataUrl || "",
            durationSeconds: BigInt(Math.round(params.duration)),
            fileSizeBytes: BigInt(params.file.size),
            isPremium: false,
          });
          videoId = rec.videoId;
        } catch (e) {
          console.warn("[upload] failed to register in backend:", e);
        }

        const newVideo: Video = {
          id: videoId,
          title: params.title.trim(),
          description: params.description.trim(),
          creatorName: params.displayName || "Anonymous",
          creatorId: params.userId || "anonymous",
          blobHash: "",
          thumbnailDataUrl: params.thumbnailDataUrl,
          durationSeconds: Math.round(params.duration),
          fileSizeBytes: params.file.size,
          views: 0,
          likes: 0,
          dislikes: 0,
          createdAt: Date.now(),
          status: "uploading",
          comments: [],
        };

        saveVideos([newVideo, ...getVideos()]);
        onVideoAddedRef.current(newVideo);

        uploadedBytesRef.current.set(videoId, 0);
        currentProgressRef.current.set(videoId, 1);
        uploadStartTimeRef.current.set(videoId, Date.now());
        lastProgressUpdateRef.current.set(videoId, Date.now());

        setUploadTasks((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            videoId,
            progress: 1,
            stage: "uploading",
            statusMsg: "Uploading... 1%",
            title: params.title.trim(),
          });
          return next;
        });

        uploadParamsRef.current.set(videoId, params);
        saveSession({
          videoId,
          file: params.file,
          title: params.title,
          description: params.description,
          thumbnailDataUrl: params.thumbnailDataUrl,
          duration: params.duration,
          captions: params.captions,
          userId: params.userId,
          displayName: params.displayName,
          lastChunkIndex: -1,
          totalChunks,
          createdAt: Date.now(),
          uploadedBytes: 0,
        });

        runUpload(videoId, params, newVideo);
      })();
    },
    [runUpload],
  );

  const cancelUpload = useCallback(
    (videoId: string) => {
      markUploadDeleted(videoId);
      abortControllersRef.current.get(videoId)?.abort();
      abortControllersRef.current.delete(videoId);
      cancelledRef.current.add(videoId);
      pausedByUserRef.current.delete(videoId);
      networkPausedRef.current.delete(videoId);
      uploadParamsRef.current.delete(videoId);
      finalizeDataRef.current.delete(videoId);
      for (const k of Object.keys(localStorage).filter((k) =>
        k.startsWith(`caption_content_${videoId}_`),
      )) {
        localStorage.removeItem(k);
      }
      deleteSession(videoId).catch(() => {});
      deleteVideo(videoId);
      removeTask(videoId);
      onVideoRemovedRef.current?.(videoId);
    },
    [removeTask],
  );

  const pauseUpload = useCallback(
    (videoId: string) => {
      pausedByUserRef.current.add(videoId);
      abortControllersRef.current.get(videoId)?.abort();
      updateTask(videoId, { isPaused: true, statusMsg: "Paused" });
    },
    [updateTask],
  );

  const resumeUpload = useCallback(
    (videoId: string) => {
      if (!pausedByUserRef.current.has(videoId)) return;
      pausedByUserRef.current.delete(videoId);
      networkPausedRef.current.delete(videoId);
      const p = currentProgressRef.current.get(videoId) ?? 0;
      updateTask(videoId, {
        isPaused: false,
        stage: "uploading",
        statusMsg: `Uploading... ${p}%`,
      });
      // pause-wait loop inside runUpload detects pausedByUserRef removal and continues
    },
    [updateTask],
  );

  const retryFinalize = useCallback(
    (videoId: string) => {
      const data = finalizeDataRef.current.get(videoId);
      if (!data) {
        console.warn("[upload] retryFinalize: no data for", videoId);
        return;
      }
      runnerActiveRef.current.delete(videoId);
      finalizingStartTimeRef.current.set(videoId, Date.now());
      updateTask(videoId, {
        stage: "finalizing",
        progress: 99,
        statusMsg: "Processing video...",
        canRetryFinalize: false,
      });
      runFinalize(videoId, data.finalHash, data.sc, data.params, data.video);
    },
    [updateTask, runFinalize],
  );

  // Factory reset
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable
  useEffect(() => {
    const handler = () => {
      for (const videoId of uploadTasks.keys()) cancelUpload(videoId);
      uploadParamsRef.current = new Map();
    };
    window.addEventListener("factory-reset", handler);
    return () => window.removeEventListener("factory-reset", handler);
  }, [uploadTasks]);

  return (
    <UploadManagerContext.Provider
      value={{
        uploadTasks,
        startUpload,
        cancelUpload,
        pauseUpload,
        resumeUpload,
        retryFinalize,
      }}
    >
      {children}
    </UploadManagerContext.Provider>
  );
}

export function useUploadManager(): UploadManagerContextValue {
  const ctx = useContext(UploadManagerContext);
  if (!ctx)
    throw new Error(
      "useUploadManager must be used within UploadManagerProvider",
    );
  return ctx;
}
