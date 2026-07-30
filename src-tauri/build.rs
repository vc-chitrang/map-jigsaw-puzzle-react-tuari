fn main() {
    let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default());
    let env_path = manifest_dir.join(".env");
    if env_path.exists() {
        println!("cargo:rerun-if-changed={}", env_path.display());
        if let Ok(iter) = dotenvy::from_path_iter(&env_path) {
            for item in iter {
                if let Ok((key, val)) = item {
                    if key.starts_with("MAP_") {
                        println!("cargo:rustc-env={key}={val}");
                    }
                }
            }
        }
    }
    tauri_build::build()
}
