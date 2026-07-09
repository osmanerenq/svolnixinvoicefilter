use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub name: String,
    pub api_key: String,
    #[serde(default)]
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub id: String,
    pub filename: String,
    pub full_path: String,
    pub issuer: String,
    pub recipient: String,
    pub amount: f64,
    pub date: String,
    pub location: String,
    pub invoice_number: String,
    pub tax_number: String,
    pub description: String,
    pub raw_text: String,
    #[serde(default)]
    pub ai_parsed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterOptions {
    pub issuers: Vec<String>,
    pub recipients: Vec<String>,
    pub locations: Vec<String>,
    pub date_min: String,
    pub date_max: String,
    pub amount_min: f64,
    pub amount_max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterCriteria {
    pub issuers: Vec<String>,
    pub recipients: Vec<String>,
    pub locations: Vec<String>,
    pub date_min: String,
    pub date_max: String,
    pub amount_min: f64,
    pub amount_max: f64,
    pub search_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiRequest {
    pub invoices: Vec<Invoice>,
    pub query: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub filter_criteria: FilterCriteria,
    pub group_by: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiGroupedResponse {
    pub groups: Vec<(String, Vec<Invoice>)>,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepAnalyzeResponse {
    pub explanation: String,
    /// AI'nın ilgili bulduğu fatura ID'leri — frontend bunları grid filtrelemesi için kullanır
    pub matched_ids: Vec<String>,
}