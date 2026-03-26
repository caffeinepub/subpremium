const DB_NAME = "upload-sessions";
const STORE_NAME = "sessions";
const DB_VERSION = 2;

const DELETED_UPLOADS_KEY = "subpremium_deleted_uploads";

export interface PersistedSession {
  videoId: string;
  file: File;
  title: string;
  description: string;
  thumbnailDataUrl: string | undefined;
  duration: number;
  captions: Array<{ lang: string; file: File }>;
  userId: string;
  displayName: string;
  /** Actual chunk index of the last successfully uploaded chunk (-1 = none yet). */
  lastChunkIndex: number;
  totalChunks: number;
  createdAt: number;
  /** Confirmed uploaded bytes — single source of truth for progress. Default 0 for older records. */
  uploadedBytes: number;
  /** Serialised BlobHashTree JSON — stored after first tree build so resume
   *  can skip re-hashing the entire file. */
  blobHashTreeJSON?: string;
  /** Lifecycle status — "uploading" while active, "DELETED" when removed.
   *  Used as a hard guard so deleted sessions never survive a reload. */
  status?: "uploading" | "DELETED";
}

// ─── Tombstone helpers (localStorage — synchronous) ───────────────────────────

export function markUploadDeleted(videoId: string): void {
  try {
    const raw = localStorage.getItem(DELETED_UPLOADS_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(videoId)) {
      set.push(videoId);
      localStorage.setItem(DELETED_UPLOADS_KEY, JSON.stringify(set));
    }
  } catch {}
}

export function isUploadDeleted(videoId: string): boolean {
  try {
    const raw = localStorage.getItem(DELETED_UPLOADS_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as string[]).includes(videoId);
  } catch {
    return false;
  }
}

export function clearDeletedUploadMark(videoId: string): void {
  try {
    const raw = localStorage.getItem(DELETED_UPLOADS_KEY);
    if (!raw) return;
    const set = (JSON.parse(raw) as string[]).filter((id) => id !== videoId);
    localStorage.setItem(DELETED_UPLOADS_KEY, JSON.stringify(set));
  } catch {}
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "videoId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSession(session: PersistedSession): Promise<void> {
  // Never persist a session that is already marked deleted
  if (isUploadDeleted(session.videoId)) return;
  const record: PersistedSession = { ...session, status: "uploading" };
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.error("[uploadPersistence] saveSession error:", err);
  }
}

/**
 * Update uploadedBytes + lastChunkIndex atomically, and optionally the tree JSON.
 * This is the single writer for progress state.
 */
export async function updateUploadProgress(
  videoId: string,
  uploadedBytes: number,
  lastChunkIndex: number,
  blobHashTreeJSON?: string,
): Promise<void> {
  // Skip persistence if this upload has been deleted
  if (isUploadDeleted(videoId)) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(videoId);
      getReq.onsuccess = () => {
        const record = getReq.result as PersistedSession | undefined;
        if (!record || record.status === "DELETED") {
          resolve();
          return;
        }
        record.uploadedBytes = uploadedBytes;
        record.lastChunkIndex = lastChunkIndex;
        if (blobHashTreeJSON !== undefined) {
          record.blobHashTreeJSON = blobHashTreeJSON;
        }
        const putReq = store.put(record);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.error("[uploadPersistence] updateUploadProgress error:", err);
  }
}

/** Backward-compat shim — delegates to updateUploadProgress. */
export async function updateChunkIndex(
  videoId: string,
  chunkIndex: number,
  blobHashTreeJSON?: string,
): Promise<void> {
  await updateUploadProgress(videoId, 0, chunkIndex, blobHashTreeJSON);
}

export async function loadSession(
  videoId: string,
): Promise<PersistedSession | null> {
  if (isUploadDeleted(videoId)) return null;
  try {
    const db = await openDB();
    const result = await new Promise<PersistedSession | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(videoId);
        req.onsuccess = () => {
          const rec = req.result as PersistedSession | undefined;
          if (!rec || rec.status === "DELETED") {
            resolve(null);
            return;
          }
          if (rec.uploadedBytes === undefined) {
            rec.uploadedBytes = 0;
          }
          resolve(rec);
        };
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    return result;
  } catch (err) {
    console.error("[uploadPersistence] loadSession error:", err);
    return null;
  }
}

/** Return true if a File object appears to be a real, accessible blob. */
function isValidFile(file: unknown): file is File {
  return (
    file instanceof File && file.size > 0 && typeof file.slice === "function"
  );
}

export async function loadAllSessions(): Promise<PersistedSession[]> {
  try {
    const db = await openDB();
    const result = await new Promise<PersistedSession[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as PersistedSession[]) ?? [];
        for (const rec of records) {
          if (rec.uploadedBytes === undefined) {
            rec.uploadedBytes = 0;
          }
        }
        resolve(records);
      };
      req.onerror = () => reject(req.error);
    });
    db.close();

    const live: PersistedSession[] = [];
    for (const session of result) {
      // Hard filter 1: localStorage tombstone
      if (isUploadDeleted(session.videoId)) {
        deleteSession(session.videoId).catch(() => {});
        continue;
      }

      // Hard filter 2: IDB status flag
      if (session.status === "DELETED") {
        deleteSession(session.videoId).catch(() => {});
        continue;
      }

      // Hard filter 3: incomplete/invalid record
      if (!session.videoId || !session.title) {
        deleteSession(session.videoId).catch(() => {});
        continue;
      }

      // Hard filter 4: missing or inaccessible file blob
      // Ghost uploads always fail here — no valid File means no real upload
      if (!isValidFile(session.file)) {
        // Purge from IDB so it never re-surfaces
        markUploadDeleted(session.videoId);
        deleteSession(session.videoId).catch(() => {});
        continue;
      }

      live.push(session);
    }
    return live;
  } catch (err) {
    console.error("[uploadPersistence] loadAllSessions error:", err);
    return [];
  }
}

/**
 * Mark the session as DELETED inside IDB first (belt-and-suspenders), then
 * physically remove the record.  The localStorage tombstone is written before
 * any async work so a reload mid-delete can never resurrect the session.
 */
export async function deleteSession(videoId: string): Promise<void> {
  // 1. Synchronous tombstone — guards against reload re-hydration immediately
  markUploadDeleted(videoId);

  try {
    const db = await openDB();

    // 2. Stamp the record as DELETED inside IDB (survives if physical delete races)
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(videoId);
      getReq.onsuccess = () => {
        const rec = getReq.result as PersistedSession | undefined;
        if (rec) {
          rec.status = "DELETED";
          store.put(rec);
        }
        resolve();
      };
      getReq.onerror = () => resolve(); // non-fatal
      tx.onerror = () => resolve();
    });

    // 3. Physical delete
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(videoId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
    // IDB record is gone — safe to clean up the localStorage tombstone
    clearDeletedUploadMark(videoId);
  } catch (err) {
    console.error("[uploadPersistence] deleteSession error:", err);
    // Leave tombstone in place — it will keep guarding against re-hydration
  }
}
