use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Write};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

#[derive(Serialize, Deserialize, Clone)]
pub struct TrainedVector {
    pub category: String,
    pub embedding: Vec<f32>,
}

pub static TRAINED_MEMORY: OnceLock<Mutex<Vec<TrainedVector>>> = OnceLock::new();

fn get_mem() -> &'static Mutex<Vec<TrainedVector>> {
    TRAINED_MEMORY.get_or_init(|| Mutex::new(Vec::new()))
}

pub fn get_memory_file_path() -> PathBuf {
    crate::get_app_dir().join("trained_categories.json")
}

const DEFAULT_JSON: &str = include_str!("initial_trained_categories.json");

pub fn load_trained_memory() {
    let path = get_memory_file_path();
    let default_vectors: Vec<TrainedVector> = serde_json::from_str(DEFAULT_JSON).unwrap_or_default();

    if path.exists() {
        if let Ok(file) = File::open(&path) {
            let reader = BufReader::new(file);
            if let Ok(mut local_data) = serde_json::from_reader::<_, Vec<TrainedVector>>(reader) {
                // Merge default vectors that are missing in local data
                let mut merged_any = false;
                for dv in default_vectors {
                    // Check if a vector with the same embedding floats already exists
                    let exists = local_data.iter().any(|lv| {
                        if lv.embedding.len() != dv.embedding.len() {
                            return false;
                        }
                        // Cosine similarity or exact check
                        crate::embedding::cosine_similarity(&lv.embedding, &dv.embedding) > 0.999
                    });

                    if !exists {
                        local_data.push(dv);
                        merged_any = true;
                    }
                }
                
                *get_mem().lock().unwrap() = local_data;
                log::info!("Eğitilmiş vektör hafızası yüklendi (Birleştirme yapıldı).");
                if merged_any {
                    save_trained_memory();
                }
            }
        }
    } else {
        log::info!("trained_categories.json bulunamadı, varsayılan şablonla oluşturuluyor...");
        *get_mem().lock().unwrap() = default_vectors;
        save_trained_memory();
    }
}

pub fn save_trained_memory() {
    let path = get_memory_file_path();
    if let Ok(mut file) = File::create(path) {
        let data = get_mem().lock().unwrap().clone();
        if let Ok(json) = serde_json::to_string_pretty(&data) {
            let _ = file.write_all(json.as_bytes());
        }
    }
}

pub fn add_trained_vector(category: String, embedding: Vec<f32>) {
    let mut mem = get_mem().lock().unwrap();
    mem.push(TrainedVector { category, embedding });
    drop(mem);
    save_trained_memory();
}

pub fn add_trained_vectors_bulk(vectors: Vec<TrainedVector>) {
    let mut mem = get_mem().lock().unwrap();
    let mut added = false;
    for v in vectors {
        let exists = mem.iter().any(|lv| {
            if lv.embedding.len() != v.embedding.len() {
                return false;
            }
            crate::embedding::cosine_similarity(&lv.embedding, &v.embedding) > 0.999
        });
        if !exists {
            mem.push(v);
            added = true;
        }
    }
    if added {
        drop(mem);
        save_trained_memory();
    }
}

pub fn find_best_match(embedding: &[f32], threshold: f32) -> Option<String> {
    let mem = get_mem().lock().unwrap();
    let mut best_cat = None;
    let mut best_score = threshold;

    for tv in mem.iter() {
        let sim = crate::embedding::cosine_similarity(embedding, &tv.embedding);
        if sim > best_score {
            best_score = sim;
            best_cat = Some(tv.category.clone());
        }
    }

    best_cat
}
