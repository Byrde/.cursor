/** Placeholder in shipped agent templates; replaced at init/sync time. */
export const AGENT_MODEL_PLACEHOLDER = "{{MODEL}}";

export function renderAgentTemplate(
  templateUtf8: string,
  model: string,
): string {
  if (!templateUtf8.includes(AGENT_MODEL_PLACEHOLDER)) {
    throw new Error(
      `Agent template is missing ${AGENT_MODEL_PLACEHOLDER} placeholder`,
    );
  }
  return templateUtf8.replaceAll(AGENT_MODEL_PLACEHOLDER, model);
}
