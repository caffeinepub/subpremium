# SubPremium — Production Stability Hardening

## Current State
App is functional with full video platform features. Critical bugs:
1. **Backend data maps use `let` (non-stable)** — every canister upgrade (deploy) wipes ALL users, videos, and sessions
2. No separate refreshToken endpoint — access and refresh tokens are the same value
3. Frontend auth has silent recovery but can still lose state on certain edge cases
4. Upload system uses IndexedDB for chunked resume (good) but network errors can surface in UI

## Requested Changes (Diff)

### Add
- `stable var` declarations for all backend data maps
- `refreshSession(refreshToken)` backend endpoint that issues a new access token
- `getAccessToken()` helper in frontend that calls refresh if access token near expiry
- Lazy image/thumbnail loading on home feed (IntersectionObserver)
- Passive offline detection — show/hide subtle banner only, no blocking

### Modify
- All backend `let` data maps → `stable var` (usersByEmail, usersById, sessions, videos, userDataMap, userSubscriptionsMap, watchProgressMap, userSettingsMap, principalToUserId)
- Session shape: store separate `refreshToken` in `SessionRecord`
- `loginUser` and `registerUser` now issue both access + refresh tokens
- `useAuth`: on `validateSession` failure, call `refreshSession` before giving up
- Upload UI: never show retry/connection text — only Preparing/Uploading/Processing/Ready
- Home feed: load videos lazily, show empty state immediately, update when data arrives

### Remove
- Any logic that logs user out due to session validation failure (replace with silent refresh)
- Any spinner/blocking state tied to auth check on app load

## Implementation Plan
1. Rewrite `main.mo` with `stable var` maps and refresh token support
2. Update `useAuth.ts` — call `refreshSession` on token failure, never logout silently
3. Update `HomeView` — instant render, lazy load thumbnails, background data fetch
4. Update `UploadManagerProvider` — strip all retry/connection UI text
5. Add subtle offline banner (non-blocking, auto-hides on reconnect)
