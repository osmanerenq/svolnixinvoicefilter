use serde_json::json;
use crate::types::{AiRequest, AiResponse, ProviderConfig};

const OPENAI_COMPATIBLE: &[&str] = &["deepseek", "openai", "openrouter", "nvidia"];

pub fn get_base_url(provider: &str) -> Result<String, String> {
    match provider {
        "deepseek" => Ok("https://api.deepseek.com".into()),
        "openai" => Ok("https://api.openai.com".into()),
        "openrouter" => Ok("https://openrouter.ai/api".into()),
        "nvidia" => Ok("https://integrate.api.nvidia.com".into()),
        "gemini" => Ok("https://generativelanguage.googleapis.com".into()),
        "claude" => Ok("https://api.anthropic.com".into()),
        _ => Err(format!("Bilinmeyen saglayici: {}", provider)),
    }
}

fn is_openai_compatible(provider: &str) -> bool {
    OPENAI_COMPATIBLE.contains(&provider)
}

pub async fn ask_ai(provider: &ProviderConfig, request: &AiRequest) -> Result<AiResponse, String> {
    match provider.name.as_str() {
        "gemini" => ask_gemini(provider, request).await,
        "claude" => ask_claude(provider, request).await,
        _ if is_openai_compatible(&provider.name) => ask_openai_compat(provider, request).await,
        _ => Err(format!("Desteklenmeyen saglayici: {}", provider.name)),
    }
}

fn get_filter_prompt(invoices: &[crate::types::Invoice], query: &str) -> String {
    let invoice_summary: Vec<String> = invoices
        .iter()
        .map(|inv| {
            format!(
                "{} | Düzenleyen:{} Alıcı:{} Tutar:{:.2}TL Tarih:{} Yer:{}",
                inv.filename, inv.issuer, inv.recipient, inv.amount, inv.date, inv.location
            )
        })
        .collect();

    format!(
        "Sen bir fatura asistanısın. Aşağıdaki faturaları kullanıcının isteğine göre filtrele veya analiz et.\n\n\
         Faturalar:\n{}\n\n\
         Kullanıcı isteği: {}\n\n\
         Eğer kullanıcı tablo, rapor veya analiz istiyorsa, arayüzde gösterilmek üzere \"explanation\" alanına markdown formatında görsel olarak çok zengin, düzenli ve okunaklı bir tablo/analiz ekle.\n\
         ÖNEMLİ: Eşleşen faturaları açıklama (explanation) metninde tek tek sıra halinde veya liste olarak yazarak kalabalık etme. Arayüz bu faturaları zaten otomatik olarak filtreleyip gösterecektir. Açıklama metninde sadece genel analiz, toplam adet/tutar bilgisi ve gerekiyorsa markdown tablosu olarak özet rapor sun.\n\
         Yanıtını ŞU JSON formatında ver, başka hiçbir şey yazma (JSON kod bloğu ```json veya ``` kullanma, doğrudan ham JSON metnini dön):\n\
         {{\n  \"filter_criteria\": {{\n    \"issuers\": [...],\n    \"recipients\": [...],\n    \"locations\": [...],\n    \"date_min\": \"\",\n    \"date_max\": \"\",\n    \"amount_min\": 0,\n    \"amount_max\": 0,\n    \"search_text\": \"\"\n  }},\n  \"group_by\": \"issuer\",\n  \"explanation\": \"Markdown formatında detaylı analiz, tablo veya kısa açıklama buraya yazılmalı.\"\n}}\n\n\
         Boş olan alanlar filtre edilmeyecek demektir. amount_min=0 veya amount_max=0 ise fiyat filtresi uygulanmaz.\n\
         group_by şunlardan biri olmalı: issuer, recipient, location, date, amount_range.",
        invoice_summary.join("\n"),
        query
    )
}

