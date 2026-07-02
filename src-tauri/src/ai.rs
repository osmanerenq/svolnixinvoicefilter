use serde_json::json;
use crate::types::{AiRequest, AiResponse};

// ponytail: defaults empty filter, caller fills
pub async fn ask_deepseek(api_key: &str, request: &AiRequest) -> Result<AiResponse, String> {
    let client = reqwest::Client::new();

    let invoice_summary: Vec<String> = request
        .invoices
        .iter()
        .map(|inv| {
            format!(
                "{} | Düzenleyen:{} Alıcı:{} Tutar:{:.2}TL Tarih:{} Yer:{}",
                inv.filename, inv.issuer, inv.recipient, inv.amount, inv.date, inv.location
            )
        })
        .collect();

    let prompt = format!(
        "Sen bir fatura asistanısın. Aşağıdaki faturaları kullanıcının isteğine göre filtrele veya analiz et.\n\n\
         Faturalar:\n{}\n\n\
         Kullanıcı isteği: {}\n\n\
         Eğer kullanıcı tablo, rapor veya analiz istiyorsa, arayüzde gösterilmek üzere \"explanation\" alanına markdown formatında görsel olarak çok zengin, düzenli ve okunaklı bir tablo/analiz ekle.\n\
         Yanıtını ŞU JSON formatında ver, başka hiçbir şey yazma (JSON kod bloğu ```json veya ``` kullanma, doğrudan ham JSON metnini dön):\n\
         {{\n  \"filter_criteria\": {{\n    \"issuers\": [...],\n    \"recipients\": [...],\n    \"locations\": [...],\n    \"date_min\": \"\",\n    \"date_max\": \"\",\n    \"amount_min\": 0,\n    \"amount_max\": 0,\n    \"search_text\": \"\"\n  }},\n  \"group_by\": \"issuer\",\n  \"explanation\": \"Markdown formatında detaylı analiz, tablo veya kısa açıklama buraya yazılmalı.\"\n}}\n\n\
         Boş olan alanlar filtre edilmeyecek demektir. amount_min=0 veya amount_max=0 ise fiyat filtresi uygulanmaz.\n\
         group_by şunlardan biri olmalı: issuer, recipient, location, date, amount_range.",
        invoice_summary.join("\n"),
        request.query
    );

    let resp = client
        .post("https://api.deepseek.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
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

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("AI yanıtı boş")?;

    let clean_temp = content.trim();
    let clean = if clean_temp.starts_with("```") {
        let first_line_end = clean_temp.find('\n').unwrap_or(0);
        let end_block = clean_temp.rfind("```").unwrap_or(clean_temp.len());
        if end_block > first_line_end {
            clean_temp[first_line_end..end_block].trim()
        } else {
            clean_temp
        }
    } else {
        clean_temp
    };

    let parsed: AiResponse = serde_json::from_str(clean).map_err(|e| format!("AI yanıtı parse hatası: {} | Ham: {}", e, clean))?;

    Ok(parsed)
}

pub async fn ai_rerank(query: &str, invoices: &[crate::types::Invoice], api_key: &str, model: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();

    let top_invoices: Vec<&crate::types::Invoice> = invoices.iter().take(20).collect();

    let invoice_summary: Vec<String> = top_invoices
        .iter()
        .map(|inv| {
            format!(
                "ID: {} | Düzenleyen: {} | Alıcı: {} | Tutar: {:.2} TL | Açıklama: {}",
                inv.id, inv.issuer, inv.recipient, inv.amount, inv.description
            )
        })
        .collect();

    let prompt = format!(
        "Aşağıdaki faturalardan kullanıcının sorgusuyla en alakalı olanların ID'lerini seç. Sorgu: {}. Sadece ID'leri virgülle ayırarak döndür, başka bir şey yazma. Örn: id1, id2, id3\n\n{}",
        query,
        invoice_summary.join("\n")
    );

    let resp = client
        .post("https://api.deepseek.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": [
                {"role": "system", "content": "Sen bir JSON API'sisin. Sadece istenen formatta yanıt döndür."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
        }))
        .send()
        .await
        .map_err(|e| format!("API hatası: {}", e))?;

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse hatası: {}", e))?;

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("AI yanıtı boş")?;

    let ids: Vec<String> = content
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(ids)
}