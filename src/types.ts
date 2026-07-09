export interface Invoice {
  id: string;
  filename: string;
  full_path: string;
  issuer: string;
  recipient: string;
  amount: number;
  date: string;
  location: string;
  invoice_number: string;
  tax_number: string;
  description: string;
  raw_text: string;
  ai_parsed: boolean;
}

export interface AiProviderConfig {
  name: string;
  api_key: string;
  models: string[];
}

export const PROVIDERS = [
  { name: 'deepseek', label: 'DeepSeek' },
  { name: 'openai', label: 'ChatGPT (OpenAI)' },
  { name: 'openrouter', label: 'OpenRouter' },
  { name: 'nvidia', label: 'NVIDIA NIM' },
  { name: 'gemini', label: 'Gemini (Google)' },
  { name: 'claude', label: 'Claude (Anthropic)' },
] as const;

export interface FilterOptions {
  issuers: string[];
  recipients: string[];
  locations: string[];
  date_min: string;
  date_max: string;
  amount_min: number;
  amount_max: number;
}

export interface FilterCriteria {
  issuers: string[];
  recipients: string[];
  locations: string[];
  date_min: string;
  date_max: string;
  amount_min: number;
  amount_max: number;
  search_text: string;
}

export interface AiResponse {
  filter_criteria: FilterCriteria;
  group_by: string;
  explanation: string;
}

export type GroupedInvoices = [string, Invoice[]];

export interface AiGroupedResponse {
  groups: GroupedInvoices[];
  explanation: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ExcelData {
  sheet_name: string;
  headers: string[];
  rows: string[][];
}

export interface DeepAnalyzeResponse {
  explanation: string;
  matched_ids: string[];
  excel_data: ExcelData | null;
}