pub async fn ask_openai_compat(provider: &ProviderConfig, request: &AiRequest) -> Result<AiResponse, String> {
    let base = get_base_url(&provider.name)?;
    let url = format!("{}/v1/chat/completions", base);
    let client = reqwest::Client::new();

    let prompt = get_filter_prompt(&request.invoices, &request.query);

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", provider.api_key))
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": request.model,
            "messages": [
                {"role": "system", "content": "Sen bir JSON API'sisin. Sadece JSON döndür, açıklama yapma."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
        }))
        .send()
        .await
        .map_err(|e| format!("API hatası: {}", e))?;

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse hatası: {}", e))?;
    parse_openai_response(&body)
}

async fn ask_gemini(provider: &ProviderConfig, request: &AiRequest) -> Result<AiResponse, String> {
    let base = get_base_url(&provider.name)?;
    let model = if request.model.starts_with("models/") || request.model.starts_with("gemini-") {
        request.model.clone()
    } else {
        format!("models/{}", request.model)
    };
    let url = format!("{}/v1beta/{}:generateContent?key={}",
        base, model, provider.api_key);
    let client = reqwest::Client::new();

    let prompt = get_filter_prompt(&request.invoices, &request.query);

    let resp = client
        .post(&url)
        .json(&json!({
            "systemInstruction": {
                "parts": [{"text": "Sen bir JSON API'sisin. Sadece JSON döndür, açıklama yapma."}]
            },
            "contents": [{
                "parts": [{"text": prompt}],
                "role": "user"
            }],
            "generationConfig": { "temperature": 0.1 },
        }))
        .send()
        .await
        .map_err(|e| format!("Gemini API hatası: {}", e))?;

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse hatası: {}", e))?;

    let content = body["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or("Gemini yanıtı boş")?;

    parse_json_response(content)
}

async fn ask_claude(provider: &ProviderConfig, request: &AiRequest) -> Result<AiResponse, String> {
    let base = get_base_url(&provider.name)?;
    let url = format!("{}/v1/messages", base);
    let client = reqwest::Client::new();

    let prompt = get_filter_prompt(&request.invoices, &request.query);

    let resp = client
        .post(&url)
        .header("x-api-key", &provider.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": request.model,
            "max_tokens": 4096,
            "system": "Sen bir JSON API'sisin. Sadece JSON döndür, açıklama yapma.",
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
        }))
        .send()
        .await
        .map_err(|e| format!("Claude API hatası: {}", e))?;

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse hatası: {}", e))?;

    let content = body["content"][0]["text"]
        .as_str()
        .or_else(|| body["content"].as_array()
            .and_then(|arr| arr.first())
            .and_then(|c| c["text"].as_str()))
        .ok_or("Claude yanıtı boş")?;

    parse_json_response(content)
}

fn parse_openai_response(body: &serde_json::Value) -> Result<AiResponse, String> {
    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("AI yanıtı boş")?;
    parse_json_response(content)
}

pub fn clean_json(raw: &str) -> &str {
    let clean_temp = raw.trim();
    let first_char = clean_temp.chars().next().unwrap_or(' ');
    
    if first_char == '{' || first_char == '[' {
        return clean_temp;
    }
    
    let start_brace = clean_temp.find('{');
    let start_bracket = clean_temp.find('[');
    
    let start_idx = match (start_brace, start_bracket) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    };
    
    if let Some(start) = start_idx {
        let end_char = if clean_temp.as_bytes()[start] == b'{' { '}' } else { ']' };
        if let Some(end) = clean_temp.rfind(end_char) {
            if end >= start {
                return &clean_temp[start..=end];
            }
        }
    }
    
    clean_temp
}

fn parse_json_response(raw: &str) -> Result<AiResponse, String> {
    let clean = clean_json(raw);
    serde_json::from_str(clean)
        .map_err(|e| format!("AI yanıtı parse hatası: {} | Ham: {}", e, clean))
}

