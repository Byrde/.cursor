import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_PROJECT_CONFIG,
  normalizeProjectConfig,
  PROJECT_CONFIG_FILENAME,
  type ProjectConfig,
} from "../domain/config.js";

const LEGACY_PROJECT_CONFIG_FILENAME = "byrde.json";

export interface ProjectConfigWriteResult {
  readonly path: string;
  readonly created: boolean;
}

export function projectConfigPath(cwd: string): string {
  return path.join(cwd, ".cursor", PROJECT_CONFIG_FILENAME);
}

export function loadProjectConfig(cwd: string): ProjectConfig | undefined {
  const configPath = projectConfigPath(cwd);
  const legacyPath = path.join(cwd, ".cursor", LEGACY_PROJECT_CONFIG_FILENAME);

  if (existsSync(configPath)) {
    return normalizeProjectConfig(
      JSON.parse(readFileSync(configPath, "utf8")),
    );
  }

  if (existsSync(legacyPath)) {
    return normalizeProjectConfig(
      JSON.parse(readFileSync(legacyPath, "utf8")),
    );
  }

  return undefined;
}

export function ensureProjectConfig(
  cwd: string,
  config: ProjectConfig = DEFAULT_PROJECT_CONFIG,
): ProjectConfigWriteResult {
  const configPath = projectConfigPath(cwd);
  if (existsSync(configPath)) {
    return {
      path: configPath,
      created: false,
    };
  }

  mkdirSync(path.dirname(configPath), { recursive: true });
  const normalized = normalizeProjectConfig(config);
  writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return {
    path: configPath,
    created: true,
  };
}

export function saveProjectConfig(
  cwd: string,
  config: ProjectConfig = DEFAULT_PROJECT_CONFIG,
): ProjectConfigWriteResult {
  const configPath = projectConfigPath(cwd);
  const created = !existsSync(configPath);
  mkdirSync(path.dirname(configPath), { recursive: true });
  const normalized = normalizeProjectConfig(config);
  writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return {
    path: configPath,
    created,
  };
}
