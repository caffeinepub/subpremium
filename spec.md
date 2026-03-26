# SubPremium

## Current State
Full-featured video platform with persistent auth, chunked uploads, video management, creator dashboard, and settings. MenuView has logout and settings. useAuth has logout(). useUploadManager has cancelUpload(). Backend has logoutUser and deleteVideo.

## Requested Changes (Diff)

### Add
- `deleteUserAccount(token)` backend method: deletes user record, all their videos, all sessions, all user data (watchLater, history, playlists, subscriptions, watchProgress, settings)
- `ClearAllDataModal` component: shows confirmation dialog with warning text, then executes full factory reset
- "Clear All Data" danger button in MenuView (visible only when logged in)

### Modify
- `useAuth.ts`: expose `factoryReset()` that calls backend delete, clears all localStorage/sessionStorage, returns so App can redirect to login
- `MenuView.tsx`: add "Clear All Data" button that opens the modal
- `App.tsx`: pass `onFactoryReset` callback down to MenuView which navigates to login after reset
- `backend.d.ts`: add `deleteUserAccount` signature
- `main.mo`: add `deleteUserAccount` public method

### Remove
- Nothing removed

## Implementation Plan
1. Add `deleteUserAccount(token)` to main.mo — deletes user from usersByEmail+usersById, all their videos, their sessions, userData, subscriptions, watchProgress, settings
2. Add signature to backend.d.ts
3. Add `factoryReset()` to useAuth.ts — calls backend deleteUserAccount, aborts uploads via cancelUpload event, clears ALL client storage (localStorage, sessionStorage, caches, IndexedDB databases), calls setUser(null)
4. Create ClearAllDataModal.tsx — AlertDialog with the required warning text, 2-step confirm (type or press button), calls factoryReset on confirm
5. Add "Clear All Data" button in MenuView, wired to modal
6. App.tsx: handle post-reset redirect to login via a reset callback prop
