//! Tauri command boundary — every front-end call lands here.
//!
//! The frontend's lib/ipc.ts wraps these exactly; keep names in sync.

use crate::sidecar::{self, SidecarHandle};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct TaskDescriptor {
    pub id: String,
    pub code: String,
    pub name: String,
    pub desc: String,
    pub inputs: Vec<String>,
}

#[tauri::command]
pub async fn list_tasks() -> Vec<TaskDescriptor> {
    // Mirror src/tasks/registry.ts — the sidecar is the source of truth once
    // it boots; the frontend uses this list for cold-start menus.
    vec![
        td(
            "mp-cn",
            "MP-CN",
            "微创报销数据处理",
            "对账单字段清洗、合并、按项目编号汇总",
            &["xlsx"],
        ),
        td(
            "ww-au",
            "WW-AU",
            "旺旺-澳大利亚报销数据处理",
            "AUD 币种归一、GST 拆列、生成 SAP 导入模板",
            &["xlsx", "csv"],
        ),
        td(
            "mp-in",
            "MP-IN",
            "微创神通-印度报销文件整理",
            "原始凭证 PDF 重命名、按月份归档、生成索引",
            &["pdf", "xlsx"],
        ),
        td(
            "va-pay",
            "VA-PAY",
            "瓦里安-Payroll 账单拆分",
            "按 Entity / Cost Center 拆分薪资账单为独立工作簿",
            &["xlsx"],
        ),
        td(
            "va-vn-r",
            "VA-VN-R",
            "瓦里安越南-Payroll 报告处理",
            "VND 金额取整、按部门生成月度汇总与差异表",
            &["xlsx"],
        ),
        td(
            "va-vn-ps",
            "VA-VN-PS",
            "瓦里安越南-Payslip 处理",
            "批量生成员工 PDF Payslip、按身份证号加密",
            &["xlsx"],
        ),
    ]
}

fn td(id: &str, code: &str, name: &str, desc: &str, inputs: &[&str]) -> TaskDescriptor {
    TaskDescriptor {
        id: id.into(),
        code: code.into(),
        name: name.into(),
        desc: desc.into(),
        inputs: inputs.iter().map(|s| s.to_string()).collect(),
    }
}

#[derive(Serialize)]
pub struct SidecarStatus {
    pub connected: bool,
    pub version: String,
    pub python_version: String,
    pub pid: Option<u32>,
    pub mem_bytes: u64,
}

#[tauri::command]
pub async fn sidecar_status() -> SidecarStatus {
    let s: SidecarHandle = sidecar::status().await;
    SidecarStatus {
        connected: s.connected,
        version: s.version,
        python_version: s.python_version,
        pid: s.pid,
        mem_bytes: s.mem_bytes,
    }
}

#[tauri::command]
pub async fn sidecar_restart(app: AppHandle) -> Result<(), String> {
    sidecar::restart(app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pick_file(app: AppHandle, filters: Option<Vec<String>>) -> Option<String> {
    let dialog = app.dialog().file();
    let dialog = if let Some(exts) = filters {
        let exts_ref: Vec<&str> = exts.iter().map(String::as_str).collect();
        dialog.add_filter("data files", &exts_ref)
    } else {
        dialog
    };
    // blocking_pick_file blocks the runtime — use the async variant in real code.
    dialog.blocking_pick_file().map(|p| p.to_string())
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStartArgs {
    pub task_id: String,
    pub input: String,
    pub output_dir: String,
    #[serde(default)]
    pub options: serde_json::Value,
}

#[tauri::command]
pub async fn start_run(app: AppHandle, args: RunStartArgs) -> Result<String, String> {
    sidecar::start_run(
        app,
        &args.task_id,
        PathBuf::from(args.input),
        PathBuf::from(args.output_dir),
        args.options,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_run(run_id: String) -> Result<(), String> {
    sidecar::cancel_run(&run_id)
        .await
        .map_err(|e| e.to_string())
}
