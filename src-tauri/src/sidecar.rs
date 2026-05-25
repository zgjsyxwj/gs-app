//! Python sidecar lifecycle + JSON line protocol.
//!
//! Wire format (one JSON object per newline):
//!   rust  → py:  {"id": "...", "method": "run", "params": {...}}
//!   py    → rust: {"id": "...", "event": "progress", "done": 4, "total": 6, "note": "..."}
//!   py    → rust: {"id": "...", "event": "log", "t": "14:22:01", "lvl": "info", "msg": "..."}
//!   py    → rust: {"id": "...", "event": "done", "ok": true, "duration_ms": 4180, "outputs": [...]}
//!
//! Rust re-emits these as Tauri events on the channel "run:event".

use anyhow::{anyhow, Result};
use once_cell::sync::OnceCell;
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

#[derive(Clone, Default)]
pub struct SidecarHandle {
    pub connected: bool,
    pub version: String,
    pub python_version: String,
    pub pid: Option<u32>,
    pub mem_bytes: u64,
}

struct Inner {
    child: Option<CommandChild>,
    handle: SidecarHandle,
}

static STATE: OnceCell<Arc<Mutex<Inner>>> = OnceCell::new();

fn state() -> Arc<Mutex<Inner>> {
    STATE.get_or_init(|| Arc::new(Mutex::new(Inner { child: None, handle: SidecarHandle::default() }))).clone()
}

pub async fn spawn(app: AppHandle) -> Result<()> {
    let sidecar = app
        .shell()
        .sidecar("pivot-sidecar")
        .map_err(|e| anyhow!("sidecar manifest missing: {e:?}"))?;

    let (mut rx, child) = sidecar.spawn().map_err(|e| anyhow!("sidecar spawn failed: {e:?}"))?;
    let pid = child.pid();

    {
        let s = state();
        let mut s = s.lock().await;
        s.child = Some(child);
        s.handle = SidecarHandle {
            connected: true,
            version: "0.1.0".into(),
            python_version: "unknown".into(),
            pid: Some(pid),
            mem_bytes: 0,
        };
    }

    // Pump stdout into Tauri events.
    let app_for_pump = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(ev) = rx.recv().await {
            match ev {
                CommandEvent::Stdout(line) => forward(&app_for_pump, &line),
                CommandEvent::Stderr(line) => log::warn!("sidecar stderr: {}", String::from_utf8_lossy(&line)),
                CommandEvent::Error(e)     => log::error!("sidecar error: {e}"),
                CommandEvent::Terminated(t) => {
                    log::info!("sidecar exited: code={:?} signal={:?}", t.code, t.signal);
                    let s = state();
                    let mut s = s.lock().await;
                    s.handle.connected = false;
                    s.child = None;
                    break;
                }
                _ => {}
            }
        }
    });

    // Refresh process memory periodically (best-effort).
    tauri::async_runtime::spawn(async {
        let mut sys = System::new();
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            let s = state();
            let mut s = s.lock().await;
            if let Some(pid) = s.handle.pid {
                sys.refresh_processes(ProcessesToUpdate::Some(&[Pid::from_u32(pid)]));
                if let Some(p) = sys.process(Pid::from_u32(pid)) {
                    s.handle.mem_bytes = p.memory();
                }
            }
        }
    });

    Ok(())
}

fn forward(app: &AppHandle, line: &[u8]) {
    let s = match std::str::from_utf8(line) { Ok(s) => s.trim(), Err(_) => return };
    if s.is_empty() { return; }

    // Parse and re-emit as a normalized event payload.
    let v: Value = match serde_json::from_str(s) {
        Ok(v) => v,
        Err(_) => { log::debug!("sidecar non-json line: {s}"); return; }
    };

    // The sidecar greets us once on boot — capture its real version strings
    // rather than leaving the SidecarHandle stuck on the spawn() placeholders.
    if v.get("event").and_then(|x| x.as_str()) == Some("hello") {
        let version = v.get("version").and_then(|x| x.as_str()).unwrap_or("unknown").to_string();
        let py_version = v.get("python_version").and_then(|x| x.as_str()).unwrap_or("unknown").to_string();
        tauri::async_runtime::spawn(async move {
            let s = state();
            let mut s = s.lock().await;
            s.handle.version = version;
            s.handle.python_version = py_version;
        });
        return; // don't forward to the frontend — transport-level event
    }

    let _ = app.emit("run:event", &v);
}

pub async fn status() -> SidecarHandle {
    state().lock().await.handle.clone()
}

pub async fn restart(app: AppHandle) -> Result<()> {
    {
        let s = state();
        let mut s = s.lock().await;
        if let Some(child) = s.child.take() {
            let _ = child.kill();
        }
        s.handle = SidecarHandle::default();
    }
    spawn(app).await
}

#[derive(Serialize)]
struct RunRequest<'a> {
    id: &'a str,
    method: &'a str,
    params: RunParams<'a>,
}
#[derive(Serialize)]
struct RunParams<'a> {
    task_id: &'a str,
    input: &'a str,
    output_dir: &'a str,
    options: &'a Value,
}

pub async fn start_run(
    _app: AppHandle,
    task_id: &str,
    input: PathBuf,
    output_dir: PathBuf,
    options: Value,
) -> Result<String> {
    let run_id = format!("r-{}", chrono::Utc::now().timestamp_millis());
    let req = RunRequest {
        id: &run_id,
        method: "run",
        params: RunParams {
            task_id,
            input: input.to_str().unwrap_or(""),
            output_dir: output_dir.to_str().unwrap_or(""),
            options: &options,
        },
    };
    let line = serde_json::to_string(&req)? + "\n";

    let s = state();
    let mut s = s.lock().await;
    let child = s.child.as_mut().ok_or_else(|| anyhow!("sidecar not running"))?;
    child.write(line.as_bytes()).map_err(|e| anyhow!("write failed: {e:?}"))?;
    Ok(run_id)
}

pub async fn cancel_run(run_id: &str) -> Result<()> {
    let line = format!("{{\"id\":\"{}\",\"method\":\"cancel\"}}\n", run_id);
    let s = state();
    let mut s = s.lock().await;
    let child = s.child.as_mut().ok_or_else(|| anyhow!("sidecar not running"))?;
    child.write(line.as_bytes()).map_err(|e| anyhow!("write failed: {e:?}"))?;
    Ok(())
}
