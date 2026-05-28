/**
 * Thin wrapper over Tauri's invoke() — every backend call goes through here so
 * the frontend never imports @tauri-apps/api directly.
 *
 * The sidecar protocol is JSON-RPC-ish over the Rust command boundary:
 *   front → rust: invoke("run_task", { taskId, input, output, options })
 *   rust  → py:   newline-delimited JSON on stdin
 *   py    → rust: newline-delimited JSON on stdout (events + result)
 *   rust  → front: event("task:progress" | "task:log" | "task:done")
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { check as checkUpdater, type Update, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateDownloadEvent = DownloadEvent;

export type SidecarStatus = {
  connected: boolean;
  version: string;
  python_version: string;
  pid: number | null;
  mem_bytes: number;
};

export type TaskDescriptor = {
  id: string; // e.g. "va-tw-payroll-split"
  code: string; // e.g. "VA-TW-PAYROLL-SPLIT"
  name: string;
  desc: string;
  inputs: string[]; // ["xlsx", "csv"]
};

export type TaskOptions = Record<string, string | number | boolean>;

export type RunStartArgs = {
  taskId: string;
  input: string; // file or folder path
  outputDir: string;
  options: TaskOptions;
};

// The sidecar emits events in snake_case (see ipc.py). Rust forwards verbatim,
// so the payload that reaches `onRunEvent` is keyed by sidecar field names —
// `done`, `total`, `note`, `duration_ms`, etc. Discriminator is `event`. Other
// event kinds (e.g. "hello", "error") are filtered by Rust or simply ignored
// by handlers — the union below covers everything callers consume.
export type RunEvent =
  | { id: string; event: "progress"; done: number; total: number; note?: string }
  | { id: string; event: "log"; t: string; lvl: "info" | "warn" | "ok" | "err"; msg: string }
  | {
      id: string;
      event: "done";
      ok: boolean;
      duration_ms: number;
      outputs: string[];
      warnings: string[];
    };

export type PayslipRow = {
  code: string;
  slug: string;
  mon: string; // "Mar"
  year: string; // "2026"
  period_num: string; // "202603"
  orig_name: string;
  new_name: string;
  bytes: number;
};

export type PayslipScan = {
  rows: PayslipRow[];
  skipped: string[];
  total_bytes: number;
};

export type UpdateInfo = {
  available: boolean;
  version?: string;
  currentVersion?: string;
  notes?: string;
  date?: string;
};

// Stash the resolved Update handle so install can act on it without leaking
// the plugin's type through this module's public API.
let pendingUpdate: Update | null = null;

export const ipc = {
  listTasks: () => invoke<TaskDescriptor[]>("list_tasks"),
  systemUsername: () => invoke<string>("system_username"),
  sidecarStatus: () => invoke<SidecarStatus>("sidecar_status"),
  restartSidecar: () => invoke<void>("sidecar_restart"),
  pickFile: (filters?: string[]) => invoke<string | null>("pick_file", { filters }),
  pickFolder: () => invoke<string | null>("pick_folder"),
  startRun: (args: RunStartArgs) => invoke<string>("start_run", { args }), // returns runId
  cancelRun: (runId: string) => invoke<void>("cancel_run", { runId }),
  payslipScan: (dir: string) => invoke<PayslipScan>("payslip_scan", { dir }),
  payrollScan: (path: string) => invoke<string[]>("payroll_scan", { path }),
  revealInFolder: (path: string) => invoke<void>("reveal_in_folder", { path }),
  zipFiles: (filePaths: string[], dstZip: string) =>
    invoke<string>("zip_files", { filePaths, dstZip }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),

  onRunEvent(cb: (ev: RunEvent) => void): Promise<UnlistenFn> {
    return listen<RunEvent>("run:event", (e) => cb(e.payload));
  },

  async checkForUpdate(): Promise<UpdateInfo> {
    const u = await checkUpdater();
    pendingUpdate = u;
    if (!u) return { available: false };
    return {
      available: true,
      version: u.version,
      currentVersion: u.currentVersion,
      notes: u.body,
      date: u.date,
    };
  },

  async installAndRelaunch(onProgress?: (e: UpdateDownloadEvent) => void): Promise<void> {
    if (!pendingUpdate) throw new Error("no pending update — call checkForUpdate first");
    await pendingUpdate.downloadAndInstall(onProgress);
    await relaunch();
  },
};
