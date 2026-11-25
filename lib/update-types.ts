/** Shared server/client types for version discovery and exact-target updates. */
export type UpdateChannel = "stable" | "development";
/** `sha` pins a Git checkout's target; an npm install is pinned by its release `tag` alone. */
export interface UpdateTarget { channel: UpdateChannel; sha?: string; tag?: string }
export type InstallKind = "git" | "npm" | "manual";
export interface UpdateStatus {
  channel: UpdateChannel;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  updateAvailable: boolean;
  canUpdate: boolean;
  manualReason?: string;
  target?: UpdateTarget;
  isGitRepo: boolean;
  /** How this copy was installed; decides what "Update now" does. */
  installKind?: InstallKind;
  supervised: boolean;
  /** An npm install is replaced by the server's own updater service, not by this process. */
  viaUpdater?: boolean;
  behind: number;
  localSha: string;
  remoteSha: string;
  error?: string;
  /** Why the server's updater could not install this release last time (set only when it has a status file). */
  updaterError?: string;
}
export interface UpdateStep { name: string; ok: boolean; output: string }
export interface UpdateResult { ok: boolean; steps: UpdateStep[]; restarting: boolean; /** The install was handed to the server's updater; this process stays up until the updater stops it. */ queued?: boolean; fromSha: string; toSha: string }
