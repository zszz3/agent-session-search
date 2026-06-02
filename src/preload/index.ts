import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, ResumePtySize } from "../core/platform";
import type { IndexStatus } from "../core/indexer";
import type {
  LiveSessionSnapshot,
  ProjectSummary,
  SearchOptions,
  SessionMessage,
  SessionSearchResult,
  SessionStats,
  SessionStatsOptions,
  ResumeConsoleEvent,
  ResumeConsoleSnapshot,
  UsageQuotaSnapshot,
} from "../core/types";

const api = {
  searchSessions: (options: SearchOptions): Promise<SessionSearchResult[]> => ipcRenderer.invoke("search:sessions", options),
  getSession: (sessionKey: string): Promise<SessionSearchResult | null> => ipcRenderer.invoke("session:get", sessionKey),
  getMessages: (sessionKey: string, offset?: number, limit?: number): Promise<SessionMessage[]> =>
    ipcRenderer.invoke("session:messages", sessionKey, offset, limit),
  getLiveSessions: (): Promise<LiveSessionSnapshot> => ipcRenderer.invoke("sessions:live"),
  getStats: (options?: SessionStatsOptions): Promise<SessionStats> => ipcRenderer.invoke("stats:get", options),
  getQuotas: (): Promise<UsageQuotaSnapshot> => ipcRenderer.invoke("quota:get"),
  listTags: (): Promise<string[]> => ipcRenderer.invoke("tags:list"),
  listProjects: (): Promise<ProjectSummary[]> => ipcRenderer.invoke("projects:list"),
  setCustomTitle: (sessionKey: string, title: string | null): Promise<void> => ipcRenderer.invoke("title:set", sessionKey, title),
  addTag: (sessionKey: string, tagName: string): Promise<void> => ipcRenderer.invoke("tag:add", sessionKey, tagName),
  removeTag: (sessionKey: string, tagName: string): Promise<void> => ipcRenderer.invoke("tag:remove", sessionKey, tagName),
  deleteTag: (tagName: string): Promise<void> => ipcRenderer.invoke("tag:delete", tagName),
  setFavorited: (sessionKey: string, favorited: boolean): Promise<void> => ipcRenderer.invoke("favorite:set", sessionKey, favorited),
  setPinned: (sessionKey: string, pinned: boolean): Promise<void> => ipcRenderer.invoke("pin:set", sessionKey, pinned),
  setHidden: (sessionKey: string, hidden: boolean): Promise<void> => ipcRenderer.invoke("hide:set", sessionKey, hidden),
  refreshIndex: (): Promise<IndexStatus> => ipcRenderer.invoke("index:refresh"),
  getIndexStatus: (): Promise<IndexStatus> => ipcRenderer.invoke("index:status"),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  setSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke("settings:set", settings),
  copyResumeCommand: (sessionKey: string): Promise<void> => ipcRenderer.invoke("command:copy-resume", sessionKey),
  resumeSession: (sessionKey: string): Promise<void> => ipcRenderer.invoke("command:resume", sessionKey),
  resumeSessionInIterm: (sessionKey: string): Promise<void> => ipcRenderer.invoke("command:resume-iterm", sessionKey),
  resumeConsoleGet: (sessionKey: string): Promise<ResumeConsoleSnapshot> => ipcRenderer.invoke("resume-console:get", sessionKey),
  resumeConsoleStart: (sessionKey: string, terminalSize?: Partial<ResumePtySize>): Promise<ResumeConsoleSnapshot> =>
    ipcRenderer.invoke("resume-console:start", sessionKey, terminalSize),
  resumeConsoleWrite: (sessionKey: string, data: string): Promise<ResumeConsoleSnapshot> =>
    ipcRenderer.invoke("resume-console:write", sessionKey, data),
  resumeConsoleStop: (sessionKey: string): Promise<ResumeConsoleSnapshot> => ipcRenderer.invoke("resume-console:stop", sessionKey),
  focusLiveTerminal: (sessionKey: string): Promise<void> => ipcRenderer.invoke("command:focus-live-terminal", sessionKey),
  openNativeApp: (sessionKey: string): Promise<void> => ipcRenderer.invoke("command:open-app", sessionKey),
  revealSession: (sessionKey: string): Promise<void> => ipcRenderer.invoke("command:reveal", sessionKey),
  copyMarkdown: (sessionKey: string): Promise<void> => ipcRenderer.invoke("command:copy-markdown", sessionKey),
  exportMarkdown: (sessionKey: string): Promise<boolean> => ipcRenderer.invoke("command:export-markdown", sessionKey),
  copyPlainText: (sessionKey: string): Promise<void> => ipcRenderer.invoke("command:copy-plain", sessionKey),
  onIndexStatus: (callback: (status: IndexStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: IndexStatus) => callback(status);
    ipcRenderer.on("index-status", listener);
    return () => ipcRenderer.removeListener("index-status", listener);
  },
  onFocusSearch: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on("focus-search", listener);
    return () => ipcRenderer.removeListener("focus-search", listener);
  },
  onOpenSettings: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on("open-settings", listener);
    return () => ipcRenderer.removeListener("open-settings", listener);
  },
  onResumeConsoleEvent: (callback: (event: ResumeConsoleEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, resumeEvent: ResumeConsoleEvent) => callback(resumeEvent);
    ipcRenderer.on("resume-console:event", listener);
    return () => ipcRenderer.removeListener("resume-console:event", listener);
  },
};

contextBridge.exposeInMainWorld("sessionSearch", api);

export type SessionSearchApi = typeof api;
