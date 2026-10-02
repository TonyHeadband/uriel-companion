use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("config.json"))
}

pub fn read_config(path: &Path) -> Result<Option<serde_json::Value>, String> {
    match fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).map(Some).map_err(|e| format!("{}: {e}", path.display())),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

pub fn write_config(path: &Path, value: &serde_json::Value) -> Result<(), String> {
    let dir = path.parent().ok_or("config path has no folder")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    // Write then rename, so a crash mid-write never leaves half a file.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    read_config(&config_path(&app)?)
}

#[tauri::command]
pub fn save_config(app: AppHandle, value: serde_json::Value) -> Result<(), String> {
    write_config(&config_path(&app)?, &value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("uriel-companion-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join("config.json")
    }

    #[test]
    fn missing_file_is_none() {
        assert_eq!(read_config(&temp_file("missing")).unwrap(), None);
    }

    #[test]
    fn write_then_read_round_trips_and_creates_the_folder() {
        let p = temp_file("roundtrip");
        let v = serde_json::json!({"gateway_url": "https://u"});
        write_config(&p, &v).unwrap();
        assert_eq!(read_config(&p).unwrap(), Some(v));
    }

    #[test]
    fn corrupt_file_is_an_error_naming_the_file() {
        let p = temp_file("corrupt");
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, "{nope").unwrap();
        let err = read_config(&p).unwrap_err();
        assert!(err.contains("config.json"), "{err}");
    }
}
