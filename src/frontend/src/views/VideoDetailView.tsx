import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { HttpAgent } from "@icp-sdk/core/agent";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Captions,
  Check,
  ChevronRight,
  Download,
  MessageCircle,
  Send,
  Settings,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { loadConfig } from "../config";
import { useActor } from "../hooks/useActor";
import { useAuth } from "../hooks/useAuth";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { addNotification } from "../hooks/useNotifications";
import { useSettings } from "../hooks/useSettings";
import type { Comment, Video } from "../types/video";
import { StorageClient } from "../utils/StorageClient";
import { formatTimeAgo, formatViewsShort } from "../utils/format";
import { detectNetworkType } from "../utils/networkQuality";
import { isSubscribed, subscribe, unsubscribe } from "../utils/subscriptions";
import {
  addToHistory,
  incrementViews,
  updateVideo,
} from "../utils/videoStorage";
import {
  addToWatchLater,
  isInWatchLater,
  removeFromWatchLater,
} from "../utils/watchLater";
import { getProgress, saveProgress } from "../utils/watchProgress";

interface VideoDetailViewProps {
  video: Video;
  onBack: () => void;
  onVideoUpdate: (video: Video) => void;
  onLoginClick: () => void;
  allVideos?: Video[];
  onVideoSelect?: (video: Video) => void;
  onCreatorClick?: (creatorId: string, creatorName: string) => void;
}

type CueLine = { start: number; end: number; text: string };
type QualityMode = "auto" | "higher" | "datasaver" | "advanced";

