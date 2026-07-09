use std::fs;
use std::path::Path;

pub fn organize_into_folders(
    groups: &[(String, Vec<crate::types::Invoice>)],
    base_dir: &str,
    copy_only: bool,
) -> Result<usize, String> {
    let base = Path::new(base_dir);
    fs::create_dir_all(base).map_err(|e| format!("Ana dizin oluşturulamadı: {}", e))?;

    let mut moved = 0usize;

    for (group_name, invoices) in groups {
        let group_dir = if group_name.is_empty() {
            base.to_path_buf()
        } else {
            let safe_name = group_name
                .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
            let gd = base.join(&safe_name);
            fs::create_dir_all(&gd).map_err(|e| format!("Klasör oluşturulamadı {}: {}", safe_name, e))?;
            gd
        };

        for inv in invoices {
            let src = Path::new(&inv.full_path);
            let dst = group_dir.join(&inv.filename);
            if src != dst && src.exists() {
                if copy_only {
                    fs::copy(src, &dst).map_err(|e| format!("Kopyalama hatası {}: {}", inv.filename, e))?;
                } else {
                    fs::rename(src, &dst).map_err(|e| format!("Taşıma hatası {}: {}", inv.filename, e))?;
                }
                moved += 1;
            }
        }

        // Save group summary as JSON alongside the files only if group_name is not empty
        if !group_name.is_empty() {
            let summary_path = group_dir.join("_group_summary.json");
            let summary = serde_json::to_string_pretty(&serde_json::json!({
                "group": group_name,
                "count": invoices.len(),
                "files": invoices.iter().map(|i| i.filename.clone()).collect::<Vec<_>>()
            }))
            .unwrap_or_default();
            let _ = fs::write(summary_path, summary);
        }
    }

    Ok(moved)
}

// Create a custom directory structure with hierarchy
pub fn organize_into_hierarchy(
    groups: &[(String, Vec<crate::types::Invoice>)],
    base_dir: &str,
    sub_group_by: &str,
    copy_only: bool,
) -> Result<usize, String> {
    let base = Path::new(base_dir);
    let mut moved = 0usize;

    for (parent, invoices) in groups {
        let safe_parent = parent.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
        let parent_dir = base.join(&safe_parent);
        fs::create_dir_all(&parent_dir).map_err(|e| format!("Dizin hatası: {}", e))?;

        // Sub-group by the second criterion
        let mut sub: std::collections::HashMap<String, Vec<&crate::types::Invoice>> =
            std::collections::HashMap::new();
        for inv in invoices {
            let sub_key = match sub_group_by {
                "amount_range" => {
                    let a = inv.amount;
                    if a < 500.0 { "0-500TL".into() }
                    else if a < 1000.0 { "500-1000TL".into() }
                    else if a < 5000.0 { "1000-5000TL".into() }
                    else { "5000TL+".into() }
                }
                "date" => inv.date.clone(),
                "location" => inv.location.clone(),
                _ => "diğer".into(),
            };
            sub.entry(sub_key).or_default().push(inv);
        }

        for (sub_name, sub_invoices) in sub {
            let safe_sub = sub_name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
            let sub_dir = parent_dir.join(&safe_sub);
            fs::create_dir_all(&sub_dir).map_err(|e| format!("Alt klasör hatası: {}", e))?;

            for inv in sub_invoices {
                let src = Path::new(&inv.full_path);
                let dst = sub_dir.join(&inv.filename);
                if src != dst && src.exists() {
                    if copy_only {
                        fs::copy(src, &dst)
                            .map_err(|e| format!("Kopyalama {}: {}", inv.filename, e))?;
                    } else {
                        fs::rename(src, &dst)
                            .map_err(|e| format!("Taşıma {}: {}", inv.filename, e))?;
                    }
                    moved += 1;
                }
            }
        }
    }

    Ok(moved)
}