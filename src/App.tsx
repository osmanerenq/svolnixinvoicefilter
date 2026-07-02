import { useState, useEffect } from 'react';
import { useStore } from './store';
import FileDrop from './FileDrop';
import FilterPanel from './FilterPanel';
import InvoiceGrid from './InvoiceGrid';
import { Key, Settings, Trash2, Cpu } from 'lucide-react';

export default function App() {
  const { apiKey, setApiKey, clearAll, invoices, model1, model2, setModels, loadModels } = useStore();
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState(apiKey);
  const [model1Input, setModel1Input] = useState(model1);
  const [model2Input, setModel2Input] = useState(model2);
  const [keyMsg, setKeyMsg] = useState('');

  useEffect(() => {
    loadModels().then(() => {
      const s = useStore.getState();
      setModel1Input(s.model1);
      setModel2Input(s.model2);
      setKeyInput(s.apiKey);
    }).catch((e) => console.warn('loadModels failed (expected in browser):', e));
  }, []);

  const handleSaveKey = async () => {
    try {
      await setApiKey(keyInput);
      await setModels(model1Input.trim() || 'deepseek-v4-flash', model2Input.trim() || 'deepseek-v4-pro');
      setKeyMsg('Kaydedildi ✔');
    } catch (e: any) {
      setKeyMsg(String(e));
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              FF
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Fatura Filtreleme</h1>
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

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <FileDrop />
        <FilterPanel />
        <InvoiceGrid />
      </main>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Settings className="w-5 h-5" /> Ayarlar
            </h2>

            <div className="space-y-2">
              <label className="text-sm text-gray-400 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" /> DeepSeek API Anahtarı
              </label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
              />
              <p className="text-xs text-gray-600">AI filtreleme ve gruplama için gerekli. <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">platform.deepseek.com</a></p>
            </div>

            <div className="space-y-2 border-t border-gray-800 pt-3">
              <label className="text-sm text-gray-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" /> Model Kodları
              </label>
              <div className="space-y-1.5">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Hızlı model (V4 Flash)</p>
                  <input
                    type="text"
                    value={model1Input}
                    onChange={(e) => setModel1Input(e.target.value)}
                    placeholder="deepseek-v4-flash"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 font-mono"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Akıllı model (V4 Pro)</p>
                  <input
                    type="text"
                    value={model2Input}
                    onChange={(e) => setModel2Input(e.target.value)}
                    placeholder="deepseek-v4-pro"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-600">Güncel model kodları: <code className="text-amber-400">deepseek-v4-flash</code>, <code className="text-amber-400">deepseek-v4-pro</code></p>
            </div>

            {keyMsg && <p className="text-xs text-emerald-400">{keyMsg}</p>}

            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowSettings(false); setKeyMsg(''); }} className="text-sm px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">
                Kapat
              </button>
              <button onClick={handleSaveKey} className="text-sm px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white">
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}