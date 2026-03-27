# SubPremium

## Current State
- `Video` type has `status: 'uploading' | 'processing' | 'ready'`
- `VideoRecord` in Motoko has `status: Text`, but no `previewFrameUrl` or `lowQualityUrl` fields
- `isPublished` in backend only allows `ready/READY/PUBLIC/public` — excludes `processing`
- `VideoCard` shows a spinner overlay when `status === 'processing'` but tapping still tries to open the player
- `VideoDetailView` ignores processing status; always attempts to load the full video URL
- No polling of video status while watching
- No fallback playback (low-quality or preview-only) for processing videos
- Home feed `readyVideos` does include `processing` videos, but player has no special handling

## Requested Changes (Diff)

### Add
- `previewFrameUrl?: Text` and `lowQualityUrl?: Text` fields to `VideoRecord` and `VideoInput` in Motoko
- Backend `getAllVideos` / `getVideo` must include processing-status videos in results (add `processing` to `isPublished`)
- `Video` TS type: add `previewFrameUrl?: string` and `lowQualityUrl?: string`
- `VideoCard`: show a "Processing" badge when `status === 'processing'`; keep existing tap behavior (allow tap)
- `VideoDetailView`: tap-to-watch logic for processing videos:
  - If `lowQualityUrl` exists → load and play it immediately
  - Else if `previewFrameUrl` exists → show thumbnail in full-screen preview state
  - Else → show processing screen (thumbnail, "Processing video...", spinner)
  - Poll backend every 4s while `status !== 'ready'`; when HD becomes available seamlessly switch `<video>` src
  - Show "HD ready soon" indicator while processing; hide badge once `status === 'ready'`
  - NEVER load main `videoUrl` (HD) when status is processing
- `videoMapper` (backend→frontend) must map new `previewFrameUrl` and `lowQualityUrl` fields

### Modify
- Backend `isPublished` to also accept `"processing"` and `"PROCESSING"`
- `VideoInput` type in Motoko to accept optional `previewFrameUrl` and `lowQualityUrl` (default to `""`)
- `addVideo` to store those fields from input
- `updateVideoStatus` (or a new `updateVideoUrls`) to allow setting `lowQualityUrl` and `previewFrameUrl` on an existing video
- `VideoDetailView` player section: check `status === 'processing'` before mounting `<video>` element

### Remove
- Nothing removed; existing spinner overlay on `VideoCard` can remain, just add the badge

## Implementation Plan
1. Update Motoko `VideoRecord` and `VideoInput` with `previewFrameUrl` and `lowQualityUrl` fields
2. Update `isPublished` to include `processing`
3. Add/extend `updateVideoStatus` to support setting preview/low-quality URLs
4. Update `backend.did.d.ts` bindings to reflect new fields
5. Extend `Video` TS type with `previewFrameUrl` and `lowQualityUrl`
6. Update videoMapper to map new backend fields
7. Update `VideoCard` to show "Processing" badge for processing status
8. Update `VideoDetailView`: implement tap-to-watch with fallback chain + status polling + seamless HD upgrade
