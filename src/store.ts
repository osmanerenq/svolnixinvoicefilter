import { create } from 'zustand';
import type { Invoice, FilterOptions, FilterCriteria, GroupedInvoices, AiResponse, AiGroupedResponse, AiProviderConfig } from './types';

const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(cmd, args);
  }
  throw new Error(`Tauri invoke '${cmd}' not available in browser dev mode`);
}

interface AppStore {
  invoices: Invoice[];
  filterOptions: FilterOptions;
  criteria: FilterCriteria;
  filtered: Invoice[];
  grouped: GroupedInvoices[];
  apiKey: string;
  model1: string;
  model2: string;
  loading: boolean;
  parseProgress: number;
  modelLoading: boolean;
  modelLoadingMessage: string;
  aiChat: { query: string; response: string; loading: boolean };
  deepAnalysisChat: { messages: ChatMessage[]; loading: boolean; matchedIds: string[]; excelData: ExcelData | null };
  providerConfigs: Record<string, AiProviderConfig>;
  activeProvider: string;
  availableModels: string[];

  initListeners: () => Promise<void>;
  loadFiles: (paths: string[]) => Promise<void>;
  refreshOptions: () => Promise<void>;
  setCriteria: (partial: Partial<FilterCriteria>) => void;
  applyFilter: () => Promise<void>;
  applyGroup: (groupBy: string) => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  setModels: (m1: string, m2: string) => Promise<void>;
  loadModels: () => Promise<void>;
  removeInvoice: (id: string) => Promise<void>;
  fixInvoiceWithAi: (id: string) => Promise<void>;
  aiFilter: (query: string) => Promise<void>;
  deepAnalyze: (query: string, model: string) => Promise<void>;
  clearDeepAnalysis: () => void;
  clearDeepAnalysisFilter: () => void;
  aiFilterAndGroup: (query: string, model: string) => Promise<void>;
  organizeFolders: (groupBy: string, outputDir: string, selectedIds?: string[], copyOnly?: boolean) => Promise<number>;
  organizeHierarchy: (parent: string, child: string, outputDir: string, selectedIds?: string[], copyOnly?: boolean) => Promise<number>;
  clearAll: () => Promise<void>;
  toggleIssuer: (issuer: string) => void;
  toggleRecipient: (r: string) => void;
  toggleLocation: (loc: string) => void;
  setProviderConfig: (providerName: string, apiKey: string) => Promise<void>;
  deleteProviderConfig: (providerName: string) => Promise<void>;
  fetchModels: (providerName: string) => Promise<void>;
  setActiveProvider: (providerName: string) => Promise<void>;
  loadProviderConfigs: () => Promise<void>;
}