function parseSRT(text: string): CueLine[] {
  const blocks = text.trim().split(/\n\n+/);
  return blocks.flatMap((block) => {
    const lines = block.trim().split("\n");
    if (lines.length < 3) return [];
    const timeLine = lines[1];
    const match = timeLine.match(
      /(\d+):(\d+):(\d+)[,.]( \d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/,
    );
    if (!match) return [];
    const toSec = (h: string, m: string, s: string, ms: string) =>
      +h * 3600 + +m * 60 + +s + +ms / 1000;
    return [
      {
        start: toSec(match[1], match[2], match[3], match[4]),
        end: toSec(match[5], match[6], match[7], match[8]),
        text: lines
          .slice(2)
          .join("\n")
          .replace(/<[^>]+>/g, ""),
      },
    ];
  });
}

function parseVTT(text: string): CueLine[] {
  const lines = text.split("\n");
  const cues: CueLine[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const match = line.match(
      /(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+)[,.](\d+)/,
    );
    if (match) {
      const toSec = (m: string, s: string, ms: string) =>
        +m * 60 + +s + +ms / 1000;
      const start = toSec(match[1], match[2], match[3]);
      const end = toSec(match[4], match[5], match[6]);
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i].trim().replace(/<[^>]+>/g, ""));
        i++;
      }
      cues.push({ start, end, text: textLines.join("\n") });
    } else {
      i++;
    }
  }
  return cues;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function VideoDetailView({
  video,
  onBack,
  onVideoUpdate,
  onLoginClick,
  allVideos = [],
  onVideoSelect,
  onCreatorClick,
}: VideoDetailViewProps) {
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const userId = user?.userId ?? "";

  const { identity } = useInternetIdentity();
  const { settings } = useSettings();
  const { actor, isFetching } = useActor();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [currentVideo, setCurrentVideo] = useState<Video>(video);
  const [showDescription, setShowDescription] = useState(false);
  const [subscribed, setSubscribed] = useState(() =>
    isSubscribed(userId, video.creatorId),
  );
  const mountedRef = useRef(false);

  // CC + Settings state
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [showCCMenu, setShowCCMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityMode, setQualityMode] = useState<QualityMode>("auto");
  const [selectedQuality, setSelectedQuality] = useState<string>("Auto");
  const [showAdvancedQuality, setShowAdvancedQuality] = useState(false);
  const [showAllCaptions, setShowAllCaptions] = useState(false);
  const [captionCues, setCaptionCues] = useState<CueLine[]>([]);
  const [currentCueText, setCurrentCueText] = useState<string | null>(null);
  const restoredTimeRef = useRef<number | null>(null);
  const lastSaveRef = useRef<number>(0);

  // Autoplay state
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(
    null,
  );
  const autoplayCancelledRef = useRef(false);
  const autoplayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPlayNextFallback, setShowPlayNextFallback] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadVideoRef = useRef<HTMLVideoElement | null>(null);
  const [activeQuality, setActiveQuality] = useState<
    "sd" | "hd" | "processing"
  >("processing");
  const [showHDToast, setShowHDToast] = useState(false);

  // Suggestions: other ready videos excluding current
  const isProcessing =
    currentVideo.status === "processing" ||
    currentVideo.status === "PROCESSING";

  const suggestions = allVideos
    .filter(
      (v) =>
        v.id !== currentVideo.id &&
        (v.status === "ready" ||
          v.status === "READY" ||
          v.status === "PUBLIC" ||
          v.status === "public"),
    )
    .slice(0, 10);

  const nextVideo = suggestions[0] ?? null;

  // Load video URL
  useEffect(() => {
    let cancelled = false;
    setLoadingVideo(true);
    setVideoError(false);

    async function loadUrl() {
      // --- Processing video: fallback order ---
      if (isProcessing) {
        if (currentVideo.lowQualityUrl) {
          // Play low-quality stream immediately
          if (!cancelled) {
            setVideoUrl(currentVideo.lowQualityUrl);
            setActiveQuality("sd");
            setLoadingVideo(false);
          }
        } else {
          // Show preview frame or placeholder (no stream yet)
          if (!cancelled) {
            setVideoUrl(null);
            setActiveQuality("processing");
            setLoadingVideo(false);
          }
        }
        return;
      }

      // --- Ready video: normal resolution ---
      // If the video already has a direct URL source from the backend, use it
      const directSource = currentVideo.sources?.find(
        (s) => s.quality === "Auto" && s.url,
      );
      if (directSource?.url) {
        if (!cancelled) {
          setVideoUrl(directSource.url);
          setLoadingVideo(false);
        }
        return;
      }

      // Fall back to resolving via blobHash
      if (!currentVideo.blobHash) {
        if (!cancelled) {
          setVideoError(true);
          setLoadingVideo(false);
        }
        return;
      }

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
        const url = await sc.getDirectURL(currentVideo.blobHash);
        if (!cancelled) setVideoUrl(url);
      } catch (e) {
        console.error("Failed to load video URL:", e);
        if (!cancelled) setVideoError(true);
      } finally {
        if (!cancelled) setLoadingVideo(false);
      }
    }

    if (!isFetching) {
      loadUrl();
    }
    return () => {
      cancelled = true;
    };
  }, [
    currentVideo.blobHash,
    currentVideo.sources,
    currentVideo.lowQualityUrl,
    isProcessing,
    identity,
    isFetching,
  ]);

  // Poll for HD readiness when video is processing
  // biome-ignore lint/correctness/useExhaustiveDependencies: polling uses refs and stable callbacks
  useEffect(() => {
    if (!isProcessing || !actor || isFetching) return;

    const switchToHD = (
      hdUrl: string,
      rec: { status: string; videoUrl?: string; blobHash?: string },
    ) => {
      // Clear poll first
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      // Build updated video state
      const updatedVideo: Video = {
        ...currentVideo,
        status: "ready",
        sources: hdUrl
          ? [{ quality: "Auto", url: hdUrl }]
          : currentVideo.sources,
        blobHash: rec.blobHash || currentVideo.blobHash,
      };

      // Seamless src swap: preserve time + play state
      const doSwitch = () => {
        const el = videoRef.current;
        if (el && hdUrl) {
          const currentTime = el.currentTime;
          const wasPaused = el.paused;
          el.src = hdUrl;
          el.currentTime = currentTime;
          if (!wasPaused) {
            el.play().catch(() => {
              /* silent */
            });
          }
        } else if (hdUrl) {
          // No element yet (processing placeholder was showing) — use React state
          setVideoUrl(hdUrl);
        }
        // Update React state to reflect new URL for download link etc.
        setVideoUrl(hdUrl || null);
        setActiveQuality("hd");
        setCurrentVideo(updatedVideo);
        onVideoUpdate(updatedVideo);

        // Show "HD Ready" in-player toast
        setShowHDToast(true);
        setTimeout(() => setShowHDToast(false), 2500);
      };

      if (!hdUrl) {
        // No HD url available yet — just update state
        setCurrentVideo(updatedVideo);
        onVideoUpdate(updatedVideo);
        return;
      }

      // Preload strategy: buffer via hidden element, switch on canplay or 2s timeout
      const preload = document.createElement("video");
      preload.preload = "metadata";
      preload.src = hdUrl;
      preloadVideoRef.current = preload;

      let switched = false;
      const switchOnce = () => {
        if (switched) return;
        switched = true;
        preload.oncanplay = null;
        preload.onerror = null;
        doSwitch();
      };

      const fallbackTimer = setTimeout(switchOnce, 2000);
      preload.oncanplay = () => {
        clearTimeout(fallbackTimer);
        switchOnce();
      };
      preload.onerror = () => {
        clearTimeout(fallbackTimer);
        // HD errored — stay on SD silently
        preloadVideoRef.current = null;
      };
      preload.load();
    };

    pollIntervalRef.current = setInterval(async () => {
      try {
        const rec = await actor.getVideo(currentVideo.id);
        if (!rec) return;
        const newStatus = rec.status;
        const isNowReady =
          newStatus === "ready" ||
          newStatus === "READY" ||
          newStatus === "PUBLIC" ||
          newStatus === "public";
        if (!isNowReady) return;
        const hdUrl = rec.videoUrl || "";
        switchToHD(hdUrl, rec);
      } catch (e) {
        console.warn("[poll] status check failed:", e);
      }
    }, 4000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (preloadVideoRef.current) {
        preloadVideoRef.current.oncanplay = null;
        preloadVideoRef.current.onerror = null;
        preloadVideoRef.current.src = "";
        preloadVideoRef.current = null;
      }
    };
  }, [isProcessing, actor, isFetching, currentVideo.id]);

  // Track history, views, and increment backend view count once on mount
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    addToHistory(video.id);
    incrementViews(video.id);
    const updated = { ...video, views: video.views + 1 };
    setCurrentVideo(updated);
    onVideoUpdate(updated);

    // Increment view in backend (fire-and-forget)
    if (actor) {
      actor
        .incrementViewCount(video.id)
        .catch((e) =>
          console.warn("[view] failed to increment view count:", e),
        );
    }
  }, [video, onVideoUpdate, actor]);

  // Apply playback rate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Load captions when language changes
  useEffect(() => {
    if (!selectedLang || selectedLang === "Off") {
      setCaptionCues([]);
      setCurrentCueText(null);
      return;
    }

    const caption = currentVideo.captions?.find((c) => c.lang === selectedLang);
    if (!caption) return;

    async function loadCaption() {
      if (!caption) return;
      try {
        let text = "";
        if (caption.url.startsWith("local:")) {
          const parts = caption.url.split(":");
          const langKey = parts.slice(2).join(":");
          const videoId = parts[1];
          text =
            localStorage.getItem(`caption_content_${videoId}_${langKey}`) ?? "";
        } else {
          const res = await fetch(caption.url);
          text = await res.text();
        }

        if (!text) return;

        const cues =
          caption.url.includes(".srt") || caption.url.includes("srt")
            ? parseSRT(text)
            : parseVTT(text);
        setCaptionCues(cues);
      } catch (e) {
        console.error("Failed to load caption:", e);
      }
    }

    loadCaption();
  }, [selectedLang, currentVideo.captions]);

  // Auto-select subtitle on video load based on preferences
  useEffect(() => {
    const captions = currentVideo.captions ?? [];
    if (captions.length === 0) {
      setSelectedLang(null);
      return;
    }
    const saved = userId
      ? localStorage.getItem(
          `subpremium_last_subtitle_${userId}_${currentVideo.id}`,
        )
      : null;
    if (saved && captions.some((c) => c.lang === saved)) {
      setSelectedLang(saved);
      return;
    }
    const preferred = settings.preferredLanguages ?? [];
    if (preferred.length > 0) {
      const match = captions.find((c) =>
        preferred.some(
          (p) =>
            c.lang.toLowerCase().includes(p.toLowerCase()) ||
            p.toLowerCase().includes(c.lang.toLowerCase()),
        ),
      );
      if (match) {
        setSelectedLang(match.lang);
        return;
      }
    }
    if (
      settings.subtitleDefaultLanguage &&
      settings.subtitleDefaultLanguage !== "none"
    ) {
      const match = captions.find((c) =>
        c.lang
          .toLowerCase()
          .includes(settings.subtitleDefaultLanguage!.toLowerCase()),
      );
      if (match) {
        setSelectedLang(match.lang);
        return;
      }
    }
    setSelectedLang(null);
  }, [
    currentVideo.id,
    currentVideo.captions,
    userId,
    settings.preferredLanguages,
    settings.subtitleDefaultLanguage,
  ]);

  // Update caption cue on timeupdate
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    function onTimeUpdate() {
      const t = el!.currentTime;
      const cue = captionCues.find((c) => t >= c.start && t <= c.end);
      setCurrentCueText(cue ? cue.text : null);
    }
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [captionCues]);

  // Track watch progress
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !userId) return;
    function onTimeUpdate() {
      if (!el) return;
      const now = Date.now();
      if (now - lastSaveRef.current > 5000) {
        lastSaveRef.current = now;
        saveProgress(
          userId,
          currentVideo.id,
          el.currentTime,
          el.duration || currentVideo.durationSeconds,
        );
      }
    }
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [userId, currentVideo.id, currentVideo.durationSeconds]);

  // Autoplay: start countdown when video ends
  const handleVideoEnded = useCallback(() => {
    // Don't autoplay from a processing video
    if (isProcessing) return;
    if (!nextVideo || !onVideoSelect) {
      setShowPlayNextFallback(true);
      return;
    }
    autoplayCancelledRef.current = false;
    setAutoplayCountdown(5);
  }, [nextVideo, onVideoSelect, isProcessing]);

  // Countdown tick
  useEffect(() => {
    if (autoplayCountdown === null) return;
    if (autoplayCountdown === 0) {
      // play next
      if (!autoplayCancelledRef.current && nextVideo && onVideoSelect) {
        try {
          onVideoSelect(nextVideo);
        } catch {
          setShowPlayNextFallback(true);
        }
      }
      setAutoplayCountdown(null);
      return;
    }
    const timer = setTimeout(() => {
      if (!autoplayCancelledRef.current) {
        setAutoplayCountdown((c) => (c !== null ? c - 1 : null));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [autoplayCountdown, nextVideo, onVideoSelect]);

  const cancelAutoplay = useCallback(() => {
    autoplayCancelledRef.current = true;
    setAutoplayCountdown(null);
    if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
  }, []);

  const playNow = useCallback(() => {
    cancelAutoplay();
    if (nextVideo && onVideoSelect) {
      onVideoSelect(nextVideo);
    }
  }, [nextVideo, onVideoSelect, cancelAutoplay]);

  const selectLang = useCallback(
    (lang: string | null) => {
      setSelectedLang(lang);
      setShowCCMenu(false);
      setShowSettings(false);
      if (userId && lang) {
        localStorage.setItem(
          `subpremium_last_subtitle_${userId}_${currentVideo.id}`,
          lang,
        );
      } else if (userId) {
        localStorage.removeItem(
          `subpremium_last_subtitle_${userId}_${currentVideo.id}`,
        );
      }
    },
    [userId, currentVideo.id],
  );

  const hasCaptions = currentVideo.captions && currentVideo.captions.length > 0;

  // Filtered captions based on user preferred languages
  const preferredLangs = settings.preferredLanguages ?? [];
  const originalCaption = currentVideo.captions?.[0] ?? null;
  const filteredCaptions =
    preferredLangs.length === 0
      ? (currentVideo.captions ?? [])
      : (currentVideo.captions ?? []).filter(
          (c) =>
            c === originalCaption ||
            preferredLangs.some(
              (p) =>
                c.lang.toLowerCase().includes(p.toLowerCase()) ||
                p.toLowerCase().includes(c.lang.toLowerCase()),
            ),
        );
  const hasFilteredMatch = filteredCaptions.length > 1;
  const visibleCaptions = showAllCaptions
    ? (currentVideo.captions ?? [])
    : filteredCaptions;
  const hasSources = currentVideo.sources && currentVideo.sources.length > 0;
  const advancedSources =
    currentVideo.sources?.filter((s) => s.quality?.match(/\d+p/)) ?? [];

  const applyQualityMode = useCallback(
    async (mode: QualityMode, quality?: string) => {
      setQualityMode(mode);
      if (mode === "advanced" && quality) setSelectedQuality(quality);
      setShowSettings(false);
      setShowAdvancedQuality(false);
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(() => {
    if (!currentVideo.sources || currentVideo.sources.length === 0) return;
    const networkType = detectNetworkType();
    let preference: "auto" | "higher" | "datasaver";
    if (networkType === "mobile") {
      preference = settings.videoQualityMobile;
    } else {
      preference = settings.videoQualityWifi;
    }
    if (preference === "auto") return;
    if (preference === "higher") {
      applyQualityMode("higher");
    } else if (preference === "datasaver") {
      applyQualityMode("datasaver");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-load URL when quality changes
  useEffect(() => {
    if (!hasSources) return;
    let cancelled = false;

    // If we already have a direct URL, use it
    const directSource = currentVideo.sources?.find(
      (s) => s.quality === "Auto" && s.url,
    );
    if (directSource?.url) {
      setVideoUrl(directSource.url);
      setLoadingVideo(false);
      return;
    }

    if (!currentVideo.blobHash) return;

    async function reload() {
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
        const url = await sc.getDirectURL(currentVideo.blobHash);
        if (!cancelled) {
          setVideoUrl(url);
          setLoadingVideo(false);
        }
      } catch {
        if (!cancelled) {
          setVideoError(true);
          setLoadingVideo(false);
        }
      }
    }
    reload();
    return () => {
      cancelled = true;
    };
  }, [hasSources, currentVideo.blobHash, currentVideo.sources, identity]);

  const handleSubscribe = useCallback(() => {
    if (!isLoggedIn || !userId) return;
    const next = !subscribed;
    setSubscribed(next);
    if (next) {
      subscribe(userId, currentVideo.creatorId, currentVideo.creatorName);
    } else {
      unsubscribe(userId, currentVideo.creatorId);
    }
  }, [
    subscribed,
    isLoggedIn,
    userId,
    currentVideo.creatorId,
    currentVideo.creatorName,
  ]);

  const handleLike = useCallback(() => {
    if (!isLoggedIn || !userId) return;
    const likedBy = currentVideo.likedBy ?? [];
    const dislikedBy = currentVideo.dislikedBy ?? [];
    const hasLiked = likedBy.includes(userId);
    const updated: Video = {
      ...currentVideo,
      likedBy: hasLiked
        ? likedBy.filter((p) => p !== userId)
        : [...likedBy, userId],
      dislikedBy: dislikedBy.filter((p) => p !== userId),
      likes: hasLiked ? currentVideo.likes - 1 : currentVideo.likes + 1,
      dislikes: dislikedBy.includes(userId)
        ? currentVideo.dislikes - 1
        : currentVideo.dislikes,
    };
    setCurrentVideo(updated);
    updateVideo(updated);
    onVideoUpdate(updated);

    // Backend call (fire-and-forget)
    if (actor) {
      actor
        .toggleLike(currentVideo.id, userId)
        .catch((e) => console.warn("[like] backend call failed:", e));
    }

    if (
      !hasLiked &&
      userId !== currentVideo.creatorId &&
      currentVideo.creatorId
    ) {
      addNotification(currentVideo.creatorId, {
        type: "like",
        title: "New like",
        message: `${
          user?.displayName || user?.email || "Someone"
        } liked your video: "${currentVideo.title}"`,
        videoId: currentVideo.id,
      });
    }
  }, [currentVideo, isLoggedIn, userId, user, onVideoUpdate, actor]);

  const handleDislike = useCallback(() => {
    if (!isLoggedIn || !userId) return;
    const likedBy = currentVideo.likedBy ?? [];
    const dislikedBy = currentVideo.dislikedBy ?? [];
    const hasDisliked = dislikedBy.includes(userId);
    const updated: Video = {
      ...currentVideo,
      dislikedBy: hasDisliked
        ? dislikedBy.filter((p) => p !== userId)
        : [...dislikedBy, userId],
      likedBy: likedBy.filter((p) => p !== userId),
      dislikes: hasDisliked
        ? currentVideo.dislikes - 1
        : currentVideo.dislikes + 1,
      likes: likedBy.includes(userId)
        ? currentVideo.likes - 1
        : currentVideo.likes,
    };
    setCurrentVideo(updated);
    updateVideo(updated);
    onVideoUpdate(updated);

    // Backend call (fire-and-forget)
    if (actor) {
      actor
        .toggleDislike(currentVideo.id, userId)
        .catch((e) => console.warn("[dislike] backend call failed:", e));
    }
  }, [currentVideo, isLoggedIn, userId, onVideoUpdate, actor]);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}?v=${currentVideo.id}`;
    if (navigator.share) {
      navigator.share({ title: currentVideo.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }, [currentVideo]);

  const handleComment = useCallback(() => {
    if (!commentText.trim() || !isLoggedIn || !user) return;
    const comment: Comment = {
      id: crypto.randomUUID(),
      text: commentText.trim(),
      authorName: user.displayName || user.email,
      authorId: user.userId,
      createdAt: Date.now(),
    };
    const updated: Video = {
      ...currentVideo,
      comments: [comment, ...currentVideo.comments],
    };
    setCurrentVideo(updated);
    updateVideo(updated);
    onVideoUpdate(updated);
    setCommentText("");

    // Backend call (fire-and-forget)
    if (actor) {
      actor
        .addComment(currentVideo.id, comment.text, userId)
        .catch((e) => console.warn("[comment] backend call failed:", e));
    }

    if (
      user &&
      user.userId !== currentVideo.creatorId &&
      currentVideo.creatorId
    ) {
      addNotification(currentVideo.creatorId, {
        type: "comment",
        title: "New comment",
        message: `${
          user.displayName || user.email || "Someone"
        } commented on your video: "${currentVideo.title}"`,
        videoId: currentVideo.id,
      });
    }
  }, [
    commentText,
    isLoggedIn,
    user,
    userId,
    currentVideo,
    onVideoUpdate,
    actor,
  ]);

  const hasLiked = (currentVideo.likedBy ?? []).includes(userId);
  const hasDisliked = (currentVideo.dislikedBy ?? []).includes(userId);

  const userInitials = user
    ? (user.displayName || user.email).slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="animate-fade-in pb-20">
      {/* Top bar */}
      <div className="flex items-center px-3 py-2">
        <button
          type="button"
          data-ocid="video.back.button"
          onClick={onBack}
          aria-label="Go back"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* Video player */}
      <div className="relative bg-black aspect-video">
        {loadingVideo && (
          <div
            data-ocid="video.loading_state"
            className="absolute inset-0 flex items-center justify-center bg-black"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">Loading...</span>
            </div>
          </div>
        )}
        {videoError && (
          <div
            data-ocid="video.error_state"
            className="absolute inset-0 flex items-center justify-center bg-black"
          >
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Failed to load video
              </p>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  setVideoError(false);
                  setLoadingVideo(true);
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}
        {/* Processing placeholder overlay (no stream available) */}
        {isProcessing && !videoUrl && !loadingVideo && (
          <div
            data-ocid="video.processing_state"
            className="absolute inset-0 flex flex-col items-center justify-center bg-black"
            style={
              currentVideo.thumbnailDataUrl
                ? {
                    backgroundImage: `url(${currentVideo.thumbnailDataUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            <div className="absolute inset-0 bg-black/60" />
            <div className="relative z-10 flex flex-col items-center gap-3 text-center px-6">
              <div className="w-12 h-12 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <p className="text-white text-base font-semibold">
                Processing video...
              </p>
              <p className="text-white/60 text-sm">HD ready soon</p>
            </div>
          </div>
        )}
        {videoUrl && !videoError && (
          // biome-ignore lint/a11y/useMediaCaption: captions handled via custom overlay
          <video
            data-ocid="video.canvas_target"
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            className="w-full h-full"
            onLoadedData={() => {
              setLoadingVideo(false);
              const saved = getProgress(userId, currentVideo.id);
              const restoreTime =
                restoredTimeRef.current !== null
                  ? restoredTimeRef.current
                  : saved && saved.progressTime > 5
                    ? saved.progressTime
                    : null;
              if (restoreTime !== null && videoRef.current) {
                videoRef.current.currentTime = restoreTime;
              }
              restoredTimeRef.current = null;
              if (videoRef.current) {
                videoRef.current.playbackRate = playbackRate;
              }
            }}
            onError={() => {
              setVideoError(true);
              setLoadingVideo(false);
            }}
            onEnded={handleVideoEnded}
          />
        )}

        {/* Quality badge — top-left of player */}
        {(activeQuality === "sd" || activeQuality === "hd") && (
          <div
            className={`absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest select-none transition-all duration-300 ${
              activeQuality === "hd"
                ? "bg-blue-500/90 text-white shadow-lg shadow-blue-500/30"
                : "bg-black/60 text-white/70"
            }`}
          >
            {activeQuality === "hd" ? "HD" : "SD"}
          </div>
        )}

        {/* "HD ready soon" spinner badge while SD is playing */}
        {isProcessing && videoUrl && activeQuality === "sd" && (
          <div className="absolute bottom-12 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-black/70 backdrop-blur-sm rounded-full">
            <div className="w-2 h-2 border border-white/40 border-t-white rounded-full animate-spin" />
            <span className="text-white text-[10px] font-semibold">
              HD ready soon
            </span>
          </div>
        )}

        {/* In-player "HD Ready" toast — fades in then out */}
        <div
          aria-live="polite"
          className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-500 ${
            showHDToast ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-600/90 backdrop-blur-sm rounded-full shadow-xl">
            <span className="text-white text-sm font-semibold tracking-wide">
              ✦ HD Ready
            </span>
          </div>
        </div>
        {/* CC + Settings overlay */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          <button
            type="button"
            data-ocid="video.cc.button"
            onClick={() => setShowCCMenu(true)}
            aria-label="Closed captions"
            className={`w-8 h-8 flex items-center justify-center rounded bg-black/60 hover:bg-black/80 transition-colors ${
              selectedLang ? "text-primary" : "text-white/70 hover:text-white"
            }`}
          >
            <Captions className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-ocid="video.settings.button"
            onClick={() => setShowSettings(true)}
            aria-label="Video settings"
            className="w-8 h-8 flex items-center justify-center rounded bg-black/60 hover:bg-black/80 transition-colors text-white"
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Caption overlay */}
        {currentCueText && (
          <div className="absolute bottom-8 left-0 right-0 flex justify-center px-4 pointer-events-none z-10">
            <div className="bg-black/75 text-white text-sm px-3 py-1 rounded text-center max-w-[90%] leading-relaxed whitespace-pre-line">
              {currentCueText}
            </div>
          </div>
        )}

        {/* Autoplay overlay */}
        {autoplayCountdown !== null && nextVideo && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80">
            <div className="flex flex-col items-center gap-4 text-white text-center px-6">
              {/* Countdown ring */}
              <div className="relative w-16 h-16">
                <svg
                  className="w-16 h-16 -rotate-90"
                  viewBox="0 0 64 64"
                  role="img"
                  aria-label="Autoplay countdown"
                >
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="4"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="white"
                    strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${
                      2 * Math.PI * 28 * (1 - autoplayCountdown / 5)
                    }`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.9s linear" }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">
                  {autoplayCountdown}
                </span>
              </div>
              <p className="text-base font-semibold">
                Next video in {autoplayCountdown}s
              </p>
              {nextVideo.thumbnailDataUrl && (
                <img
                  src={nextVideo.thumbnailDataUrl}
                  alt={nextVideo.title}
                  className="w-40 h-24 object-cover rounded-lg opacity-80"
                />
              )}
              <p className="text-sm text-white/70 max-w-[200px] line-clamp-2">
                {nextVideo.title}
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={playNow}
                  className="px-5 py-2 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
                >
                  Play Now
                </button>
                <button
                  type="button"
                  onClick={cancelAutoplay}
                  className="px-5 py-2 rounded-full border border-white/50 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fallback: play next button if autoplay failed */}
      {showPlayNextFallback && nextVideo && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setShowPlayNextFallback(false);
              onVideoSelect?.(nextVideo);
            }}
            className="px-5 py-2 rounded-full bg-black/70 text-white text-sm font-semibold hover:bg-black/90 transition-colors"
          >
            ▶ Play next video
          </button>
        </div>
      )}

      {/* CC Language Selector Sheet */}
      <Sheet
        open={showCCMenu}
        onOpenChange={(open) => {
          setShowCCMenu(open);
          if (!open) setShowAllCaptions(false);
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl bg-background border-border px-0 pb-8"
        >
          <SheetHeader className="px-4 pb-2">
            <SheetTitle className="text-base">Subtitles</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col">
            {!hasCaptions ? (
              <>
                <CCLangOption
                  label="Off"
                  active={true}
                  onClick={() => selectLang(null)}
                />
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  No captions available for this video.
                </p>
              </>
            ) : (
              <>
                <CCLangOption
                  label="Off"
                  active={!selectedLang}
                  onClick={() => selectLang(null)}
                />
                {originalCaption && (
                  <CCLangOption
                    label={`${originalCaption.lang} (Original)`}
                    active={selectedLang === originalCaption.lang}
                    onClick={() => selectLang(originalCaption.lang)}
                  />
                )}
                {visibleCaptions
                  .filter((c) => c !== originalCaption)
                  .map((c) => (
                    <CCLangOption
                      key={c.lang}
                      label={c.lang}
                      active={selectedLang === c.lang}
                      onClick={() => selectLang(c.lang)}
                    />
                  ))}
                {preferredLangs.length > 0 &&
                  !hasFilteredMatch &&
                  !showAllCaptions && (
                    <div className="px-4 py-3 text-sm text-muted-foreground">
                      No subtitles in your language.
                      <button
                        type="button"
                        className="ml-2 text-primary underline text-sm"
                        onClick={() => setShowAllCaptions(true)}
                      >
                        Show all
                      </button>
                    </div>
                  )}
                {preferredLangs.length > 0 && showAllCaptions && (
                  <button
                    type="button"
                    className="px-4 py-2 text-sm text-primary underline text-left"
                    onClick={() => setShowAllCaptions(false)}
                  >
                    Show less
                  </button>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Settings Sheet */}
      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl bg-background border-border px-0 pb-8"
        >
          <SheetHeader className="px-4 pb-2">
            <SheetTitle className="text-base">Settings</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-0">
            {/* Playback Speed */}
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Playback Speed
              </p>
              <div className="flex gap-2 flex-wrap">
                {SPEEDS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      setPlaybackRate(rate);
                      if (videoRef.current)
                        videoRef.current.playbackRate = rate;
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      playbackRate === rate
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {rate === 1 ? "1x (Default)" : `${rate}x`}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            {hasSources && (
              <>
                <Separator className="bg-border" />
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Video Quality
                  </p>
                  <div className="flex flex-col gap-0">
                    <QualityRow
                      label="Auto (recommended)"
                      description="Adjusts based on your network"
                      active={qualityMode === "auto"}
                      onClick={() => applyQualityMode("auto")}
                    />
                    <QualityRow
                      label="Higher quality"
                      description="Best resolution, uses more data"
                      active={qualityMode === "higher"}
                      onClick={() => applyQualityMode("higher")}
                    />
                    <QualityRow
                      label="Data saver"
                      description="Lower resolution, saves data"
                      active={qualityMode === "datasaver"}
                      onClick={() => applyQualityMode("datasaver")}
                    />
                    {advancedSources.length > 0 && (
                      <>
                        <button
                          type="button"
                          data-ocid="video.quality.advanced.toggle"
                          onClick={() => {
                            setShowAdvancedQuality((p) => !p);
                            if (qualityMode !== "advanced")
                              setQualityMode("advanced");
                          }}
                          className={`w-full py-2.5 text-left flex items-center justify-between transition-colors hover:text-primary ${
                            qualityMode === "advanced"
                              ? "text-primary"
                              : "text-foreground"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              Advanced
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Choose exact resolution
                            </span>
                          </div>
                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${
                              showAdvancedQuality ? "rotate-90" : ""
                            }`}
                            aria-hidden="true"
                          />
                        </button>

                        {showAdvancedQuality && (
                          <div className="pl-4 flex flex-col gap-0 border-l-2 border-border ml-1">
                            {advancedSources.map((src) => (
                              <button
                                key={src.quality}
                                type="button"
                                data-ocid={`video.quality.${src.quality}.button`}
                                onClick={() =>
                                  applyQualityMode("advanced", src.quality)
                                }
                                className={`w-full py-2 text-left text-sm flex items-center justify-between transition-colors hover:text-primary ${
                                  qualityMode === "advanced" &&
                                  selectedQuality === src.quality
                                    ? "text-primary font-semibold"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {src.quality}
                                {qualityMode === "advanced" &&
                                  selectedQuality === src.quality && (
                                    <Check
                                      className="w-3.5 h-3.5"
                                      aria-hidden="true"
                                    />
                                  )}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Captions */}
            {hasCaptions && (
              <>
                <Separator className="bg-border" />
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Captions
                  </p>
                  <div className="flex flex-col gap-0">
                    <SettingsLangOption
                      label="Off"
                      active={!selectedLang}
                      onClick={() => selectLang(null)}
                    />
                    {originalCaption && (
                      <SettingsLangOption
                        label={`${originalCaption.lang} (Original)`}
                        active={selectedLang === originalCaption.lang}
                        onClick={() => selectLang(originalCaption.lang)}
                      />
                    )}
                    {visibleCaptions
                      .filter((c) => c !== originalCaption)
                      .map((c) => (
                        <SettingsLangOption
                          key={c.lang}
                          label={c.lang}
                          active={selectedLang === c.lang}
                          onClick={() => selectLang(c.lang)}
                        />
                      ))}
                    {preferredLangs.length > 0 &&
                      !hasFilteredMatch &&
                      !showAllCaptions && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No subtitles in your language.
                          <button
                            type="button"
                            className="ml-2 text-primary underline text-sm"
                            onClick={() => setShowAllCaptions(true)}
                          >
                            Show all
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <div className="px-3 pt-3">
        {/* Title + metadata */}
        <h1 className="text-base font-bold text-foreground leading-snug">
          {currentVideo.title}
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          {formatViewsShort(currentVideo.views)} views &middot;{" "}
          {formatTimeAgo(currentVideo.createdAt)}
        </p>

        {/* Channel row */}
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            data-ocid="video.creator.button"
            onClick={() =>
              onCreatorClick?.(currentVideo.creatorId, currentVideo.creatorName)
            }
            className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0 hover:ring-2 hover:ring-primary/40 transition-all"
            aria-label={`View ${currentVideo.creatorName}'s profile`}
          >
            <span className="text-xs font-bold">
              {currentVideo.creatorName.slice(0, 2).toUpperCase()}
            </span>
          </button>
          <button
            type="button"
            data-ocid="video.creator.link"
            onClick={() =>
              onCreatorClick?.(currentVideo.creatorId, currentVideo.creatorName)
            }
            className="text-sm font-semibold flex-1 truncate text-left hover:text-primary transition-colors"
          >
            {currentVideo.creatorName}
          </button>
          <Button
            data-ocid="video.subscribe.button"
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSubscribe}
            className={subscribed ? "text-muted-foreground border-muted" : ""}
          >
            {subscribed ? "Subscribed" : "Subscribe"}
          </Button>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between mt-4 py-1">
          <ActionBtn
            data-ocid="video.like.button"
            icon={
              <ThumbsUp
                className={`w-5 h-5 ${hasLiked ? "fill-primary text-primary" : ""}`}
                aria-hidden="true"
              />
            }
            label={String(currentVideo.likes)}
            onClick={handleLike}
            active={hasLiked}
          />
          <ActionBtn
            data-ocid="video.dislike.button"
            icon={
              <ThumbsDown
                className={`w-5 h-5 ${hasDisliked ? "fill-primary text-primary" : ""}`}
                aria-hidden="true"
              />
            }
            label={String(currentVideo.dislikes)}
            onClick={handleDislike}
            active={hasDisliked}
          />
          <ActionBtn
            data-ocid="video.share.button"
            icon={<Share2 className="w-5 h-5" aria-hidden="true" />}
            label="Share"
            onClick={handleShare}
          />
          {videoUrl && (
            <a
              data-ocid="video.download.button"
              href={videoUrl}
              download={currentVideo.title}
              className="flex flex-col items-center gap-1 px-2 hover:text-primary transition-colors"
            >
              <Download className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] text-muted-foreground">
                Download
              </span>
            </a>
          )}
        </div>

        <Separator className="my-3 bg-border" />

        {/* Description */}
        <section data-ocid="video.description.section">
          <h2 className="text-sm font-semibold text-foreground mb-1">
            Description
          </h2>
          {currentVideo.description ? (
            <div>
              <p
                className={`text-sm text-muted-foreground leading-relaxed ${
                  !showDescription ? "line-clamp-3" : ""
                }`}
              >
                {currentVideo.description}
              </p>
              {currentVideo.description.length > 120 && (
                <button
                  type="button"
                  onClick={() => setShowDescription((p) => !p)}
                  className="text-xs text-primary mt-1"
                >
                  {showDescription ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No description</p>
          )}
        </section>

        <Separator className="my-3 bg-border" />

        {/* Captions info */}
        <section data-ocid="video.captions.section">
          <h2 className="text-sm font-semibold text-foreground mb-1">
            Captions
          </h2>
          {hasCaptions ? (
            <div className="flex flex-wrap gap-2">
              {visibleCaptions.map((c) => (
                <button
                  key={c.lang}
                  type="button"
                  onClick={() => setSelectedLang(c.lang)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selectedLang === c.lang
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.lang}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No captions available
            </p>
          )}
        </section>

        <Separator className="my-3 bg-border" />

        {/* Suggested Videos */}
        {suggestions.length > 0 && (
          <section data-ocid="video.suggestions.section">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              Up Next
            </h2>
            <div className="flex flex-col gap-3">
              {suggestions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onVideoSelect?.(v)}
                  className="flex gap-3 items-start text-left hover:bg-secondary/50 rounded-lg p-1.5 -mx-1.5 transition-colors w-full"
                >
                  {/* Thumbnail */}
                  <div className="relative w-28 h-16 rounded-lg bg-secondary shrink-0 overflow-hidden">
                    {v.thumbnailDataUrl ? (
                      <img
                        src={v.thumbnailDataUrl}
                        alt={v.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground">
                          No thumb
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
                      {v.title}
                    </p>
                    <button
                      type="button"
                      data-ocid="video.suggestions.creator.button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreatorClick?.(v.creatorId, v.creatorName);
                      }}
                      className="text-xs text-muted-foreground mt-1 hover:text-primary hover:underline underline-offset-2 transition-colors text-left"
                    >
                      {v.creatorName}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {formatViewsShort(v.views)} views
                    </p>
                  </div>
                  {/* Save to Watch Later */}
                  <button
                    type="button"
                    data-ocid="video.suggestions.toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!userId) {
                        toast("Login to save videos");
                        return;
                      }
                      if (isInWatchLater(userId, v.id)) {
                        removeFromWatchLater(userId, v.id);
                        toast("Removed from Watch Later");
                      } else {
                        addToWatchLater(userId, v.id);
                        toast("Saved to Watch Later");
                      }
                    }}
                    className="p-1.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    aria-label="Save to Watch Later"
                  >
                    {userId && isInWatchLater(userId, v.id) ? (
                      <BookmarkCheck className="w-4 h-4 text-primary" />
                    ) : (
                      <Bookmark className="w-4 h-4" />
                    )}
                  </button>
                </button>
              ))}
            </div>
            <Separator className="my-3 bg-border" />
          </section>
        )}

        {/* Comments */}
        <section data-ocid="video.comments.section">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            Comments ({currentVideo.comments.length})
          </h2>

          {isLoggedIn ? (
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold">{userInitials}</span>
              </div>
              <Input
                data-ocid="video.comment.input"
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleComment()}
                className="flex-1 h-8 text-sm bg-secondary border-0 rounded-full px-4 focus-visible:ring-1 focus-visible:ring-primary"
              />
              <Button
                data-ocid="video.comment.submit_button"
                type="button"
                size="sm"
                onClick={handleComment}
                disabled={!commentText.trim()}
                className="w-8 h-8 p-0 rounded-full bg-primary text-white"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mb-4">
              <button
                type="button"
                data-ocid="video.login.button"
                className="text-primary hover:underline"
                onClick={onLoginClick}
              >
                Login
              </button>{" "}
              to comment
            </p>
          )}

          {currentVideo.comments.length === 0 ? (
            <div
              data-ocid="video.comments.empty_state"
              className="py-4 text-center"
            >
              <p className="text-sm text-muted-foreground">
                No comments yet. Be the first!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {currentVideo.comments.map((comment, i) => (
                <div
                  key={comment.id}
                  data-ocid={`video.comments.item.${i + 1}`}
                  className="flex gap-2"
                >
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold">
                      {comment.authorName.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      {comment.authorName}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                      {comment.text}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatTimeAgo(comment.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CCLangOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-4 py-3 text-left text-sm flex items-center justify-between transition-colors hover:bg-secondary ${
        active ? "text-primary font-semibold" : "text-foreground"
      }`}
    >
      {label}
      {active && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
    </button>
  );
}

function SettingsLangOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full py-2 text-left text-sm flex items-center justify-between transition-colors hover:text-primary ${
        active ? "text-primary font-semibold" : "text-muted-foreground"
      }`}
    >
      {label}
      {active && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
    </button>
  );
}

function QualityRow({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full py-2.5 text-left flex items-center justify-between transition-colors hover:text-primary ${
        active ? "text-primary" : "text-foreground"
      }`}
    >
      <div className="flex flex-col">
        <span className={`text-sm ${active ? "font-semibold" : "font-medium"}`}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      {active && (
        <Check className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  active,
  "data-ocid": ocid,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  "data-ocid"?: string;
}) {
  return (
    <button
      type="button"
      data-ocid={ocid}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2 transition-colors hover:text-primary ${
        active ? "text-primary" : "text-foreground"
      }`}
    >
      {icon}
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  );
}
