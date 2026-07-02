use calamine::{open_workbook, Reader, Xlsx};
use log::info;
use pdf_extract::extract_text;
use regex::Regex;
use std::path::Path;

use crate::embedding::{cosine_similarity, EmbeddingEngine};
use crate::types::Invoice;

pub fn parse_pdf(path: &str) -> Result<Vec<Invoice>, String> {
    let text = extract_text(path).map_err(|e| format!("PDF okunamadı: {}", e))?;
    let lines: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    let full = text.clone();
    let filename = Path::new(path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let id = uuid::Uuid::new_v4().to_string();

    // Turkish ASCII normalization helper (must be at the top to be used in skip_line)
    let to_ascii = |s: &str| -> String {
        s.chars()
            .map(|c| match c {
                'İ' | 'ı' | 'i' | 'I' => 'i',
                'Ş' | 'ş' | 's' | 'S' => 's',
                'Ğ' | 'ğ' | 'g' | 'G' => 'g',
                'Ç' | 'ç' | 'c' | 'C' => 'c',
                'Ö' | 'ö' | 'o' | 'O' => 'o',
                'Ü' | 'ü' | 'u' | 'U' => 'u',
                _ => c.to_ascii_lowercase(),
            })
            .collect()
    };

    // Turkish number format: 26.844,48 → 26844.48
    let parse_tr_amount = |s: &str| -> f64 {
        s.replace('.', "").replace(',', ".").trim().parse::<f64>().unwrap_or(0.0)
    };

    // Date: dd.mm.yyyy or dd/mm/yyyy or dd-mm-yyyy, also spaced: "26- 02- 2026"
    let date_re = Regex::new(r"(\d{2}\s*[.\-/]\s*\d{2}\s*[.\-/]\s*\d{4})").unwrap();
    let date_kw_re = Regex::new(
        r"(?i)(?:Fatura\s*Tarih[i:]?|D[üu]zenlenme\s*Tarih|Invoice\s*Date|Kesim\s*Tarih)[:\s]*(\d{2}\s*[.\-/]\s*\d{2}\s*[.\-/]\s*\d{4})"
    ).unwrap();

    // Priority regexes for amount parsing (using horizontal whitespace matching to avoid cross-line capture)
    let odenenecek_re = Regex::new(
        r"(?i)(?:Ödenecek\s*Tutar|Ödeme\s*Tutarı|Ödenecek|Fatura\s*Tutarı)\s*(?:\([^)]+\)\s*)?[\|:]?\s*([\d.,]+)"
    ).unwrap();
    let vergiler_dahil_re = Regex::new(
        r"(?i)(?:Vergiler\s*Dahil\s*Toplam\s*Tutar|Genel\s*Toplam|Toplam\s*Tutar)\s*(?:\([^)]+\)\s*)?[\|:]?\s*([\d.,]+)"
    ).unwrap();
    let toplam_re = Regex::new(
        r"(?i)(?:TOPLAM)\s*(?:\([^)]+\)\s*)?[\|:]?\s*([\d.,]+)"
    ).unwrap();
    let invoice_no_re = Regex::new(r"(?:Fatura\s*No|Invoice\s*No)[:\s]*([A-Z0-9\-]+)").unwrap();
    
    // VKN Regex: 10 or 11 digit numbers
    let tax_re = Regex::new(r"(?i)(?:VKN|V\.K\.N\.|Vergi\s*No|Vergi\s*Kimlik\s*No)[:\s]*(\d{10,11})").unwrap();
    
    let city_re = Regex::new(
        r"(?i)\b(İstanbul|Ankara|İzmir|Bursa|Antalya|Adana|Konya|Gaziantep|Kayseri|Mersin|Niğde|Eskişehir|Denizli|Samsun|Diyarbakır|Trabzon|Çankaya|Bor|Muğla|Milas|Beyoğlu)\b"
    ).unwrap();

    let normalize_date = |s: &str| -> String {
        s.split_whitespace().collect::<Vec<_>>().join("")
    };

    let date = date_kw_re.captures(&text)
        .map(|c| normalize_date(&c[1]))
        .or_else(|| date_re.captures(&text).map(|c| normalize_date(&c[1])))
        .unwrap_or_default();

    let mut candidates = Vec::new();
    for c in odenenecek_re.captures_iter(&text) {
        let v = parse_tr_amount(&c[1]);
        if v > 5.0 { candidates.push(v); }
    }
    for c in vergiler_dahil_re.captures_iter(&text) {
        let v = parse_tr_amount(&c[1]);
        if v > 5.0 { candidates.push(v); }
    }
    for c in toplam_re.captures_iter(&text) {
        let v = parse_tr_amount(&c[1]);
        if v > 5.0 { candidates.push(v); }
    }
    let amount = candidates.into_iter()
        .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        .unwrap_or(0.0);

    let invoice_number = invoice_no_re.captures(&text).map(|c| c[1].to_string()).unwrap_or_default();

    // Skip lines when detecting company names
    let skip_line = |l: &str| -> bool {
        let lw = to_ascii(l);
        let lu = l.to_uppercase();
        
        l.len() <= 3
            || lw.starts_with("tel")
            || lw.starts_with("fax")
            || lw.starts_with("faks")
            || lw.starts_with("e-posta")
            || lw.starts_with("e-mail")
            || lw.starts_with("web")
            || lw.starts_with("vkn")
            || lw.starts_with("vergi")
            || lw.starts_with("ticaret sicil")
            || lw.starts_with("mersis")
            || lw.starts_with("sicil")
            || lw.starts_with("siparis")
            || lw.starts_with("irsaliye")
            || lw.starts_with("ettn")
            || lw.starts_with("ozellestirme")
            || lw.starts_with("senaryo")
            || lw.starts_with("fatura")
            || lw.starts_with("bina no")
            || lw.starts_with("kapi no")
            || lw.starts_with("turkiye")
            || lw.starts_with("musteri no")
            || lw.starts_with("musteri adi")
            || lw.starts_with("sozlesme")
            || lw.starts_with("tesisat")
            || lw.starts_with("hesap no")
            || lw.starts_with("otomatik odeme")
            || lw.starts_with("mal hizmet")
            || lw.starts_with("toplam iskonto")
            || lw.starts_with("hesaplanan")
            || lw.contains("dahil toplam")
            || lw.contains("vergiler dahil")
            || lw.contains("odenecek")
            || lw.contains("aciklama")
            || lw.contains("hesap aciklamasi")
            || lw.starts_with("adres")
            || lw.starts_with("teslimat")
            || lw.starts_with("subeno")
            || lw.starts_with("ticaretsicil")
            || lw.starts_with("son odeme")
            || lw.starts_with("tarihi")
            || lw.contains("dairesi")
            || lw.contains("turkiye")
            || lw.contains("e-fatura")
            || lw.contains("efatura")
            || lw.contains("@")
            || lw.contains("iban")
            || lw.contains("http")
            || lw.contains("www.")
            || lu.trim() == "SAYIN" || lu.trim() == "SAYIN:"
            || lw.starts_with("alici")
            || lw.contains("yalniz")
            || lw.contains("#")
            || lw.contains("hizmet turu")
            || lw.contains("dsl(internet)")
            || lw.contains("musteri hizmetleri")
            || lw.contains("online islemler")
            || lw.contains("sabit hattinizla")
            || lw.contains("faturanizda")
            || lw.contains("odenmemis")
            || lw.contains("otomatik fatura")
            || lw.contains("yansitma faturasi")
            || lw.contains("tarihli")
            || lw.contains("tarihinde")
            || lw.contains("akaryakit yansitma")
            || lw.contains("tutarin")
            || lw.contains("sube kodu")
            || lw.contains("banka bilgileri")
            || lw.contains("para birimi")
            || lw.contains("tuketici")
            || lw.contains("abone")
            || lw.contains("basvuru")
            || lw.contains("islem")
            || lw.contains("yekdem")
            || lw.contains("bankacilik")
            || lw.contains("farki")
            || lw.contains("farkı")
            || lw.contains("gosteril")
            || lw.contains("goruntule")
            || lw.contains("bize ulas")
            || lw.contains("hizmet kanallar")
            || lw.contains("cozumleri sun")
            || lw.contains("odeme yap")
            // IBAN detector: contains TR and more than 15 digits
            || (lw.contains("tr") && l.chars().filter(|c| c.is_ascii_digit()).count() > 15)
            || lw.contains("mah") || lw.contains("mahalle") || lw.contains("mh.")
            || lw.contains("cad") || lw.contains("cadde") || lw.contains("cd.")
            || lw.contains("sok") || lw.contains("sokak") || lw.contains("sk.")
            || lw.contains("bulvar") || lw.contains("bulv")
            || lw.contains("degerli") || lw.contains("musterimiz")
            || lw.contains("urun adi") || lw.contains("urunadi")
            || lw.contains("cinsi") || lw.contains("miktari")
            || lw.contains("birim fiyat") || lw.contains("odeme sekli")
            || lw.contains("kartli odeme") || lw.contains("iade edilen")
            || lw.contains("mal hizmet") || lw.contains("yazili talimat")
            || lw.contains("kavsak") || lw.contains("kavs")
            || lw.contains("apartman") || lw.contains("apt.")
            || lw.contains("kapi no")
            || (lu.contains("TUTAR") && l.chars().any(|c| c.is_ascii_digit()))
            || (lu.contains("TOPLAM") && l.chars().any(|c| c.is_ascii_digit()))
            || l.chars().take(5).all(|c| c.is_ascii_digit())
            || l.chars().all(|c| c.is_ascii_digit() || c == ' ' || c == '/')
    };

    let has_company_keyword = |l: &str| -> bool {
        let la = to_ascii(l);
        if la.len() < 4 { return false; }
        la.contains("a.s") || la.contains("a.s.")
            || la.contains("ltd")
            || la.contains("anonim") || la.contains("limited") || la.contains("sirket")
            || la.contains("kompani")
            || la.trim_end_matches(|c: char| c == '.' || c == ' ').ends_with("as")
            || la.trim_end_matches(|c: char| c == '.' || c == ' ').ends_with("sti")
            || la.contains("enerji") || la.contains("petrol") || la.contains("akaryakit")
            || la.contains("gida") || la.contains("sanayi") || la.contains("ticaret")
            || la.contains("ambalaj") || la.contains("nakliye") || la.contains("insaat")
            || la.contains("grup") || la.contains("kirtasiye") || la.contains("dijital")
            || la.contains("teknoloji") || la.contains("servis") || la.contains("hirdavat")
            || la.contains("muhendislik") || la.contains("telekomunikasyon") || la.contains("telekom")
            || la.contains("hafriyat") || la.contains("inovasyon") || la.contains("musavirlik")
    };



    let contains_city = |l: &str| -> bool {
        let l_lower = to_ascii(l);
        let cities = [
            "istanbul", "ankara", "izmir", "bursa", "antalya", "adana", "konya", 
            "gaziantep", "kayseri", "mersin", "nigde", "eskisehir", "denizli", "samsun", 
            "diyarbakir", "trabzon", "cankaya", "bor", "mugla", "milas", "beyogu", 
            "bornova", "aksaray", "kocasinan", "altunhisar"
        ];
        cities.iter().any(|&c| l_lower.contains(c))
    };

    let looks_like_company = |l: &str| -> bool {
        if has_company_keyword(l) { return true; }
        let lu = l.to_uppercase();
        if l.len() < 4 || l.len() > 85 { return false; }
        if contains_city(l) { return false; }
        
        lu.chars().filter(|c| c.is_alphabetic()).count() > 8
            && l.chars().filter(|c| c.is_alphabetic() && c.is_uppercase()).count() > 5
            && l.split_whitespace().count() >= 2
            && !l.contains('/') && !l.contains(',')
            && !l.chars().any(|c| c.is_ascii_digit())
            && !lu.contains("TUTAR") && !lu.contains("TOPLAM") && !lu.contains("İSKONTO")
            && !lu.contains("HESAP") && !lu.contains("SÖZLEŞME") && !lu.contains("TESİSAT")
            && !lu.contains("ÖDENECEK") && !lu.contains("HESAPLANAN")
            && !lu.contains("TÜRKİYE") && !lu.contains("TURKIYE")
            && !lu.contains("DAİRE") && !lu.contains("MÜDÜ")
    };

    let is_part_of_company = |l: &str| -> bool {
        if skip_line(l) { return false; }
        if contains_city(l) { return false; }
        if looks_like_company(l) { return true; }
        
        let has_letters = l.chars().any(|c| c.is_alphabetic());
        let has_digits = l.chars().any(|c| c.is_ascii_digit());
        let has_uppercase = l.chars().any(|c| c.is_uppercase());
        let word_count = l.split_whitespace().count();
        
        has_letters && !has_digits && l.len() < 50 && word_count >= 2 && has_uppercase
    };

    // Find all VKN positions and values in the lines
    let mut vkn_matches = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if let Some(caps) = tax_re.captures(line) {
            let vkn = caps[1].to_string();
            vkn_matches.push((i, vkn));
        }
    }

    // Resolving split company lines helper (bidirectional expansion)
    let clean_and_merge = |line_idx: usize| -> String {
        let has_company_suffix = |l: &str| -> bool {
            let la = to_ascii(l)
                .replace("a.s.", "as")
                .replace("a.s", "as")
                .replace("ltd.sti.", "ltd sti")
                .replace("ltd.sti", "ltd sti")
                .replace('-', " ")
                .replace('.', " ");
            la.split_whitespace().any(|w| w == "as" || w == "ltd" || w == "sti" || w == "sirket")
        };

        let mut start = line_idx;
        while start > 0 && is_part_of_company(lines[start - 1]) && !has_company_suffix(lines[start - 1]) {
            start -= 1;
        }
        
        let mut end = line_idx;
        while end + 1 < lines.len() && is_part_of_company(lines[end + 1]) && !has_company_suffix(lines[end]) {
            end += 1;
        }
        
        let mut merged_parts = Vec::new();
        for k in start..=end {
            let mut name = lines[k].to_string().replace('\r', "").replace('\n', " ");
            
            // Strip common prefix noise if present
            let clean_prefixes = [
                "Hesap Açıklaması:", "Hesap Aciklamasi:", "Açıklama:", "Aciklama:", "Yazı ile:", "Yazi ile:",
                "Sayın;", "Sayın:", "Sayın ", "Sayin;", "Sayin:", "Sayin "
            ];
            for prefix in &clean_prefixes {
                if name.to_lowercase().starts_with(&prefix.to_lowercase()) {
                    name = name[prefix.len()..].trim().to_string();
                }
            }
            merged_parts.push(name);
        }
        
        merged_parts.join(" ").replace("  ", " ").trim().to_string()
    };

    // Helper: Find closest company name going backwards from line index `start_idx`
    let find_company_backward = |start_idx: usize| -> Option<String> {
        let mut idx = start_idx;
        let mut found_line: Option<usize> = None;
        
        // Search backwards up to 20 lines (robust against stream reordering)
        for _ in 0..20 {
            if idx == 0 { break; }
            idx -= 1;
            let l = lines[idx];
            if !skip_line(l) && looks_like_company(l) {
                found_line = Some(idx);
                break;
            }
        }

        found_line.map(|f_idx| clean_and_merge(f_idx))
    };

    // Resolving party names based on VKN matches
    let mut resolved_parties: Vec<(String, String)> = Vec::new(); // Vec<(VKN, CompanyName)>
    
    for &(idx, ref vkn) in &vkn_matches {
        if let Some(comp_name) = find_company_backward(idx) {
            if !resolved_parties.iter().any(|(v, _)| v == vkn) {
                resolved_parties.push((vkn.clone(), comp_name));
            }
        }
    }

    // Build lists of ASC Enerji candidates and other candidates
    let mut asc_candidates = Vec::new();
    let mut other_candidates = Vec::new();

    for (pos, &line) in lines.iter().enumerate() {
        if !skip_line(line) && looks_like_company(line) {
            let lu = line.to_uppercase();
            let full_name = clean_and_merge(pos);

            if lu.contains("ASC ENERJİ") || lu.contains("ASC ENERJI") || lu.contains("ASC energy") {
                if !asc_candidates.contains(&full_name) {
                    asc_candidates.push(full_name);
                }
            } else {
                if !other_candidates.contains(&full_name) && full_name.len() > 10 {
                    other_candidates.push(full_name);
                }
            }
        }
    }

    let mut issuer = String::new();
    let mut recipient = String::new();

    // Priority 1: If we resolved both parties via VKN, use them directly (absolute!)
    if !resolved_parties.is_empty() {
        if let Some(asc_idx) = resolved_parties.iter().position(|(v, _)| v == "0860574079") {
            recipient = resolved_parties[asc_idx].1.clone();
            if resolved_parties.len() > 1 {
                let other_idx = if asc_idx == 0 { 1 } else { 0 };
                issuer = resolved_parties[other_idx].1.clone();
            }
        } else {
            // No ASC Enerji VKN? First VKN is issuer, second is recipient
            issuer = resolved_parties[0].1.clone();
            if resolved_parties.len() > 1 {
                recipient = resolved_parties[1].1.clone();
            }
        }
    }

    // Priority 2: Fallback to SAYIN checks if VKN matching is incomplete
    if issuer.is_empty() || recipient.is_empty() {
        let sayin_idx = lines.iter().position(|l| {
            let up = l.to_uppercase().trim().to_string();
            up == "SAYIN" || up == "SAYIN:" || up.starts_with("SAYIN ") || up.starts_with("SAYIN:")
        });

        if let Some(si) = sayin_idx {
            let sayin_line = lines[si];
            let up = sayin_line.to_uppercase().trim().to_string();
            let target = if up == "SAYIN" || up == "SAYIN:" {
                lines.get(si + 1).map(|s| s.to_string()).unwrap_or_default()
            } else {
                let stripped = sayin_line.trim();
                if let Some(idx) = stripped.to_uppercase().find("SAYIN") {
                    stripped[idx + 5..].trim().trim_start_matches(':').trim().to_string()
                } else {
                    stripped.to_string()
                }
            };

            let target_lu = target.to_uppercase();
            if target_lu.contains("ASC ENERJİ") || target_lu.contains("ASC ENERJI") || target_lu.contains("ASC energy") {
                if recipient.is_empty() {
                    recipient = if !asc_candidates.is_empty() { asc_candidates[0].clone() } else { target };
                }
                if issuer.is_empty() {
                    issuer = other_candidates.first().cloned().unwrap_or_default();
                }
            } else {
                if recipient.is_empty() {
                    recipient = target;
                }
                if issuer.is_empty() {
                    issuer = if !asc_candidates.is_empty() { asc_candidates[0].clone() } else { String::new() };
                }
            }
        }
    }

    // Fallbacks if one is still empty:
    if issuer.is_empty() {
        issuer = other_candidates.iter()
            .find(|c| **c != recipient)
            .cloned()
            .unwrap_or_default();
    }
    if recipient.is_empty() {
        recipient = asc_candidates.first().cloned().unwrap_or_else(|| {
            "ASC ENERJİ ANONİM ŞİRKETİ".to_string()
        });
    }

    // Clean up results
    let clean_final_name = |s: String| -> String {
        s.trim().trim_start_matches('.').trim_end_matches('.').trim().to_string()
    };

    let issuer = clean_final_name(issuer);
    let recipient = clean_final_name(recipient);

    let tax_number = if !vkn_matches.is_empty() {
        if let Some(&(_, ref vkn)) = vkn_matches.iter().find(|(_, v)| v != "0860574079") {
            vkn.clone()
        } else {
            vkn_matches[0].1.clone()
        }
    } else {
        String::new()
    };

    let title_case = |s: &str| -> String {
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
    };

    let location = city_re.captures(&text)
        .map(|c| title_case(&c[1]))
        .unwrap_or_default();

    let description = lines.iter()
        .find(|l| {
            let lw = l.to_lowercase();
            lw.contains("açıklama") || lw.contains("hizmet")
        })
        .map(|s| s.to_string())
        .unwrap_or_default();

    info!("PDF parsed: issuer={:?} recipient={:?} amount={} date={:?}", issuer, recipient, amount, date);

    let mut invoice = Invoice {
        id,
        filename,
        full_path: path.to_string(),
        issuer,
        recipient,
        amount,
        date,
        location,
        invoice_number,
        tax_number,
        description,
        raw_text: full,
        embedding: None,
        category: String::new(),
        ai_parsed: false,
    };
    validate_with_embedding(&mut invoice);
    Ok(vec![invoice])
}

