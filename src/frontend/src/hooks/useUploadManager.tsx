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
import {
  type BlobHashTreeJSON,
  CHUNK_SIZE_BYTES,
  StorageClient,
} from "../utils/StorageClient";
import { getBackendActor } from "../utils/backendActor";
import {
  deleteSession,
  loadAllSessions,
  saveSession,
  updateChunkIndex,
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
  }, []);

  const runUpload = useCallback(
    (
      videoId: string,
      params: StartUploadParams,
      video: Video,
      startChunkIndex = 0,
      precomputedTree?: BlobHashTreeJSON,
    ) => {
      if (runnerActiveRef.current.has(videoId)) return;
      runnerActiveRef.current.add(videoId);
      cancelledRef.current.delete(videoId);

      (async () => {
        try {
          updateTask(videoId, {
            stage: "uploading",
            isPaused: false,
            statusMsg:
              startChunkIndex > 0
                ? `Uploading... ${Math.round((startChunkIndex / Math.ceil(params.file.size / CHUNK_SIZE_BYTES)) * 100)}%`
                : "Preparing...",
          });

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

          const _totalChunks =
            Math.ceil(params.file.size / CHUNK_SIZE_BYTES) || 1;
          const uploadStart = Date.now();
          let treeJSON: BlobHashTreeJSON | undefined = precomputedTree;
          let treeJSONSaved = !!precomputedTree;

          // ── Outer retry loop ─────────────────────────────────────────────
          let attempt = 0;
          const MAX_BACKOFF = 60_000;
          let currentChunk = startChunkIndex;
          let finalHash = "";

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
              const result = await sc.putFile(
                params.file,
                (pct, chunkIdx) => {
                  if (cancelledRef.current.has(videoId)) return;

                  currentChunk = chunkIdx;

                  // Persist tree JSON on first chunk callback (tree is built by then)
                  // We get treeJSON from the result after putFile completes,
                  // but we want to save it early. We'll handle this via a wrapper.

                  const elapsed = Date.now() - uploadStart;
                  const slow = elapsed > 20_000 && pct < 40;
                  let statusMsg: string;
                  if (pct < 5) statusMsg = "Preparing...";
                  else if (slow && elapsed > 60_000)
                    statusMsg = "Uploading... this may take time";
                  else statusMsg = `Uploading... ${pct}%`;

                  updateTask(videoId, {
                    progress: pct,
                    stage: "uploading",
                    isSlowNetwork: slow,
                    statusMsg,
                  });

                  // Persist actual chunk index for crash-resume
                  updateChunkIndex(videoId, chunkIdx).catch(() => {});
                },
                currentChunk,
                treeJSON,
              );

              finalHash = result.hash;
              treeJSON = result.treeJSON;

              // Persist treeJSON so next resume skips re-hashing
              if (!treeJSONSaved) {
                treeJSONSaved = true;
                updateChunkIndex(
                  videoId,
                  currentChunk,
                  JSON.stringify(treeJSON),
                ).catch(() => {});
              }

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

              // Silent retry — resume from last completed chunk
              updateTask(videoId, { stage: "uploading", isSlowNetwork: false });
              await sleep(delay);

              // On retry, reload the current chunk index from IDB so we resume correctly
              // (currentChunk is already updated by the progress callback)
            }
          }
          // ── End retry loop ────────────────────────────────────────────────

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

        // lastChunkIndex is now the actual chunk index (−1 = no chunk done)
        const resumeChunk = Math.max(0, session.lastChunkIndex);
        const _totalChunks =
          Math.ceil(session.file.size / CHUNK_SIZE_BYTES) || 1;
        const savedPct = Math.round((resumeChunk / _totalChunks) * 100);

        // Restore the precomputed tree JSON so we skip re-hashing
        const precomputedTree = session.blobHashTreeJSON
          ? (JSON.parse(session.blobHashTreeJSON) as BlobHashTreeJSON)
          : undefined;

        uploadParamsRef.current.set(videoId, params);

        setUploadTasks((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            videoId,
            progress: savedPct,
            stage: "uploading",
            statusMsg:
              savedPct > 0 ? `Uploading... ${savedPct}%` : "Preparing...",
          });
          return next;
        });

        const delay = 300 + Math.random() * 400;
        setTimeout(() => {
          runUpload(videoId, params, video!, resumeChunk, precomputedTree);
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

      const _totalChunks = Math.ceil(params.file.size / CHUNK_SIZE_BYTES) || 1;

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

        setUploadTasks((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            videoId,
            progress: 0,
            stage: "uploading",
            statusMsg: "Preparing...",
          });
          return next;
        });

        uploadParamsRef.current.set(videoId, params);

        // lastChunkIndex = -1 (no chunk uploaded yet)
        saveSession({
          videoId,
          file: params.file, // File object stored by reference in IDB
          title: params.title,
          description: params.description,
          thumbnailDataUrl: params.thumbnailDataUrl,
          duration: params.duration,
          captions: params.captions,
          userId: params.userId,
          displayName: params.displayName,
          lastChunkIndex: -1,
          totalChunks: _totalChunks,
          createdAt: Date.now(),
        });

        runUpload(videoId, params, newVideo, 0, undefined);
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
