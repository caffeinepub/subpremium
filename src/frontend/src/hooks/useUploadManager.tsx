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
  loadAllSessions,
  saveSession,
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

  // FIX 3: Track last real progress update timestamp per videoId
  const lastProgressUpdateRef = useRef<Map<string, number>>(new Map());

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
  }, []);

  const runUpload = useCallback(
    (videoId: string, params: StartUploadParams, video: Video) => {
      if (runnerActiveRef.current.has(videoId)) return;
      runnerActiveRef.current.add(videoId);
      cancelledRef.current.delete(videoId);

      (async () => {
        try {
          // FIX 1: Fresh uploads start at 1% with "Uploading... 1%"
          updateTask(videoId, {
            stage: "uploading",
            isPaused: false,
            progress: 1,
            statusMsg: "Uploading... 1%",
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

          // Read file into memory for upload (required by StorageClient API)
          const fileBytes = new Uint8Array(await params.file.arrayBuffer());

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
            if (pausedByUserRef.current.has(videoId)) {
              await sleep(300);
              continue;
            }

            try {
              const result = await sc.putFile(fileBytes, (pct: number) => {
                if (cancelledRef.current.has(videoId)) return;

                // FIX 3: Record timestamp of real progress update
                lastProgressUpdateRef.current.set(videoId, Date.now());

                const elapsed = Date.now() - uploadStart;
                const slow = elapsed > 20_000 && pct < 40;

                // FIX 2: Always show actual percentage, never "Preparing..."
                let statusMsg: string;
                if (slow && elapsed > 60_000)
                  statusMsg = "Uploading... this may take time";
                else statusMsg = `Uploading... ${pct}%`;

                updateTask(videoId, {
                  progress: pct,
                  stage: "uploading",
                  isSlowNetwork: slow,
                  statusMsg,
                });
              });

              finalHash = result.hash;
              break; // success
            } catch (err) {
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

              // Silent retry
              updateTask(videoId, { stage: "uploading", isSlowNetwork: false });
              await sleep(delay);
            }
          }

          if (cancelledRef.current.has(videoId)) {
            runnerActiveRef.current.delete(videoId);
            return;
          }

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
          updateTask(videoId, {
            stage: "uploading",
            statusMsg: "Uploading...",
            isSlowNetwork: false,
          });
        }
      })();
    },
    [updateTask, removeTask],
  );

  // FIX 3: Failsafe — if no real progress update in 5s, slowly increment
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
            const newProgress = Math.min(task.progress + 0.5, 99);
            next.set(videoId, {
              ...task,
              progress: newProgress,
              statusMsg: `Uploading... ${Math.round(newProgress)}%`,
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
      const storedVideos = getVideos();

      for (const session of sessions) {
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

        // Restored sessions start at 1% minimum
        setUploadTasks((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            videoId,
            progress: 1,
            stage: "uploading",
            statusMsg: "Uploading... 1%",
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
            next.set(id, { ...task, statusMsg: "Uploading..." });
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
        updateTask(videoId, { stage: "uploading", statusMsg: "Uploading..." });
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

      const totalChunks = Math.ceil(params.file.size / (5 * 1024 * 1024)) || 1;

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

        // FIX 1: Start at 1% with "Uploading... 1%"
        setUploadTasks((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            videoId,
            progress: 1,
            stage: "uploading",
            statusMsg: "Uploading... 1%",
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
        });

        runUpload(videoId, params, newVideo);
      })();
    },
    [runUpload],
  );

  const cancelUpload = useCallback(
    (videoId: string) => {
      cancelledRef.current.add(videoId);
      pausedByUserRef.current.delete(videoId);
      networkPausedRef.current.delete(videoId);
      uploadParamsRef.current.delete(videoId);
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
      updateTask(videoId, { isPaused: true, statusMsg: "Paused" });
    },
    [updateTask],
  );

  const resumeUpload = useCallback(
    (videoId: string) => {
      if (!pausedByUserRef.current.has(videoId)) return;
      pausedByUserRef.current.delete(videoId);
      networkPausedRef.current.delete(videoId);
      updateTask(videoId, {
        isPaused: false,
        stage: "uploading",
        statusMsg: "Uploading...",
      });
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