pub async fn fetch_models(provider_name: &str, api_key: &str) -> Result<Vec<String>, String> {
    match provider_name {
        "gemini" => fetch_gemini_models(api_key).await,
        "claude" => fetch_claude_models(api_key).await,
        _ => fetch_openai_compat_models(provider_name, api_key).await,
    }
}

async fn fetch_openai_compat_models(provider_name: &str, api_key: &str) -> Result<Vec<String>, String> {
    let base = get_base_url(provider_name)?;
    let url = format!("{}/v1/models", base);
    let client = reqwest::Client::new();

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Model fetch hatası: {}", e))?;

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse: {}", e))?;

    let models: Vec<String> = body["data"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|m| m["id"].as_str().map(String::from))
        .collect();

    if models.is_empty() {
        Err("Model listesi bos dondu. API key dogru mu?".into())
    } else {
        Ok(models)
    }
}

async fn fetch_gemini_models(api_key: &str) -> Result<Vec<String>, String> {
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models?key={}", api_key);
    let client = reqwest::Client::new();

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Gemini model fetch hatası: {}", e))?;

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse: {}", e))?;

    let models: Vec<String> = body["models"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter(|m| {
            m["supportedGenerationMethods"].as_array()
                .unwrap_or(&vec![])
                .iter()
                .any(|g| g.as_str() == Some("generateContent"))
        })
        .filter_map(|m| {
            let name = m["name"].as_str()?.to_string();
            let short = name.strip_prefix("models/").unwrap_or(&name).to_string();
            Some(short)
        })
        .collect();

    if models.is_empty() {
        Err("Gemini model listesi bos dondu. API key dogru mu?".into())
    } else {
        Ok(models)
    }
}

async fn fetch_claude_models(api_key: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.anthropic.com/v1/models")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await
        .map_err(|e| format!("Claude model fetch hatası: {}", e))?;

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse: {}", e))?;

    let models: Vec<String> = body["data"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|m| m["id"].as_str().map(String::from))
        .collect();

    if models.is_empty() {
        Err("Claude model listesi bos dondu. API key dogru mu?".into())
    } else {
        Ok(models)
    }
}

pub async fn chat_completion_openai_compat(
    provider: &ProviderConfig,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    response_format_json: bool,
) -> Result<String, String> {
    let base = get_base_url(&provider.name)?;
    let url = format!("{}/v1/chat/completions", base);
    let client = reqwest::Client::new();

    let mut body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,
    });

    if response_format_json {
        body["response_format"] = json!({"type": "json_object"});
    }

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", provider.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API hatası: {}", e))?;

    let resp_body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse: {}", e))?;
    let content = resp_body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("AI yanıtı boş")?;
    Ok(content.to_string())
}

pub async fn chat_completion_gemini(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    let model_name = if model.starts_with("models/") || model.starts_with("gemini-") {
        model.to_string()
    } else {
        format!("models/{}", model)
    };
    let url = format!("https://generativelanguage.googleapis.com/v1beta/{}:generateContent?key={}",
        model_name, api_key);
    let client = reqwest::Client::new();

    let resp = client
        .post(&url)
        .json(&json!({
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [{
                "parts": [{"text": user_prompt}],
                "role": "user"
            }],
            "generationConfig": { "temperature": 0.1 },
        }))
        .send()
        .await
        .map_err(|e| format!("Gemini API hatası: {}", e))?;

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse: {}", e))?;
    let content = body["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or("Gemini yanıtı boş")?;
    Ok(content.to_string())
}

pub async fn chat_completion_claude(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    let url = "https://api.anthropic.com/v1/messages";
    let client = reqwest::Client::new();

    let resp = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.1,
        }))
        .send()
        .await
        .map_err(|e| format!("Claude API hatası: {}", e))?;

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse: {}", e))?;
    let content = body["content"][0]["text"]
        .as_str()
        .or_else(|| body["content"].as_array()
            .and_then(|arr| arr.first())
            .and_then(|c| c["text"].as_str()))
        .ok_or("Claude yanıtı boş")?;
    Ok(content.to_string())
}
