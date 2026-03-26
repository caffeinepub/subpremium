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
import { DeleteVideoButton } from "../components/DeleteVideoButton";
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
  onVideoDeleted?: (videoId: string) => void;
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
  userId,
  onVideoClick,
  onVideoDeleted,
}: {
  userVideos: VideoType[];
  userId: string;
  onVideoClick: (v: VideoType) => void;
  onVideoDeleted?: (videoId: string) => void;
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
            <DeleteVideoButton
              video={v}
              currentUserId={userId}
              onDelete={(id) => onVideoDeleted?.(id)}
            />
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
            onClick={() =>
              setExpandedId((prev) => (prev === pl.id ? null : pl.id))
            }
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left"
          >
            <div className="flex items-center gap-2">
              <ListVideo className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium">{pl.name}</span>
              <span className="text-xs text-muted-foreground">
                ({pl.videoIds.length})
              </span>
            </div>
            <div className="flex items-center gap-1">
              {!pl.isDefault && (
                <button
                  type="button"
                  data-ocid="creator_dashboard.playlists.delete_button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePlaylist(pl.id);
                  }}
                  className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                  expandedId === pl.id ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M6 9l6 6 6-6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </button>

          {expandedId === pl.id && (
            <div className="border-t border-border">
              {userVideos.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No videos uploaded yet
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {userVideos.map((v) => {
                    const inPlaylist = pl.videoIds.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        data-ocid="creator_dashboard.playlists.toggle"
                        onClick={() => toggleVideo(pl.id, v.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
                      >
                        <div className="w-12 aspect-video rounded bg-secondary overflow-hidden shrink-0">
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
                        <p className="text-xs flex-1 line-clamp-2 leading-snug">
                          {v.title}
                        </p>
                        {inPlaylist && (
                          <Check className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {playlists.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No playlists yet. Create one above.
        </p>
      )}
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
  const [tab, setTab] = useState<"post" | "repost">("post");
  const [caption, setCaption] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const imgInputRef = useRef<HTMLInputElement>(null);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImageDataUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handlePost() {
    if (tab === "post" && !imageDataUrl) return;
    if (tab === "repost" && !selectedVideoId) return;

    const repostedVideo = userVideos.find((v) => v.id === selectedVideoId);
    const newPost: CommunityPost = {
      id: `post_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId,
      username,
      type: tab === "post" ? "image" : "repost",
      imageDataUrl: tab === "post" ? imageDataUrl : undefined,
      repostedVideoId: tab === "repost" ? selectedVideoId : undefined,
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
    setCaption("");
    setImageDataUrl(undefined);
    setSelectedVideoId("");
    if (imgInputRef.current) imgInputRef.current.value = "";
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
    const text = (commentTexts[postId] ?? "").trim();
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
            username,
            text,
            createdAt: Date.now(),
          },
        ],
      };
    });
    setPosts(next);
    savePosts(next);
    setCommentTexts((prev) => ({ ...prev, [postId]: "" }));
  }

  return (
    <div className="pt-3 space-y-4">
      {/* Compose */}
      <div className="bg-card rounded-xl border border-border p-3 space-y-3">
        {/* Tab toggle */}
        <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
          {(["post", "repost"] as const).map((t) => (
            <button
              key={t}
              type="button"
              data-ocid={`creator_dashboard.community.${t}.tab`}
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "post" ? (
                <Image className="w-3.5 h-3.5" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
              {t === "post" ? "Post Image" : "Repost Video"}
            </button>
          ))}
        </div>

        {tab === "post" && (
          <div>
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            {imageDataUrl ? (
              <div className="relative rounded-lg overflow-hidden">
                <img
                  src={imageDataUrl}
                  alt="preview"
                  className="w-full max-h-48 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImageDataUrl(undefined)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center text-white text-xs"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-ocid="creator_dashboard.community.upload_button"
                onClick={() => imgInputRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              >
                <Image className="w-5 h-5" />
                <span className="text-xs">Tap to select image</span>
              </button>
            )}
          </div>
        )}

        {tab === "repost" && (
          <select
            data-ocid="creator_dashboard.community.select"
            value={selectedVideoId}
            onChange={(e) => setSelectedVideoId(e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground"
          >
            <option value="">Select a video to repost...</option>
            {userVideos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        )}

        <Textarea
          data-ocid="creator_dashboard.community.textarea"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write a caption..."
          className="resize-none text-sm bg-secondary border-border h-16"
        />

        <Button
          data-ocid="creator_dashboard.community.submit_button"
          size="sm"
          onClick={handlePost}
          disabled={tab === "post" ? !imageDataUrl : !selectedVideoId}
          className="w-full h-8 text-xs"
        >
          Post
        </Button>
      </div>

      {/* Feed */}
      {posts.length === 0 ? (
        <div
          data-ocid="creator_dashboard.community.empty_state"
          className="flex flex-col items-center py-10 gap-2 text-center"
        >
          <p className="text-sm text-muted-foreground">No posts yet</p>
        </div>
      ) : (
        posts.map((post, i) => (
          <div
            key={post.id}
            data-ocid={`creator_dashboard.community.item.${i + 1}`}
            className="bg-card rounded-xl border border-border overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 pt-3 pb-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">
                  {post.username.slice(0, 1).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">
                  {post.username}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {relativeTime(post.createdAt)}
                </p>
              </div>
            </div>

            {post.type === "image" && post.imageDataUrl && (
              <img
                src={post.imageDataUrl}
                alt="post"
                className="w-full max-h-56 object-cover"
              />
            )}

            {post.type === "repost" && post.repostedVideoThumb && (
              <div className="relative mx-3 rounded-lg overflow-hidden bg-secondary">
                <img
                  src={post.repostedVideoThumb}
                  alt={post.repostedVideoTitle}
                  className="w-full aspect-video object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="w-4 h-4 text-white"
                      fill="currentColor"
                    >
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                </div>
                {post.repostedVideoTitle && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                    <p className="text-white text-[10px] truncate">
                      {post.repostedVideoTitle}
                    </p>
                  </div>
                )}
              </div>
            )}

            {post.caption && (
              <p className="px-3 pt-2 pb-1 text-xs text-foreground">
                {post.caption}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 px-3 pb-2 pt-1">
              <button
                type="button"
                data-ocid="creator_dashboard.community.toggle"
                onClick={() => toggleLike(post.id)}
                className={`flex items-center gap-1 text-xs transition-colors ${
                  post.likes.includes(userId)
                    ? "text-red-500"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Heart
                  className="w-3.5 h-3.5"
                  fill={post.likes.includes(userId) ? "currentColor" : "none"}
                />
                {post.likes.length}
              </button>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageCircle className="w-3.5 h-3.5" />
                {post.comments.length}
              </span>
            </div>

            {/* Comments */}
            {post.comments.length > 0 && (
              <div className="border-t border-border px-3 pt-2 pb-1 space-y-1.5">
                {post.comments.slice(-2).map((c) => (
                  <p key={c.id} className="text-[11px]">
                    <span className="font-semibold">{c.username}</span>{" "}
                    <span className="text-muted-foreground">{c.text}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Comment input */}
            <div className="flex gap-1.5 px-3 pb-3 pt-1">
              <input
                type="text"
                data-ocid="creator_dashboard.community.input"
                value={commentTexts[post.id] ?? ""}
                onChange={(e) =>
                  setCommentTexts((prev) => ({
                    ...prev,
                    [post.id]: e.target.value,
                  }))
                }
                onKeyDown={(e) => e.key === "Enter" && addComment(post.id)}
                placeholder="Add a comment..."
                className="flex-1 h-7 rounded-md border border-border bg-secondary px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                data-ocid="creator_dashboard.community.submit_button"
                onClick={() => addComment(post.id)}
                disabled={!(commentTexts[post.id] ?? "").trim()}
                className="h-7 px-2 rounded-md bg-primary text-white text-xs font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Post
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Earnings Tab ─────────────────────────────────────────────────────────────

function EarningsTab({ userVideos }: { userVideos: VideoType[] }) {
  const totalViews = userVideos.reduce((sum, v) => sum + v.views, 0);
  const estimatedEarnings = (totalViews * 0.003).toFixed(2);

  return (
    <div className="pt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div
          data-ocid="creator_dashboard.earnings.card"
          className="bg-card rounded-xl border border-border p-4 flex flex-col gap-1"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-4 h-4" />
            <span className="text-xs">Total Views</span>
          </div>
          <p className="text-xl font-bold text-foreground mt-1">
            {formatNum(totalViews)}
          </p>
        </div>

        <div
          data-ocid="creator_dashboard.earnings.card"
          className="bg-card rounded-xl border border-border p-4 flex flex-col gap-1"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs">Est. Earnings</span>
          </div>
          <p className="text-xl font-bold text-foreground mt-1">
            ${estimatedEarnings}
          </p>
        </div>
      </div>

      {userVideos.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <p className="text-xs font-semibold text-muted-foreground px-3 pt-3 pb-2">
            Per Video
          </p>
          <div className="divide-y divide-border">
            {userVideos.map((v, i) => (
              <div
                key={v.id}
                data-ocid={`creator_dashboard.earnings.item.${i + 1}`}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <div className="w-10 aspect-video rounded bg-secondary overflow-hidden shrink-0">
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
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{v.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatNum(v.views)} views
                  </p>
                </div>
                <p className="text-xs font-semibold text-primary shrink-0">
                  ${(v.views * 0.003).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center px-4">
        Estimated earnings based on $3 CPM. Actual earnings may vary.
      </p>
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
  onVideoDeleted,
}: CreatorDashboardViewProps) {
  const userVideos = allVideos.filter(
    (v) => v.creatorId === userId && v.status === "ready",
  );

  return (
    <div className="animate-fade-in min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-3 py-3 max-w-md mx-auto">
          <button
            type="button"
            data-ocid="creator_dashboard.back.button"
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
            >
              <path
                d="M19 12H5M12 5l-7 7 7 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-base font-bold leading-tight">
              Creator Dashboard
            </h1>
            {username && (
              <p className="text-xs text-muted-foreground">{username}</p>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto" style={{ paddingTop: "56px" }}>
        <Tabs defaultValue="videos" className="w-full">
          <div className="sticky top-14 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
            <TabsList className="w-full h-10 bg-transparent rounded-none grid grid-cols-4">
              {[
                { value: "videos", label: "Videos", icon: Video },
                { value: "playlists", label: "Playlists", icon: ListVideo },
                { value: "community", label: "Community", icon: Users },
                { value: "earnings", label: "Earnings", icon: DollarSign },
              ].map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  data-ocid={`creator_dashboard.${value}.tab`}
                  className="flex flex-col gap-0.5 h-full text-[10px] font-medium data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="px-3 pb-24">
            <TabsContent value="videos" className="mt-0">
              <VideosTab
                userVideos={userVideos}
                userId={userId}
                onVideoClick={onVideoClick}
                onVideoDeleted={onVideoDeleted}
              />
            </TabsContent>

            <TabsContent value="playlists" className="mt-0">
              <PlaylistsTab userId={userId} userVideos={userVideos} />
            </TabsContent>

            <TabsContent value="community" className="mt-0">
              <CommunityTab
                userId={userId}
                username={username}
                userVideos={userVideos}
              />
            </TabsContent>

            <TabsContent value="earnings" className="mt-0">
              <EarningsTab userVideos={userVideos} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
