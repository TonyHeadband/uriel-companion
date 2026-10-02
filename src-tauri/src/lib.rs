mod auth;
mod config;
mod windows;

pub fn run() {
    // WebKitGTK's DMA-BUF renderer crashes on NVIDIA under Wayland ("Error 71 (Protocol error)"); the
    // fallback renderer is fine for a small window. Respect an explicit setting from the environment.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(auth::Session::default())
        .on_window_event(windows::on_window_event)
        .invoke_handler(tauri::generate_handler![
            config::load_config,
            config::save_config,
            auth::sign_in,
            auth::access_token,
            auth::refresh_access_token,
            auth::sign_out,
            auth::api_key,
            auth::set_api_key,
            windows::open_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running uriel-companion");
}
