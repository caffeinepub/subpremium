import type { backendInterface } from "../backend";
import { createActorWithConfig } from "../config";

/**
 * Returns an anonymous backend actor.
 * Safe to call outside of React hooks (e.g., in upload manager).
 */
export async function getBackendActor(): Promise<backendInterface> {
  return createActorWithConfig();
}
