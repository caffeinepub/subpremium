# SubPremium

## Current State
`useUploadManager.tsx` has a `runFinalize` function that:
- Makes one finalize attempt
- On failure, checks backend once (forceStatusCheck)
- Increments failure count and shows a manual Retry button after first failure
- Shows Retry button too early — user sees it before system has exhausted retries

## Requested Changes (Diff)

### Add
- Silent auto-retry loop inside `runFinalize`: up to 3 attempts, exponential backoff (2s → 5s → 10s)
- Backend truth check (`getVideo`) before every retry — if already READY, skip retry and complete instantly
- Background recovery loop: after all retries exhausted, continue polling every 5–10s in the failsafe interval
- Persist recovery state across page reloads via existing `saveFinalizePending` mechanism
- Navigate user to Home as soon as upload session starts (dispatch `navigate-home` event)
- Video appears in feed as PROCESSING immediately after upload completes

### Modify
- `runFinalize`: replace single-attempt + manual retry with 3-attempt silent retry loop with backoff
- Failsafe interval: reduce FORCE_CHECK_AFTER_MS from 60s to 8s for faster background recovery
- Retry button: only shown if ALL 3 retries failed AND backend confirms video does NOT exist
- `completeUpload`: remove processing stage — go directly to READY and remove card

### Remove
- Immediate `canRetryFinalize: true` after first failure
- Hard failure after 3 failures that deletes the upload entirely (replace with background recovery)

## Implementation Plan
1. Update `runFinalize` to loop 3 retries with backoff and backend-check before each
2. Update failsafe interval to poll FINALIZING tasks every 8s (not 60s)
3. Only show Retry button when ALL retries exhausted AND backend getVideo returns null
4. Dispatch `navigate-home` event when upload starts so UploadView returns user to Home
5. Ensure processing video is visible in feed immediately
