use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct ImageData {
    pub width: u32,
    pub height: u32,
    /// Linear-light RGBA Float32 (0.0-1.0), length = width * height * 4
    pub data: Vec<f32>,
}

#[inline]
fn srgb_to_linear(v: f32) -> f32 {
    if v <= 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}

#[inline]
fn linear_to_srgb(v: f32) -> u8 {
    let c = v.clamp(0.0, 1.0);
    let enc = if c <= 0.0031308 {
        12.92 * c
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    };
    (enc * 255.0).round() as u8
}

fn load_standard_image(path: &Path) -> Result<ImageData, String> {
    let img = image::open(path)
        .map_err(|e| format!("Cannot open image: {e}"))?
        .to_rgba8();
    let (width, height) = img.dimensions();
    let data: Vec<f32> = img
        .into_raw()
        .chunks(4)
        .flat_map(|px| {
            [
                srgb_to_linear(px[0] as f32 / 255.0),
                srgb_to_linear(px[1] as f32 / 255.0),
                srgb_to_linear(px[2] as f32 / 255.0),
                px[3] as f32 / 255.0,
            ]
        })
        .collect();
    Ok(ImageData { width, height, data })
}

fn load_raw_image(path: &Path) -> Result<ImageData, String> {
    use rawler::decoders::RawDecodeParams;
    use rawler::rawsource::RawSource;
    use rawler::get_decoder;

    let rawsource = RawSource::new(path)
        .map_err(|e| format!("Cannot open RAW file: {e}"))?;

    let decoder = get_decoder(&rawsource)
        .map_err(|e| format!("No decoder for this RAW format: {e}"))?;

    let params = RawDecodeParams::default();

    let dynamic_image = decoder
        .full_image(&rawsource, &params)
        .map_err(|e| format!("RAW decode failed: {e}"))?
        .ok_or_else(|| "RAW file has no embedded image".to_string())?;

    let width = dynamic_image.width();
    let height = dynamic_image.height();
    let rgb16 = dynamic_image.to_rgb16();

    let data: Vec<f32> = rgb16
        .pixels()
        .flat_map(|px| [px[0] as f32 / 65535.0, px[1] as f32 / 65535.0, px[2] as f32 / 65535.0, 1.0f32])
        .collect();

    Ok(ImageData { width, height, data })
}

#[tauri::command]
fn load_image(path: String) -> Result<ImageData, String> {
    let p = Path::new(&path);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" => load_standard_image(p),
        "cr2" | "cr3" | "nef" | "arw" | "raf" | "orf" | "rw2" | "dng" => load_raw_image(p),
        _ => Err(format!("Unsupported format: .{ext}")),
    }
}

#[tauri::command]
fn export_image(path: String, width: u32, height: u32, data: Vec<f32>) -> Result<(), String> {
    use image::{ImageBuffer, Rgba};
    let pixels: Vec<u8> = data
        .chunks(4)
        .flat_map(|px| {
            [linear_to_srgb(px[0]), linear_to_srgb(px[1]), linear_to_srgb(px[2]), (px[3].clamp(0.0, 1.0) * 255.0) as u8]
        })
        .collect();
    let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_raw(width, height, pixels).ok_or("Failed to create image buffer")?;
    img.save(Path::new(&path)).map_err(|e| format!("Export failed: {e}"))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_image, export_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
