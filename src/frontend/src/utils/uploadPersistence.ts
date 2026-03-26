const DB_NAME = "upload-sessions";
const STORE_NAME = "sessions";
const DB_VERSION = 2;

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
  /** Serialised BlobHashTree JSON — stored after first tree build so resume
   *  can skip re-hashing the entire file. */
  blobHashTreeJSON?: string;
}

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
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(session);
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

/** Update the last completed chunk index AND optionally the stored tree JSON. */
export async function updateChunkIndex(
  videoId: string,
  chunkIndex: number,
  blobHashTreeJSON?: string,
): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(videoId);
      getReq.onsuccess = () => {
        const record = getReq.result as PersistedSession | undefined;
        if (!record) {
          resolve();
          return;
        }
        record.lastChunkIndex = chunkIndex;
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
    console.error("[uploadPersistence] updateChunkIndex error:", err);
  }
}

export async function loadSession(
  videoId: string,
): Promise<PersistedSession | null> {
  try {
    const db = await openDB();
    const result = await new Promise<PersistedSession | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(videoId);
        req.onsuccess = () => resolve((req.result as PersistedSession) ?? null);
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

export async function loadAllSessions(): Promise<PersistedSession[]> {
  try {
    const db = await openDB();
    const result = await new Promise<PersistedSession[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as PersistedSession[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (err) {
    console.error("[uploadPersistence] loadAllSessions error:", err);
    return [];
  }
}

export async function deleteSession(videoId: string): Promise<void> {
  try {
    const db = await openDB();
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
  } catch (err) {
    console.error("[uploadPersistence] deleteSession error:", err);
  }
}
