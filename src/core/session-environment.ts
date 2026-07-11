import type { EnvironmentKind } from "./types";

export interface SessionEnvironmentIdentity {
  environmentKind: EnvironmentKind;
  environmentId: string;
}

export function isLocalSessionEnvironment(session: SessionEnvironmentIdentity): boolean {
  return session.environmentKind === "local" && session.environmentId === "local";
}
