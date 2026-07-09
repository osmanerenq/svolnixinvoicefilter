import { useState, useEffect } from 'react';
import { useStore } from './store';
import FileDrop from './FileDrop';
import FilterPanel from './FilterPanel';
import InvoiceGrid from './InvoiceGrid';
import { Key, Settings, Trash2, Brain, X, Info, RefreshCw, Check, Trash } from 'lucide-react';
import { PROVIDERS } from './types';

export default function App() {
  const {
    apiKey, clearAll, invoices, model1, model2, setModels, loadModels,
    initListeners, modelLoading, modelLoadingMessage,
    providerConfigs, activeProvider, availableModels,
    setProviderConfig, deleteProviderConfig, fetchModels, setActiveProvider,
  } = useStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  const [tutorialPage, setTutorialPage] = useState(1);
  const [keyInput, setKeyInput] = useState(apiKey);
  const [model1Input, setModel1Input] = useState(model1);
  const [model2Input, setModel2Input] = useState(model2);
  const [keyMsg, setKeyMsg] = useState('');
  const [settingsProvider, setSettingsProvider] = useState(activeProvider);
  const [fetchingModels, setFetchingModels] = useState(false);

  useEffect(() => {
    initListeners();
    loadModels().then(() => {
      const s = useStore.getState();
      setModel1Input(s.model1);
      setModel2Input(s.model2);
      setKeyInput(s.apiKey);
      setSettingsProvider(s.activeProvider);
    }).catch((e) => console.warn('loadModels failed (expected in browser):', e));
  }, []);

  const handleSaveKey = async () => {
    try {
      await setProviderConfig(settingsProvider, keyInput);
      await setModels(model1Input.trim() || getDefaultModel1(settingsProvider), model2Input.trim() || getDefaultModel2(settingsProvider));
      setKeyMsg('Kaydedildi ✔');
    } catch (e: any) {
      setKeyMsg(String(e));
    }
  };

  const handleFetchModels = async () => {
    if (!keyInput.trim()) { setKeyMsg('API anahtarı gerekli'); return; }
    setFetchingModels(true);
    try {
      await setProviderConfig(settingsProvider, keyInput);
      await fetchModels(settingsProvider);
      // Fetch başarılıysa ilk iki modeli otomatik seç
      const fetched = useStore.getState().availableModels;
      if (fetched.length > 0) setModel1Input(fetched[0]);
      if (fetched.length > 1) setModel2Input(fetched[1]);
      setKeyMsg(`${fetched.length} model getirildi ✔`);
    } catch (e: any) {
      setKeyMsg(String(e));
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSwitchProvider = async (name: string) => {
    setSettingsProvider(name);
    const key = providerConfigs[name]?.api_key || '';
    setKeyInput(key);
    setKeyMsg('');
    // Use stored models or defaults
    const models = providerConfigs[name]?.models || [];
    if (models.length >= 2) {
      setModel1Input(models[0]);
      setModel2Input(models[1]);
    } else if (models.length === 1) {
      setModel1Input(models[0]);
      setModel2Input(getDefaultModel2(name));
    } else {
      setModel1Input(getDefaultModel1(name));
      setModel2Input(getDefaultModel2(name));
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Model Loading Overlay */}
      {modelLoading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-sm">
          <Brain className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">AI Motoru Hazırlanıyor</h2>
          <p className="text-gray-400 text-sm animate-pulse">{modelLoadingMessage}</p>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain"></img>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white flex items-center gap-2">
                Fatura Filtreleme
                <button onClick={() => { setShowTutorial(true); setTutorialPage(1); }} className="text-blue-400 hover:text-blue-300" title="Nasıl Kullanılır?">
                  <Info className="w-4 h-4" />
                </button>
              </h1>
              <p className="text-xs text-gray-500">AI Destekli Fatura Yönetimi</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {invoices.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Temizle
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" /> Ayarlar
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <FileDrop />
        <FilterPanel />
        <InvoiceGrid />
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-500" />
                API ve Model Ayarları
              </h2>
              <button
                onClick={() => { setShowSettings(false); setKeyMsg(''); }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Provider selector */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Sağlayıcı</label>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {PROVIDERS.map((p) => {
                  const isActive = settingsProvider === p.name;
                  const hasKey = !!providerConfigs[p.name]?.api_key;
                  return (
                    <button
                      key={p.name}
                      onClick={() => handleSwitchProvider(p.name)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition-colors ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                    >
                      <span>{p.label}</span>
                      {hasKey && <span className="text-emerald-400 ml-1"><Check className="w-3 h-3" /></span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* API key input */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                {PROVIDERS.find(p => p.name === settingsProvider)?.label} API Anahtarı
              </label>
              <div className="flex gap-1.5">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="sk-..."
                />
                <button
                  onClick={handleFetchModels}
                  disabled={fetchingModels}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs px-2.5 py-2 rounded-lg flex items-center gap-1 whitespace-nowrap"
                  title="API'den modelleri getir"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fetchingModels ? 'animate-spin' : ''}`} />
                  Getir
                </button>
              </div>
            </div>

            {/* Model selection dropdowns (fetched or manual) */}
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Model 1 (AI Filtreleme / Hızlı Analiz)</label>
                {availableModels.length > 0 ? (
                  <select
                    value={model1Input}
                    onChange={(e) => setModel1Input(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={model1Input}
                    onChange={(e) => setModel1Input(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                    placeholder="deepseek-v4-flash"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Model 2 (Detaylı AI Düzeltme / Akıllı Analiz)</label>
                {availableModels.length > 0 ? (
                  <select
                    value={model2Input}
                    onChange={(e) => setModel2Input(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={model2Input}
                    onChange={(e) => setModel2Input(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                    placeholder="deepseek-v4-pro"
                  />
                )}
              </div>
            </div>



            {/* Saved providers summary */}
            {Object.keys(providerConfigs).length > 0 && (
              <div className="border-t border-gray-800 pt-3">
                <label className="block text-xs text-gray-400 mb-1">Kayıtlı Sağlayıcılar</label>
                <div className="space-y-1">
                  {Object.values(providerConfigs).map((cfg) => (
                    <div key={cfg.name} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${cfg.name === activeProvider ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                        <span className="text-xs text-gray-200">{PROVIDERS.find(p => p.name === cfg.name)?.label || cfg.name}</span>
                        {cfg.name === activeProvider && <span className="text-xs text-emerald-400">(aktif)</span>}
                        {cfg.models.length > 0 && <span className="text-xs text-gray-500">({cfg.models.length} model)</span>}
                      </div>
                      <div className="flex gap-1">
                        {cfg.name !== activeProvider && (
                          <button
                            onClick={async () => {
                              await setActiveProvider(cfg.name);
                              setSettingsProvider(cfg.name);
                              const m = useStore.getState().availableModels;
                              setModel1Input(m[0] || getDefaultModel1(cfg.name));
                              setModel2Input(m[1] || getDefaultModel2(cfg.name));
                              setKeyInput(cfg.api_key);
                              setKeyMsg(`${PROVIDERS.find(p => p.name === cfg.name)?.label} aktif edildi`);
                            }}
                            className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-2 py-0.5 rounded"
                          >
                            Aktif
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            await deleteProviderConfig(cfg.name);
                            if (settingsProvider === cfg.name) {
                              setKeyInput('');
                              setModel1Input('deepseek-v4-flash');
                              setModel2Input('deepseek-v4-pro');
                            }
                            setKeyMsg(`${cfg.name} silindi`);
                          }}
                          className="text-xs text-red-400 hover:text-red-300 px-1"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {keyMsg && (
              <p className={`text-xs ${keyMsg.includes('✔') || keyMsg.includes('Başarılı') || keyMsg.includes('Kaydedildi') || keyMsg.includes('edildi') ? 'text-emerald-400' : 'text-red-400'}`}>
                {keyMsg}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-800 pt-3">
              <button
                onClick={() => { setShowSettings(false); setKeyMsg(''); }}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition-colors"
              >
                Kapat
              </button>
              <button
                onClick={handleSaveKey}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tutorial modal */}
      {showTutorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg space-y-4 relative">

            {tutorialPage === 3 && (
              <button
                onClick={() => setShowTutorial(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Brain className="w-6 h-6 text-purple-500" />
              Nasıl Kullanılır? (Sayfa {tutorialPage}/3)
            </h2>

            {tutorialPage === 1 && (
              <div className="text-sm text-gray-300 space-y-3">
                <p>Nixie Invoice Filter uygulamasını 3 adımda kolayca kullanmaya başlayabilirsiniz:</p>
                <div className="space-y-2 text-xs text-gray-400">
                  <div className="bg-gray-950/40 p-2.5 rounded-lg border border-gray-800">
                    <strong className="text-white block mb-0.5">1. Faturaları Yükleyin:</strong>
                    PDF veya Excel faturalarınızı sürükleyip bırakarak uygulamaya yükleyin. Sistem saniyeler içinde tüm tutar, tarih, vergi numarası, alıcı ve düzenleyen bilgilerini okur.
                  </div>
                  <div className="bg-gray-950/40 p-2.5 rounded-lg border border-gray-800">
                    <strong className="text-white block mb-0.5">2. Filtreleyin & Gruplayın:</strong>
                    Üst kısımdaki hızlı filtre çiplerini (Düzenleyen, Alıcı, Yer), tutar/tarih aralıklarını veya kelime aramayı kullanarak faturalarınızı süzün.
                  </div>
                  <div className="bg-gray-950/40 p-2.5 rounded-lg border border-gray-800">
                    <strong className="text-white block mb-0.5">3. Otomatik Klasörleyin:</strong>
                    Filtrelenmiş faturalarınızı **"Klasörle"** butonuna basarak bilgisayarınızda otomatik olarak Tedarikçi, Alıcı veya Tarih klasörleri halinde düzenli dosyalara ayırın.
                  </div>
                </div>
              </div>
            )}

            {tutorialPage === 2 && (
              <div className="text-sm text-gray-300 space-y-3">
                <p>**Nixie AI ile Sohbet ve Excel Raporu Oluşturma**:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li><strong className="text-white">Nixie AI'ya Soru Sor:</strong> Alt paneli kullanarak faturalar hakkında serbestçe konuşabilirsiniz (örn. *"Ankara faturalarının özetini çıkar"*).</li>
                  <li><strong className="text-white">İnteraktif Sihirbaz:</strong> AI'dan ürün kalemlerini de içeren bir Excel tablosu istediğinizde, size aradığınız kriterlerle ilgili sorular sorar. Soruları tamamladığınızda Excel tablonuz native olarak derlenir ve doğrudan bilgisayarınıza indirilebilir hale gelir.</li>
                  <li><strong className="text-white">Dinamik Raw Metin Yükleme:</strong> Basit sorular 2 saniyede hızlıca yanıtlanır. Sadece derin detay gerektiren durumlarda sistem arka planda faturaların ham metinlerini (maks 300 fatura limitiyle) AI'a yükler.</li>
                </ul>
              </div>
            )}

            {tutorialPage === 3 && (
              <div className="text-sm text-gray-300 space-y-3">
                <p>Uygulamanın diğer gelişmiş özellikleri şunlardır:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li><strong className="text-white">AI ile Unvan Düzeltme (CPU Butonu):</strong> OCR işlemi sırasında şirket unvanları yarım/hatalı okunduysa, faturanın en sağındaki <b>CPU (AI ile Düzelt)</b> butonuna tıklayarak yapay zekayla bilgileri saniyeler içinde tam adına eşleştirebilirsiniz.</li>
                  <li><strong className="text-white">Yerel Kategori Belleği:</strong> Faturalara elle atadığınız kategoriler yerel vektör tabanında saklanır. AI sonraki faturalarda bu kategorileri otomatik atamayı öğrenir.</li>
                </ul>
                <div className="pt-2 text-[11px] text-gray-500 border-t border-gray-800 text-center">
                  *Bu uygulama <strong>GLM 5.2, DeepSeek ve Gemini</strong> yapay zeka modellerinin yardımıyla geliştirilmiştir.*
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-gray-800">
              <span className="text-xs text-gray-500">Adım {tutorialPage} / 3</span>
              <div className="flex gap-2">
                {tutorialPage === 1 ? (
                  <button
                    onClick={() => setTutorialPage(2)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    İleri
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setTutorialPage(tutorialPage - 1)}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
                    >
                      Geri
                    </button>
                    {tutorialPage < 3 ? (
                      <button
                        onClick={() => setTutorialPage(tutorialPage + 1)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        İleri
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowTutorial(false)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Anladım, Başla
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getDefaultModel1(provider: string): string {
  switch (provider) {
    case 'deepseek': return 'deepseek-v4-flash';
    case 'openai': return 'gpt-4o-mini';
    case 'openrouter': return 'openai/gpt-4o-mini';
    case 'nvidia': return 'meta/llama-3.1-8b-instruct';
    case 'gemini': return 'gemini-2.0-flash';
    case 'claude': return 'claude-3-5-haiku-20241022';
    default: return 'deepseek-v4-flash';
  }
}

function getDefaultModel2(provider: string): string {
  switch (provider) {
    case 'deepseek': return 'deepseek-v4-pro';
    case 'openai': return 'gpt-4o';
    case 'openrouter': return 'anthropic/claude-3.5-sonnet';
    case 'nvidia': return 'meta/llama-3.1-70b-instruct';
    case 'gemini': return 'gemini-2.0-pro-exp-02-05';
    case 'claude': return 'claude-3-5-sonnet-20241022';
    default: return 'deepseek-v4-pro';
  }
}