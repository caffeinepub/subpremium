# SubPremium

## Current State
VideoDetailView already has a CC button and subtitle filtering logic, but the CC button only appears when `hasCaptions` is true. The subtitle menu exists inside a Sheet component and filters by user's `preferredLanguages` setting. The Settings button is always visible. Both are in the top-right overlay of the player.

## Requested Changes (Diff)

### Add
- CC button should always be visible (even if no captions available), placed directly next to the Settings button
- When CC is tapped with no captions: show a menu with just "Off" + message "No captions available for this video"

### Modify
- CC button visibility: remove `hasCaptions` conditional — always render it
- CC button styling: highlight (primary color) when a subtitle is active, muted when off
- CC menu layout: ensure correct order: Off → Original (video language) → user-preferred language matches → fallback if no match
- The CC sheet title should say "Subtitles" instead of "Select Language"
- Fallback message when no subtitle matches user preferences: "No subtitles in your language" with a "Show all languages" toggle

### Remove
- Nothing

## Implementation Plan
1. In `VideoDetailView.tsx`, remove `hasCaptions &&` conditional guard from the CC button in the player overlay
2. When `!hasCaptions`, clicking CC should open a sheet that shows "No captions available for this video"
3. When `hasCaptions`, the CC sheet shows: Off, Original (video language), then only user-preferred matches (filtered), then fallback message with show-all toggle
4. Rename SheetTitle from "Select Language" to "Subtitles"
5. Keep all existing auto-select, save-per-user, and fallback logic unchanged
