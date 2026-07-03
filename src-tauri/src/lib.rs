mod types;
pub mod parser;
mod filter;
mod ai;
mod folder;
pub mod embedding;
pub mod memory;

use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::Manager;
use tauri::Emitter;
use tokio::sync::Semaphore;

use types::*;

struct AppState {
    invoices: Mutex<Vec<Invoice>>,
    providers: Mutex<Vec<ProviderConfig>>,
    active_provider: Mutex<String>,
    model1: Mutex<String>,  // user-configurable model 1 (fast)
    model2: Mutex<String>,  // user-configurable model 2 (smart)
    vkn_cache: Mutex<HashMap<String, String>>, // persistent VKN dictionary
    parse_cache: Mutex<HashMap<String, Vec<Invoice>>>, // persistent parsing results cache
    models_dir: Mutex<String>,
}

pub fn get_app_dir() -> PathBuf {
    let mut path = if let Ok(profile) = std::env::var("USERPROFILE") {
        PathBuf::from(profile)
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
    } else {
        std::env::current_dir().unwrap_or_default()
    };
    path.push(".receiptfilterapp");
    let _ = std::fs::create_dir_all(&path);
    
    // Migrate files if they exist in current working directory
    let old_vkn = PathBuf::from("vkn_cache.json");
    let new_vkn = path.join("vkn_cache.json");
    if old_vkn.exists() && !new_vkn.exists() {
        let _ = std::fs::copy(&old_vkn, &new_vkn);
    }

    let old_cfg = PathBuf::from("config.json");
    let new_cfg = path.join("config.json");
    if old_cfg.exists() && !new_cfg.exists() {
        let _ = std::fs::copy(&old_cfg, &new_cfg);
    }

    let old_parse = PathBuf::from("parse_cache.json");
    let new_parse = path.join("parse_cache.json");
    if old_parse.exists() && !new_parse.exists() {
        let _ = std::fs::copy(&old_parse, &new_parse);
    }

    path
}

fn get_cache_path() -> PathBuf {
    let mut p = get_app_dir();
    p.push("vkn_cache.json");
    p
}

fn get_parse_cache_path() -> PathBuf {
    let mut p = get_app_dir();
    p.push("parse_cache.json");
    p
}

fn load_parse_cache() -> HashMap<String, Vec<Invoice>> {
    let path = get_parse_cache_path();
    if path.exists() {
        if let Ok(mut file) = File::open(path) {
            let mut content = String::new();
            if file.read_to_string(&mut content).is_ok() {
                if let Ok(map) = serde_json::from_str::<HashMap<String, Vec<Invoice>>>(&content) {
                    return map;
                }
            }
        }
    }
    HashMap::new()
}

fn save_parse_cache(map: &HashMap<String, Vec<Invoice>>) {
    let path = get_parse_cache_path();
    if let Ok(content) = serde_json::to_string_pretty(map) {
        if let Ok(mut file) = File::create(path) {
            let _ = file.write_all(content.as_bytes());
        }
    }
}

fn load_vkn_cache() -> HashMap<String, String> {
    let path = get_cache_path();
    if path.exists() {
        if let Ok(mut file) = File::open(path) {
            let mut content = String::new();
            if file.read_to_string(&mut content).is_ok() {
                if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&content) {
                    return map;
                }
            }
        }
    }
    let mut default_map = HashMap::new();
    default_map.insert("0860574079".to_string(), "ASC ENERJİ ANONİM ŞİRKETİ".to_string());
    default_map
}

