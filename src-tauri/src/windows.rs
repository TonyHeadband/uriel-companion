use tauri::{AppHandle, Manager, Runtime, Window, WindowEvent};

const SETTINGS: &str = "settings";

/// The settings window is declared hidden in tauri.conf.json, so opening it never waits for a webview to load.
#[tauri::command]
pub fn open_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let win = app.get_webview_window(SETTINGS).ok_or("the settings window is missing")?;
    win.show().map_err(|e| e.to_string())?;
    win.unminimize().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())
}

/// Hides the settings window instead of closing it, and takes it down with the main window.
/// Returns whether the close should be cancelled.
fn on_close_requested<R: Runtime>(window: &Window<R>) -> bool {
    if window.label() == SETTINGS {
        let _ = window.hide();
        return true;
    }
    // A hidden settings window would otherwise keep the app running after the main window closes.
    if let Some(settings) = window.app_handle().get_webview_window(SETTINGS) {
        let _ = settings.destroy();
    }
    false
}

pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if on_close_requested(window) {
            api.prevent_close();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    fn app(labels: &[&str]) -> tauri::App<MockRuntime> {
        let app = mock_builder().build(mock_context(noop_assets())).unwrap();
        for label in labels {
            WebviewWindowBuilder::new(&app, *label, WebviewUrl::default()).build().unwrap();
        }
        app
    }

    #[test]
    fn open_settings_succeeds_when_the_window_exists() {
        let app = app(&["main", SETTINGS]);
        assert_eq!(open_settings(app.handle().clone()), Ok(()));
    }

    #[test]
    fn open_settings_reports_a_missing_window() {
        let app = app(&["main"]);
        assert_eq!(open_settings(app.handle().clone()), Err("the settings window is missing".to_string()));
    }

    #[test]
    fn closing_the_settings_window_is_cancelled_so_it_can_come_back() {
        let app = app(&["main", SETTINGS]);
        let settings = app.get_webview_window(SETTINGS).unwrap().as_ref().window();
        assert!(on_close_requested(&settings));
        assert!(app.get_webview_window(SETTINGS).is_some());
    }

    #[test]
    fn closing_the_main_window_is_not_cancelled() {
        // Settings teardown is verified manually: the mock runtime does not remove destroyed windows.
        let app = app(&["main", SETTINGS]);
        let main = app.get_webview_window("main").unwrap().as_ref().window();
        assert!(!on_close_requested(&main));
    }
}
