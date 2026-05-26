mod commands;
mod sidecar;

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Boot the Python sidecar once the window exists.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = sidecar::spawn(handle).await {
                    log::error!("sidecar boot failed: {e:?}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_tasks,
            commands::system_username,
            commands::sidecar_status,
            commands::sidecar_restart,
            commands::pick_file,
            commands::pick_folder,
            commands::start_run,
            commands::cancel_run,
            commands::payslip_scan,
            commands::payroll_scan,
            commands::reveal_in_folder,
            commands::zip_files,
            commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running pivot-desk");
}
