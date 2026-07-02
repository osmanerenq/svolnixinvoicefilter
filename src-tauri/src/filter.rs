use crate::types::Invoice;
use std::collections::HashSet;

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
    // Pre-compute semantic search matches if ~ prefix
    let semantic_ids: Option<HashSet<String>> = if criteria.search_text.starts_with('~') {
        let query = &criteria.search_text[1..];
        let targets: Vec<(Vec<f32>, usize)> = invoices
            .iter()
            .enumerate()
            .filter_map(|(i, inv)| inv.embedding.as_ref().map(|e| (e.clone(), i)))
            .collect();
        if targets.is_empty() {
            Some(HashSet::new())
        } else {
            let matches = crate::embedding::search_similar(query, &targets, invoices.len());
            Some(
                matches
                    .into_iter()
                    .map(|(idx, _)| invoices[idx].id.clone())
                    .collect(),
            )
        }
    } else {
        None
    };

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
                if let Some(ref ids) = semantic_ids {
                    if !ids.contains(&inv.id) {
                        return false;
                    }
                } else {
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
            }
            if !criteria.categories.is_empty() {
                let inv_cat = normalize_str(&inv.category);
                let found = criteria.categories.iter().any(|c| normalize_str(c) == inv_cat);
                if !found {
                    return false;
                }
            }
            true
        })
        .cloned()
        .collect()
}

pub fn category_filter(invoices: &[Invoice], categories: &[String]) -> Vec<Invoice> {
    if categories.is_empty() {
        return invoices.to_vec();
    }
    let normalized_cats: Vec<String> = categories.iter().map(|c| normalize_str(c)).collect();
    invoices
        .iter()
        .filter(|inv| {
            let inv_cat = normalize_str(&inv.category);
            normalized_cats.iter().any(|c| *c == inv_cat)
        })
        .cloned()
        .collect()
}

#[allow(dead_code)]
pub fn search_by_embedding(
    query: &str,
    invoices_and_embeddings: &[(crate::types::Invoice, Vec<f32>)],
    top_n: usize,
) -> Vec<(usize, f32)> {
    let targets: Vec<(Vec<f32>, usize)> = invoices_and_embeddings
        .iter()
        .enumerate()
        .map(|(i, (_, emb))| (emb.clone(), i))
        .collect();
    crate::embedding::search_similar(query, &targets, top_n)
}

pub fn group_and_sort(invoices: &[Invoice], group_by: &str) -> Vec<(String, Vec<Invoice>)> {
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