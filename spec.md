# SubPremium

## Current State
The app has a chunked upload system via `useUploadManager.tsx` and `StorageClient.ts`. Issues:
1. `runUpload` calls `new Uint8Array(await params.file.arrayBuffer())` — loads entire file into memory at once, crashing browser for 500MB+ files and causing progress to stay stuck at 0% while memory is allocated.
2. No duplicate upload prevention — calling startUpload twice for the same file creates two parallel uploads.
3. `StorageClient.putFile` requires the whole file as `Uint8Array`, not a streaming Blob.
4. Pause/Resume works via a polling flag but the running `sc.putFile` call can't be aborted — pause only takes effect after the whole upload finishes.
5. No persistent floating upload tray — users can't see or control uploads after leaving the Upload page.
6. Page crash recovery restores sessions but re-reads the full file again into memory.

## Requested Changes (Diff)

### Add
- `putBlob(blob: Blob, onProgress?, signal?: AbortSignal)` method to `StorageClient` that works with the raw File/Blob, never loading it fully into memory. Internally reuses `processFileForUpload` and `parallelUpload` already using Blob slices.
- `AbortController` map (`abortControllersRef`) in `useUploadManager` — one per active upload. Created at start of `runUpload`, stored by videoId, aborted on cancel/pause.
- Duplicate upload prevention: before starting a new upload in `startUpload`, check `uploadParamsRef` and existing sessions for a matching videoId or same `file.name + file.size`. If already active, skip silently.
- Floating `UploadTray` component (`src/frontend/src/components/UploadTray.tsx`) — sticky above BottomNav, shows all active uploads. Each row: title (truncated), animated progress bar, status text, Pause/Resume/Cancel buttons. Hides when no active uploads.
- Mount `UploadTray` in `App.tsx` inside `UploadManagerProvider`, above `BottomNav`.
- Progress reporting during hashing phase: pass an `onHashProgress` callback to `processFileForUpload` that updates the task to `Preparing... X%` (0–10%) as chunks are hashed, so progress never stays frozen.

### Modify
- `useUploadManager.runUpload`: remove `const fileBytes = new Uint8Array(await params.file.arrayBuffer())`. Replace `sc.putFile(fileBytes, ...)` with `sc.putBlob(params.file, progressCallback, abortController.signal)`.
- `StorageClient.parallelUpload`: accept `signal?: AbortSignal` and pass it to each `fetch` call in `uploadChunk`. Throw if signal is aborted before each chunk.
- `StorageClient.uploadChunk`: pass `signal` to `fetch`.
- `useUploadManager.cancelUpload`: call `abortControllersRef.current.get(videoId)?.abort()` before removing the task.
- `useUploadManager.pauseUpload`: call `abortControllersRef.current.get(videoId)?.abort()` to stop the in-flight upload, set `isPaused: true`. The abort causes `runUpload` outer catch, which checks `pausedByUserRef` and enters the wait loop.
- `useUploadManager.resumeUpload`: after unpausing, delete the old AbortController and call `runUpload` again (runner guard `runnerActiveRef` is cleared in the abort handler).
- `runUpload` abort handling: when AbortError is caught, if `pausedByUserRef.has(videoId)` enter pause-wait loop; if `cancelledRef.has(videoId)` clean up and exit.

### Remove
- The line `const fileBytes = new Uint8Array(await params.file.arrayBuffer())` from `useUploadManager.runUpload`.

## Implementation Plan
1. Modify `StorageClient.ts`: add `putBlob`, thread `AbortSignal` through `parallelUpload` → `uploadChunk` → `fetch`.
2. Modify `useUploadManager.tsx`: add `abortControllersRef`, fix `runUpload` to use `putBlob`, add duplicate check, fix pause/cancel to use abort.
3. Create `UploadTray.tsx`: floating tray with per-upload progress rows and controls.
4. Add `UploadTray` to `App.tsx`.
5. Validate and fix any TypeScript errors.