export const useStore = create<AppStore>((set, get) => ({
  invoices: [],
  filterOptions: {
    issuers: [],
    recipients: [],
    locations: [],
    date_min: '',
    date_max: '',
    amount_min: 0,
    amount_max: 0,
  },
  criteria: {
    issuers: [],
    recipients: [],
    locations: [],
    date_min: '',
    date_max: '',
    amount_min: 0,
    amount_max: 0,
    search_text: '',
  },
  filtered: [],
  grouped: [],
  apiKey: '',
  model1: 'deepseek-v4-flash',
  model2: 'deepseek-v4-pro',
  loading: false,
  parseProgress: 0,
  modelLoading: true,
  modelLoadingMessage: 'AI Motoru Başlatılıyor...',
  aiChat: { query: '', response: '', loading: false },
  deepAnalysisChat: { messages: [], loading: false, matchedIds: [], excelData: null },
  providerConfigs: {},
  activeProvider: 'deepseek',
  availableModels: [],

  initListeners: async () => {
    if (isTauri) {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<string>('model_loading_status', (event) => {
        set({ modelLoading: true, modelLoadingMessage: event.payload });
      });
      await listen<void>('model_ready', () => {
        set({ modelLoading: false, modelLoadingMessage: '' });
      });
      // Check if it's already ready to avoid race conditions
      const ready = await invoke<boolean>('is_model_ready').catch(() => false);
      if (ready) {
        set({ modelLoading: false, modelLoadingMessage: '' });
      }
    } else {
      set({ modelLoading: false });
    }
  },

  loadFiles: async (paths) => {
    set({ loading: true, parseProgress: 0 });
    let unlisten: (() => void) | undefined;
    try {
      if (isTauri) {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<number>('parse_progress', (event) => {
          set({ parseProgress: event.payload });
        });
      }
      await invoke<number>('load_files', { paths });
      const invoices = await invoke<Invoice[]>('get_all_invoices');
      const filterOptions = await invoke<FilterOptions>('get_filter_options');
      set({ invoices, filterOptions, filtered: invoices, loading: false, parseProgress: 0 });
    } catch (e) {
      set({ loading: false, parseProgress: 0 });
      throw e;
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  },

  refreshOptions: async () => {
    const opts = await invoke<FilterOptions>('get_filter_options');
    set({ filterOptions: opts });
  },

  setCriteria: (partial) => {
    set((s) => ({ criteria: { ...s.criteria, ...partial } }));
  },

  applyFilter: async () => {
    const { criteria } = get();
    const filtered = await invoke<Invoice[]>('filter', { criteria });
    set({ filtered, grouped: [] });
  },

  applyGroup: async (groupBy) => {
    const { criteria } = get();
    const grouped = await invoke<GroupedInvoices[]>('group_invoices', { criteria, groupBy });
    set({ grouped });
  },

  setApiKey: async (key) => {
    await invoke('set_api_key', { key });
    set({ apiKey: key });
  },

  setProviderConfig: async (providerName, apiKey) => {
    await invoke('set_provider_config', { providerName, apiKey });
    const configs = await invoke<AiProviderConfig[]>('get_provider_configs');
    const cfgMap: Record<string, AiProviderConfig> = {};
    for (const c of configs) cfgMap[c.name] = c;
    set((s) => ({ providerConfigs: cfgMap, apiKey: cfgMap[s.activeProvider]?.api_key || '' }));
  },

  deleteProviderConfig: async (providerName) => {
    await invoke('delete_provider_config', { providerName });
    const configs = await invoke<AiProviderConfig[]>('get_provider_configs');
    const active = await invoke<string>('get_active_provider');
    const cfgMap: Record<string, AiProviderConfig> = {};
    for (const c of configs) cfgMap[c.name] = c;
    set({ providerConfigs: cfgMap, activeProvider: active, availableModels: cfgMap[active]?.models || [], apiKey: cfgMap[active]?.api_key || '' });
  },

  fetchModels: async (providerName) => {
    const models = await invoke<string[]>('fetch_models_command', { providerName });
    const configs = await invoke<AiProviderConfig[]>('get_provider_configs');
    const cfgMap: Record<string, AiProviderConfig> = {};
    for (const c of configs) cfgMap[c.name] = c;
    // Her zaman availableModels güncelle — settings'te aktif olmayan provider da yapılandırılabilir
    set({ providerConfigs: cfgMap, availableModels: models });
  },

  setActiveProvider: async (providerName) => {
    await invoke('set_active_provider', { providerName });
    const configs = await invoke<AiProviderConfig[]>('get_provider_configs');
    const cfgMap: Record<string, AiProviderConfig> = {};
    for (const c of configs) cfgMap[c.name] = c;
    set({
      activeProvider: providerName,
      providerConfigs: cfgMap,
      availableModels: cfgMap[providerName]?.models || [],
      apiKey: cfgMap[providerName]?.api_key || '',
    });
    // Set default models for provider if empty
    const state = get();
    if (!state.model1 || state.model1 === 'deepseek-v4-flash') {
      const defs = getDefaultModels(providerName);
      await get().setModels(defs[0], defs[1]);
    }
  },

  loadProviderConfigs: async () => {
    try {
      const configs = await invoke<AiProviderConfig[]>('get_provider_configs');
      const active = await invoke<string>('get_active_provider');
      const cfgMap: Record<string, AiProviderConfig> = {};
      for (const c of configs) cfgMap[c.name] = c;
      set({
        providerConfigs: cfgMap,
        activeProvider: active || 'deepseek',
        availableModels: cfgMap[active]?.models || [],
        apiKey: cfgMap[active]?.api_key || '',
      });
    } catch { /* browser dev mode */ }
  },

  setModels: async (model1, model2) => {
    await invoke('set_models', { model1, model2 });
    set({ model1, model2 });
  },

  loadModels: async () => {
    const [model1, model2] = await invoke<[string, string]>('get_models');
    const apiKey = await invoke<string>('get_api_key');
    set({ model1, model2, apiKey });
    // Also load provider configs
    try {
      const configs = await invoke<AiProviderConfig[]>('get_provider_configs');
      const active = await invoke<string>('get_active_provider');
      const cfgMap: Record<string, AiProviderConfig> = {};
      for (const c of configs) cfgMap[c.name] = c;
      set({
        providerConfigs: cfgMap,
        activeProvider: active || 'deepseek',
        availableModels: cfgMap[active || 'deepseek']?.models || [],
      });
    } catch { /* browser */ }
  },

  removeInvoice: async (id) => {
    await invoke('remove_invoice', { id });
    const invoices = await invoke<Invoice[]>('get_all_invoices');
    const filterOptions = await invoke<FilterOptions>('get_filter_options');
    set((s) => ({
      invoices,
      filterOptions,
      filtered: s.filtered.filter((inv) => inv.id !== id),
      grouped: s.grouped.map(([k, v]) => [k, v.filter((inv) => inv.id !== id)] as [string, Invoice[]]).filter(([, v]) => v.length > 0),
    }));
  },

  fixInvoiceWithAi: async (id) => {
    set({ loading: true });
    try {
      const updated = await invoke<Invoice>('fix_invoice_with_ai', { id });
      const filterOptions = await invoke<FilterOptions>('get_filter_options');
      set((s) => ({
        invoices: s.invoices.map((inv) => inv.id === id ? updated : inv),
        filtered: s.filtered.map((inv) => inv.id === id ? updated : inv),
        grouped: s.grouped.map(([k, v]) => [k, v.map((inv) => inv.id === id ? updated : inv)] as [string, Invoice[]]),
        filterOptions,
        loading: false,
      }));
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },



  aiFilter: async (query) => {
    set((s) => ({ aiChat: { ...s.aiChat, query, loading: true } }));
    try {
      const resp = await invoke<AiResponse>('ai_filter', { query });
      set({
        criteria: resp.filter_criteria,
        aiChat: { query, response: resp.explanation, loading: false },
      });
      // auto-apply filter
      const filtered = await invoke<Invoice[]>('filter', { criteria: resp.filter_criteria });
      set({ filtered, grouped: [] });
    } catch (e: any) {
      set((s) => ({ aiChat: { ...s.aiChat, response: String(e), loading: false } }));
    }
  },

  deepAnalyze: async (query, model) => {
    const newMessages = [...get().deepAnalysisChat.messages, { role: 'user', content: query } as ChatMessage];
    set((s) => ({
      deepAnalysisChat: {
        ...s.deepAnalysisChat,
        messages: newMessages,
        loading: true,
      }
    }));
    try {
      const history = get().deepAnalysisChat.messages.slice(0, -1);
      const resp = await invoke<DeepAnalyzeResponse>('deep_analyze', { query, history, model });
      set((s) => {
        const filtered = resp.matched_ids.length > 0
          ? s.invoices.filter((inv) => resp.matched_ids.includes(inv.id))
          : s.filtered;
        return {
          deepAnalysisChat: {
            messages: [...s.deepAnalysisChat.messages, { role: 'assistant', content: resp.explanation } as ChatMessage],
            loading: false,
            matchedIds: resp.matched_ids,
            excelData: resp.excel_data,
          },
          filtered,
        };
      });
    } catch (e: any) {
      set((s) => ({
        deepAnalysisChat: {
          ...s.deepAnalysisChat,
          messages: [...s.deepAnalysisChat.messages, { role: 'assistant', content: `Hata: ${String(e)}` } as ChatMessage],
          loading: false,
        }
      }));
    }
  },

  clearDeepAnalysis: () => {
    set({
      deepAnalysisChat: { messages: [], loading: false, matchedIds: [], excelData: null }
    });
    get().applyFilter();
  },

  clearDeepAnalysisFilter: () => {
    set((s) => ({
      deepAnalysisChat: { ...s.deepAnalysisChat, matchedIds: [] }
    }));
    get().applyFilter();
  },

  aiFilterAndGroup: async (query, model) => {
    set((s) => ({ aiChat: { ...s.aiChat, query, loading: true } }));
    try {
      const { criteria } = get();
      const resp = await invoke<AiGroupedResponse>('ai_filter_and_group', { query, criteria, model });
      const flatFiltered = resp.groups.flatMap((g) => g[1]);
      set({
        grouped: resp.groups,
        filtered: flatFiltered,
        aiChat: { query, response: resp.explanation, loading: false }
      });
    } catch (e: any) {
      set((s) => ({ aiChat: { ...s.aiChat, response: String(e), loading: false } }));
    }
  },

  organizeFolders: async (groupBy, outputDir, selectedIds, copyOnly) => {
    const { criteria } = get();
    return invoke<number>('organize_folders', { criteria, groupBy, outputDir, selectedIds, copyOnly });
  },

  organizeHierarchy: async (parent, child, outputDir, selectedIds, copyOnly) => {
    const { criteria } = get();
    return invoke<number>('organize_hierarchy', { criteria, parentGroup: parent, childGroup: child, outputDir, selectedIds, copyOnly });
  },

  clearAll: async () => {
    try {
      await invoke('clear_invoices');
    } catch (e) {
      console.error("Backend temizleme hatası:", e);
    }
    set({
      invoices: [],
      filterOptions: {
        issuers: [], recipients: [], locations: [],
        date_min: '', date_max: '', amount_min: 0, amount_max: 0,
      },
      criteria: {
        issuers: [], recipients: [], locations: [],
        date_min: '', date_max: '', amount_min: 0, amount_max: 0, search_text: '',
      },
      filtered: [],
      grouped: [],
    });
  },

  toggleIssuer: (issuer) => {
    set((s) => {
      const issuers = s.criteria.issuers.includes(issuer)
        ? s.criteria.issuers.filter((i) => i !== issuer)
        : [...s.criteria.issuers, issuer];
      return { criteria: { ...s.criteria, issuers } };
    });
  },

  toggleRecipient: (r) => {
    set((s) => {
      const recipients = s.criteria.recipients.includes(r)
        ? s.criteria.recipients.filter((i) => i !== r)
        : [...s.criteria.recipients, r];
      return { criteria: { ...s.criteria, recipients } };
    });
  },

  toggleLocation: (loc) => {
    set((s) => {
      const locations = s.criteria.locations.includes(loc)
        ? s.criteria.locations.filter((l) => l !== loc)
        : [...s.criteria.locations, loc];
      return { criteria: { ...s.criteria, locations } };
    });
  },


}));

function getDefaultModels(provider: string): [string, string] {
  switch (provider) {
    case 'deepseek': return ['deepseek-v4-flash', 'deepseek-v4-pro'];
    case 'openai': return ['gpt-4o-mini', 'gpt-4o'];
    case 'openrouter': return ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'];
    case 'nvidia': return ['meta/llama-3.1-8b-instruct', 'meta/llama-3.1-70b-instruct'];
    case 'gemini': return ['gemini-2.0-flash', 'gemini-2.0-pro-exp-02-05'];
    case 'claude': return ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'];
    default: return ['deepseek-v4-flash', 'deepseek-v4-pro'];
  }
}