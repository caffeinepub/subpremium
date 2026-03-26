import { type HttpAgent, isV3ResponseBody } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";

type Headers = Record<string, string>;

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

const GATEWAY_VERSION = "v1";

const HASH_ALGORITHM = "SHA-256";
const SHA256_PREFIX = "sha256:";
const DOMAIN_SEPARATOR_FOR_CHUNKS = new TextEncoder().encode("icfs-chunk/");
const DOMAIN_SEPARATOR_FOR_METADATA = new TextEncoder().encode(
  "icfs-metadata/",
);
const DOMAIN_SEPARATOR_FOR_NODES = new TextEncoder().encode("ynode/");

// 5 MB logical chunk size — never holds more than this in memory at once
export const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const shouldRetry = isRetriableError(error);
      if (attempt === MAX_RETRIES || !shouldRetry) throw error;
      const delay = Math.min(
        BASE_DELAY_MS * 2 ** attempt + Math.random() * 1000,
        MAX_DELAY_MS,
      );
      console.warn(
        `[storage] attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ${lastError.message}. Retry in ${Math.round(delay)}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError || new Error("Unknown error");
}

function isRetriableError(error: any): boolean {
  const msg = error?.message?.toLowerCase() || "";
  if (error?.response?.status) {
    const s = error.response.status;
    if (s === 408 || s === 429) return true;
    if (s >= 400 && s < 500) return false;
    if (s >= 500) return true;
  }
  if (
    msg.includes("ssl") ||
    msg.includes("tls") ||
    msg.includes("network error") ||
    msg.includes("connection") ||
    msg.includes("timeout") ||
    msg.includes("fetch")
  )
    return true;
  if (
    msg.includes("validation") ||
    msg.includes("invalid") ||
    msg.includes("malformed") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("not found")
  )
    return false;
  return true;
}

function validateHashFormat(hash: string, context: string): void {
  if (!hash) throw new Error(`${context}: Hash cannot be empty`);
  if (!hash.startsWith(SHA256_PREFIX))
    throw new Error(`${context}: Invalid hash format, expected sha256:...`);
  const hex = hash.substring(SHA256_PREFIX.length);
  if (hex.length !== 64)
    throw new Error(`${context}: Hash hex must be 64 chars`);
  if (!/^[0-9a-f]{64}$/i.test(hex))
    throw new Error(`${context}: Hash must be hex characters`);
}

class YHash {
  public readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    if (bytes.length !== 32)
      throw new Error(`YHash must be 32 bytes, got ${bytes.length}`);
    this.bytes = new Uint8Array(bytes);
  }

  static async fromNodes(
    left: YHash | null,
    right: YHash | null,
  ): Promise<YHash> {
    const leftBytes =
      left instanceof YHash
        ? left.bytes
        : new TextEncoder().encode("UNBALANCED");
    const rightBytes =
      right instanceof YHash
        ? right.bytes
        : new TextEncoder().encode("UNBALANCED");
    const combined = new Uint8Array(
      DOMAIN_SEPARATOR_FOR_NODES.length + leftBytes.length + rightBytes.length,
    );
    let offset = 0;
    for (const d of [DOMAIN_SEPARATOR_FOR_NODES, leftBytes, rightBytes]) {
      combined.set(d, offset);
      offset += d.length;
    }
    return new YHash(
      new Uint8Array(await crypto.subtle.digest(HASH_ALGORITHM, combined)),
    );
  }

  static async fromChunk(data: Uint8Array): Promise<YHash> {
    return YHash.fromBytes(DOMAIN_SEPARATOR_FOR_CHUNKS, data);
  }

  static async fromHeaders(headers: Headers): Promise<YHash> {
    const lines = Object.entries(headers)
      .map(([k, v]) => `${k.trim()}: ${v.trim()}\n`)
      .sort();
    return YHash.fromBytes(
      DOMAIN_SEPARATOR_FOR_METADATA,
      new TextEncoder().encode(lines.join("")),
    );
  }

  static async fromBytes(sep: Uint8Array, data: Uint8Array): Promise<YHash> {
    const combined = new Uint8Array(sep.length + data.length);
    combined.set(sep);
    combined.set(data, sep.length);
    return new YHash(
      new Uint8Array(await crypto.subtle.digest(HASH_ALGORITHM, combined)),
    );
  }

  static fromHex(hexString: string): YHash {
    const bytes = new Uint8Array(
      hexString.match(/.{1,2}/g)!.map((b) => Number.parseInt(b, 16)),
    );
    return new YHash(bytes);
  }

  toShaString(): string {
    return `${SHA256_PREFIX}${this.toHex()}`;
  }

  toString(): string {
    throw new Error("toString not supported for YHash");
  }

  private toHex(): string {
    return Array.from(this.bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

type TreeNode = { hash: YHash; left: TreeNode | null; right: TreeNode | null };

export type TreeNodeJSON = {
  hash: string;
  left: TreeNodeJSON | null;
  right: TreeNodeJSON | null;
};

export type BlobHashTreeJSON = {
  tree_type: "DSBMTWH";
  chunk_hashes: string[];
  tree: TreeNodeJSON;
  headers: string[];
};

function nodeToJSON(node: TreeNode): TreeNodeJSON {
  return {
    hash: node.hash.toShaString(),
    left: node.left ? nodeToJSON(node.left) : null,
    right: node.right ? nodeToJSON(node.right) : null,
  };
}

class BlobHashTree {
  public tree_type: "DSBMTWH";
  public chunk_hashes: YHash[];
  public tree: TreeNode;
  public headers: string[];

  constructor(
    chunk_hashes: YHash[],
    tree: TreeNode,
    headers: string[] | Headers | null = null,
  ) {
    this.tree_type = "DSBMTWH";
    this.chunk_hashes = chunk_hashes;
    this.tree = tree;
    if (headers == null) this.headers = [];
    else if (Array.isArray(headers)) this.headers = headers;
    else
      this.headers = Object.entries(headers).map(
        ([k, v]) => `${k.trim()}: ${v.trim()}`,
      );
    this.headers.sort();
  }

  static async build(
    chunkHashes: YHash[],
    headers: Headers = {},
  ): Promise<BlobHashTree> {
    if (chunkHashes.length === 0) {
      const hex =
        "8b8e620f084e48da0be2287fd12c5aaa4dbe14b468fd2e360f48d741fe7628a0";
      chunkHashes.push(new YHash(new TextEncoder().encode(hex)));
    }
    let level: TreeNode[] = chunkHashes.map((hash) => ({
      hash,
      left: null,
      right: null,
    }));
    while (level.length > 1) {
      const next: TreeNode[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || null;
        const parentHash = await YHash.fromNodes(
          left.hash,
          right ? right.hash : null,
        );
        next.push({ hash: parentHash, left, right });
      }
      level = next;
    }
    const chunksRoot = level[0];
    if (headers && Object.keys(headers).length > 0) {
      const metaHash = await YHash.fromHeaders(headers);
      const metaRoot: TreeNode = { hash: metaHash, left: null, right: null };
      const combinedHash = await YHash.fromNodes(
        chunksRoot.hash,
        metaRoot.hash,
      );
      const combinedRoot: TreeNode = {
        hash: combinedHash,
        left: chunksRoot,
        right: metaRoot,
      };
      return new BlobHashTree(chunkHashes, combinedRoot, headers);
    }
    return new BlobHashTree(chunkHashes, chunksRoot, headers);
  }

  /** Reconstruct a BlobHashTree from stored JSON (no re-hashing needed). */
  static fromJSON(json: BlobHashTreeJSON): BlobHashTree {
    const chunkHashes = json.chunk_hashes.map((h) =>
      YHash.fromHex(h.replace(SHA256_PREFIX, "")),
    );
    const rebuildNode = (n: TreeNodeJSON): TreeNode => ({
      hash: YHash.fromHex(n.hash.replace(SHA256_PREFIX, "")),
      left: n.left ? rebuildNode(n.left) : null,
      right: n.right ? rebuildNode(n.right) : null,
    });
    return new BlobHashTree(chunkHashes, rebuildNode(json.tree), json.headers);
  }

  toJSON(): BlobHashTreeJSON {
    return {
      tree_type: this.tree_type,
      chunk_hashes: this.chunk_hashes.map((h) => h.toShaString()),
      tree: nodeToJSON(this.tree),
      headers: this.headers,
    };
  }
}

interface UploadChunkParams {
  blobRootHash: YHash;
  chunkHash: YHash;
  chunkIndex: number;
  chunkData: Uint8Array;
  bucketName: string;
  owner: string;
  projectId: string;
  httpHeaders: Headers;
}

class StorageGatewayClient {
  constructor(private readonly storageGatewayUrl: string) {}

  getStorageGatewayUrl(): string {
    return this.storageGatewayUrl;
  }

  async uploadChunk(
    params: UploadChunkParams,
  ): Promise<{ isComplete: boolean }> {
    const blobHashString = params.blobRootHash.toShaString();
    const chunkHashString = params.chunkHash.toShaString();
    validateHashFormat(
      blobHashString,
      `uploadChunk[${params.chunkIndex}] blob`,
    );
    validateHashFormat(
      chunkHashString,
      `uploadChunk[${params.chunkIndex}] chunk`,
    );
    return withRetry(async () => {
      const qp = new URLSearchParams({
        owner_id: params.owner,
        blob_hash: blobHashString,
        chunk_hash: chunkHashString,
        chunk_index: params.chunkIndex.toString(),
        bucket_name: params.bucketName,
        project_id: params.projectId,
      });
      const url = `${this.storageGatewayUrl}/${GATEWAY_VERSION}/chunk/?${qp}`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Caffeine-Project-ID": params.projectId,
        },
        body: params.chunkData as BodyInit,
      });
      if (!response.ok) {
        const text = await response.text();
        const err = new Error(
          `Chunk ${params.chunkIndex} failed: ${response.status} - ${text}`,
        );
        (err as any).response = { status: response.status };
        throw err;
      }
      const result = (await response.json()) as { status: string };
      return { isComplete: result.status === "blob_complete" };
    });
  }

  async uploadBlobTree(
    blobHashTree: BlobHashTree,
    bucketName: string,
    numBlobBytes: number,
    owner: string,
    projectId: string,
    certificateBytes: Uint8Array,
  ): Promise<void> {
    const treeJSON = blobHashTree.toJSON();
    validateHashFormat(treeJSON.tree.hash, "uploadBlobTree root");
    treeJSON.chunk_hashes.forEach((h, i) =>
      validateHashFormat(h, `uploadBlobTree chunk[${i}]`),
    );
    return withRetry(async () => {
      const url = `${this.storageGatewayUrl}/${GATEWAY_VERSION}/blob-tree/`;
      const body = {
        blob_tree: treeJSON,
        bucket_name: bucketName,
        num_blob_bytes: numBlobBytes,
        owner,
        project_id: projectId,
        headers: blobHashTree.headers,
        auth: { OwnerEgressSignature: Array.from(certificateBytes) },
      };
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Caffeine-Project-ID": projectId,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text();
        const err = new Error(
          `BlobTree upload failed: ${response.status} - ${text}`,
        );
        (err as any).response = { status: response.status };
        throw err;
      }
    });
  }
}

export interface PutFileResult {
  hash: string;
  treeJSON: BlobHashTreeJSON;
  totalChunks: number;
}

export class StorageClient {
  private readonly gateway: StorageGatewayClient;

  constructor(
    private readonly bucket: string,
    storageGatewayUrl: string,
    private readonly backendCanisterId: string,
    private readonly projectId: string,
    private readonly agent: HttpAgent,
  ) {
    this.gateway = new StorageGatewayClient(storageGatewayUrl);
  }

  private async getCertificate(hash: string): Promise<Uint8Array> {
    const args = IDL.encode([IDL.Text], [hash]);
    const result = await this.agent.call(this.backendCanisterId, {
      methodName: "_caffeineStorageCreateCertificate",
      arg: args,
    });
    const body = result.response.body;
    if (isV3ResponseBody(body)) return body.certificate;
    throw new Error("Expected v3 response body");
  }

  /**
   * Upload a file in memory-safe 5 MB chunks.
   *
   * - Never reads more than one chunk into memory at a time.
   * - Uploads chunks sequentially so memory stays flat.
   * - Pass `startChunkIndex` + `precomputedTree` to resume after a crash
   *   without re-hashing the entire file.
   * - Calls `onProgress(pct, chunkIndex)` after each chunk so callers can
   *   persist the chunk index for crash-resume.
   */
  async putFile(
    blob: Blob,
    onProgress?: (percentage: number, chunkIndex: number) => void,
    startChunkIndex = 0,
    precomputedTree?: BlobHashTreeJSON,
  ): Promise<PutFileResult> {
    const httpHeaders: Headers = { "Content-Type": "application/json" };
    const fileHeaders: Headers = {
      "Content-Type": "application/octet-stream",
      "Content-Length": blob.size.toString(),
    };

    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE_BYTES) || 1;

    // ── Phase 1: Build blob hash tree ────────────────────────────────────────
    // If we have a stored tree from a previous run, skip re-hashing entirely.
    let blobHashTree: BlobHashTree;
    if (precomputedTree) {
      blobHashTree = BlobHashTree.fromJSON(precomputedTree);
    } else {
      // Hash one chunk at a time — peak memory = CHUNK_SIZE_BYTES
      const chunkHashes: YHash[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE_BYTES;
        const end = Math.min(start + CHUNK_SIZE_BYTES, blob.size);
        const chunkData = new Uint8Array(
          await blob.slice(start, end).arrayBuffer(),
        );
        chunkHashes.push(await YHash.fromChunk(chunkData));
        // chunkData is released here (let GC collect it)
      }
      blobHashTree = await BlobHashTree.build(chunkHashes, fileHeaders);
    }

    const blobRootHash = blobHashTree.tree.hash;
    const hashString = blobRootHash.toShaString();

    // ── Phase 2: Upload tree metadata (idempotent) ───────────────────────────
    const certificateBytes = await this.getCertificate(hashString);
    await this.gateway.uploadBlobTree(
      blobHashTree,
      this.bucket,
      blob.size,
      this.backendCanisterId,
      this.projectId,
      certificateBytes,
    );

    // ── Phase 3: Upload chunks sequentially from startChunkIndex ─────────────
    for (let i = startChunkIndex; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE_BYTES;
      const end = Math.min(start + CHUNK_SIZE_BYTES, blob.size);
      // Slice from the raw File/Blob — no full-file read
      const chunkData = new Uint8Array(
        await blob.slice(start, end).arrayBuffer(),
      );
      const chunkHash = blobHashTree.chunk_hashes[i];

      await this.gateway.uploadChunk({
        blobRootHash,
        chunkHash,
        chunkIndex: i,
        chunkData,
        bucketName: this.bucket,
        owner: this.backendCanisterId,
        projectId: this.projectId,
        httpHeaders,
      });

      // Release chunk data — let GC collect before next iteration
      if (onProgress) {
        const pct = Math.round(((i + 1) / totalChunks) * 100);
        onProgress(pct, i);
      }
    }

    return { hash: hashString, treeJSON: blobHashTree.toJSON(), totalChunks };
  }

  async getDirectURL(hash: string): Promise<string> {
    if (!hash) throw new Error("Hash must not be empty");
    validateHashFormat(hash, "getDirectURL");
    return `${this.gateway.getStorageGatewayUrl()}/${GATEWAY_VERSION}/blob/?blob_hash=${encodeURIComponent(hash)}&owner_id=${encodeURIComponent(this.backendCanisterId)}&project_id=${encodeURIComponent(this.projectId)}`;
  }
}
