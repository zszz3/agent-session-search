import { z } from "zod";
import { defineIpcRequest } from "./contract";

const noInput = z.tuple([]);
const pathInput = z.string().min(1).max(32_768).refine((value) => !value.includes("\0"), "Path must not contain NUL.");
const remoteIdInput = z.string().trim().min(1).max(512);
const fingerprintListInput = z.array(z.string().trim().min(1).max(512)).max(500);
const optionalBooleanInput = z
  .union([z.tuple([pathInput]), z.tuple([pathInput, z.boolean().optional()])])
  .transform((input): [string, boolean] => [input[0], input[1] ?? false]);

export const SKILLS_IPC = {
  list: defineIpcRequest("skills:list", noInput),
  refreshUsage: defineIpcRequest("skills:refresh-usage", noInput),
  getSyncSnapshot: defineIpcRequest("skills:sync-snapshot", noInput),
  upload: defineIpcRequest("skills:sync-upload", optionalBooleanInput),
  install: defineIpcRequest("skills:sync-install", z.tuple([remoteIdInput])),
  downloadMany: defineIpcRequest("skills:sync-download-many", z.tuple([fingerprintListInput])),
  deleteMany: defineIpcRequest("skills:sync-delete-many", z.tuple([fingerprintListInput])),
  getVersion: defineIpcRequest("skills:sync-get-version", z.tuple([remoteIdInput])),
  getDiff: defineIpcRequest("skills:sync-diff", z.tuple([pathInput.nullable(), remoteIdInput.nullable()])),
  copySetupSql: defineIpcRequest("skills:sync-copy-setup-sql", noInput),
  copyPath: defineIpcRequest("skills:copy-path", z.tuple([pathInput])),
  reveal: defineIpcRequest("skills:reveal", z.tuple([pathInput])),
  delete: defineIpcRequest("skills:delete", z.tuple([pathInput])),
  getUsageHookStatus: defineIpcRequest("skills:usage-hook-status", noInput),
  installUsageHook: defineIpcRequest("skills:install-usage-hook", noInput),
  uninstallUsageHook: defineIpcRequest("skills:uninstall-usage-hook", noInput),
} as const;