pub(crate) fn find_best_field(lines: &[&str], prototype: &str) -> Option<String> {
    let engine = EmbeddingEngine::get()?;
    let proto_emb = engine.embed(prototype).ok()?;

    let mut best_line: Option<&str> = None;
    let mut best_score: f32 = 0.4;

    for line in lines {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        let lower = l.to_lowercase();
        if l.len() < 4 {
            continue;
        }
        if l.chars().all(|c| c.is_ascii_digit() || c == ' ' || c == '.' || c == ',') {
            continue;
        }
        if lower.contains("iban")
            || lower.contains("http")
            || lower.contains("@")
        {
            continue;
        }
        if lower.contains("cadde")
            || lower.contains("sokak")
            || lower.contains("mahalle")
            || lower.contains("bulvar")
            || lower.contains("cad.")
            || lower.contains("sk.")
            || lower.contains("mah.")
        {
            continue;
        }
        let line_emb = match engine.embed(l) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let sim = cosine_similarity(&proto_emb, &line_emb);
        if sim > best_score {
            best_score = sim;
            best_line = Some(l);
        }
    }
    best_line.map(|s| s.to_string())
}

pub(crate) fn validate_with_embedding(invoice: &mut Invoice) {
    if EmbeddingEngine::get().is_none() {
        return;
    }

    let text = &invoice.raw_text;
    // ponytail: doc embedding computed per spec, unused for now — future combined similarity
    let doc_text: String = text.chars().take(1000).collect();
    let engine = EmbeddingEngine::get().unwrap();
    let _doc_emb = engine.embed(&doc_text).ok();

    let lines: Vec<&str> = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    let count_digits = |s: &str| -> usize { s.chars().filter(|c| c.is_ascii_digit()).count() };

    // Issuer
    let issuer_bad = invoice.issuer.is_empty()
        || invoice.issuer.len() < 4
        || invoice.issuer.to_lowercase().contains("iban")
        || count_digits(&invoice.issuer) > 5;
    if issuer_bad {
        if let Some(better) =
            find_best_field(&lines, "sirket adi düzenleyen firma satıcı")
        {
            invoice.issuer = better;
        }
    }

    // Recipient
    let recipient_bad = invoice.recipient.is_empty()
        || invoice.recipient.len() < 4
        || invoice.recipient.to_lowercase().contains("iban")
        || count_digits(&invoice.recipient) > 5;
    if recipient_bad {
        if let Some(better) = find_best_field(&lines, "alici musteri recipient") {
            invoice.recipient = better;
        }
    }

    // Amount
    if invoice.amount < 0.01 {
        if let Some(better) =
            find_best_field(&lines, "toplam tutar odeme miktari")
        {
            let cleaned = better.replace('.', "").replace(',', ".").trim().to_string();
            if let Ok(v) = cleaned.parse::<f64>() {
                if v > 1.0 {
                    invoice.amount = v;
                }
            }
        }
    }

    // Date
    if invoice.date.is_empty() {
        if let Some(better) =
            find_best_field(&lines, "tarih fatura kesim duzenlenme")
        {
            let date_re =
                Regex::new(r"(\d{2}\s*[.\-/]\s*\d{2}\s*[.\-/]\s*\d{4})").unwrap();
            if let Some(caps) = date_re.captures(&better) {
                invoice.date = caps[1]
                    .to_string()
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join("");
            }
        }
    }

    // Location
    if invoice.location.is_empty() || invoice.location.len() < 3 {
        if let Some(better) = find_best_field(&lines, "sehir il konum adres") {
            invoice.location = better;
        }
    }
}

