use crate::types::Invoice;

fn normalize_str(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| match c {
            'ı' => 'i',
            'ş' => 's',
            'ğ' => 'g',
            'ü' => 'u',
            'ö' => 'o',
            'ç' => 'c',
            _ => c,
        })
        .collect()
}

pub fn filter_invoices(invoices: &[Invoice], criteria: &crate::types::FilterCriteria) -> Vec<Invoice> {
    invoices
        .iter()
        .filter(|inv| {
            if !criteria.issuers.is_empty() && !criteria.issuers.contains(&inv.issuer) {
                return false;
            }
            if !criteria.recipients.is_empty() && !criteria.recipients.contains(&inv.recipient) {
                return false;
            }
            if !criteria.locations.is_empty() && !criteria.locations.contains(&inv.location) {
                return false;
            }
            if criteria.amount_min > 0.0 && inv.amount < criteria.amount_min {
                return false;
            }
            if criteria.amount_max > 0.0 && inv.amount > criteria.amount_max {
                return false;
            }
            if !criteria.date_min.is_empty() && inv.date < criteria.date_min {
                return false;
            }
            if !criteria.date_max.is_empty() && inv.date > criteria.date_max {
                return false;
            }
            if !criteria.search_text.is_empty() {
                let text_lower = normalize_str(&format!("{} {}", inv.description, inv.raw_text));
                let keywords: Vec<String> = criteria
                    .search_text
                    .split(',')
                    .map(|k| normalize_str(k.trim()))
                    .filter(|k| !k.is_empty())
                    .collect();

                if !keywords.is_empty() {
                    let matched = keywords.iter().filter(|k| text_lower.contains(k.as_str())).count();
                    let min_matches = if keywords.len() >= 3 {
                        (keywords.len() / 2).max(1)
                    } else {
                        1
                    };
                    if matched < min_matches {
                        return false;
                    }
                }
            }
            true
        })
        .cloned()
        .collect()
}

pub fn group_and_sort(invoices: &[Invoice], group_by: &str) -> Vec<(String, Vec<Invoice>)> {
    if group_by == "none" {
        return vec![("".to_string(), invoices.to_vec())];
    }
    let mut groups: std::collections::HashMap<String, Vec<Invoice>> = std::collections::HashMap::new();

    for inv in invoices {
        let key = match group_by {
            "issuer" => inv.issuer.clone(),
            "recipient" => inv.recipient.clone(),
            "location" => inv.location.clone(),
            "date" => inv.date.clone(),
            _ => inv.issuer.clone(),
        };

        groups.entry(key).or_default().push(inv.clone());
    }

    let mut sorted: Vec<(String, Vec<Invoice>)> = groups.into_iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    sorted
}

// Group by multiple columns
#[allow(dead_code)]
pub fn group_by_category(invoices: &[Invoice], categories: &[String]) -> Vec<(String, Vec<Invoice>)> {
    let mut groups: std::collections::HashMap<String, Vec<Invoice>> = std::collections::HashMap::new();

    for inv in invoices {
        let key = categories
            .iter()
            .map(|cat| match cat.as_str() {
                "issuer" => inv.issuer.clone(),
                "recipient" => inv.recipient.clone(),
                "location" => inv.location.clone(),
                "date" => inv.date.clone(),
                "amount_range" => {
                    let a = inv.amount;
                    if a < 500.0 {
                        "0-500TL".into()
                    } else if a < 1000.0 {
                        "500-1000TL".into()
                    } else if a < 5000.0 {
                        "1000-5000TL".into()
                    } else {
                        "5000TL+".into()
                    }
                }
                _ => inv.issuer.clone(),
            })
            .collect::<Vec<_>>()
            .join("/");

        groups.entry(key).or_default().push(inv.clone());
    }

    let mut sorted: Vec<(String, Vec<Invoice>)> = groups.into_iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    sorted
}