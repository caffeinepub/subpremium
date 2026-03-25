import type { Video } from "../types/video";

const STORAGE_KEY = "subpremium_videos";
const HISTORY_KEY = "subpremium_history";

export function getVideos(): Video[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Video[]) : [];
  } catch {
    return [];
  }
}

export function saveVideos(videos: Video[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  } catch (e) {
    console.error("Failed to save videos:", e);
  }
}

export function getHistory(): Array<{ videoId: string; watchedAt: number }> {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addToHistory(videoId: string): void {
  const history = getHistory();
  const existing = history.findIndex((h) => h.videoId === videoId);
  if (existing >= 0) history.splice(existing, 1);
  history.unshift({ videoId, watchedAt: Date.now() });
  history.splice(100);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save history:", e);
  }
}

export function incrementViews(videoId: string): void {
  const videos = getVideos();
  const video = videos.find((v) => v.id === videoId);
  if (video) {
    video.views++;
    saveVideos(videos);
  }
}

export function updateVideo(updated: Video): void {
  const videos = getVideos();
  const idx = videos.findIndex((v) => v.id === updated.id);
  if (idx >= 0) {
    videos[idx] = updated;
    saveVideos(videos);
  }
}
