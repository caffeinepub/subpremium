export interface Comment {
  id: string;
  text: string;
  authorName: string;
  authorId: string;
  createdAt: number;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  creatorName: string;
  creatorId: string;
  blobHash: string;
  thumbnailDataUrl?: string;
  durationSeconds: number;
  fileSizeBytes: number;
  views: number;
  likes: number;
  dislikes: number;
  createdAt: number;
  status: "uploading" | "processing" | "ready";
  comments: Comment[];
  likedBy?: string[];
  dislikedBy?: string[];
  captions?: Array<{ lang: string; url: string }>;
  sources?: Array<{ quality: string; url: string }>;
}

export type ViewName =
  | "home"
  | "video"
  | "upload"
  | "history"
  | "menu"
  | "login"
  | "signup"
  | "privacy"
  | "preferences"
  | "language"
  | "display";
