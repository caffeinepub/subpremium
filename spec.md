# SubPremium

## Current State
- Video cards have a trash icon (DeleteVideoButton) shown only to owners of ready videos
- Backend has `updateVideoStatus` but no endpoint for editing title/description/thumbnail
- No edit modal or hook exists

## Requested Changes (Diff)

### Add
- `updateVideoMeta` backend endpoint: accepts videoId, title, description, thumbnailUrl; owner-only; does NOT touch video file, views, or stats
- `useVideoEdit` hook: manages edit state, thumbnail upload, save logic, optimistic UI update
- `EditVideoModal` component: modal with Title (required, max 100 chars), Description (optional, max 500 chars), Thumbnail (upload/preview), Save/Cancel
- Replace standalone `DeleteVideoButton` with a `VideoCardMenu` (⋮ button) that shows Edit + Delete options for owners

### Modify
- `HomeView`: use `VideoCardMenu` instead of `DeleteVideoButton`, pass `onVideoEdited` callback
- `App.tsx`: handle `onVideoEdited` to update global video state instantly across all views
- `backend.d.ts`: add `updateVideoMeta` signature
- `backend/main.mo`: add `updateVideoMeta` function

### Remove
- Direct usage of standalone `DeleteVideoButton` in favor of unified menu

## Implementation Plan
1. Add `updateVideoMeta` to backend (Motoko)
2. Add `updateVideoMeta` to `backend.d.ts`
3. Create `useVideoEdit` hook
4. Create `EditVideoModal` component
5. Create `VideoCardMenu` component (⋮ with Edit + Delete)
6. Update `HomeView`, `CreatorDashboardView`, `CreatorProfileView` to use `VideoCardMenu`
7. Update `App.tsx` to handle edit callbacks and propagate video updates globally
