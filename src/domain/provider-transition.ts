import type { ProjectConfig } from "./config.js";

/**
 * Result of the interactive provider mismatch prompt (task 026).
 * `cancel` carries no effective config; `transition` and `keep_detected` must include it.
 */
export type ProviderTransitionResult =
  | {
      readonly kind: "transition";
      readonly effectiveConfig: ProjectConfig;
    }
  | {
      readonly kind: "keep_detected";
      readonly effectiveConfig: ProjectConfig;
    }
  | { readonly kind: "cancel" };

/**
 * Proof that the user confirmed a provider-affecting change. Required when
 * `compareDetectedSetupToTarget` is not `matches_target`.
 */
export interface ProviderTransitionAck {
  readonly kind: "transition" | "keep_detected";
  readonly effectiveConfig: ProjectConfig;
}

export class ProviderTransitionRequiredError extends Error {
  readonly code = "PROVIDER_TRANSITION_REQUIRED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProviderTransitionRequiredError";
  }
}