fn save_vkn_cache(map: &HashMap<String, String>) {
    let path = get_cache_path();
    if let Ok(content) = serde_json::to_string_pretty(map) {
        if let Ok(mut file) = File::create(path) {
            let _ = file.write_all(content.as_bytes());
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AppConfig {
    api_key: String,  // ponytail: backward compat, read old configs
    model1: String,
    model2: String,
    #[serde(default)]
    providers: Vec<ProviderConfig>,
    #[serde(default = "default_active_provider")]
    active_provider: String,
}

fn default_active_provider() -> String {
    "deepseek".into()
}

fn get_config_path() -> PathBuf {
    let mut p = get_app_dir();
    p.push("config.json");
    p
}

fn load_config() -> AppConfig {
    let path = get_config_path();
    let default_cfg = AppConfig {
        api_key: String::new(),
        model1: "deepseek-v4-flash".to_string(),
        model2: "deepseek-v4-pro".to_string(),
        providers: vec![],
        active_provider: "deepseek".into(),
    };

    if !path.exists() {
        return default_cfg;
    }

    if let Ok(mut file) = File::open(&path) {
        let mut content = String::new();
        if file.read_to_string(&mut content).is_ok() {
            if let Ok(mut cfg) = serde_json::from_str::<AppConfig>(&content) {
                // Migration: convert old single api_key to providers vec
                if cfg.providers.is_empty() && !cfg.api_key.is_empty() {
                    cfg.providers.push(ProviderConfig {
                        name: "deepseek".into(),
                        api_key: cfg.api_key.clone(),
                        models: vec![],
                    });
                    cfg.active_provider = "deepseek".into();
                }
                if cfg.active_provider.is_empty() {
                    cfg.active_provider = "deepseek".into();
                }
                return cfg;
            }
        }
    }
    default_cfg
}

fn save_config(state: &AppState) {
    let path = get_config_path();
    let providers = state.providers.lock().unwrap().clone();
    let cfg = AppConfig {
        api_key: String::new(),
        model1: state.model1.lock().unwrap().clone(),
        model2: state.model2.lock().unwrap().clone(),
        providers,
        active_provider: state.active_provider.lock().unwrap().clone(),
    };
    if let Ok(content) = serde_json::to_string_pretty(&cfg) {
        if let Ok(mut file) = File::create(path) {
            let _ = file.write_all(content.as_bytes());
        }
    }
}

fn download_model_files(models_dir: &std::path::Path) -> Result<(), String> {
    use hf_hub::api::sync::Api;

    // Önce bozuk/yanlış dosyaları temizle
    let _ = std::fs::remove_file(models_dir.join("model.onnx"));
    let _ = std::fs::remove_file(models_dir.join("tokenizer.json"));

    let api = Api::new().map_err(|e| format!("HF API: {}", e))?;
    // paraphrase-multilingual-MiniLM-L12-v2: ~118MB quantized. Türkçe dahil 50+ dili çok iyi anlar.
    let repo = api.model("Xenova/paraphrase-multilingual-MiniLM-L12-v2".into());

    log::info!("Model indiriliyor: Xenova/paraphrase-multilingual-MiniLM-L12-v2 (~118MB)...");
    let model_src = repo.get("onnx/model_quantized.onnx")
        .map_err(|e| format!("Model indirme: {}", e))?;
    log::info!("Tokenizer indiriliyor...");
    let tokenizer_src = repo.get("tokenizer.json")
        .map_err(|e| format!("Tokenizer indirme: {}", e))?;

    std::fs::copy(&model_src, models_dir.join("model.onnx"))
        .map_err(|e| format!("Model kopyalama: {}", e))?;
    std::fs::copy(&tokenizer_src, models_dir.join("tokenizer.json"))
        .map_err(|e| format!("Tokenizer kopyalama: {}", e))?;

    Ok(())
}

fn get_file_cache_key(path: &str) -> String {
    let filename = std::path::Path::new(path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    
    let (size, modified) = if let Ok(meta) = std::fs::metadata(path) {
        let sz = meta.len();
        let mod_time = meta.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        (sz, mod_time)
    } else {
        (0, 0)
    };

    format!("{}_{}_{}", filename, size, modified)
}

#[tauri::command]
async fn load_files(
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
    paths: Vec<String>
) -> Result<usize, String> {
    let total_steps = Arc::new(AtomicUsize::new(paths.len()));
    let processed_steps = Arc::new(AtomicUsize::new(0));

    // Concurrency limit for parsing (Semaphore)
    let parse_sem = Arc::new(Semaphore::new(12));

    let mut parse_set = tokio::task::JoinSet::new();

    // Clone cache to check it or load it
    let (cached_invoices, new_paths) = {
        let cache = state.parse_cache.lock().unwrap();
        let mut cached = Vec::new();
        let mut parse_needed = Vec::new();
        
        for path in &paths {
            let key = get_file_cache_key(path);
            if let Some(invs) = cache.get(&key) {
                // Refresh ids so that they are fresh, or just extend them
                let mut refreshed = invs.clone();
                for inv in &mut refreshed {
                    inv.id = uuid::Uuid::new_v4().to_string();
                }
                cached.extend(refreshed);
                // Mark as processed immediately
                processed_steps.fetch_add(1, Ordering::SeqCst);
            } else {
                parse_needed.push(path.clone());
            }
        }
        
        // Emit initial progress if some are cached
        let current = processed_steps.load(Ordering::SeqCst);
        let total = total_steps.load(Ordering::SeqCst);
        let pct = (current * 100) / total;
        let _ = window.emit("parse_progress", pct);
        
        (cached, parse_needed)
    };

    // 1. Concurrent PDF & Excel parsing for paths that are not cached
    for path in new_paths {
        let parse_sem_clone = parse_sem.clone();
        let processed_steps_clone = processed_steps.clone();
        let total_steps_clone = total_steps.clone();
        let window_clone = window.clone();

        parse_set.spawn(async move {
            let _permit = parse_sem_clone.acquire().await.unwrap();
            let key = get_file_cache_key(&path);
            let parsed_result = if path.ends_with(".pdf") {
                match tokio::task::spawn_blocking(move || parser::parse_pdf(&path)).await {
                    Ok(Ok(v)) => Some(v),
                    _ => None,
                }
            } else if path.ends_with(".xlsx") || path.ends_with(".xls") {
                match tokio::task::spawn_blocking(move || parser::parse_excel(&path)).await {
                    Ok(Ok(v)) => Some(v),
                    _ => None,
                }
            } else {
                None
            };

            // Emit progress
            let current = processed_steps_clone.fetch_add(1, Ordering::SeqCst) + 1;
            let total = total_steps_clone.load(Ordering::SeqCst);
            let pct = (current * 100) / total;
            let _ = window_clone.emit("parse_progress", pct);

            parsed_result.map(|invs| (key, invs))
        });
    }

    let mut all = cached_invoices;
    let mut new_parsed_map = HashMap::new();

    while let Some(res) = parse_set.join_next().await {
        if let Ok(Some((key, invoices))) = res {
            all.extend(invoices.clone());
            new_parsed_map.insert(key, invoices);
        }
    }



    // AI Fallback System for poor parse quality
    let provider = {
        let active = state.active_provider.lock().unwrap().clone();
        find_provider(&state, &active)
    };
    let model = {
        state.model1.lock().unwrap().clone()
    };

    let mut ai_tasks = tokio::task::JoinSet::new();
    let ai_sem = Arc::new(Semaphore::new(3)); // limit concurrent AI requests to 3

    // Loop through invoices to hit cache or queue AI tasks concurrently
    {
        let mut vkn_cache = state.vkn_cache.lock().unwrap();
        let mut cache_modified = false;

        for (idx, inv) in all.iter_mut().enumerate() {
            // First check: if VKN is ASC Enerji, recipient must be ASC
            if inv.tax_number == "0860574079" {
                inv.recipient = "ASC ENERJİ ANONİM ŞİRKETİ".to_string();
            }

            // 1. Check if the VKN is already resolved in cache
            if !inv.tax_number.is_empty() && inv.tax_number != "0860574079" {
                if let Some(cached_name) = vkn_cache.get(&inv.tax_number) {
                    let lu = inv.issuer.to_uppercase();
                    if lu.contains("ASC ENERJİ") || lu.contains("ASC ENERJI") || lu.contains("ASC energy") {
                        inv.recipient = cached_name.clone();
                    } else {
                        inv.issuer = cached_name.clone();
                    }
                    continue; // Skip AI fallback since we solved it!
                }
            }

            // 2. Fallback to AI if parse quality is suspect
            let is_poor_parse = inv.issuer.is_empty() 
                || inv.recipient.is_empty() 
                || inv.issuer.chars().count() < 3 
                || inv.recipient.chars().count() < 3
                || inv.issuer.to_uppercase() == "SAN.LTD.ŞTİ"
                || inv.issuer.to_uppercase() == "MERKEZ NİĞDE"
                || inv.issuer.to_uppercase().contains("IBAN")
                || inv.issuer.to_uppercase().contains("TR51")
                || inv.issuer.to_uppercase().contains("TR10");

            if is_poor_parse {
                if let Some(ref provider_cfg) = provider {
                    if provider_cfg.api_key.is_empty() { continue; }
                    // response_format json_object only works on OpenAI-compatible
                    let is_compat = matches!(provider_cfg.name.as_str(), "deepseek" | "openai" | "openrouter" | "nvidia");
                    if !is_compat {
                        log::warn!("AI Fallback atlandi ({} json_object desteklemez): {}", provider_cfg.name, inv.filename);
                        continue;
                    }
                    log::info!("AI Fallback kuyruğa ekleniyor (Eksik/Hatalı Parse): {}", inv.filename);
                    
                    let filename = inv.filename.clone();
                    let tax_number = inv.tax_number.clone();
                    let provider_cfg_clone = provider_cfg.clone();
                    let model_clone = model.clone();
                    let snippet = if inv.raw_text.len() > 2500 {
                        inv.raw_text[..2500].to_string()
                    } else {
                        inv.raw_text.clone()
                    };

                    // Add a step for progress tracking
                    total_steps.fetch_add(1, Ordering::SeqCst);

                    let ai_sem_clone = ai_sem.clone();
                    let processed_steps_clone = processed_steps.clone();
                    let total_steps_clone = total_steps.clone();
                    let window_clone = window.clone();

                    ai_tasks.spawn(async move {
                        let _permit = ai_sem_clone.acquire().await.unwrap();
                        let sys = "Sen bir JSON API'sisin. Sadece JSON döndür. Örn: {\"issuer\": \"...\", \"recipient\": \"...\"}";
                        let user = format!("Aşağıdaki faturadan Düzenleyen (satıcı/issuer) ve Alıcı (alıcı/recipient) resmi şirket adlarını bulup JSON olarak ver.\n\n\
                             Kurallar:\n\
                             1. Alıcı (recipient), faturada genellikle 'SAYIN', 'Sayın', 'Müşteri' veya 'Alıcı' ifadesinin hemen ardından gelen şirkettir.\n\
                             2. Düzenleyen (issuer), faturayı kesen satıcıdır. Kesinlikle 'SAYIN' ile başlayan şirketi Düzenleyen (issuer) olarak yazma, onu Alıcı (recipient) olarak yaz.\n\n\
                             Fatura Metni:\n{}", snippet);

                        let content_res = ai::chat_completion_openai_compat(
                            &provider_cfg_clone, &model_clone, sys, &user, true
                        ).await;

                        // Emit progress for AI task finish
                        let current = processed_steps_clone.fetch_add(1, Ordering::SeqCst) + 1;
                        let total = total_steps_clone.load(Ordering::SeqCst);
                        let pct = (current * 100) / total;
                        let _ = window_clone.emit("parse_progress", pct);

                        if let Ok(content) = content_res {
                            let clean = content.trim()
                                .trim_start_matches("```json")
                                .trim_end_matches("```")
                                .trim();
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(clean) {
                                let ai_issuer = parsed["issuer"].as_str().unwrap_or_default().trim().to_string();
                                let ai_recipient = parsed["recipient"].as_str().unwrap_or_default().trim().to_string();
                                return Some((idx, filename, tax_number, ai_issuer, ai_recipient));
                            }
                        }
                        None
                    });
                }
            } else {
                // Successful regex parse, populate cache
                if !inv.tax_number.is_empty() && inv.tax_number != "0860574079" {
                    let lu = inv.issuer.to_uppercase();
                    let other_party_name = if lu.contains("ASC ENERJİ") || lu.contains("ASC ENERJI") || lu.contains("ASC energy") {
                        &inv.recipient
                    } else {
                        &inv.issuer
                    };
                    if !other_party_name.is_empty() {
                        vkn_cache.insert(inv.tax_number.clone(), other_party_name.clone());
                        cache_modified = true;
                    }
                }
            }
        }

        if cache_modified {
            save_vkn_cache(&vkn_cache);
        }
    }

    // 3. Wait for all AI tasks to complete concurrently
    let mut resolved_ai = Vec::new();
    while let Some(res) = ai_tasks.join_next().await {
        if let Ok(Some(data)) = res {
            resolved_ai.push(data);
        }
    }

    // 4. Update the invoices and persistent database in a single short lock
    if !resolved_ai.is_empty() {
        let mut cache_modified = false;
        let mut vkn_cache = state.vkn_cache.lock().unwrap();

        for (idx, _filename, tax_number, ai_issuer, ai_recipient) in resolved_ai {
            if let Some(inv) = all.get_mut(idx) {
                if !ai_issuer.is_empty() {
                    log::info!("AI Düzeltmesi (Düzenleyen): {} -> {}", inv.issuer, ai_issuer);
                    inv.issuer = ai_issuer.clone();
                }
                if !ai_recipient.is_empty() {
                    log::info!("AI Düzeltmesi (Alıcı): {} -> {}", inv.recipient, ai_recipient);
                    inv.recipient = ai_recipient.clone();
                }

                // Save the other party's name to the cache (issuer or recipient)
                if !tax_number.is_empty() && tax_number != "0860574079" {
                    let lu = inv.issuer.to_uppercase();
                    let other_party_name = if lu.contains("ASC ENERJİ") || lu.contains("ASC ENERJI") || lu.contains("ASC energy") {
                        ai_recipient
                    } else {
                        ai_issuer
                    };
                    if !other_party_name.is_empty() {
                        vkn_cache.insert(tax_number.clone(), other_party_name);
                        cache_modified = true;
                    }
                }
            }
        }

        if cache_modified {
            save_vkn_cache(&vkn_cache);
        }
    }

    // Save final corrected invoices to persistent parse cache
    {
        let mut final_cache_map: HashMap<String, Vec<Invoice>> = HashMap::new();
        for inv in &all {
            let key = get_file_cache_key(&inv.full_path);
            final_cache_map.entry(key).or_default().push(inv.clone());
        }
        let mut cache = state.parse_cache.lock().unwrap();
        for (key, invs) in final_cache_map {
            cache.insert(key, invs);
        }
        save_parse_cache(&cache);
    }

    // Force progress to 100% at the very end
    let _ = window.emit("parse_progress", 100);

    let count = all.len();
    let mut invoices = state.invoices.lock().unwrap();
    invoices.extend(all);  // ponytail: additive — new files append, don't replace
    log::info!("{} fatura eklendi, toplam {}", count, invoices.len());
    Ok(invoices.len())
}

#[tauri::command]
fn get_all_invoices(state: tauri::State<AppState>) -> Vec<Invoice> {
    state.invoices.lock().unwrap().clone()
}

#[tauri::command]
fn get_filter_options(state: tauri::State<AppState>) -> FilterOptions {
    let invoices = state.invoices.lock().unwrap();
    let mut issuers = std::collections::HashSet::new();
    let mut recipients = std::collections::HashSet::new();
    let mut locations = std::collections::HashSet::new();
    let mut categories = std::collections::HashSet::new();
    let mut dates: Vec<String> = Vec::new();

    for inv in invoices.iter() {
        if !inv.issuer.is_empty() {
            issuers.insert(inv.issuer.clone());
        }
        if !inv.recipient.is_empty() {
            recipients.insert(inv.recipient.clone());
        }
        if !inv.location.is_empty() {
            // normalize case so "ANKARA" and "Ankara" are one
            let loc = title_case(&inv.location);
            locations.insert(loc);
        }
        if !inv.date.is_empty() {
            dates.push(inv.date.clone());
        }
        if !inv.category.is_empty() {
            categories.insert(inv.category.clone());
        }
    }

    dates.sort();
    let date_min = dates.first().cloned().unwrap_or_default();
    let date_max = dates.last().cloned().unwrap_or_default();

    FilterOptions {
        issuers: {
            let mut v: Vec<_> = issuers.into_iter().collect();
            v.sort();
            v
        },
        recipients: {
            let mut v: Vec<_> = recipients.into_iter().collect();
            v.sort();
            v
        },
        locations: {
            let mut v: Vec<_> = locations.into_iter().collect();
            v.sort();
            v
        },
        date_min,
        date_max,
        amount_min: 0.0,
        amount_max: 0.0,
        categories: {
            let mut v: Vec<_> = categories.into_iter().collect();
            v.sort();
            v
        },
    }
}

// ponytail: simple Turkish-aware title case (first letter of each word uppercase, rest lower)
fn title_case(s: &str) -> String {
    s.split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + &c.as_str().to_lowercase(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
fn filter(state: tauri::State<AppState>, criteria: FilterCriteria) -> Vec<Invoice> {
    let invoices = state.invoices.lock().unwrap();
    filter::filter_invoices(&invoices, &criteria)
}

#[tauri::command]
fn group_invoices(state: tauri::State<AppState>, criteria: FilterCriteria, group_by: String) -> Vec<(String, Vec<Invoice>)> {
    let invoices = state.invoices.lock().unwrap();
    let filtered = filter::filter_invoices(&invoices, &criteria);
    filter::group_and_sort(&filtered, &group_by)
}

#[tauri::command]
fn organize_folders(
    state: tauri::State<AppState>,
    criteria: FilterCriteria,
    group_by: String,
    output_dir: String,
) -> Result<usize, String> {
    let invoices = state.invoices.lock().unwrap();
    let filtered = filter::filter_invoices(&invoices, &criteria);
    let groups = filter::group_and_sort(&filtered, &group_by);
    folder::organize_into_folders(&groups, &output_dir)
}

#[tauri::command]
fn organize_hierarchy(
    state: tauri::State<AppState>,
    criteria: FilterCriteria,
    parent_group: String,
    child_group: String,
    output_dir: String,
) -> Result<usize, String> {
    let invoices = state.invoices.lock().unwrap();
    let filtered = filter::filter_invoices(&invoices, &criteria);
    let groups = filter::group_and_sort(&filtered, &parent_group);
    folder::organize_into_hierarchy(&groups, &output_dir, &child_group)
}

fn find_provider(state: &AppState, name: &str) -> Option<ProviderConfig> {
    state.providers.lock().unwrap().iter()
        .find(|p| p.name == name)
        .cloned()
}

#[tauri::command]
fn set_provider_config(state: tauri::State<AppState>, provider_name: String, api_key: String) {
    {
        let mut providers = state.providers.lock().unwrap();
        if let Some(existing) = providers.iter_mut().find(|p| p.name == provider_name) {
            existing.api_key = api_key;
        } else {
            providers.push(ProviderConfig {
                name: provider_name.clone(),
                api_key,
                models: vec![],
            });
        }
    } // providers lock serbest bırakıldı
    if state.active_provider.lock().unwrap().is_empty() {
        *state.active_provider.lock().unwrap() = provider_name;
    }
    save_config(&state);
}

#[tauri::command]
fn delete_provider_config(state: tauri::State<AppState>, provider_name: String) {
    {
        let mut providers = state.providers.lock().unwrap();
        providers.retain(|p| p.name != provider_name);
        if state.active_provider.lock().unwrap().clone() == provider_name {
            let new_active = providers.first().map(|p| p.name.clone()).unwrap_or_default();
            *state.active_provider.lock().unwrap() = new_active;
        }
    } // providers lock serbest bırakıldı
    save_config(&state);
}

#[tauri::command]
fn get_provider_configs(state: tauri::State<AppState>) -> Vec<ProviderConfig> {
    state.providers.lock().unwrap().clone()
}

#[tauri::command]
async fn fetch_models_command(state: tauri::State<'_, AppState>, provider_name: String) -> Result<Vec<String>, String> {
    let api_key = find_provider(&state, &provider_name)
        .map(|p| p.api_key)
        .unwrap_or_default();
    if api_key.is_empty() {
        return Err("Bu saglayici icin API anahtari ayarlanmamis.".into());
    }
    let models = ai::fetch_models(&provider_name, &api_key).await?;
    {
        let mut providers = state.providers.lock().unwrap();
        if let Some(cfg) = providers.iter_mut().find(|p| p.name == provider_name) {
            cfg.models = models.clone();
        }
    } // providers lock serbest bırakıldı
    save_config(&state);
    Ok(models)
}

#[tauri::command]
fn set_active_provider(state: tauri::State<AppState>, provider_name: String) {
    *state.active_provider.lock().unwrap() = provider_name.clone();
    save_config(&state);
}

#[tauri::command]
fn get_active_provider(state: tauri::State<AppState>) -> String {
    state.active_provider.lock().unwrap().clone()
}

#[tauri::command]
fn set_models(state: tauri::State<AppState>, model1: String, model2: String) {
    *state.model1.lock().unwrap() = model1.clone();
    *state.model2.lock().unwrap() = model2.clone();
    save_config(&state);
}

#[tauri::command]
fn get_models(state: tauri::State<AppState>) -> (String, String) {
    (
        state.model1.lock().unwrap().clone(),
        state.model2.lock().unwrap().clone(),
    )
}

#[tauri::command]
fn get_api_key(state: tauri::State<AppState>) -> String {
    // ponytail: backward compat — returns active provider's key
    let active = state.active_provider.lock().unwrap().clone();
    find_provider(&state, &active)
        .map(|p| p.api_key)
        .unwrap_or_default()
}

// ponytail: backward compat shim for old set_api_key
#[tauri::command]
fn set_api_key(state: tauri::State<AppState>, key: String) {
    let provider_name = state.active_provider.lock().unwrap().clone();
    let mut providers = state.providers.lock().unwrap();
    if let Some(existing) = providers.iter_mut().find(|p| p.name == provider_name) {
        existing.api_key = key.clone();
    } else {
        providers.push(ProviderConfig {
            name: provider_name.clone(),
            api_key: key,
            models: vec![],
        });
    }
    save_config(&state);
}

#[tauri::command]
fn remove_invoice(state: tauri::State<AppState>, id: String) {
    let mut invoices = state.invoices.lock().unwrap();
    invoices.retain(|inv| inv.id != id);
}

#[tauri::command]
async fn ai_filter(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<AiResponse, String> {
    let invoices = state.invoices.lock().unwrap().clone();
    let provider = {
        let active = state.active_provider.lock().unwrap().clone();
        find_provider(&state, &active)
    };

    let filtered: Vec<Invoice> = if let Some(engine) = embedding::EmbeddingEngine::get() {
        let mut indexed: Vec<(Vec<f32>, usize, String)> = Vec::new();
        for (i, inv) in invoices.iter().enumerate().take(200) {
            if let Some(ref emb) = inv.embedding {
                indexed.push((emb.clone(), i, inv.id.clone()));
            } else {
                let text = format!("{} {} {} {}", inv.issuer, inv.recipient, inv.category, inv.description);
                if let Ok(emb) = engine.embed(text.trim()) {
                    indexed.push((emb, i, inv.id.clone()));
                }
            }
        }
        let targets: Vec<(Vec<f32>, usize)> = indexed.iter()
            .map(|(emb, idx, _)| (emb.clone(), *idx))
            .collect();
        if !targets.is_empty() {
            let matches = embedding::search_similar(&query, &targets, 50);
            let matched_ids: std::collections::HashSet<String> = matches.iter()
                .map(|(idx, _)| invoices[*idx].id.clone())
                .collect();
            invoices.iter().filter(|inv| matched_ids.contains(&inv.id)).cloned().collect()
        } else {
            vec![]
        }
    } else {
        let q = query.to_lowercase();
        invoices.iter()
            .filter(|inv| {
                inv.issuer.to_lowercase().contains(&q)
                    || inv.recipient.to_lowercase().contains(&q)
                    || inv.description.to_lowercase().contains(&q)
            })
            .take(50)
            .cloned()
            .collect()
    };

    if filtered.is_empty() {
        return Ok(AiResponse {
            filter_criteria: FilterCriteria {
                issuers: vec![], recipients: vec![], locations: vec![],
                date_min: String::new(), date_max: String::new(),
                amount_min: 0.0, amount_max: 0.0,
                search_text: query.clone(), categories: vec![],
            },
            group_by: "issuer".to_string(),
            explanation: "Eslestirme yapilamadi. Manuel filtreleme deneyin.".to_string(),
        });
    }

    if let Some(provider_cfg) = provider {
        if !provider_cfg.api_key.is_empty() {
            let model = state.model1.lock().unwrap().clone();
            let top: Vec<_> = filtered.iter().take(20).cloned().collect();
            let request = AiRequest { invoices: top, query, model };
            return ai::ask_ai(&provider_cfg, &request).await;
        }
    }
    Ok(AiResponse {
        filter_criteria: FilterCriteria {
            issuers: vec![], recipients: vec![], locations: vec![],
            date_min: String::new(), date_max: String::new(),
            amount_min: 0.0, amount_max: 0.0,
            search_text: query.clone(), categories: vec![],
        },
        group_by: "issuer".to_string(),
        explanation: format!("{} fatura bulundu.", filtered.len()),
    })
}

#[tauri::command]
async fn ai_filter_and_group(
    state: tauri::State<'_, AppState>,
    query: String,
    criteria: FilterCriteria,
    model: String,
) -> Result<AiGroupedResponse, String> {
    let all_invoices = {
        state.invoices.lock().unwrap().clone()
    };

    let provider = {
        let active = state.active_provider.lock().unwrap().clone();
        find_provider(&state, &active)
            .ok_or("Aktif saglayici ayarlanmamis.")?
    };

    if provider.api_key.is_empty() {
        return Err(format!("{} API anahtari ayarlanmamis.", provider.name));
    }

    // If pre_filtered is empty (no criteria set or returned nothing), use all loaded invoices
    let pre_filtered = filter::filter_invoices(&all_invoices, &criteria);
    let invoices_to_send = if pre_filtered.is_empty() {
        all_invoices.clone()
    } else {
        pre_filtered.clone()
    };

    let request = AiRequest { invoices: invoices_to_send.clone(), query, model };
    let ai_resp = ai::ask_ai(&provider, &request).await?;
    let filtered = filter::filter_invoices(&invoices_to_send, &ai_resp.filter_criteria);
    let groups = filter::group_and_sort(&filtered, &ai_resp.group_by);
    
    Ok(AiGroupedResponse {
        groups,
        explanation: ai_resp.explanation,
    })
}

#[tauri::command]
async fn fix_invoice_with_ai(state: tauri::State<'_, AppState>, id: String) -> Result<Invoice, String> {
    let provider = {
        let active = state.active_provider.lock().unwrap().clone();
        find_provider(&state, &active)
            .ok_or("Aktif saglayici ayarlanmamis.")?
    };

    if provider.api_key.is_empty() {
        return Err(format!("{} API anahtari ayarlanmamis.", provider.name));
    }

    let is_compat = matches!(provider.name.as_str(), "deepseek" | "openai" | "openrouter" | "nvidia");
    if !is_compat {
        return Err(format!("{} json_object desteklemez. AI duzeltme icin DeepSeek/OpenAI secin.", provider.name));
    }
    
    let invoice = {
        let invoices = state.invoices.lock().unwrap();
        invoices.iter().find(|inv| inv.id == id).cloned()
    };
    
    if let Some(mut inv) = invoice {
        let model = state.model1.lock().unwrap().clone();
        let snippet = if inv.raw_text.len() > 2500 {
            inv.raw_text[..2500].to_string()
        } else {
            inv.raw_text.clone()
        };
        
        let sys = "Sen bir JSON API'sisin. Sadece JSON döndür. Örn: {\"issuer\": \"...\", \"recipient\": \"...\"}";
        let user = format!("Aşağıdaki faturadan Düzenleyen (issuer) ve Alıcı (recipient) resmi şirket adlarını bulup JSON olarak ver:\n\n{}", snippet);

        let content = ai::chat_completion_openai_compat(&provider, &model, sys, &user, true).await?;

        let clean = content.trim()
            .trim_start_matches("```json")
            .trim_end_matches("```")
            .trim();

        let parsed = serde_json::from_str::<serde_json::Value>(clean)
            .map_err(|e| format!("JSON ayrıştırma hatası: {}", e))?;

        let ai_issuer = parsed["issuer"].as_str().unwrap_or_default().trim().to_string();
        let ai_recipient = parsed["recipient"].as_str().unwrap_or_default().trim().to_string();

        if !ai_issuer.is_empty() {
            inv.issuer = ai_issuer;
        }
        if !ai_recipient.is_empty() {
            inv.recipient = ai_recipient;
        }
        
        // Save to cache
        if !inv.tax_number.is_empty() && inv.tax_number != "0860574079" {
            let mut vkn_cache = state.vkn_cache.lock().unwrap();
            let lu = inv.issuer.to_uppercase();
            let other_party_name = if lu.contains("ASC ENERJİ") || lu.contains("ASC ENERJI") || lu.contains("ASC energy") {
                &inv.recipient
            } else {
                &inv.issuer
            };
            if !other_party_name.is_empty() {
                vkn_cache.insert(inv.tax_number.clone(), other_party_name.clone());
                save_vkn_cache(&vkn_cache);
            }
        }
        
        // Update in state
        let mut invoices = state.invoices.lock().unwrap();
        if let Some(existing) = invoices.iter_mut().find(|i| i.id == id) {
            existing.issuer = inv.issuer.clone();
            existing.recipient = inv.recipient.clone();

            // Recalculate embedding since fields changed
            if let Some(engine) = embedding::EmbeddingEngine::get() {
                let text = format!("{} {} {} {}", existing.issuer, existing.recipient, existing.category, existing.description);
                if let Ok(emb) = engine.embed(&text) {
                    existing.embedding = Some(emb.clone());
                    inv.embedding = Some(emb);
                }
            }
        }

        // Update parse cache and save
        let path_key = get_file_cache_key(&inv.full_path);
        let mut cache = state.parse_cache.lock().unwrap();
        if let Some(cache_invs) = cache.get_mut(&path_key) {
            for ci in cache_invs {
                if ci.filename == inv.filename {
                    ci.issuer = inv.issuer.clone();
                    ci.recipient = inv.recipient.clone();
                    ci.embedding = inv.embedding.clone();
                }
            }
        }
        save_parse_cache(&cache);
        
        Ok(inv)
    } else {
        Err("Fatura bulunamadı.".into())
    }
}

#[tauri::command]
fn clear_invoices(state: tauri::State<AppState>) {
    let mut invoices = state.invoices.lock().unwrap();
    invoices.clear();
}

#[tauri::command]
fn update_invoice_category(
    state: tauri::State<AppState>,
    id: String,
    new_category: String
) -> Result<(), String> {
    let mut invoices = state.invoices.lock().unwrap();
    if let Some(inv) = invoices.iter_mut().find(|i| i.id == id) {
        inv.category = new_category.clone();
        
        if let Some(engine) = embedding::EmbeddingEngine::get() {
            let text = format!("{} {} {} {}", inv.issuer, inv.recipient, inv.category, inv.description);
            if let Ok(emb) = engine.embed(&text) {
                inv.embedding = Some(emb.clone());
                crate::memory::add_trained_vector(new_category, emb);
            }
        } else if let Some(emb) = &inv.embedding {
            crate::memory::add_trained_vector(new_category, emb.clone());
        }

        // Update parse cache and save
        let path_key = get_file_cache_key(&inv.full_path);
        let mut cache = state.parse_cache.lock().unwrap();
        if let Some(cache_invs) = cache.get_mut(&path_key) {
            for ci in cache_invs {
                if ci.filename == inv.filename {
                    ci.category = inv.category.clone();
                    ci.embedding = inv.embedding.clone();
                }
            }
        }
        save_parse_cache(&cache);
        
        Ok(())
    } else {
        Err("Fatura bulunamadı.".into())
    }
}

#[tauri::command]
async fn deep_analyze(
    state: tauri::State<'_, AppState>,
    query: String,
    model: String,
) -> Result<DeepAnalyzeResponse, String> {
    let provider = {
        let active = state.active_provider.lock().unwrap().clone();
        find_provider(&state, &active)
            .ok_or("Aktif saglayici ayarlanmamis.")?
    };

    if provider.api_key.is_empty() {
        return Err(format!("{} API anahtari ayarlanmamis.", provider.name));
    }

    // Max 300 fatura al
    let invoices: Vec<Invoice> = {
        let all = state.invoices.lock().unwrap();
        all.iter().take(300).cloned().collect()
    };

    if invoices.is_empty() {
        return Err("Hiç fatura yüklenmemiş.".into());
    }

    // Her fatura için snippet: meta + raw_text ilk 4000 karakter
    let snippets: Vec<String> = invoices
        .iter()
        .enumerate()
        .map(|(i, inv)| {
            let raw_snippet = if inv.raw_text.len() > 4000 {
                // ponytail: char-safe truncation — find last char boundary at or before 4000 bytes
                let end = inv.raw_text.char_indices()
                    .map(|(i, _)| i)
                    .take_while(|&i| i <= 4000)
                    .last()
                    .unwrap_or(0);
                &inv.raw_text[..end]
            } else {
                &inv.raw_text
            };
            format!(
                "[{}] Dosya: {} | Düzenleyen: {} | Alıcı: {} | Tutar: {:.2} TL | Tarih: {} | Kategori: {}\n---\n{}\n",
                i + 1,
                inv.filename,
                inv.issuer,
                inv.recipient,
                inv.amount,
                inv.date,
                inv.category,
                raw_snippet
            )
        })
        .collect();

    let all_text = snippets.join("\n========\n");

    let system_prompt = "Sen bir fatura analiz uzmanısın. Sana numaralandırılmış faturalar ve içerikleri verilecek. \
        Kullanıcının sorusunu doğru ve eksiksiz yanıtla. \
        ÖNEMLİ: Faturalardaki Kategori alanları otomatik atanmış olup doğruluk seviyeleri düşüktür ve güvenilir değildir. \
        Kategorilere güvenmek yerine fatura içeriğindeki (raw_text) asıl ürün, hizmet ve açıklama metinlerine dayanarak karar ver. \
        Ürün/hizmet adetleri, tutarlar, tedarikçiler gibi detayları fatura içeriğinden okuyarak hesapla. \
        ÖNEMLİ: Eşleşen faturaları açıklama (explanation) metninde tek tek sıra halinde veya liste olarak yazarak kalabalık etme. Arayüz bu faturaları zaten otomatik olarak filtreleyip gösterecektir. Açıklama metninde sadece genel analiz, toplam adet/tutar bilgisi ve gerekiyorsa markdown tablosu olarak özet rapor sun. \
        Yanıtını SADECE şu JSON formatında ver (başka hiçbir şey yazma, kod bloğu kullanma):\
        {\"explanation\": \"Markdown formatında detaylı cevap\", \"matched_indices\": [1, 5, 12]}. \
        matched_indices: soruyla ilgili fatura numaraları (köşeli parantez içinde, [1] den başlayan). \
        Eğer soru tüm faturalarla ilgiliyse matched_indices boş liste döndür.";

    let user_prompt = format!(
        "Faturalar ({} adet):\n\n{}\n\nKullanıcı sorusu: {}",
        invoices.len(),
        all_text,
        query
    );

    let content = match provider.name.as_str() {
        "gemini" => ai::chat_completion_gemini(&provider.api_key, &model, system_prompt, &user_prompt).await?,
        "claude" => ai::chat_completion_claude(&provider.api_key, &model, system_prompt, &user_prompt).await?,
        _ => ai::chat_completion_openai_compat(&provider, &model, system_prompt, &user_prompt, false).await?,
    };

    // JSON bloğu varsa temizle
    let clean = {
        let t = content.trim();
        if t.starts_with("```") {
            let end = t.find('\n').unwrap_or(0);
            let tail = t.rfind("```").unwrap_or(t.len());
            t[end..tail].trim()
        } else {
            t
        }
    };

    let parsed: serde_json::Value = serde_json::from_str(clean)
        .map_err(|e| format!("AI yanıtı parse hatası: {} | Ham: {}", e, clean))?;

    let explanation = parsed["explanation"].as_str().unwrap_or("").to_string();

    // matched_indices → invoice ID'lerine dönüştür (1-based → 0-based)
    let matched_ids: Vec<String> = parsed["matched_indices"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|v| v.as_u64())
        .filter_map(|idx| {
            let i = (idx as usize).saturating_sub(1);
            invoices.get(i).map(|inv| inv.id.clone())
        })
        .collect();

    Ok(DeepAnalyzeResponse { explanation, matched_ids })
}

#[tauri::command]
fn is_model_ready() -> bool {
    embedding::EmbeddingEngine::get().is_some()
}

#[tauri::command]
async fn sync_cache_to_memory(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let cache = state.parse_cache.lock().unwrap().clone();
    let engine = embedding::EmbeddingEngine::get().ok_or("Embedding motoru hazır değil.")?;
    
    let mut to_train = Vec::new();
    for (_key, invs) in cache {
        for inv in invs {
            if !inv.category.is_empty() && inv.category != "Diğer" {
                let emb = if let Some(e) = inv.embedding {
                    e
                } else {
                    let text = format!("{} {} {} {}", inv.issuer, inv.recipient, inv.category, inv.description);
                    match engine.embed(&text) {
                        Ok(e) => e,
                        Err(_) => continue,
                    }
                };
                
                to_train.push(crate::memory::TrainedVector {
                    category: inv.category.clone(),
                    embedding: emb,
                });
            }
        }
    }
    
    let count = to_train.len();
    if count > 0 {
        crate::memory::add_trained_vectors_bulk(to_train);
    }
    
    Ok(count)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .level_for("pdf_extract", log::LevelFilter::Error)
                        .build(),
                )?;
            }

            let cfg = load_config();

            app.manage(AppState {
                invoices: Mutex::new(Vec::new()),
                providers: Mutex::new(cfg.providers),
                active_provider: Mutex::new(cfg.active_provider),
                model1: Mutex::new(cfg.model1),
                model2: Mutex::new(cfg.model2),
                vkn_cache: Mutex::new(load_vkn_cache()),
                parse_cache: Mutex::new(load_parse_cache()),
                models_dir: Mutex::new(get_app_dir().join("models").to_string_lossy().to_string()),
            });

            // Initialize memory
            memory::load_trained_memory();

            // ort::init() ana thread'de çağrılmalı — Windows loader lock nedeniyle
            // arka thread'den çağrılırsa UI bloklanıyor
            if ort::init().commit() {
                log::info!("ONNX Runtime yuklendi");
            } else {
                log::error!("ONNX Runtime yuklenemedi");
            }

            let app_handle = app.handle().clone();
            
            // Sadece ağır model yüklemesi arka thread'de
            std::thread::spawn(move || {
                let models_dir = get_app_dir().join("models");
                let _ = std::fs::create_dir_all(&models_dir);
                let model_path = models_dir.join("model.onnx");
                let tokenizer_path = models_dir.join("tokenizer.json");

                // Auto-download model if missing
                if !model_path.exists() || !tokenizer_path.exists() {
                    log::info!("Model dosyalari eksik, HuggingFace'ten indiriliyor...");
                    let _ = app_handle.emit("model_loading_status", "Model indiriliyor: Xenova/paraphrase-multilingual-MiniLM-L12-v2 (~118MB)...");
                    match download_model_files(&models_dir) {
                        Ok(()) => log::info!("Model dosyalari indirildi"),
                        Err(e) => log::error!("Model indirme hatasi: {}", e),
                    }
                }

                if model_path.exists() && tokenizer_path.exists() {
                    let _ = app_handle.emit("model_loading_status", "Model yükleniyor (Belleğe alınıyor)...");
                    match embedding::EmbeddingEngine::init(
                        &model_path.to_string_lossy(),
                        &tokenizer_path.to_string_lossy(),
                    ) {
                        Ok(()) => {
                            log::info!("Embedding engine baslatildi");
                            let _ = app_handle.emit("model_ready", ());
                        },
                        Err(e) => log::error!("Embedding engine baslatilamadi: {}", e),
                    }
                } else {
                    log::warn!("Model dosyalari bulunamadi: {}", models_dir.display());
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_files,
            get_all_invoices,
            get_filter_options,
            filter,
            group_invoices,
            organize_folders,
            organize_hierarchy,
            set_api_key,
            set_provider_config,
            delete_provider_config,
            get_provider_configs,
            fetch_models_command,
            set_active_provider,
            get_active_provider,
            set_models,
            get_models,
            get_api_key,
            remove_invoice,
            fix_invoice_with_ai,
            ai_filter,
            ai_filter_and_group,
            clear_invoices,
            update_invoice_category,
            is_model_ready,
            sync_cache_to_memory,
            deep_analyze,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}