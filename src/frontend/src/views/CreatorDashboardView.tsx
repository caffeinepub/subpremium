import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  DollarSign,
  Heart,
  Image,
  ListVideo,
  MessageCircle,
  Plus,
  Share2,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Video as VideoType } from "../types/video";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Playlist {
  id: string;
  name: string;
  videoIds: string[];
  isDefault: boolean;
}

interface CommunityPost {
  id: string;
  userId: string;
  username: string;
  type: "image" | "repost";
  imageDataUrl?: string;
  repostedVideoId?: string;
  repostedVideoTitle?: string;
  repostedVideoThumb?: string;
  caption: string;
  createdAt: number;
  likes: string[];
  comments: Array<{
    id: string;
    userId: string;
    username: string;
    text: string;
    createdAt: number;
  }>;
}

interface CreatorDashboardViewProps {
  userId: string;
  username: string;
  allVideos: VideoType[];
  onBack: () => void;
  onVideoClick: (video: VideoType) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function relativeTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function loadPlaylists(userId: string): Playlist[] {
  try {
    const raw = localStorage.getItem(`playlists_${userId}`);
    if (raw) return JSON.parse(raw) as Playlist[];
  } catch {}
  return [
    { id: "watch-later", name: "Watch Later", videoIds: [], isDefault: true },
    { id: "favorites", name: "Favorites", videoIds: [], isDefault: true },
  ];
}

function savePlaylists(userId: string, playlists: Playlist[]) {
  localStorage.setItem(`playlists_${userId}`, JSON.stringify(playlists));
}

function loadPosts(): CommunityPost[] {
  try {
    const raw = localStorage.getItem("community_posts_global");
    if (raw) return JSON.parse(raw) as CommunityPost[];
  } catch {}
  return [];
}

function savePosts(posts: CommunityPost[]) {
  localStorage.setItem("community_posts_global", JSON.stringify(posts));
}

// ─── Videos Tab ──────────────────────────────────────────────────────────────

function VideosTab({
  userVideos,
  onVideoClick,
}: {
  userVideos: VideoType[];
  onVideoClick: (v: VideoType) => void;
}) {
  if (userVideos.length === 0) {
    return (
      <div
        data-ocid="creator_dashboard.videos.empty_state"
        className="flex flex-col items-center justify-center py-20 gap-3 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
          <Video className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-base font-semibold">No uploads yet</p>
        <p className="text-sm text-muted-foreground">
          Your videos will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 pt-3">
      {userVideos.map((v, i) => (
        <button
          key={v.id}
          type="button"
          data-ocid={`creator_dashboard.videos.item.${i + 1}`}
          onClick={() => onVideoClick(v)}
          className="flex flex-col text-left bg-card rounded-xl overflow-hidden border border-border hover:border-primary/40 transition-colors"
        >
          <div className="relative w-full aspect-video bg-secondary">
            {v.thumbnailDataUrl ? (
              <img
                src={v.thumbnailDataUrl}
                alt={v.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Video className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="p-2">
            <p className="text-xs font-medium line-clamp-2 leading-tight">
              {v.title}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNum(v.views)} views
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Playlists Tab ────────────────────────────────────────────────────────────

function PlaylistsTab({
  userId,
  userVideos,
}: {
  userId: string;
  userVideos: VideoType[];
}) {
  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    loadPlaylists(userId),
  );
  const [newName, setNewName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function create() {
    const name = newName.trim();
    if (!name) return;
    const next: Playlist[] = [
      ...playlists,
      { id: `pl_${Date.now()}`, name, videoIds: [], isDefault: false },
    ];
    setPlaylists(next);
    savePlaylists(userId, next);
    setNewName("");
  }

  function deletePlaylist(id: string) {
    const next = playlists.filter((p) => p.id !== id);
    setPlaylists(next);
    savePlaylists(userId, next);
  }

  function toggleVideo(playlistId: string, videoId: string) {
    const next = playlists.map((p) => {
      if (p.id !== playlistId) return p;
      const has = p.videoIds.includes(videoId);
      return {
        ...p,
        videoIds: has
          ? p.videoIds.filter((id) => id !== videoId)
          : [...p.videoIds, videoId],
      };
    });
    setPlaylists(next);
    savePlaylists(userId, next);
  }

  return (
    <div className="pt-3 space-y-3">
      {/* Create */}
      <div className="flex gap-2">
        <Input
          data-ocid="creator_dashboard.playlists.input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New playlist name..."
          className="h-9 text-sm bg-secondary border-border"
        />
        <Button
          data-ocid="creator_dashboard.playlists.primary_button"
          size="sm"
          onClick={create}
          disabled={!newName.trim()}
          className="h-9 px-3 shrink-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* List */}
      {playlists.map((pl) => (
        <div
          key={pl.id}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <button
            type="button"
            data-ocid="creator_dashboard.playlists.panel"
            onClick={() => setExpandedId(expandedId === pl.id ? null : pl.id)}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-secondary/40 transition-colors text-left"
          >
            <ListVideo className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{pl.name}</p>
              <p className="text-xs text-muted-foreground">
                {pl.videoIds.length} videos
              </p>
            </div>
            {!pl.isDefault && (
              <button
                type="button"
                data-ocid="creator_dashboard.playlists.delete_button"
                onClick={(e) => {
                  e.stopPropagation();
                  deletePlaylist(pl.id);
                }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </button>

          {expandedId === pl.id && userVideos.length > 0 && (
            <div className="border-t border-border">
              {userVideos.map((v) => {
                const added = pl.videoIds.includes(v.id);
                return (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-2">
                    <div className="w-12 h-8 rounded bg-secondary overflow-hidden shrink-0">
                      {v.thumbnailDataUrl ? (
                        <img
                          src={v.thumbnailDataUrl}
                          alt={v.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-3 h-3 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="flex-1 text-xs truncate">{v.title}</p>
                    <button
                      type="button"
                      onClick={() => toggleVideo(pl.id, v.id)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${
                        added
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                      }`}
                    >
                      {added ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Community Tab ────────────────────────────────────────────────────────────

function CommunityTab({
  userId,
  username,
  userVideos,
}: {
  userId: string;
  username: string;
  userVideos: VideoType[];
}) {
  const [posts, setPosts] = useState<CommunityPost[]>(() => loadPosts());
  const [postType, setPostType] = useState<"image" | "repost">("image");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [repostVideoId, setRepostVideoId] = useState("");
  const [caption, setCaption] = useState("");
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>(
    {},
  );
  const [expandedComments, setExpandedComments] = useState<
    Record<string, boolean>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function submitPost() {
    if (postType === "image" && !imageDataUrl) return;
    if (postType === "repost" && !repostVideoId) return;

    const repostedVideo = userVideos.find((v) => v.id === repostVideoId);
    const newPost: CommunityPost = {
      id: `post_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId,
      username: username || "Creator",
      type: postType,
      imageDataUrl: postType === "image" ? imageDataUrl : undefined,
      repostedVideoId: postType === "repost" ? repostVideoId : undefined,
      repostedVideoTitle: repostedVideo?.title,
      repostedVideoThumb: repostedVideo?.thumbnailDataUrl,
      caption,
      createdAt: Date.now(),
      likes: [],
      comments: [],
    };

    const next = [newPost, ...posts];
    setPosts(next);
    savePosts(next);
    setImageDataUrl("");
    setRepostVideoId("");
    setCaption("");
  }

  function toggleLike(postId: string) {
    const next = posts.map((p) => {
      if (p.id !== postId) return p;
      const liked = p.likes.includes(userId);
      return {
        ...p,
        likes: liked
          ? p.likes.filter((id) => id !== userId)
          : [...p.likes, userId],
      };
    });
    setPosts(next);
    savePosts(next);
  }

  function addComment(postId: string) {
    const text = (commentInputs[postId] ?? "").trim();
    if (!text) return;
    const next = posts.map((p) => {
      if (p.id !== postId) return p;
      return {
        ...p,
        comments: [
          ...p.comments,
          {
            id: `c_${Date.now()}`,
            userId,
            username: username || "You",
            text,
            createdAt: Date.now(),
          },
        ],
      };
    });
    setPosts(next);
    savePosts(next);
    setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
  }

  return (
    <div className="pt-3 space-y-4">
      {/* Post form */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        {/* Toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            data-ocid="creator_dashboard.community.tab"
            onClick={() => setPostType("image")}
            className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium transition-colors ${
              postType === "image"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Image className="w-4 h-4" />
            Post Image
          </button>
          <button
            type="button"
            onClick={() => setPostType("repost")}
            className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium transition-colors ${
              postType === "repost"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Share2 className="w-4 h-4" />
            Repost Video
          </button>
        </div>

        {/* Image picker */}
        {postType === "image" && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            {imageDataUrl ? (
              <div className="relative">
                <img
                  src={imageDataUrl}
                  alt="Preview"
                  className="w-full rounded-lg object-cover max-h-48"
                />
                <button
                  type="button"
                  onClick={() => setImageDataUrl("")}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-xs"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-ocid="creator_dashboard.community.upload_button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              >
                <Image className="w-6 h-6" />
                <span className="text-xs">Tap to select image</span>
              </button>
            )}
          </div>
        )}

        {/* Video repost picker */}
        {postType === "repost" && (
          <select
            data-ocid="creator_dashboard.community.select"
            value={repostVideoId}
            onChange={(e) => setRepostVideoId(e.target.value)}
            className="w-full h-9 rounded-lg bg-secondary border border-border text-sm px-3 text-foreground"
          >
            <option value="">Select a video to repost...</option>
            {userVideos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        )}

        {/* Caption */}
        <Textarea
          data-ocid="creator_dashboard.community.textarea"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write a caption..."
          className="resize-none text-sm bg-secondary border-border min-h-[72px]"
        />

        <Button
          data-ocid="creator_dashboard.community.submit_button"
          onClick={submitPost}
          disabled={postType === "image" ? !imageDataUrl : !repostVideoId}
          className="w-full h-9"
          size="sm"
        >
          Post
        </Button>
      </div>

      {/* Feed */}
      {posts.length === 0 ? (
        <div
          data-ocid="creator_dashboard.community.empty_state"
          className="flex flex-col items-center justify-center py-12 gap-3 text-center"
        >
          <Users className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No community posts yet
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post, i) => {
            const liked = post.likes.includes(userId);
            const showComments = expandedComments[post.id];
            return (
              <div
                key={post.id}
                data-ocid={`creator_dashboard.community.item.${i + 1}`}
                className="bg-card rounded-xl border border-border overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">
                      {(post.username || "?")[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">@{post.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {relativeTime(post.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Media */}
                {post.type === "image" && post.imageDataUrl && (
                  <img
                    src={post.imageDataUrl}
                    alt="Post"
                    className="w-full object-cover max-h-64"
                  />
                )}
                {post.type === "repost" && post.repostedVideoThumb && (
                  <div className="relative">
                    <img
                      src={post.repostedVideoThumb}
                      alt={post.repostedVideoTitle}
                      className="w-full object-cover max-h-48"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/70 rounded-lg px-2 py-1">
                      <p className="text-xs text-white font-medium line-clamp-1">
                        {post.repostedVideoTitle}
                      </p>
                    </div>
                  </div>
                )}

                {/* Caption */}
                {post.caption && (
                  <p className="px-4 pt-3 pb-1 text-sm">{post.caption}</p>
                )}

                <Separator className="mx-4 my-2" />

                {/* Actions */}
                <div className="flex items-center gap-4 px-4 pb-3">
                  <button
                    type="button"
                    data-ocid="creator_dashboard.community.toggle"
                    onClick={() => toggleLike(post.id)}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${
                      liked
                        ? "text-red-400"
                        : "text-muted-foreground hover:text-red-400"
                    }`}
                  >
                    <Heart
                      className={`w-4 h-4 ${liked ? "fill-red-400" : ""}`}
                    />
                    <span>{post.likes.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedComments((prev) => ({
                        ...prev,
                        [post.id]: !prev[post.id],
                      }))
                    }
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{post.comments.length}</span>
                  </button>
                </div>

                {/* Comments */}
                {showComments && (
                  <div className="border-t border-border px-4 pb-3 pt-3 space-y-2">
                    {post.comments.map((c) => (
                      <div key={c.id} className="flex gap-2">
                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold">
                            {(c.username || "?")[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold">@{c.username}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.text}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <Input
                        data-ocid="creator_dashboard.community.input"
                        value={commentInputs[post.id] ?? ""}
                        onChange={(e) =>
                          setCommentInputs((prev) => ({
                            ...prev,
                            [post.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) =>
                          e.key === "Enter" && addComment(post.id)
                        }
                        placeholder="Add a comment..."
                        className="h-8 text-xs bg-secondary border-border"
                      />
                      <Button
                        size="sm"
                        onClick={() => addComment(post.id)}
                        disabled={!(commentInputs[post.id] ?? "").trim()}
                        className="h-8 px-3 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Earnings Tab ─────────────────────────────────────────────────────────────

function EarningsTab({ userVideos }: { userVideos: VideoType[] }) {
  const totalViews = userVideos.reduce((sum, v) => sum + v.views, 0);
  const estimated = totalViews * 0.001;

  return (
    <div className="pt-3 space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div
          data-ocid="creator_dashboard.earnings.card"
          className="bg-card rounded-xl border border-border p-4 text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-2">
            <Video className="w-5 h-5 text-primary" />
          </div>
          <p className="text-2xl font-bold">{formatNum(totalViews)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total Views</p>
        </div>
        <div
          data-ocid="creator_dashboard.earnings.card"
          className="bg-card rounded-xl border border-border p-4 text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center mx-auto mb-2">
            <DollarSign className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold">${estimated.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Est. Earnings</p>
        </div>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Earnings are estimated at $0.001 per view
      </p>

      {/* Breakdown */}
      {userVideos.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Breakdown
          </p>
          {userVideos.map((v, i) => (
            <div key={v.id}>
              {i > 0 && <Separator className="mx-4" />}
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-7 rounded bg-secondary overflow-hidden shrink-0">
                  {v.thumbnailDataUrl ? (
                    <img
                      src={v.thumbnailDataUrl}
                      alt={v.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <p className="flex-1 text-xs truncate">{v.title}</p>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold">
                    {formatNum(v.views)} views
                  </p>
                  <p className="text-xs text-green-400">
                    ${(v.views * 0.001).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {userVideos.length === 0 && (
        <div
          data-ocid="creator_dashboard.earnings.empty_state"
          className="flex flex-col items-center justify-center py-12 gap-3 text-center"
        >
          <DollarSign className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Upload videos to start earning
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function CreatorDashboardView({
  userId,
  username,
  allVideos,
  onBack,
  onVideoClick,
}: CreatorDashboardViewProps) {
  const userVideos = allVideos.filter(
    (v) => v.creatorId === userId && v.status === "ready",
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-3 py-3 max-w-md mx-auto">
          <button
            type="button"
            data-ocid="creator_dashboard.close_button"
            onClick={onBack}
            aria-label="Go back"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              role="img"
              aria-label="Back"
            >
              <path
                d="M19 12H5M12 5l-7 7 7 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h1 className="text-base font-bold">Creator Dashboard</h1>
        </div>
      </header>

      {/* Content */}
      <div
        className="max-w-md mx-auto px-3 pb-24"
        style={{ paddingTop: "60px" }}
      >
        <Tabs defaultValue="videos" className="w-full">
          <TabsList
            data-ocid="creator_dashboard.tabs.tab"
            className="w-full grid grid-cols-4 sticky top-[60px] z-40 bg-background border-b border-border rounded-none h-10 mt-1"
          >
            <TabsTrigger
              value="videos"
              className="text-xs gap-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <Video className="w-3.5 h-3.5" />
              Videos
            </TabsTrigger>
            <TabsTrigger
              value="playlists"
              className="text-xs gap-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <ListVideo className="w-3.5 h-3.5" />
              Playlists
            </TabsTrigger>
            <TabsTrigger
              value="community"
              className="text-xs gap-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <Users className="w-3.5 h-3.5" />
              Community
            </TabsTrigger>
            <TabsTrigger
              value="earnings"
              className="text-xs gap-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <DollarSign className="w-3.5 h-3.5" />
              Earnings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="videos">
            <VideosTab userVideos={userVideos} onVideoClick={onVideoClick} />
          </TabsContent>
          <TabsContent value="playlists">
            <PlaylistsTab userId={userId} userVideos={userVideos} />
          </TabsContent>
          <TabsContent value="community">
            <CommunityTab
              userId={userId}
              username={username}
              userVideos={userVideos}
            />
          </TabsContent>
          <TabsContent value="earnings">
            <EarningsTab userVideos={userVideos} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
