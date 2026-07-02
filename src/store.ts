import { create } from 'zustand';
import type { Invoice, FilterOptions, FilterCriteria, GroupedInvoices, AiResponse, AiGroupedResponse } from './types';

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
  updateInvoiceCategory: (id: string, category: string) => Promise<void>;
  syncCacheToMemory: () => Promise<number>;
  aiFilter: (query: string) => Promise<void>;
  aiFilterAndGroup: (query: string, model: string) => Promise<void>;
  organizeFolders: (groupBy: string, outputDir: string) => Promise<number>;
  organizeHierarchy: (parent: string, child: string, outputDir: string) => Promise<number>;
  clearAll: () => Promise<void>;
  toggleIssuer: (issuer: string) => void;
  toggleRecipient: (r: string) => void;
  toggleLocation: (loc: string) => void;
  toggleCategory: (cat: string) => void;
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
    categories: [],
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
    categories: [],
  },
  filtered: [],
  grouped: [],
  apiKey: '',
  model1: 'deepseek-v4-flash',
  model2: 'deepseek-v4-pro',
  loading: false,
  parseProgress: 0,
  modelLoading: true, // Start as true to block UI if model isn't ready
  modelLoadingMessage: 'AI Motoru Başlatılıyor...',
  aiChat: { query: '', response: '', loading: false },

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

  setModels: async (model1, model2) => {
    await invoke('set_models', { model1, model2 });
    set({ model1, model2 });
  },

  loadModels: async () => {
    const [model1, model2] = await invoke<[string, string]>('get_models');
    const apiKey = await invoke<string>('get_api_key');
    set({ model1, model2, apiKey });
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

  updateInvoiceCategory: async (id, category) => {
    try {
      await invoke('update_invoice_category', { id, newCategory: category });
      const filterOptions = await invoke<FilterOptions>('get_filter_options');
      set((s) => ({
        invoices: s.invoices.map((inv) => inv.id === id ? { ...inv, category } : inv),
        filtered: s.filtered.map((inv) => inv.id === id ? { ...inv, category } : inv),
        grouped: s.grouped.map(([k, v]) => [k, v.map((inv) => inv.id === id ? { ...inv, category } : inv)] as [string, Invoice[]]),
        filterOptions,
      }));
    } catch (e) {
      console.error("Kategori guncelleme hatasi", e);
      throw e;
    }
  },

  syncCacheToMemory: async () => {
    try {
      const count = await invoke<number>('sync_cache_to_memory');
      return count;
    } catch (e) {
      console.error("Hafıza eşitleme hatası", e);
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

  aiFilterAndGroup: async (query, model) => {
    set((s) => ({ aiChat: { ...s.aiChat, query, loading: true } }));
    try {
      const { criteria } = get();
      const resp = await invoke<AiGroupedResponse>('ai_filter_and_group', { query, criteria, model });
      set({ grouped: resp.groups, aiChat: { query, response: resp.explanation, loading: false } });
    } catch (e: any) {
      set((s) => ({ aiChat: { ...s.aiChat, response: String(e), loading: false } }));
    }
  },

  organizeFolders: async (groupBy, outputDir) => {
    const { criteria } = get();
    return invoke<number>('organize_folders', { criteria, groupBy, outputDir });
  },

  organizeHierarchy: async (parent, child, outputDir) => {
    const { criteria } = get();
    return invoke<number>('organize_hierarchy', { criteria, parentGroup: parent, childGroup: child, outputDir });
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
        date_min: '', date_max: '', amount_min: 0, amount_max: 0, categories: [],
      },
      criteria: {
        issuers: [], recipients: [], locations: [],
        date_min: '', date_max: '', amount_min: 0, amount_max: 0, search_text: '', categories: [],
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

  toggleCategory: (cat) => {
    set((s) => {
      const categories = s.criteria.categories.includes(cat)
        ? s.criteria.categories.filter((c) => c !== cat)
        : [...s.criteria.categories, cat];
      return { criteria: { ...s.criteria, categories } };
    });
  },
}));