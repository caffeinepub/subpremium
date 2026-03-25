# SubPremium

## Current State
- `useSettings` hook stores all settings in localStorage keyed by userId (or guest)
- No backend methods exist for saving/loading settings
- Settings are not synced across devices

## Requested Changes (Diff)

### Add
- Backend: `UserSettings` type storing videoQuality, videoQualityWifi, videoQualityMobile, subtitlesLanguage, subtitleDefaultLanguage, appLanguage, darkMode, fontSize, preferredLanguages, accountPublic, allowComments, allowDownloads, autoplayVideos
- Backend: `saveUserSettings(token, settings)` — stores settings per userId
- Backend: `getUserSettings(userId)` — returns saved settings or null
- Frontend: `useSettings` hook — on login, fetch settings from backend and apply; on any setting change, persist to backend (plus localStorage as cache); on app load with no backend data, use localStorage cache then defaults

### Modify
- `useSettings` hook: add backend sync — save to backend on every `updateSetting` call, load from backend when userId changes (login)

### Remove
- Nothing removed

## Implementation Plan
1. Add `UserSettings` type and two methods (`saveUserSettings`, `getUserSettings`) to `main.mo`
2. Regenerate backend bindings
3. Update `useSettings` hook to call `saveUserSettings` on every change and `getUserSettings` on login, with localStorage as offline cache and fallback to defaults
