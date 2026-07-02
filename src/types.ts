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
  embedding?: number[];
  category: string;
  ai_parsed: boolean;
}

export interface FilterOptions {
  issuers: string[];
  recipients: string[];
  locations: string[];
  date_min: string;
  date_max: string;
  amount_min: number;
  amount_max: number;
  categories: string[];
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
  categories: string[];
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