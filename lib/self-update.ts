import "server-only";
import { createUpdater } from "./update-service";
import { APP_VERSION, BUILD_SHA, GITHUB_REPO } from "./build-info";
export type { UpdateStatus, UpdateStep, UpdateResult } from "./update-types";
export const RESTART_EXIT_CODE = 75;
const updater = createUpdater({ cwd: process.cwd(), version: APP_VERSION, buildSha: BUILD_SHA, repository: GITHUB_REPO, supervised: process.env.BEADSCOPE_SUPERVISED === "1",
  requestDir: process.env.BEADSCOPE_UPDATE_REQUEST_DIR || undefined, statusFile: process.env.BEADSCOPE_UPDATE_STATUS_FILE || undefined });
export const checkForUpdate = updater.check;
export const runUpdate = updater.update;
