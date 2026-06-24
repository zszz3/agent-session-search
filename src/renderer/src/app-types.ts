import type { SessionMigrationResult, SessionSearchResult } from "../../core/types";

export type ActionStatus = {
  kind: "running" | "success" | "error";
  message: string;
};

export type RefreshFeedback = ActionStatus | null;
export type StatsFeedback = ActionStatus | null;
export type QuotaFeedback = ActionStatus | null;
export type SettingsFeedback = ActionStatus | null;
export type SkillsFeedback = ActionStatus | null;

export interface ContextMenuState {
  x: number;
  y: number;
  session: SessionSearchResult;
}

export type DialogState =
  | {
      kind: "rename" | "tag";
      session: SessionSearchResult;
      value: string;
    }
  | null;

export type SessionMigrationDialogState =
  | { kind: "select"; session: SessionSearchResult }
  | {
      kind: "launch-failed";
      session: SessionSearchResult;
      result: SessionMigrationResult;
    }
  | null;
