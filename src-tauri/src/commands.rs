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
            "复制供应商 PDF · 按 {code}_{YYYYMM}.pdf 重命名 · 清除底部水印",
            &["folder"],
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
pub fn system_username() -> String {
    #[cfg(windows)]
    let key = "USERNAME";
    #[cfg(not(windows))]
    let key = "USER";
    std::env::var(key).unwrap_or_default()
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

// ─────────────────────────── Payslip scan ───────────────────────────
//
// VA-VN-PS needs a cheap directory listing BEFORE the task runs so the UI
// can render the comparison list (original → renamed). We do this in Rust
// rather than via the sidecar streaming protocol because it's a single
// synchronous response with no progress to report. The Python task is still
// the authority on actual file processing — this command only inspects
// filenames.

#[derive(Serialize)]
pub struct PayslipRow {
    pub code: String,
    pub slug: String,
    pub mon: String,
    pub year: String,
    pub period_num: String,
    pub orig_name: String,
    pub new_name: String,
    pub bytes: u64,
}

#[derive(Serialize)]
pub struct PayslipScan {
    pub rows: Vec<PayslipRow>,
    pub skipped: Vec<String>,
    pub total_bytes: u64,
}

fn month_num(mon: &str) -> Option<u8> {
    Some(match mon {
        "Jan" => 1,
        "Feb" => 2,
        "Mar" => 3,
        "Apr" => 4,
        "May" => 5,
        "Jun" => 6,
        "Jul" => 7,
        "Aug" => 8,
        "Sep" => 9,
        "Oct" => 10,
        "Nov" => 11,
        "Dec" => 12,
        _ => return None,
    })
}

fn parse_payslip_filename(name: &str) -> Option<PayslipRow> {
    // Case-insensitive .pdf suffix — supplier files sometimes ship as .PDF.
    let stem = if name.len() >= 4 && name[name.len() - 4..].eq_ignore_ascii_case(".pdf") {
        &name[..name.len() - 4]
    } else {
        return None;
    };
    let (left, period) = stem.rsplit_once("_payslip_for_")?;
    let (code, slug) = left.split_once('-')?;
    let (mon, year_str) = period.split_once('-')?;
    let month = month_num(mon)?;
    let year: u32 = year_str.parse().ok()?;
    if !(2000..=2999).contains(&year) {
        return None;
    }
    if code.is_empty()
        || !code
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        return None;
    }
    if slug.is_empty()
        || !slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return None;
    }
    let period_num = format!("{year_str}{month:02}");
    Some(PayslipRow {
        code: code.to_string(),
        slug: slug.to_string(),
        mon: mon.to_string(),
        year: year_str.to_string(),
        new_name: format!("{code}_{period_num}.pdf"),
        period_num,
        orig_name: name.to_string(),
        bytes: 0,
    })
}

// ─────────────────────────── Reveal in folder / Zip folder ───────────────────
//
// Both helpers serve the Payslip "completed" footer:
//   · "在文件夹中显示" → reveal_in_folder(outDir)
//   · "打包 ZIP"       → zip_folder(outDir, outDir + ".zip") then reveal the zip
// We invoke OS file managers via std::process::Command directly (not the shell
// plugin) — no capability change required, since the security boundary is the
// Tauri command surface that already gates the path.

#[tauri::command]
pub async fn reveal_in_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("路径不存在：{path}"));
    }
    open_in_os_file_manager(&p).map_err(|e| e.to_string())
}

// Open an https URL in the user's default browser. Used as the updater
// fallback: when reqwest can't reach GitHub's release CDN (common on CN
// networks), the user can still download the installer through their own
// browser/VPN. Restricted to https to avoid this becoming a generic
// shell-out for arbitrary schemes.
#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("only https URLs are allowed".to_string());
    }
    open_url_in_browser(&url).map_err(|e| e.to_string())
}

fn open_url_in_browser(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(url).status()?;
    }
    #[cfg(target_os = "windows")]
    {
        // Empty "" is the window title arg — without it `start` treats the
        // URL itself as the title and opens nothing.
        std::process::Command::new("cmd")
            .args(["/c", "start", "", url])
            .status()?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(url).status()?;
    }
    Ok(())
}

fn open_in_os_file_manager(path: &std::path::Path) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        // `open -R <file>` highlights a file; `open <folder>` opens a folder.
        let mut cmd = std::process::Command::new("open");
        if path.is_file() {
            cmd.arg("-R");
        }
        cmd.arg(path).status()?;
    }
    #[cfg(target_os = "windows")]
    {
        // `explorer.exe /select,<file>` highlights a file; bare path opens dir.
        let mut cmd = std::process::Command::new("explorer.exe");
        if path.is_file() {
            // /select expects path as a separate arg per Win32 convention.
            cmd.arg(format!("/select,{}", path.display()));
        } else {
            cmd.arg(path);
        }
        cmd.status()?;
    }
    #[cfg(target_os = "linux")]
    {
        // xdg-open has no "select" — fall back to opening the parent dir.
        let target = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        std::process::Command::new("xdg-open")
            .arg(target)
            .status()?;
    }
    Ok(())
}

