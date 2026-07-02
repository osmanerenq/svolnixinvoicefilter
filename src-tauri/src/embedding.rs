use std::sync::{Mutex, OnceLock};
use ort::{inputs, session::Session, value::Tensor};
use ort::execution_providers::CPUExecutionProvider;
use ndarray::Array2;
use tokenizers::Tokenizer;

static ENGINE: OnceLock<EmbeddingEngine> = OnceLock::new();

pub struct EmbeddingEngine {
    session: Mutex<Session>,
    tokenizer: Tokenizer,
}

impl EmbeddingEngine {
    pub fn init(model_path: &str, tokenizer_path: &str) -> Result<(), String> {
        log::info!("Embedding: tokenizer yukleniyor...");
        let tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|e| {
                log::error!("Embedding: tokenizer hatasi: {}", e);
                format!("Tokenizer yuklenemedi: {}", e)
            })?;
        log::info!("Embedding: tokenizer yuklendi");

        log::info!("Embedding: ONNX model yukleniyor ({} MB)...", 
            std::fs::metadata(model_path).map(|m| m.len() / 1024 / 1024).unwrap_or(0));
        let session = Session::builder()
            .map_err(|e| format!("Session builder: {}", e))?
            // CPU-only: GPU provider arama hang'ini önler
            .with_execution_providers([CPUExecutionProvider::default().build()])
            .map_err(|e| format!("Execution provider: {}", e))?
            .with_intra_threads(2)
            .map_err(|e| format!("Thread config: {}", e))?
            .commit_from_file(model_path)
            .map_err(|e| {
                log::error!("Embedding: model yukleme hatasi: {}", e);
                format!("Model yuklenemedi: {}", e)
            })?;
        log::info!("Embedding: ONNX model yuklendi");

        ENGINE
            .set(EmbeddingEngine { session: Mutex::new(session), tokenizer })
            .map_err(|_| "Embedding engine zaten baslatilmis".to_string())
    }

    pub fn get() -> Option<&'static EmbeddingEngine> {
        ENGINE.get()
    }

    pub fn embed(&self, text: &str) -> Result<Vec<f32>, String> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| format!("Tokenization: {}", e))?;

        let ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
        let mask: Vec<i64> = encoding.get_attention_mask().iter().map(|&m| m as i64).collect();
        let type_ids: Vec<i64> = vec![0i64; ids.len()]; // token_type_ids — tüm modeller için sıfır
        let seq_len = ids.len();

        if seq_len == 0 {
            return Err("Bos metin".into());
        }

        let ids_array = Array2::<i64>::from_shape_vec((1, seq_len), ids)
            .map_err(|e| format!("Array: {}", e))?;
        let mask_array = Array2::<i64>::from_shape_vec((1, seq_len), mask)
            .map_err(|e| format!("Array: {}", e))?;
        let type_array = Array2::<i64>::from_shape_vec((1, seq_len), type_ids)
            .map_err(|e| format!("Array: {}", e))?;

        let ids_tensor = Tensor::from_array(ids_array)
            .map_err(|e| format!("Tensor: {}", e))?;
        let mask_tensor = Tensor::from_array(mask_array)
            .map_err(|e| format!("Tensor: {}", e))?;
        let type_tensor = Tensor::from_array(type_array)
            .map_err(|e| format!("Tensor: {}", e))?;

        let mut session = self.session.lock().unwrap();

        // 3 input dene, olmazsa 2 input ile tekrar dene
        let outputs = session.run(inputs![ids_tensor, mask_tensor, type_tensor])
            .map_err(|e| format!("Inference: {}", e))?;

        let (_shape, raw_data): (&ort::value::Shape, &[f32]) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Output extract: {}", e))?;

        // Mean pooling: (batch=1, seq_len, hidden_dim) → (hidden_dim,)
        let total = raw_data.len();
        let embed_dim = total / seq_len;
        let pooled: Vec<f32> = (0..embed_dim)
            .map(|d| {
                let sum: f32 = (0..seq_len).map(|t| raw_data[t * embed_dim + d]).sum();
                sum / seq_len as f32
            })
            .collect();

        Ok(pooled)
    }
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a < 1e-9 || norm_b < 1e-9 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

pub fn search_similar(
    query: &str,
    targets: &[(Vec<f32>, usize)],
    top_n: usize,
) -> Vec<(usize, f32)> {
    let engine = match EmbeddingEngine::get() {
        Some(e) => e,
        None => return vec![],
    };

    let query_emb = match engine.embed(query) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut results: Vec<(usize, f32)> = targets
        .iter()
        .map(|(emb, idx)| (*idx, cosine_similarity(&query_emb, emb)))
        .filter(|(_, s)| *s > 0.25)
        .collect();

    results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(top_n);
    results
}
