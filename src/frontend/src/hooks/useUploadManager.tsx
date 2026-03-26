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
  deleteSession,
  isUploadDeleted,
  loadAllSessions,
  loadSession,
  markUploadDeleted,
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
  stage: "uploading" | "processing" | "error";
  statusMsg?: string;
  isSlowNetwork?: boolean;
  isPaused?: boolean;
  title?: string;
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

const CHUNK_SIZE = 1024 * 1024; // 1MB — must match StorageClient

function computeChunkBytes(
  chunkIndex: number,
  totalChunks: number,
  fileSize: number,
): number {
  const isLast = chunkIndex === totalChunks - 1;
  return isLast ? fileSize - chunkIndex * CHUNK_SIZE : CHUNK_SIZE;
}

function bytesToProgress(uploadedBytes: number, totalFileSize: number): number {
  if (totalFileSize <= 0) return 100;
  const p = Math.floor((uploadedBytes * 100) / totalFileSize);
  return Math.min(p, 100);
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

  // Track last real progress update timestamp per videoId
  const lastProgressUpdateRef = useRef<Map<string, number>>(new Map());

  // Confirmed uploaded bytes per videoId — single writer is runUpload
  const uploadedBytesRef = useRef<Map<string, number>>(new Map());
  // Current displayed progress per videoId — for monotonic guard
  const currentProgressRef = useRef<Map<string, number>>(new Map());

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
    abortControllersRef.current.delete(videoId);
    uploadedBytesRef.current.delete(videoId);
    currentProgressRef.current.delete(videoId);
  }, []);

  const runUpload = useCallback(
    (videoId: string, params: StartUploadParams, video: Video) => {
      if (runnerActiveRef.current.has(videoId)) return;
      runnerActiveRef.current.add(videoId);
      cancelledRef.current.delete(videoId);

      (async () => {
        try {
          // Load persisted session to determine resume position from bytes (not chunk index)
          const initialSession = await loadSession(videoId);
          const restoredBytes = initialSession?.uploadedBytes ?? 0;
          uploadedBytesRef.current.set(videoId, restoredBytes);
          const restoredProgress = bytesToProgress(
            restoredBytes,
            params.file.size,
          );
          const clampedRestoredProgress = Math.max(1, restoredProgress);
          currentProgressRef.current.set(videoId, clampedRestoredProgress);

          updateTask(videoId, {
            stage: "uploading",
            isPaused: false,
            progress: clampedRestoredProgress,
            statusMsg: `Uploading... ${clampedRestoredProgress}%`,
          });

          // Seed the failsafe timer so it doesn't fire immediately
          lastProgressUpdateRef.current.set(videoId, Date.now());

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

          // Outer retry loop
          while (true) {
            if (cancelledRef.current.has(videoId)) {
              runnerActiveRef.current.delete(videoId);
              return;
            }

            try {
              // Reload session on every attempt to get the latest position
              const currentSession = await loadSession(videoId);
              const fromChunk =
                currentSession && currentSession.lastChunkIndex >= 0
                  ? currentSession.lastChunkIndex + 1
                  : 0;
              const resumeState =
                currentSession?.blobHashTreeJSON && fromChunk > 0
                  ? {
                      fromChunk,
                      treeJSON: JSON.parse(currentSession.blobHashTreeJSON),
                    }
                  : undefined;

              // Create a fresh AbortController for each attempt
              const controller = new AbortController();
              abortControllersRef.current.set(videoId, controller);

              const totalChunks = Math.ceil(params.file.size / CHUNK_SIZE) || 1;

              const result = await (sc as any).putBlob(
                params.file,
                (pct: number) => {
                  if (cancelledRef.current.has(videoId)) return;

                  // Record timestamp for slow-network detection only
                  lastProgressUpdateRef.current.set(videoId, Date.now());

                  // Only used for slow network detection — do NOT update progress here
                  const elapsed = Date.now() - uploadStart;
                  const slow = elapsed > 20_000 && pct < 40;
                  if (slow && elapsed > 60_000) {
                    updateTask(videoId, {
                      isSlowNetwork: true,
                      statusMsg: "Uploading... this may take time",
                    });
                  }
                },
                controller.signal,
                resumeState,
                async (chunkIndex: number, treeJSON?: unknown) => {
                  if (treeJSON !== undefined) {
                    // Tree build complete — save tree JSON but do NOT change uploadedBytes
                    const currentBytes =
                      uploadedBytesRef.current.get(videoId) ?? 0;
                    await updateUploadProgress(
                      videoId,
                      currentBytes,
                      -1,
                      JSON.stringify(treeJSON),
                    );
                    return;
                  }

                  // A real chunk completed — update uploadedBytes
                  const chunkBytes = computeChunkBytes(
                    chunkIndex,
                    totalChunks,
                    params.file.size,
                  );
                  const prevBytes = uploadedBytesRef.current.get(videoId) ?? 0;
                  const newBytes = Math.min(
                    prevBytes + chunkBytes,
                    params.file.size,
                  );
                  uploadedBytesRef.current.set(videoId, newBytes);

                  // Persist to IDB immediately
                  await updateUploadProgress(videoId, newBytes, chunkIndex);

                  // Compute and apply progress (monotonic guard)
                  const newProgress = bytesToProgress(
                    newBytes,
                    params.file.size,
                  );
                  const current = currentProgressRef.current.get(videoId) ?? 0;
                  if (newProgress < current) return; // monotonic guard — never go backward
                  currentProgressRef.current.set(videoId, newProgress);

                  lastProgressUpdateRef.current.set(videoId, Date.now());
                  updateTask(videoId, {
                    progress: newProgress,
                    stage: "uploading",
                    statusMsg: `Uploading... ${newProgress}%`,
                    isSlowNetwork: false,
                  });
                },
              );

              abortControllersRef.current.delete(videoId);
              finalHash = result.hash;
              break; // success
            } catch (err) {
              abortControllersRef.current.delete(videoId);

              // Handle abort (pause or cancel)
              if (err instanceof DOMException && err.name === "AbortError") {
                if (cancelledRef.current.has(videoId)) {
                  runnerActiveRef.current.delete(videoId);
                  return;
                }
                if (pausedByUserRef.current.has(videoId)) {
                  // Wait until user resumes
                  while (pausedByUserRef.current.has(videoId)) {
                    if (cancelledRef.current.has(videoId)) {
                      runnerActiveRef.current.delete(videoId);
                      return;
                    }
                    await sleep(300);
                  }
                  // Resume: go back to top of outer loop
                  attempt = 0; // reset backoff after deliberate pause
                  continue;
                }
                // Abort from unknown reason — treat as retriable
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
              console.warn(
                `[upload] attempt ${attempt} failed for ${videoId}:`,
                err,
              );

              // Silent retry — show last known progress, do NOT change uploadedBytes
              const retryProgress =
                currentProgressRef.current.get(videoId) ?? 0;
              updateTask(videoId, {
                stage: "uploading",
                isSlowNetwork: false,
                statusMsg: `Uploading... ${retryProgress}%`,
              });
              await sleep(delay);
            }
          }

          if (cancelledRef.current.has(videoId)) {
            runnerActiveRef.current.delete(videoId);
            return;
          }

          // Completion lock
          uploadedBytesRef.current.set(videoId, params.file.size);
          currentProgressRef.current.set(videoId, 100);
          updateTask(videoId, {
            progress: 100,
            stage: "processing",
            statusMsg: "Processing...",
            isSlowNetwork: false,
          });

          // Upload captions
          const captionsMeta: Array<{ lang: string; url: string }> = [];
          for (const entry of params.captions) {
            if (!entry.lang.trim() || !entry.file) continue;
            try {
              const text = await entry.file.text();
              const langKey = entry.lang.trim();
              localStorage.setItem(
                `caption_content_${videoId}_${langKey}`,
                text,
              );
              captionsMeta.push({
                lang: langKey,
                url: `local:${videoId}:${langKey}`,
              });
            } catch (e) {
              console.error("[upload] caption read failed", e);
            }
          }

          const url = await sc.getDirectURL(finalHash);

          try {
            const backendActor = await getBackendActor();
            await backendActor.updateVideoStatus({
              videoId,
              status: "ready",
              videoUrl: url,
            });
          } catch (e) {
            console.error("[upload] failed to update video status:", e);
          }

          const readyVideo: Video = {
            ...video,
            blobHash: finalHash,
            status: "ready",
            captions: captionsMeta.length > 0 ? captionsMeta : undefined,
            sources: [{ quality: "Auto", url }],
          };

          updateVideo(readyVideo);
          onVideoUpdateRef.current(readyVideo);
          await deleteSession(videoId);
          removeTask(videoId);

          if (params.userId) {
            addNotification(params.userId, {
              type: "upload",
              title: "Upload complete",
              message: `Your video is ready to watch: "${params.title}"`,
              videoId,
            });
          }

          toast.success("Upload complete", {
            description: `"${params.title}" is ready to watch`,
            duration: 4000,
            action: {
              label: "Watch",
              onClick: () => {
                window.dispatchEvent(
                  new CustomEvent("open-video", { detail: { videoId } }),
                );
              },
            },
          });
        } catch (err) {
          runnerActiveRef.current.delete(videoId);
          if (cancelledRef.current.has(videoId)) return;
          console.error("[upload] fatal error:", err);
          networkPausedRef.current.add(videoId);
          const fatalProgress = currentProgressRef.current.get(videoId) ?? 0;
          updateTask(videoId, {
            stage: "uploading",
            statusMsg: `Uploading... ${fatalProgress}%`,
            isSlowNetwork: false,
          });
        }
      })();
    },
    [updateTask, removeTask],
  );

  // Failsafe — if no real progress update in 5s, slowly increment (monotonic)
  useEffect(() => {
    const interval = setInterval(() => {
      setUploadTasks((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [videoId, task] of prev) {
          if (
            task.stage !== "uploading" ||
            task.isPaused ||
            cancelledRef.current.has(videoId)
          )
            continue;
          const lastUpdate = lastProgressUpdateRef.current.get(videoId) ?? 0;
          if (Date.now() - lastUpdate > 5000 && task.progress < 99) {
            const current =
              currentProgressRef.current.get(videoId) ?? task.progress;
            const nudged = Math.min(current + 0.5, 99);
            if (nudged <= current) continue; // never go backward (monotonic)
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
  }, []);

  // On mount: restore IDB sessions and auto-resume
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once
  useEffect(() => {
    (async () => {
      const sessions = await loadAllSessions();
      if (sessions.length === 0) return;
      // loadAllSessions already filters tombstoned sessions, but double-check
      const validSessions = sessions.filter((s) => !isUploadDeleted(s.videoId));
      if (validSessions.length === 0) return;
      const storedVideos = getVideos();

      for (const session of validSessions) {
        const { videoId } = session;
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

        let video = storedVideos.find((v) => v.id === videoId);
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
          const existing = getVideos();
          saveVideos([video, ...existing]);
          onVideoAddedRef.current(video);
        }

        uploadParamsRef.current.set(videoId, params);

        // Restore progress from bytes — NOT from chunk index
        const restoredBytes = session.uploadedBytes ?? 0;
        const resumePct = Math.max(
          1,
          bytesToProgress(restoredBytes, session.file.size),
        );

        // Initialise refs so monotonic guard and failsafe have correct baseline
        uploadedBytesRef.current.set(videoId, restoredBytes);
        currentProgressRef.current.set(videoId, resumePct);

        setUploadTasks((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            videoId,
            progress: resumePct,
            stage: "uploading",
            statusMsg: `Uploading... ${resumePct}%`,
            title: session.title,
          });
          return next;
        });

        const delay = 300 + Math.random() * 400;
        setTimeout(() => {
          runUpload(videoId, params, video!);
        }, delay);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Online / offline handling
  useEffect(() => {
    const handleOffline = () => {
      setUploadTasks((prev) => {
        const next = new Map(prev);
        for (const [id, task] of prev) {
          if (task.stage === "uploading" && !task.isPaused) {
            networkPausedRef.current.add(id);
            const offlineProgress =
              currentProgressRef.current.get(id) ?? task.progress;
            next.set(id, {
              ...task,
              statusMsg: `Uploading... ${Math.round(offlineProgress)}%`,
            });
          }
        }
        return next;
      });
    };

    const handleOnline = () => {
      const toResume = Array.from(networkPausedRef.current).filter(
        (id) => !pausedByUserRef.current.has(id),
      );
      for (const videoId of toResume) {
        networkPausedRef.current.delete(videoId);
        runnerActiveRef.current.delete(videoId);
        const params = uploadParamsRef.current.get(videoId);
        const vids = getVideos();
        const video = vids.find((v) => v.id === videoId);
        if (!params || !video) continue;
        const onlineProgress = currentProgressRef.current.get(videoId) ?? 0;
        updateTask(videoId, {
          stage: "uploading",
          statusMsg: `Uploading... ${onlineProgress}%`,
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

  const startUpload = useCallback(
    (params: StartUploadParams) => {
      if (!params.file) {
        console.warn("[upload] no file provided");
        return;
      }

      // Prevent duplicate uploads (same filename + size)
      const existingTaskIds = [...uploadParamsRef.current.keys()];
      if (
        existingTaskIds.some((id) => {
          const p = uploadParamsRef.current.get(id);
          return (
            p?.file.name === params.file.name &&
            p?.file.size === params.file.size
          );
        })
      ) {
        console.warn("[upload] duplicate upload prevented");
        return;
      }

      const totalChunks = Math.ceil(params.file.size / CHUNK_SIZE) || 1;

      (async () => {
        let videoId: string = crypto.randomUUID();

        try {
          const backendActor = await getBackendActor();
          const videoRecord = await backendActor.addVideo({
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
          videoId = videoRecord.videoId;
        } catch (e) {
          console.warn(
            "[upload] failed to register in backend, using local id:",
            e,
          );
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

        const existing = getVideos();
        saveVideos([newVideo, ...existing]);
        onVideoAddedRef.current(newVideo);

        // Initialise monotonic refs before first task creation
        uploadedBytesRef.current.set(videoId, 0);
        currentProgressRef.current.set(videoId, 1);

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
      // Synchronous tombstone FIRST — guards against reload re-hydration
      markUploadDeleted(videoId);

      abortControllersRef.current.get(videoId)?.abort();
      abortControllersRef.current.delete(videoId);

      cancelledRef.current.add(videoId);
      pausedByUserRef.current.delete(videoId);
      networkPausedRef.current.delete(videoId);
      uploadParamsRef.current.delete(videoId);

      // Clean up caption localStorage entries
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith(`caption_content_${videoId}_`),
      );
      for (const k of keys) localStorage.removeItem(k);

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
      const resumeProgress = currentProgressRef.current.get(videoId) ?? 0;
      updateTask(videoId, {
        isPaused: false,
        stage: "uploading",
        statusMsg: `Uploading... ${resumeProgress}%`,
      });
      // The pause-wait loop inside runUpload detects the removal from pausedByUserRef
      // and continues the retry loop automatically — no need to call runUpload again.
    },
    [updateTask],
  );

  return (
    <UploadManagerContext.Provider
      value={{
        uploadTasks,
        startUpload,
        cancelUpload,
        pauseUpload,
        resumeUpload,
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