pub fn parse_excel(path: &str) -> Result<Vec<Invoice>, String> {
    let mut workbook: Xlsx<_> = open_workbook(path).map_err(|e| format!("Excel açılamadı: {}", e))?;
    let sheets = workbook.sheet_names().to_vec();
    let mut invoices = Vec::new();

    for sheet_name in &sheets {
        if let Ok(range) = workbook.worksheet_range(sheet_name) {
            let mut rows = range.rows();
            if rows.len() < 2 {
                continue;
            }

            let header: Vec<String> = rows
                .next()
                .unwrap()
                .iter()
                .map(|c| c.to_string().to_lowercase().trim().to_string())
                .collect();

            let col_idx = |name: &str| -> Option<usize> {
                header.iter().position(|h| h.contains(name))
            };

            let i_issuer = col_idx("düzenleyen").or(col_idx("satici").or(col_idx("firma").or(col_idx("issuer"))));
            let i_recipient = col_idx("alici").or(col_idx("müşteri").or(col_idx("recipient")));
            let i_amount = col_idx("tutar").or(col_idx("fiyat").or(col_idx("amount").or(col_idx("toplam"))));
            let i_date = col_idx("tarih").or(col_idx("date"));
            let i_location = col_idx("yer").or(col_idx("şehir").or(col_idx("adres").or(col_idx("location"))));
            let i_invoice_no = col_idx("fatura").or(col_idx("no").or(col_idx("invoice")));
            let i_tax = col_idx("vergi").or(col_idx("tax"));
            let i_desc = col_idx("açıklama").or(col_idx("description"));

            let filename = Path::new(path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            for row in rows {
                let cells: Vec<String> = row.iter().map(|c| c.to_string().trim().to_string()).collect();
                let get = |idx: Option<usize>| -> String {
                    idx.and_then(|i| cells.get(i)).cloned().unwrap_or_default()
                };

                let id = uuid::Uuid::new_v4().to_string();
                let raw_text = cells.join(" | ");

                invoices.push(Invoice {
                    id,
                    filename: filename.clone(),
                    full_path: path.to_string(),
                    issuer: get(i_issuer),
                    recipient: get(i_recipient),
                    amount: get(i_amount).parse().unwrap_or(0.0),
                    date: get(i_date),
                    location: get(i_location),
                    invoice_number: get(i_invoice_no),
                    tax_number: get(i_tax),
                    description: get(i_desc),
                    raw_text,
                    embedding: None,
                    category: String::new(),
                    ai_parsed: false,
                });
            }
        }
    }

    info!("Excel'den {} fatura okundu: {}", invoices.len(), path);
    Ok(invoices)
}