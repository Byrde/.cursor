import { select } from "@inquirer/prompts";
import {
  normalizeProjectConfig,
  type ProjectConfig,
} from "../domain/config.js";
import type { ProviderTransitionResult } from "../domain/provider-transition.js";
import type { ClassifiedProjectSetup } from "./project-init-state.js";
import type { QuestionnairePrompts } from "./init-questionnaire.js";

const DEFAULT_PROMPTS: Pick<QuestionnairePrompts, "select"> = {
  select,
};

/**
 * Merge questionnaire workflow choices with the detected backlog subtree.
 */
export function buildKeepDetectedEffectiveConfig(
  questionnaireTarget: ProjectConfig,
  classified: ClassifiedProjectSetup,
): ProjectConfig | undefined {
  const detected = classified.bestResolvedInstalledConfig;
  if (!detected) {
    return undefined;
  }
  return normalizeProjectConfig({
    backlog: detected.backlog,
    workflow: questionnaireTarget.workflow,
  });
}

export function canOfferKeepDetected(
  classified: ClassifiedProjectSetup,
): boolean {
  if (classified.kind === "mixed_ambiguous") {
    return false;
  }
  return classified.bestResolvedInstalledConfig !== undefined;
}

export async function promptProviderTransition(
  options: {
    readonly classified: ClassifiedProjectSetup;
    readonly targetFromQuestionnaire: ProjectConfig;
  },
  prompts: Pick<QuestionnairePrompts, "select"> = DEFAULT_PROMPTS,
): Promise<ProviderTransitionResult> {
  const { classified, targetFromQuestionnaire } = options;

  const target = normalizeProjectConfig(targetFromQuestionnaire);
  const keep = buildKeepDetectedEffectiveConfig(target, classified);
  const offerKeep = canOfferKeepDetected(classified) && keep !== undefined;

  const detectedLabel =
    classified.kind === "template_uninitialized"
      ? "template / uninitialized"
      : classified.kind === "scaffolded_file"
        ? "file-backed backlog"
        : classified.kind === "scaffolded_github"
          ? "GitHub Project + issues"
          : "mixed / conflicting signals";

  const targetLabel =
    target.backlog.provider === "file"
      ? `file backlog (${target.backlog.file?.path ?? "?"})`
      : `GitHub (${target.backlog["github-issues"]?.repository ?? "?"} project #${target.backlog["github-issues"]?.projectNumber ?? "?"})`;

  if (classified.kind === "mixed_ambiguous") {
    const choice = await prompts.select({
      message:
        `Detected setup is ${detectedLabel}, but you selected ${targetLabel}.\n` +
        "Choose how to proceed (no automatic bulk rewrite—reconcile the repo with your selection in the one-time session after install).",
      choices: [
        {
          name: "Apply the selected setup (updates config, managed assets, and MCP as needed)",
          value: "transition" as const,
        },
        { name: "Cancel init", value: "cancel" as const },
      ],
    });

    if (choice === "cancel") {
      return { kind: "cancel" };
    }
    return { kind: "transition", effectiveConfig: target };
  }

  if (!offerKeep) {
    const choice = await prompts.select({
      message:
        `Detected setup is ${detectedLabel}, but you selected ${targetLabel}.\n` +
        "Choose how to proceed (no automatic bulk rewrite—reconcile the repo with your selection in the one-time session after install).",
      choices: [
        {
          name: "Apply the selected setup (updates config, managed assets, and MCP as needed)",
          value: "transition" as const,
        },
        { name: "Cancel init", value: "cancel" as const },
      ],
    });

    if (choice === "cancel") {
      return { kind: "cancel" };
    }
    return { kind: "transition", effectiveConfig: target };
  }

  const choice = await prompts.select({
    message:
      `Detected setup is ${detectedLabel}, but you selected ${targetLabel}.\n` +
      "Choose how to proceed (no automatic bulk rewrite—reconcile the repo with your selection in the one-time session after install).",
    choices: [
      {
        name: "Apply the selected setup (updates config, managed assets, and MCP as needed)",
        value: "transition" as const,
      },
      {
        name:
          "Keep detected backlog setup; apply only new workflow defaults and models from this run",
        value: "keep" as const,
      },
      { name: "Cancel init", value: "cancel" as const },
    ],
  });

  if (choice === "cancel") {
    return { kind: "cancel" };
  }
  if (choice === "keep") {
    return { kind: "keep_detected", effectiveConfig: keep! };
  }
  return { kind: "transition", effectiveConfig: target };
}
