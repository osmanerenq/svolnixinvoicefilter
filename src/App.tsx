import { useState, useEffect } from 'react';
import { useStore } from './store';
import FileDrop from './FileDrop';
import FilterPanel from './FilterPanel';
import InvoiceGrid from './InvoiceGrid';
import { Key, Settings, Trash2, Cpu, Brain, X, Info } from 'lucide-react';

export default function App() {
  const { apiKey, setApiKey, clearAll, invoices, model1, model2, setModels, loadModels, initListeners, modelLoading, modelLoadingMessage, syncCacheToMemory } = useStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  const [tutorialPage, setTutorialPage] = useState(1);
  const [keyInput, setKeyInput] = useState(apiKey);
  const [model1Input, setModel1Input] = useState(model1);
  const [model2Input, setModel2Input] = useState(model2);
  const [keyMsg, setKeyMsg] = useState('');

  useEffect(() => {
    initListeners();
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
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              <img src="/src-tauri/icons/128x128.png" alt="Logo" className="w-full h-full object-contain"></img>
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
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4">
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

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">DeepSeek API Anahtarı</label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="sk-..."
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Model 1 (AI Filtreleme / Hızlı Analiz)</label>
                <input
                  type="text"
                  value={model1Input}
                  onChange={(e) => setModel1Input(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  placeholder="deepseek-v4-flash"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Model 2 (Detaylı AI Düzeltme / Akıllı Analiz)</label>
                <input
                  type="text"
                  value={model2Input}
                  onChange={(e) => setModel2Input(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  placeholder="deepseek-v4-pro" />
              </div>

              <div className="border-t border-gray-800 pt-3">
                <label className="block text-xs text-gray-400 mb-1">Eğitim & Bellek Yönetimi</label>
                <button
                  onClick={async () => {
                    setKeyMsg('Bellek senkronize ediliyor...');
                    try {
                      const count = await syncCacheToMemory();
                      setKeyMsg(`Başarılı: Önbellekten ${count} adet kategori eğitildi.`);
                    } catch (e: any) {
                      setKeyMsg(`Hata: ${e}`);
                    }
                  }}
                  className="w-full text-xs px-3 py-2 bg-gray-800 hover:bg-gray-700 text-blue-400 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <Brain className="w-3.5 h-3.5" /> Önbellek Kategorilerini Eğitime Aktar
                </button>
              </div>
            </div>

            {keyMsg && (
              <p className={`text-xs ${keyMsg.includes('Başarılı') || keyMsg.includes('Kaydedildi') ? 'text-emerald-400' : 'text-red-400'}`}>
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

            {tutorialPage === 2 && (
              <button
                onClick={() => setShowTutorial(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Brain className="w-6 h-6 text-blue-500" />
              Nasıl Kullanılır? (Sayfa {tutorialPage}/2)
            </h2>

            {tutorialPage === 1 ? (
              <div className="text-sm text-gray-300 space-y-3">
                <p>Fatura Filtreleme uygulaması yerleşik <b>Yapay Zeka (AI)</b> ile çalışır.</p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li><strong className="text-white">Otomatik Kategorizasyon:</strong> Yüklediğiniz faturalar otomatik olarak kategorize edilir.</li>
                  <li><strong className="text-white">Kategori Düzeltme (Öğrenme):</strong> Eğer sistem faturayı yanlış kategorize etmişse, tablodan veya karttan kategoriye tıklayıp doğrusunu yazıp <b>Enter</b> tuşuna basmanız yeterlidir. Sistem bunu <b>hemen öğrenecek</b> ve benzer faturalar için gelecekte hep bu kategoriyi kullanacaktır!</li>
                  <li><strong className="text-white">Akıllı AI Arama:</strong> Sağ menüdeki "AI Destekli Filtreleme" kısmına örneğin <i>"Geçen ayki demirbaş harcamaları neler?"</i> yazarsanız, sistem kendi eğittiğiniz bu kategorileri de kullanarak mükemmel sonuçlar getirir.</li>
                </ul>
              </div>
            ) : (
              <div className="text-sm text-gray-300 space-y-3">
                <p>Uygulamanın diğer gelişmiş özellikleri şunlardır:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li><strong className="text-white">AI ile Düzeltme (Cpu Simgesi):</strong> PDF'ler okunurken unvanların yanlış okunması durumunda (örneğin sadece "ŞTİ" yazması), fatura satırının sonundaki <b>CPU (AI ile Düzelt)</b> butonuna basarak DeepSeek yapay zekasıyla faturanın satıcı/alıcı bilgilerini otomatik düzeltebilirsiniz.</li>
                  <li><strong className="text-white">Grup & Görünüm Seçenekleri:</strong> Tablo, Kart veya Gruplar görünümüyle faturaları tedarikçilerine, tutarlarına veya kategorilerine göre gruplayabilirsiniz.</li>
                  <li><strong className="text-white">Dosya & Hiyerarşi Düzenleme:</strong> Süzdüğünüz veya grupladığınız faturaları bilgisayarınızda otomatik olarak klasörleyebilir (Elektrik, Su, Yemek klasörleri açarak) veya Excel raporları oluşturabilirsiniz.</li>
                </ul>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-gray-800">
              <span className="text-xs text-gray-500">Adım {tutorialPage} / 2</span>
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
                      onClick={() => setTutorialPage(1)}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
                    >
                      Geri
                    </button>
                    <button
                      onClick={() => setShowTutorial(false)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Anladım, Başla
                    </button>
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