#[tauri::command]
pub async fn zip_files(file_paths: Vec<String>, dst_zip: String) -> Result<String, String> {
    use std::io::Write;

    if file_paths.is_empty() {
        return Err("没有可打包的文件".to_string());
    }
    let dst = PathBuf::from(&dst_zip);
    if let Some(parent) = dst.parent() {
        if !parent.exists() {
            return Err(format!("目标目录不存在：{}", parent.display()));
        }
    }
    let file = std::fs::File::create(&dst).map_err(|e| e.to_string())?;

    let mut writer = zip::ZipWriter::new(file);
    let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Add files in the given order (caller controls ordering via the array).
    // Duplicate basenames are disambiguated with a numeric suffix so the zip
    // stays valid even if two outputs collide.
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for p in &file_paths {
        let path = PathBuf::from(p);
        if !path.is_file() {
            return Err(format!("文件不存在或不可读：{p}"));
        }
        let base = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("文件名无法解析：{p}"))?
            .to_string();
        let entry_name = unique_entry_name(&base, &mut seen);
        writer
            .start_file(entry_name, options)
            .map_err(|e| e.to_string())?;
        let data = std::fs::read(&path).map_err(|e| e.to_string())?;
        writer.write_all(&data).map_err(|e| e.to_string())?;
    }
    writer.finish().map_err(|e| e.to_string())?;
    Ok(dst.to_string_lossy().to_string())
}

fn unique_entry_name(base: &str, seen: &mut std::collections::HashSet<String>) -> String {
    if seen.insert(base.to_string()) {
        return base.to_string();
    }
    let (stem, ext) = match base.rfind('.') {
        Some(i) if i > 0 => (&base[..i], &base[i..]),
        _ => (base, ""),
    };
    for n in 2.. {
        let candidate = format!("{stem} ({n}){ext}");
        if seen.insert(candidate.clone()) {
            return candidate;
        }
    }
    unreachable!()
}

// ─────────────────────────── Payroll sheet scan ───────────────────────────
//
// VA-PAY needs to validate that the supplier xlsx actually contains the sheets
// the split map expects. .xlsx is a zip; sheet names live in `xl/workbook.xml`
// as `<sheet name="..." .../>`. We reuse the existing `zip` dep and do a
// minimal string scan rather than pulling in a real XML / xlsx parser — this
// command only reads names, not cells.

#[tauri::command]
pub async fn payroll_scan(path: String) -> Result<Vec<String>, String> {
    use std::io::Read;
    let file = std::fs::File::open(&path).map_err(|e| format!("打开失败：{e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| "不是有效的 xlsx 文件".to_string())?;
    let mut xml = String::new();
    archive
        .by_name("xl/workbook.xml")
        .map_err(|_| "不是有效的 xlsx（缺少 workbook.xml）".to_string())?
        .read_to_string(&mut xml)
        .map_err(|e| e.to_string())?;
    Ok(extract_sheet_names(&xml))
}

fn extract_sheet_names(xml: &str) -> Vec<String> {
    let mut names = Vec::new();
    let bytes = xml.as_bytes();
    let mut i = 0usize;
    while i + 7 < bytes.len() {
        // Match "<sheet " or "<sheet\t" — but not "<sheets>" or "<sheetData>".
        if &bytes[i..i + 6] == b"<sheet" && matches!(bytes[i + 6], b' ' | b'\t' | b'\n' | b'\r') {
            let end = bytes[i..]
                .iter()
                .position(|&b| b == b'>')
                .map(|p| i + p)
                .unwrap_or(bytes.len());
            let tag = &xml[i..end];
            if let Some(name) = extract_attr(tag, "name") {
                names.push(name);
            }
            i = end;
        }
        i += 1;
    }
    names
}

fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let needle = format!("{attr}=\"");
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('"')? + start;
    Some(tag[start..end].to_string())
}

#[tauri::command]
pub async fn payslip_scan(dir: String) -> Result<PayslipScan, String> {
    let path = PathBuf::from(&dir);
    if !path.is_dir() {
        return Err(format!("not a directory: {dir}"));
    }
    let read = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut entries: Vec<_> = read.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());

    let mut rows = Vec::new();
    let mut skipped = Vec::new();
    let mut total_bytes: u64 = 0;
    for e in entries {
        let p = e.path();
        if p.extension()
            .and_then(|x| x.to_str())
            .map(|s| s.to_ascii_lowercase())
            .as_deref()
            != Some("pdf")
        {
            continue;
        }
        let name = match p.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        match parse_payslip_filename(&name) {
            Some(mut row) => {
                let bytes = e.metadata().map(|m| m.len()).unwrap_or(0);
                row.bytes = bytes;
                total_bytes += bytes;
                rows.push(row);
            }
            None => skipped.push(name),
        }
    }
    Ok(PayslipScan {
        rows,
        skipped,
        total_bytes,
    })
}
