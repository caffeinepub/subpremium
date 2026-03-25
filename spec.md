# SubPremium

## Current State
- Auth (userId, token) stored in backend + localStorage session cache
- Videos stored in backend, linked to userId (working)
- Likes stored in backend in video.likedBy (working)
- Profile extras (username, avatarUrl): localStorage only — lost after logout/cache clear
- Watch Later: localStorage only per userId
- Watch Progress: localStorage only per userId+videoId
- History: localStorage only (not per-user)
- Playlists: in-memory only (CreatorDashboardView state)
- Settings: localStorage only per userId

## Requested Changes (Diff)

### Add
- Backend: `UserData` type with userId, username, avatarUrl, watchLater (videoId list), history (videoId + watchedAt), watchProgress (videoId + progressTime + duration), playlists
- Backend: `getUserAllData(userId)` query — returns full UserData for a user
- Backend: `updateUserExtra(token, username, avatarUrl)` — save profile extras
- Backend: `saveUserData(token, watchLater, history, playlists)` — bulk save user data
- Backend: `saveWatchProgress(token, videoId, progressTime, durationSeconds)` — save single progress entry
- Backend: `getWatchProgressAll(userId)` — returns all watch progress entries for a user
- Frontend: after login or signup succeeds, call `getUserAllData(userId)` and hydrate localStorage keys so all existing utils (watchLater, watchProgress, history, settings, profile) instantly work from the backend data
- Frontend: when watch later changes, sync to backend
- Frontend: when history entry added, sync to backend
- Frontend: when watch progress saved, sync to backend
- Frontend: when profile updated, sync username/avatarUrl to backend
- Frontend: new `useUserData.ts` hook that handles backend sync for all user data

### Modify
- `useAuth.ts`: after successful login/signup, call `getUserAllData` and populate localStorage
- `watchLater.ts`: add async `syncWatchLaterToBackend(userId, actor)` call
- `watchProgress.ts`: add async sync call
- `videoStorage.ts` (history): add async sync on `addToHistory`
- `useAuth.updateProfile`: also call `updateUserExtra` on backend

### Remove
- Nothing removed

## Implementation Plan
1. Add `UserData`, `HistoryEntry`, `WatchProgressEntry`, `PlaylistRecord` types to main.mo
2. Add `userDataMap` stable map (userId → UserData)
3. Add `watchProgressMap` stable map (userId+videoId → WatchProgressEntry)
4. Implement `getUserAllData`, `updateUserExtra`, `saveUserData`, `saveWatchProgress`, `getWatchProgressAll` in backend
5. Regenerate frontend bindings
6. Create `src/frontend/src/utils/userDataSync.ts` — functions to hydrate localStorage from UserAllData and sync changes to backend
7. Update `useAuth.ts` login/signup to call `hydrateFromBackend(userId, actor)` after success
8. Update `useAuth.updateProfile` to also call backend `updateUserExtra`
9. Update `watchLater.ts` utility to also call backend sync
10. Update `videoStorage.ts` addToHistory to sync to backend
11. Update `watchProgress.ts` saveProgress to sync to backend
