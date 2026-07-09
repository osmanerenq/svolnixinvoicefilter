import { useState } from 'react';
import { useStore } from './store';
import { Filter, Search, Folders, ChevronDown, ChevronUp, SlidersHorizontal, MessageSquare, FolderOpen, X, Info } from 'lucide-react';
import type { Invoice } from './types';
import { open, save } from '@tauri-apps/plugin-dialog';

const computeTargetPath = (
  inv: Invoice,
  targetDir: string,
  groupByOpt: string,
  isHierarchical: boolean,
  childGroupOpt: string
) => {
  if (!targetDir) return '';
  let cleanBase = targetDir.trim();
  if (cleanBase.endsWith('/') || cleanBase.endsWith('\\')) {
    cleanBase = cleanBase.slice(0, -1);
  }
  const sep = cleanBase.includes('/') ? '/' : '\\';
  const getSafeName = (name: string) => {
    return name.replace(/[\/\\:\*\?"<>\|]/g, '_');
  };

  if (groupByOpt === 'none') {
    return `${cleanBase}${sep}${inv.filename}`;
  }

  const parentFolder = getSafeName(
    groupByOpt === 'issuer' ? inv.issuer :
    groupByOpt === 'recipient' ? inv.recipient :
    groupByOpt === 'location' ? inv.location :
    groupByOpt === 'date' ? inv.date : inv.issuer
  );

  if (isHierarchical) {
    let childFolder = 'diğer';
    if (childGroupOpt === 'amount_range') {
      const a = inv.amount;
      if (a < 500) childFolder = '0-500TL';
      else if (a < 1000) childFolder = '500-1000TL';
      else if (a < 5000) childFolder = '1000-5000TL';
      else childFolder = '5000TL+';
    } else if (childGroupOpt === 'date') {
      childFolder = inv.date;
    } else if (childGroupOpt === 'location') {
      childFolder = inv.location;
    }
    return `${cleanBase}${sep}${parentFolder}${sep}${getSafeName(childFolder)}${sep}${inv.filename}`;
  }

  return `${cleanBase}${sep}${parentFolder}${sep}${inv.filename}`;
};

export default function FilterPanel() {
  const {
    filterOptions, criteria, filtered, invoices,
    setCriteria, applyFilter, applyGroup, toggleIssuer, toggleRecipient, toggleLocation,
    organizeFolders, organizeHierarchy, model1, model2, deepAnalyze, deepAnalysisChat,
    availableModels, clearDeepAnalysis, clearDeepAnalysisFilter, refreshOptions,
  } = useStore();

  const [groupBy, setGroupBy] = useState('issuer');

  const [outputDir, setOutputDir] = useState('');
  const [folderMsg, setFolderMsg] = useState('');
  const [showDeepAnalyze, setShowDeepAnalyze] = useState(false);
  const [deepQuery, setDeepQuery] = useState('');
  const [deepModel, setDeepModel] = useState(availableModels[0] || model1);

  // Folder preview modal states
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [modalCopyOnly, setModalCopyOnly] = useState(true);
  const [modalGroupBy, setModalGroupBy] = useState('none');
  const [modalIsHierarchical, setModalIsHierarchical] = useState(false);
  const [modalChildGroup, setModalChildGroup] = useState('amount_range');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [wizardAnswers, setWizardAnswers] = useState<Record<string, string>>({});
  const [customAnswer, setCustomAnswer] = useState('');

  const activeFilters = [
    criteria.issuers.length > 0 && `Düzenleyen: ${criteria.issuers.length}`,
    criteria.recipients.length > 0 && `Alıcı: ${criteria.recipients.length}`,
    criteria.locations.length > 0 && `Yer: ${criteria.locations.length}`,
    criteria.amount_min > 0 && `Min: ${criteria.amount_min}TL`,
    criteria.amount_max > 0 && `Max: ${criteria.amount_max}TL`,
    criteria.search_text && `Ara: "${criteria.search_text}"`,
  ].filter(Boolean);

  const handleFilter = () => applyFilter();
  const handleGroup = () => applyGroup(groupBy);

  const handleOpenFolderModal = () => {
    setSelectedIds(filtered.map(inv => inv.id));
    setFolderMsg('');
    setShowPreviewModal(true);
  };



  const clearFilters = () => {
    setCriteria({
      issuers: [], recipients: [], locations: [],
      date_min: '', date_max: '', amount_min: 0, amount_max: 0, search_text: '',
    });
    applyFilter();
  };

  if (invoices.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Active filters badge */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <SlidersHorizontal className="w-4 h-4 text-blue-400" />
          {activeFilters.map((f, i) => (
            <span key={i} className="text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full">{f}</span>
          ))}
          <button onClick={clearFilters} className="text-xs text-red-400 hover:text-red-300 ml-1">Temizle</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {/* Issuers */}
        {filterOptions.issuers.length > 0 && (
          <ChipSelect label="Düzenleyen" options={filterOptions.issuers} selected={criteria.issuers} onToggle={toggleIssuer} />
        )}
        {/* Recipients */}
        {filterOptions.recipients.length > 0 && (
          <ChipSelect label="Alıcı" options={filterOptions.recipients} selected={criteria.recipients} onToggle={toggleRecipient} />
        )}
        {/* Locations */}
        {filterOptions.locations.length > 0 && (
          <ChipSelect label="Yer" options={filterOptions.locations} selected={criteria.locations} onToggle={toggleLocation} />
        )}


        {/* Amount range */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
          <label className="text-xs text-gray-400 font-medium mb-1 block">Tutar Aralığı (TL)</label>
          <div className="flex gap-1.5">
            <input
              type="number" placeholder="Min"
              value={criteria.amount_min || ''}
              onChange={(e) => setCriteria({ amount_min: Number(e.target.value) })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-600"
            />
            <span className="text-gray-500 self-center">-</span>
            <input
              type="number" placeholder="Max"
              value={criteria.amount_max || ''}
              onChange={(e) => setCriteria({ amount_max: Number(e.target.value) })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-600"
            />
          </div>
        </div>

        {/* Date range */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
          <label className="text-xs text-gray-400 font-medium mb-1 block">Tarih Aralığı</label>
          <div className="flex gap-1.5">
            <input
              type="text" placeholder="GG/AA/YYYY"
              value={criteria.date_min}
              onChange={(e) => setCriteria({ date_min: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-600"
            />
            <span className="text-gray-500 self-center">-</span>
            <input
              type="text" placeholder="GG/AA/YYYY"
              value={criteria.date_max}
              onChange={(e) => setCriteria({ date_max: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-600"
            />
          </div>
        </div>

        {/* Text search */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
          <label className="text-xs text-gray-400 font-medium mb-1 block">Metin Ara</label>
          <div className="flex gap-1.5">
            <input
              type="text" placeholder="Fatura içinde ara ( ~ ile semantik)"
              value={criteria.search_text}
              onChange={(e) => setCriteria({ search_text: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-600"
            />
            <button onClick={handleFilter} className="bg-blue-600 hover:bg-blue-500 rounded px-3 py-1 text-white text-sm">
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Action bar: Group + Filter + Folder */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={handleFilter} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1.5">
          <Filter className="w-4 h-4" /> Filtrele
        </button>

        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
        >
          <option value="issuer">Düzenleyene göre</option>
          <option value="recipient">Alıcıya göre</option>
          <option value="location">Yere göre</option>
          <option value="date">Tarihe göre</option>
        </select>

        <button onClick={handleGroup} className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-4 py-1.5 rounded-lg">
          Gruplandır
        </button>

        <button
          onClick={handleOpenFolderModal}
          className="bg-violet-700 hover:bg-violet-600 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1.5"
        >
          <Folders className="w-4 h-4" /> Klasörle
        </button>

        <button
          onClick={() => setShowDeepAnalyze(!showDeepAnalyze)}
          className="bg-purple-700 hover:bg-purple-600 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-all shadow-md shadow-purple-900/10"
        >
          <MessageSquare className="w-4 h-4" /> Nixie AI'ya Soru Sor {showDeepAnalyze ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <span className="text-sm text-gray-500 ml-auto">
          {filtered.length}/{invoices.length} fatura
        </span>
      </div>

      {/* Klasörleme Önizleme Modalı */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-950 border border-gray-800 rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/40">
              <h3 className="text-base font-semibold text-gray-200 flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-violet-400" />
                Klasörleme Önizleme ve Onay
              </h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-gray-400 hover:text-gray-250 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Target Directory Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 block">Hedef Klasör Yolu</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Hedef klasör yolu seçin (örn: C:\faturalar)"
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                  <button
                    onClick={async () => {
                      const dir = await open({ directory: true, multiple: false });
                      if (dir && typeof dir === 'string') setOutputDir(dir);
                    }}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-750 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <FolderOpen className="w-4 h-4" /> Seç
                  </button>
                </div>
              </div>

              {/* Options grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-900/30 border border-gray-900/80 rounded-xl p-4">
                {/* Action Type: Copy vs Move */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 block">İşlem Türü</label>
                  <div className="flex bg-gray-900 p-0.5 rounded-lg border border-gray-800">
                    <button
                      type="button"
                      onClick={() => setModalCopyOnly(true)}
                      className={`flex-1 text-center py-1.5 text-xs font-medium rounded-md transition-all ${
                        modalCopyOnly
                          ? 'bg-violet-600 text-white shadow-md'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      Kopyala (Güvenli)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalCopyOnly(false)}
                      className={`flex-1 text-center py-1.5 text-xs font-medium rounded-md transition-all ${
                        !modalCopyOnly
                          ? 'bg-amber-600 text-white shadow-md'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      Taşı (Taşı & Sil)
                    </button>
                  </div>
                </div>

                {/* Grouping Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 block">Gruplama Tipi</label>
                  <select
                    value={modalGroupBy}
                    onChange={(e) => setModalGroupBy(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-violet-500 transition-colors"
                  >
                    <option value="none">Gruplama Yok (Hepsini tek klasöre koy)</option>
                    <option value="issuer">Düzenleyene göre klasörle</option>
                    <option value="recipient">Alıcıya göre klasörle</option>
                    <option value="location">Yere göre klasörle</option>
                    <option value="date">Tarihe göre klasörle</option>
                  </select>
                </div>

                {/* Hierarchical Sub-grouping */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-400 flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={modalIsHierarchical}
                        disabled={modalGroupBy === 'none'}
                        onChange={(e) => setModalIsHierarchical(e.target.checked)}
                        className="w-3.5 h-3.5 rounded bg-gray-900 border-gray-800 text-violet-600 focus:ring-violet-500 accent-violet-600 disabled:opacity-50"
                      />
                      Hiyerarşik Alt Gruplama
                    </label>
                  </div>
                  <select
                    value={modalChildGroup}
                    disabled={!modalIsHierarchical || modalGroupBy === 'none'}
                    onChange={(e) => setModalChildGroup(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="amount_range">Tutar aralığına göre</option>
                    <option value="date">Tarihe göre</option>
                    <option value="location">Yere göre</option>
                  </select>
                </div>
              </div>

              {/* Table / File list */}
              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">İşlem Görecek Dosyalar</span>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedIds(filtered.map(i => i.id))}
                      className="text-violet-400 hover:text-violet-300 font-medium"
                    >
                      Tümünü Seç
                    </button>
                    <span className="text-gray-650">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="text-gray-400 hover:text-gray-300 font-medium"
                    >
                      Seçimi Temizle
                    </button>
                  </div>
                </div>

                {!outputDir && (
                  <div className="flex items-center gap-2 bg-blue-950/20 border border-blue-900/30 rounded-lg px-4 py-3 text-xs text-blue-300">
                    <Info className="w-4 h-4 flex-shrink-0" />
                    Hedef dosya önizlemesini görmek için lütfen bir <strong>Hedef Klasör Yolu</strong> girin veya seçin.
                  </div>
                )}

                <div className="border border-gray-800 rounded-xl overflow-hidden flex-1 min-h-[150px] max-h-[300px] overflow-y-auto bg-gray-900/10">
                  <table className="min-w-full divide-y divide-gray-800 text-left text-xs text-gray-300">
                    <thead className="bg-gray-900/50 sticky top-0 backdrop-blur-md text-gray-400 uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-3 w-10">Seç</th>
                        <th className="px-4 py-3">Fatura Dosyası</th>
                        <th className="px-4 py-3">Kaynak Klasör</th>
                        <th className="px-4 py-3">Oluşacak Hedef Yol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {filtered.map((inv) => {
                        const isSelected = selectedIds.includes(inv.id);
                        const sep = (outputDir || '').trim().includes('/') ? '/' : '\\';
                        const pathParts = (inv.full_path || '').split(/[\/\\]/);
                        const srcFolder = pathParts.slice(0, -1).join(sep);
                        const targetPath = outputDir
                          ? computeTargetPath(
                              inv,
                              outputDir,
                              modalGroupBy,
                              modalIsHierarchical && modalGroupBy !== 'none',
                              modalChildGroup
                            )
                          : '';

                        return (
                          <tr
                            key={inv.id}
                            className={`hover:bg-gray-850/30 transition-colors ${
                              isSelected ? 'bg-gray-900/20' : 'opacity-50'
                            }`}
                          >
                            <td className="px-4 py-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedIds([...selectedIds, inv.id]);
                                  } else {
                                    setSelectedIds(selectedIds.filter(id => id !== inv.id));
                                  }
                                }}
                                className="w-3.5 h-3.5 rounded bg-gray-900 border-gray-800 text-violet-600 focus:ring-violet-500 accent-violet-600"
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-gray-200 truncate max-w-[200px]" title={inv.filename}>
                                {inv.filename}
                              </div>
                              <div className="text-[10px] text-gray-500">
                                {inv.issuer} • {inv.amount} TL
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 truncate max-w-[150px]" title={srcFolder}>
                              {srcFolder}
                            </td>
                            <td className="px-4 py-2.5 text-gray-300 font-mono text-[10px] truncate max-w-[250px]" title={targetPath}>
                              {targetPath || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Status Message */}
              {folderMsg && (
                <div className={`p-3 rounded-lg text-xs font-medium border ${
                  folderMsg.includes('hata') || folderMsg.includes('gerekli')
                    ? 'bg-red-950/20 border-red-900/30 text-red-400'
                    : 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400'
                }`}>
                  {folderMsg}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/40 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Seçili: <strong className="text-violet-400">{selectedIds.length}</strong> / {filtered.length} fatura
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={isProcessing || !outputDir || selectedIds.length === 0}
                  onClick={async () => {
                    setIsProcessing(true);
                    setFolderMsg('');
                    try {
                      let n = 0;
                      if (modalIsHierarchical && modalGroupBy !== 'none') {
                        n = await organizeHierarchy(modalGroupBy, modalChildGroup, outputDir, selectedIds, modalCopyOnly);
                      } else {
                        n = await organizeFolders(modalGroupBy, outputDir, selectedIds, modalCopyOnly);
                      }
                      setFolderMsg(`${n} fatura dosyası ${modalCopyOnly ? 'başarıyla kopyalandı' : 'başarıyla taşındı'}.`);
                      await refreshOptions();
                    } catch (e: any) {
                      setFolderMsg(`İşlem sırasında hata oluştu: ${e}`);
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-5 py-2 rounded-lg font-medium shadow-lg hover:shadow-violet-600/20 transition-all flex items-center gap-1.5"
                >
                  {isProcessing ? 'İşleniyor...' : 'Onayla ve Klasörle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gelişmiş İnceleme panel */}
      {showDeepAnalyze && (
        <div className="bg-gray-900 border border-purple-800/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-medium text-purple-300 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Nixie AI'ya Soru Sor
              <span className="text-xs text-gray-500 font-normal">— Faturalarınız hakkında Nixie AI ile sohbet edin, analiz edin ve Excel raporları oluşturun</span>
            </h3>
            <div className="flex items-center gap-2">
              {deepAnalysisChat.messages.length > 0 && (
                <button
                  onClick={() => clearDeepAnalysis()}
                  className="bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-200 text-xs px-2.5 py-1 rounded-lg"
                >
                  Sohbeti Temizle
                </button>
              )}
              <select
                value={deepModel}
                onChange={(e) => setDeepModel(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-purple-200"
              >
                {availableModels.length > 0
                  ? availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))
                  : <>
                      <option value={model1}>{model1} (Hızlı)</option>
                      <option value={model2}>{model2} (Akıllı)</option>
                    </>
                }
              </select>
            </div>
          </div>

          {/* Chat message stream */}
          {deepAnalysisChat.messages.length > 0 && (
            <div className="space-y-3 max-h-96 overflow-y-auto p-2 bg-gray-950/40 rounded-lg border border-gray-800">
              {deepAnalysisChat.messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] text-gray-500 mb-1 px-1">
                    {msg.role === 'user' ? 'Kullanıcı' : 'Yapay Zeka'}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-lg p-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-purple-900/40 border border-purple-800/40 text-purple-100'
                        : 'bg-gray-800/80 border border-gray-700/50 text-gray-200'
                    }`}
                  >
                    <MarkdownFormatter text={msg.content} />
                  </div>
                </div>
              ))}
              
              {/* Spinner if loading and not finalized */}
              {deepAnalysisChat.loading && !deepAnalysisChat.finalized && (
                <div className="flex items-center gap-2 text-xs text-purple-400 animate-pulse py-2 px-1">
                  <span>🔍</span> Analiz ediliyor ve taranıyor...
                </div>
              )}

              {/* Premium glowing scan animation if finalized and loading */}
              {deepAnalysisChat.loading && deepAnalysisChat.finalized && (
                <div className="flex flex-col items-center justify-center p-6 bg-purple-950/20 border border-purple-900/30 rounded-xl space-y-4 animate-pulse my-2 animate-fade-in">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping"></div>
                    <div className="absolute inset-2 rounded-full border-2 border-purple-500/60 animate-spin border-t-transparent"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-xl">
                      📑
                    </div>
                  </div>
                  <div className="text-center space-y-1">
                    <h5 className="text-sm font-semibold text-purple-300">Faturalar Derinlemesine Analiz Ediliyor...</h5>
                    <p className="text-[11px] text-gray-400">Tüm ürün kalemleri ve raw fatura metinleri taranıyor.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action buttons like Download Excel */}
          {deepAnalysisChat.excelData && !deepAnalysisChat.loading && (
            <div className="flex flex-col items-center justify-center p-4 bg-purple-950/30 border border-purple-800/50 rounded-lg space-y-2 animate-fade-in">
              <div className="text-center">
                <span className="text-lg">📊</span>
                <h4 className="text-sm font-semibold text-purple-200 mt-1">Excel Tablosu Hazır!</h4>
                <p className="text-xs text-purple-400">"{deepAnalysisChat.excelData.sheet_name}" başlıklı excel şablonu oluşturuldu.</p>
              </div>
              <button
                onClick={async () => {
                  if (!deepAnalysisChat.excelData) return;
                  const { invoke } = await import('@tauri-apps/api/core');
                  try {
                    const savePath = await save({
                      filters: [{ name: 'Excel Tablosu', extensions: ['xlsx'] }],
                      defaultPath: `${deepAnalysisChat.excelData.sheet_name}.xlsx`
                    });
                    if (savePath) {
                      await invoke('save_excel_file', { path: savePath, excelData: deepAnalysisChat.excelData });
                      alert(`Excel dosyası başarıyla kaydedildi:\n${savePath}`);
                    }
                  } catch (err) {
                    alert(`Kaydetme hatası: ${err}`);
                  }
                }}
                className="bg-green-600 hover:bg-green-500 text-white font-medium text-sm px-5 py-2 rounded-lg flex items-center gap-2 shadow-lg shadow-green-900/30 transition-all cursor-pointer"
              >
                📥 Excel Dosyasını İndir (.xlsx)
              </button>
            </div>
          )}

          {/* Grid matched status */}
          {deepAnalysisChat.matchedIds.length > 0 && !deepAnalysisChat.loading && (
            <div className="flex items-center justify-between text-xs text-purple-300 bg-purple-950/30 border border-purple-800/40 rounded-lg px-3 py-1.5 animate-fade-in">
              <div className="flex items-center gap-2">
                <span>📋</span>
                <span>Grid <strong className="text-purple-200">{deepAnalysisChat.matchedIds.length}</strong> ilgili faturaya filtrelendi</span>
              </div>
              <button
                onClick={clearDeepAnalysisFilter}
                className="text-purple-400 hover:text-purple-200 font-semibold"
              >
                Filtreyi Kaldır
              </button>
            </div>
          )}

          {/* Query input field */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={
                deepAnalysisChat.messages.length > 0
                  ? "Sohbete devam edin veya soruları yanıtlayın..."
                  : 'Örn: "kaç tane bilgisayar alındı?", "en yüksek tutarlı 5 fatura için excel dosyası yap"'
              }
              value={deepQuery}
              onChange={(e) => setDeepQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && deepQuery.trim() && !deepAnalysisChat.loading) {
                  deepAnalyze(deepQuery.trim(), deepModel);
                  setDeepQuery('');
                }
              }}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={() => {
                if (deepQuery.trim()) {
                  deepAnalyze(deepQuery.trim(), deepModel);
                  setDeepQuery('');
                }
              }}
              disabled={deepAnalysisChat.loading || !deepQuery.trim()}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg whitespace-nowrap cursor-pointer"
            >
              {deepAnalysisChat.loading ? 'Gönderiliyor...' : 'Gönder'}
            </button>
          </div>
        </div>
      )}

      {/* Claude-style Wizard Modal */}
      {showDeepAnalyze && deepAnalysisChat.questions && deepAnalysisChat.questions.length > 0 && !deepAnalysisChat.finalized && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-gray-850 rounded-2xl max-w-xl w-full shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in duration-200 text-gray-200">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Nixie AI Sihirbazı</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  {currentQuestionIdx + 1} / {deepAnalysisChat.questions.length}
                </span>
                <button
                  onClick={() => {
                    useStore.setState((s) => ({
                      deepAnalysisChat: { ...s.deepAnalysisChat, questions: null }
                    }));
                  }}
                  className="text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Question Text */}
            <div>
              <h3 className="text-base font-medium text-gray-100">
                {deepAnalysisChat.questions[currentQuestionIdx].text}
              </h3>
            </div>

            {/* Options List */}
            <div className="space-y-2">
              {deepAnalysisChat.questions[currentQuestionIdx].options.map((option: string, optIdx: number) => (
                <button
                  key={optIdx}
                  onClick={() => {
                    const q = deepAnalysisChat.questions![currentQuestionIdx];
                    const updated: Record<string, string> = { ...wizardAnswers, [q.id]: option };
                    setWizardAnswers(updated);
                    
                    if (currentQuestionIdx + 1 < deepAnalysisChat.questions!.length) {
                      setCurrentQuestionIdx(currentQuestionIdx + 1);
                    } else {
                      const formatted = deepAnalysisChat.questions!.map((question) => {
                        const ans = updated[question.id] || "Belirtilmedi";
                        return `Soru: ${question.text}\nCevap: ${ans}`;
                      }).join("\n\n");
                      deepAnalyze(`Sihirbaz Soruları Yanıtları:\n\n${formatted}`, deepModel, "Sihirbaz soruları yanıtlandı.");
                      setCurrentQuestionIdx(0);
                      setWizardAnswers({});
                      useStore.setState((s) => ({
                        deepAnalysisChat: { ...s.deepAnalysisChat, questions: null }
                      }));
                    }
                  }}
                  className="w-full text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-purple-900/50 rounded-xl px-4 py-3 flex items-center justify-between text-sm transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-gray-800 group-hover:bg-purple-950/40 text-gray-400 group-hover:text-purple-300 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-semibold">
                      {optIdx + 1}
                    </span>
                    <span className="text-gray-300 group-hover:text-purple-200">{option}</span>
                  </div>
                  <span className="text-gray-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-transform">→</span>
                </button>
              ))}
            </div>

            {/* Something else / Custom Input */}
            {deepAnalysisChat.questions[currentQuestionIdx].allow_custom && (
              <div className="pt-2 border-t border-gray-800/50 space-y-2">
                <label className="text-xs text-gray-400">Farklı bir şey belirtin (İsteğe bağlı):</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Buraya kendi yanıtınızı yazabilirsiniz..."
                    value={customAnswer}
                    onChange={(e) => setCustomAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customAnswer.trim()) {
                        const q = deepAnalysisChat.questions![currentQuestionIdx];
                        const updated: Record<string, string> = { ...wizardAnswers, [q.id]: customAnswer.trim() };
                        setWizardAnswers(updated);
                        setCustomAnswer('');

                        if (currentQuestionIdx + 1 < deepAnalysisChat.questions!.length) {
                          setCurrentQuestionIdx(currentQuestionIdx + 1);
                        } else {
                          const formatted: string = deepAnalysisChat.questions!.map((question: any) => {
                            const ans = updated[question.id] || "Belirtilmedi";
                            return `Soru: ${question.text}\nCevap: ${ans}`;
                          }).join("\n\n");
                          deepAnalyze(`Sihirbaz Soruları Yanıtları:\n\n${formatted}`, deepModel, "Sihirbaz soruları yanıtlandı.");
                          setCurrentQuestionIdx(0);
                          setWizardAnswers({});
                          useStore.setState((s) => ({
                            deepAnalysisChat: { ...s.deepAnalysisChat, questions: null }
                          }));
                        }
                      }
                    }}
                    className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-250 placeholder-gray-600 focus:outline-none focus:border-purple-600"
                  />
                  <button
                    onClick={() => {
                      if (customAnswer.trim()) {
                        const q = deepAnalysisChat.questions![currentQuestionIdx];
                        const updated: Record<string, string> = { ...wizardAnswers, [q.id]: customAnswer.trim() };
                        setWizardAnswers(updated);
                        setCustomAnswer('');

                        if (currentQuestionIdx + 1 < deepAnalysisChat.questions!.length) {
                          setCurrentQuestionIdx(currentQuestionIdx + 1);
                        } else {
                          const formatted = deepAnalysisChat.questions!.map((question: any) => {
                            const ans = updated[question.id] || "Belirtilmedi";
                            return `Soru: ${question.text}\nCevap: ${ans}`;
                          }).join("\n\n");
                          deepAnalyze(`Sihirbaz Soruları Yanıtları:\n\n${formatted}`, deepModel, "Sihirbaz soruları yanıtlandı.");
                          setCurrentQuestionIdx(0);
                          setWizardAnswers({});
                          useStore.setState((s) => ({
                            deepAnalysisChat: { ...s.deepAnalysisChat, questions: null }
                          }));
                        }
                      }
                    }}
                    disabled={!customAnswer.trim()}
                    className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-all cursor-pointer"
                  >
                    Onayla
                  </button>
                </div>
              </div>
            )}

            {/* Footer Navigation */}
            <div className="flex items-center justify-between pt-2">
              <button
                disabled={currentQuestionIdx === 0}
                onClick={() => setCurrentQuestionIdx(currentQuestionIdx - 1)}
                className="text-xs text-gray-400 hover:text-gray-250 disabled:opacity-30 cursor-pointer"
              >
                ← Önceki Soru
              </button>
              
              <button
                onClick={() => {
                  const q = deepAnalysisChat.questions![currentQuestionIdx];
                  const updated: Record<string, string> = { ...wizardAnswers, [q.id]: "Pas Geçildi" };
                  setWizardAnswers(updated);

                  if (currentQuestionIdx + 1 < deepAnalysisChat.questions!.length) {
                    setCurrentQuestionIdx(currentQuestionIdx + 1);
                  } else {
                    const formatted = deepAnalysisChat.questions!.map((question) => {
                      const ans = updated[question.id] || "Belirtilmedi";
                      return `Soru: ${question.text}\nCevap: ${ans}`;
                    }).join("\n\n");
                    deepAnalyze(`Sihirbaz Soruları Yanıtları:\n\n${formatted}`, deepModel, "Sihirbaz soruları yanıtlandı.");
                    setCurrentQuestionIdx(0);
                    setWizardAnswers({});
                    useStore.setState((s) => ({
                      deepAnalysisChat: { ...s.deepAnalysisChat, questions: null }
                    }));
                  }
                }}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Geç (Skip)
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

/* Chip multi-select dropdown */
function ChipSelect({
  label, options, selected, onToggle,
}: {
  label: string; options: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative bg-gray-900 rounded-lg p-3 border border-gray-800">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        <span className="text-xs text-gray-500">
          {selected.length > 0 ? `${selected.length} seçili` : 'Tümü'}
          {open ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />}
        </span>
      </button>
      {open && (
        <div className="absolute z-10 mt-2 w-56 max-h-48 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => onToggle(opt)}
                className="accent-blue-500"
              />
              <span className="text-gray-300 truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function MarkdownFormatter({ text }: { text: string }) {
  const lines = text.split('\n');
  const renderedElements = [];
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for table row
    if (line.startsWith('|')) {
      inTable = true;
      const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

      // Skip separator row |---|---|
      if (cells.every(c => c.startsWith('-') || c === '')) {
        continue;
      }

      if (tableHeaders.length === 0) {
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else {
      // If we were in a table and table ended, render the table
      if (inTable && tableHeaders.length > 0) {
        renderedElements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-2 border border-gray-800 rounded-lg">
            <table className="min-w-full text-xs text-left text-gray-300">
              <thead className="bg-gray-800 text-amber-200 uppercase font-semibold border-b border-gray-700">
                <tr>
                  {tableHeaders.map((h, idx) => (
                    <th key={idx} className="px-3 py-1.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-900/40">
                {tableRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-gray-800/20">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap">{parseBoldText(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        inTable = false;
        tableHeaders = [];
        tableRows = [];
      }
    }

    if (line === '') {
      renderedElements.push(<div key={`space-${i}`} className="h-1.5" />);
      continue;
    }

    // List item check
    if (line.startsWith('- ') || line.startsWith('* ')) {
      renderedElements.push(
        <ul key={`list-${i}`} className="list-disc list-inside ml-2 text-xs text-gray-300">
          <li>{parseBoldText(line.substring(2))}</li>
        </ul>
      );
      continue;
    }

    // Regular line
    renderedElements.push(
      <p key={`p-${i}`} className="text-xs text-amber-200/90 leading-relaxed">
        {parseBoldText(line)}
      </p>
    );
  }

  // Handle case where table is the last block
  if (inTable && tableHeaders.length > 0) {
    renderedElements.push(
      <div key="table-final" className="overflow-x-auto my-2 border border-gray-800 rounded-lg">
        <table className="min-w-full text-xs text-left text-gray-300">
          <thead className="bg-gray-800 text-amber-200 uppercase font-semibold border-b border-gray-700">
            <tr>
              {tableHeaders.map((h, idx) => (
                <th key={idx} className="px-3 py-1.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-900/40">
            {tableRows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-gray-800/20">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-3 py-1.5">{parseBoldText(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <div className="space-y-1">{renderedElements}</div>;
}

// Simple bold parser helper
function parseBoldText(text: string) {
  const parts = text.split('**');
  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      return <strong key={idx} className="font-bold text-amber-100">{part}</strong>;
    }
    return part;
  });
}