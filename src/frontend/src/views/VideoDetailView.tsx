import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { HttpAgent } from "@icp-sdk/core/agent";
import {
  ArrowLeft,
  Captions,
  Download,
  MessageCircle,
  Send,
  Settings,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadConfig } from "../config";
import { useActor } from "../hooks/useActor";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import type { Comment, Video } from "../types/video";
import { StorageClient } from "../utils/StorageClient";
import { formatTimeAgo, formatViewsShort } from "../utils/format";
import {
  addToHistory,
  incrementViews,
  updateVideo,
} from "../utils/videoStorage";

interface VideoDetailViewProps {
  video: Video;
  onBack: () => void;
  onVideoUpdate: (video: Video) => void;
}

export function VideoDetailView({
  video,
  onBack,
  onVideoUpdate,
}: VideoDetailViewProps) {
  const { identity, loginStatus } = useInternetIdentity();
  const { isFetching } = useActor();
  const isLoggedIn = loginStatus === "success" && !!identity;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [currentVideo, setCurrentVideo] = useState<Video>(video);
  const [showDescription, setShowDescription] = useState(false);
  const userPrincipal = identity?.getPrincipal().toString() ?? "";
  const mountedRef = useRef(false);

  // Load video URL
  useEffect(() => {
    let cancelled = false;
    setLoadingVideo(true);
    setVideoError(false);

    async function loadUrl() {
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
  }, [currentVideo.blobHash, identity, isFetching]);

  // Track history and views once on mount
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    addToHistory(video.id);
    incrementViews(video.id);
    const updated = { ...video, views: video.views + 1 };
    setCurrentVideo(updated);
    onVideoUpdate(updated);
  }, [video, onVideoUpdate]);

  const handleLike = useCallback(() => {
    if (!isLoggedIn) return;
    const likedBy = currentVideo.likedBy ?? [];
    const dislikedBy = currentVideo.dislikedBy ?? [];
    const hasLiked = likedBy.includes(userPrincipal);
    const updated: Video = {
      ...currentVideo,
      likedBy: hasLiked
        ? likedBy.filter((p) => p !== userPrincipal)
        : [...likedBy, userPrincipal],
      dislikedBy: dislikedBy.filter((p) => p !== userPrincipal),
      likes: hasLiked ? currentVideo.likes - 1 : currentVideo.likes + 1,
      dislikes: dislikedBy.includes(userPrincipal)
        ? currentVideo.dislikes - 1
        : currentVideo.dislikes,
    };
    setCurrentVideo(updated);
    updateVideo(updated);
    onVideoUpdate(updated);
  }, [currentVideo, isLoggedIn, userPrincipal, onVideoUpdate]);

  const handleDislike = useCallback(() => {
    if (!isLoggedIn) return;
    const likedBy = currentVideo.likedBy ?? [];
    const dislikedBy = currentVideo.dislikedBy ?? [];
    const hasDisliked = dislikedBy.includes(userPrincipal);
    const updated: Video = {
      ...currentVideo,
      dislikedBy: hasDisliked
        ? dislikedBy.filter((p) => p !== userPrincipal)
        : [...dislikedBy, userPrincipal],
      likedBy: likedBy.filter((p) => p !== userPrincipal),
      dislikes: hasDisliked
        ? currentVideo.dislikes - 1
        : currentVideo.dislikes + 1,
      likes: likedBy.includes(userPrincipal)
        ? currentVideo.likes - 1
        : currentVideo.likes,
    };
    setCurrentVideo(updated);
    updateVideo(updated);
    onVideoUpdate(updated);
  }, [currentVideo, isLoggedIn, userPrincipal, onVideoUpdate]);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}?v=${currentVideo.id}`;
    if (navigator.share) {
      navigator.share({ title: currentVideo.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }, [currentVideo]);

  const handleComment = useCallback(() => {
    if (!commentText.trim() || !isLoggedIn) return;
    const comment: Comment = {
      id: crypto.randomUUID(),
      text: commentText.trim(),
      authorName: `${identity!.getPrincipal().toString().slice(0, 10)}...`,
      authorId: identity!.getPrincipal().toString(),
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
  }, [commentText, isLoggedIn, identity, currentVideo, onVideoUpdate]);

  const hasLiked = (currentVideo.likedBy ?? []).includes(userPrincipal);
  const hasDisliked = (currentVideo.dislikedBy ?? []).includes(userPrincipal);

  return (
    <div className="animate-fade-in pb-20">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          data-ocid="video.back.button"
          onClick={onBack}
          aria-label="Go back"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-ocid="video.settings.button"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
            aria-label="Video settings"
          >
            <Settings
              className="w-5 h-5 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            data-ocid="video.cc.button"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
            aria-label="Closed captions"
          >
            <Captions
              className="w-5 h-5 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        </div>
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
        {videoUrl && !videoError && (
          // biome-ignore lint/a11y/useMediaCaption: captions not available for user-uploaded content
          <video
            data-ocid="video.canvas_target"
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            className="w-full h-full"
            onLoadedData={() => setLoadingVideo(false)}
            onError={() => {
              setVideoError(true);
              setLoadingVideo(false);
            }}
          />
        )}
      </div>

      <div className="px-3 pt-3">
        {/* Title + metadata */}
        <h1 className="text-base font-bold text-foreground leading-snug">
          {currentVideo.title}
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          {currentVideo.creatorName} &middot;{" "}
          {formatViewsShort(currentVideo.views)} views &middot;{" "}
          {formatTimeAgo(currentVideo.createdAt)}
        </p>

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

        {/* Captions */}
        <section data-ocid="video.captions.section">
          <h2 className="text-sm font-semibold text-foreground mb-1">
            Captions
          </h2>
          <p className="text-sm text-muted-foreground">No captions available</p>
        </section>

        <Separator className="my-3 bg-border" />

        {/* Comments */}
        <section data-ocid="video.comments.section">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            Comments ({currentVideo.comments.length})
          </h2>

          {isLoggedIn ? (
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold">
                  {identity!
                    .getPrincipal()
                    .toString()
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
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
                className="text-primary hover:underline"
                onClick={() => {}}
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
