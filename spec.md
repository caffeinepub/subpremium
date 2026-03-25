# SUB PREMIUM

## Current State
The app has: Home feed, video player, upload, history, watch later, menu/profile, settings, notifications, auth. Navigation uses a `ViewName` union type in `types/video.ts` and is managed in `App.tsx`. There is no creator profile page.

The backend exposes `getVideosByCreator(creatorId: string): Promise<Array<VideoRecord>>` and `VideoRecord` includes `creatorId`, `creatorName`. The `getUserProfile(token)` and `validateSession(token)` return `UserProfile` with `{ displayName, userId, email }`. No dedicated endpoint exists to fetch a user profile by userId alone, but we can use `creatorName` from the video records.

## Requested Changes (Diff)

### Add
- `CreatorProfileView` component: shows creator avatar (initials-based), display name, @username (derived from displayName), and a grid of their uploaded videos (thumbnail, title, views). Empty state: "No videos yet".
- `"profile"` to `ViewName` union type with `profileCreatorId` state in `App.tsx` to track which creator to show.
- Navigation: tapping creator name or avatar in VideoCard (home feed), VideoDetailView (creator info row), and suggested videos triggers opening the creator profile.

### Modify
- `types/video.ts` — add `"profile"` to `ViewName`.
- `App.tsx` — add `profileCreatorId` + `profileCreatorName` state, render `CreatorProfileView`, pass `onCreatorClick` down to `HomeView` and `VideoDetailView`.
- `HomeView` — pass `onCreatorClick` to `VideoCard`.
- `VideoCard` — make creator name/avatar tappable, call `onCreatorClick(creatorId, creatorName)`.
- `VideoDetailView` — make creator name row tappable.

### Remove
- Nothing removed.

## Implementation Plan
1. Add `"profile"` to `ViewName` in `types/video.ts`.
2. Create `CreatorProfileView.tsx`: accepts `creatorId`, `creatorName`; fetches videos via `actor.getVideosByCreator(creatorId)`; shows avatar (large initials circle), display name, @username; renders 2-col thumbnail grid with title/views; empty state; on video tap calls `onVideoClick`.
3. Update `App.tsx`: add `profileCreatorId`/`profileCreatorName` state; `handleCreatorClick(id, name)` sets view to `"profile"`; pass `onCreatorClick` to `HomeView` and `VideoDetailView`; render `CreatorProfileView` in the main switch.
4. Update `VideoCard`: wrap creator name in a tappable element with `onCreatorClick` prop.
5. Update `VideoDetailView`: make creator name row tappable.
6. Hide bottom nav and header on profile view (treat like video/settings view) — show a back arrow header instead.
