import { useState } from 'react';
import { useStore } from './store';
import { FileUp, Loader2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

export default function FileDrop() {
  const { loadFiles, invoices, loading, parseProgress } = useStore();
  const [error, setError] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem('categoryWarningDismissed') === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
    try {
      localStorage.setItem('categoryWarningDismissed', 'true');
    } catch (err) {
      console.warn(err);
    }
  };

  const handleClick = async () => {
    setError('');
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Faturalar', extensions: ['pdf', 'xlsx', 'xls'] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      await loadFiles(paths);
    } catch (e: any) {
      setError(String(e));
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    setError('');
    try {
      // Tauri 2: dragEvent items have .path via webkitGetAsEntry or tauri drag
      const files = Array.from(e.dataTransfer.files);
      const paths = files.map((f) => (f as any).path).filter(Boolean);
      if (paths.length === 0) {
        setError('Dosya yolu alınamadı. Lütfen tıklayarak seçin.');
        return;
      }
      await loadFiles(paths);
    } catch (e: any) {
      setError(String(e));
    }
  };

  return (
    <div className="space-y-2">
      {!isDismissed && (
        <div className="flex items-center justify-between gap-2 bg-amber-955/20 border border-amber-900/30 rounded-lg px-4 py-2.5 text-xs text-amber-200/90 shadow-sm leading-relaxed">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-semibold flex-shrink-0">⚠️ Not:</span>
            <span>Kategoriler %100 güvenilir değildir. Hatalı olan kategorileri, aşağıdaki tablo veya kart görünümünden üzerine tıklayarak değiştirebilirsiniz.</span>
          </div>
          <button
            onClick={handleDismiss}
            className="text-xs bg-amber-600/80 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold px-2.5 py-1 rounded-md shadow-sm transition-colors whitespace-nowrap"
          >
            Anladım
          </button>
        </div>
      )}
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
        onDragLeave={() => setIsDragActive(false)}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-400 bg-blue-950/30' : 'border-gray-600 hover:border-gray-400 bg-gray-900/50'}`}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span>Faturalar işleniyor... %{parseProgress}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <FileUp className="w-10 h-10" />
            <p className="text-sm">
              {isDragActive
                ? 'Dosyaları buraya bırakın'
                : 'PDF veya Excel faturalarınızı sürükleyin ya da tıklayıp seçin'}
            </p>
            <p className="text-xs text-gray-500">.pdf, .xlsx, .xls</p>
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {invoices.length > 0 && (
        <p className="text-sm text-gray-400">{invoices.length} fatura yüklendi</p>
      )}
    </div>
  );
}