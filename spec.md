# SubPremium — Delete Video Feature

## Current State
The backend has `deleteVideo(videoId)` that removes the video record from the stable map. The frontend has no delete button anywhere — not on the Creator Dashboard, Creator Profile view, or any video card. `handleVideoRemoved` exists in App.tsx and is wired to the upload system only (for cancelling in-progress uploads).

## Requested Changes (Diff)

### Add
- `useVideoDelete` hook: calls `actor.deleteVideo(videoId)`, removes from localStorage/sessionStorage caches, dispatches a global `video-deleted` event, then calls `onDeleted` callback. Restores video on failure and shows error toast.
- `DeleteVideoButton` component: renders a trash icon button; only visible when `currentUserId === video.creatorId` and `video.status === 'ready'`. Shows a shadcn `AlertDialog` for confirmation before calling the hook.
- Delete buttons on: `VideosTab` in `CreatorDashboardView`, `CreatorProfileView` video grid (owner-only), and `HomeView` video cards (owner-only).
- App.tsx: pass `onVideoDeleted` callback to relevant views; listen for `video-deleted` event to remove from global `videos` state.

### Modify
- `CreatorDashboardView.VideosTab`: add delete button (trash icon) per video card; accept `onVideoDeleted` prop and pass `userId` down.
- `CreatorDashboardView` main: accept and pass `onVideoDeleted`.
- `CreatorProfileView`: add delete button for own videos (when `currentUserId === creatorId`); accept `onVideoDeleted`.
- `App.tsx`: wire `onVideoDeleted` to `handleVideoRemoved` + backend call; pass `actor` reference through.

### Remove
- Nothing removed.

## Implementation Plan
1. Create `src/frontend/src/hooks/useVideoDelete.ts` — encapsulates backend call, optimistic removal, rollback on error, cache cleanup, toast.
2. Create `src/frontend/src/components/DeleteVideoButton.tsx` — trash icon + AlertDialog confirmation, calls `useVideoDelete`, owner-only visibility.
3. Modify `CreatorDashboardView.tsx` — add `onVideoDeleted` prop, pass to `VideosTab`, render `DeleteVideoButton` on each card.
4. Modify `CreatorProfileView.tsx` — add `onVideoDeleted` prop, render `DeleteVideoButton` on own video cards.
5. Modify `App.tsx` — add `handleVideoDeleted` (calls backend + `handleVideoRemoved`), pass to `CreatorDashboardView` and `CreatorProfileView`.
6. Also add delete option on `HomeView` video cards for own videos (owner-only).
