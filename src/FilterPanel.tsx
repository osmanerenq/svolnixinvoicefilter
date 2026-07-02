import { useState } from 'react';
import { useStore } from './store';
import { Filter, Search, Folders, ChevronDown, ChevronUp, SlidersHorizontal, MessageSquare, FolderOpen } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

export default function FilterPanel() {
  const {
    filterOptions, criteria, filtered, invoices,
    setCriteria, applyFilter, applyGroup, toggleIssuer, toggleRecipient, toggleLocation, toggleCategory,
    organizeFolders, organizeHierarchy, aiFilterAndGroup, aiFilter, aiChat, model1, model2,
  } = useStore();

  const [groupBy, setGroupBy] = useState('issuer');
  const [childGroup, setChildGroup] = useState('amount_range');
  const [outputDir, setOutputDir] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [aiModel, setAiModel] = useState(model1);
  const [showChat, setShowChat] = useState(false);
  const [showFolder, setShowFolder] = useState(false);
  const [folderMsg, setFolderMsg] = useState('');
  const [isSmartFilter, setIsSmartFilter] = useState(false);

  const activeFilters = [
    criteria.issuers.length > 0 && `Düzenleyen: ${criteria.issuers.length}`,
    criteria.recipients.length > 0 && `Alıcı: ${criteria.recipients.length}`,
    criteria.locations.length > 0 && `Yer: ${criteria.locations.length}`,
    criteria.amount_min > 0 && `Min: ${criteria.amount_min}TL`,
    criteria.amount_max > 0 && `Max: ${criteria.amount_max}TL`,
    criteria.search_text && `Ara: "${criteria.search_text}"`,
    criteria.categories.length > 0 && `Kategori: ${criteria.categories.length}`,
  ].filter(Boolean);

  const handleFilter = () => applyFilter();
  const handleGroup = () => applyGroup(groupBy);

  const handleSend = async () => {
    if (!chatInput.trim()) return;
    if (isSmartFilter) {
      await aiFilter(chatInput.trim());
    } else {
      await aiFilterAndGroup(chatInput.trim(), aiModel);
    }
    setChatInput('');
  };

  const handleOrganize = async () => {
    if (!outputDir) { setFolderMsg('Klasör yolu gerekli'); return; }
    try {
      const n = await organizeFolders(groupBy, outputDir);
      setFolderMsg(`${n} dosya taşındı → ${outputDir}`);
    } catch (e: any) { setFolderMsg(String(e)); }
  };

  const handleHierarchy = async () => {
    if (!outputDir) { setFolderMsg('Klasör yolu gerekli'); return; }
    try {
      const n = await organizeHierarchy(groupBy, childGroup, outputDir);
      setFolderMsg(`${n} dosya hiyerarşik taşındı → ${outputDir}`);
    } catch (e: any) { setFolderMsg(String(e)); }
  };

  const clearFilters = () => setCriteria({
    issuers: [], recipients: [], locations: [],
    date_min: '', date_max: '', amount_min: 0, amount_max: 0, search_text: '', categories: [],
  });

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
        {filterOptions.categories.length > 0 && (
          <ChipSelect label="Kategori" options={filterOptions.categories} selected={criteria.categories} onToggle={toggleCategory} />
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
          onClick={() => setShowFolder(!showFolder)}
          className="bg-violet-700 hover:bg-violet-600 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1.5"
        >
          <Folders className="w-4 h-4" /> Klasörle {showFolder ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <button
          onClick={() => setShowChat(!showChat)}
          className="bg-amber-700 hover:bg-amber-600 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1.5"
        >
          <MessageSquare className="w-4 h-4" /> AI Chat {showChat ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <span className="text-sm text-gray-500 ml-auto">
          {filtered.length}/{invoices.length} fatura
        </span>
      </div>

      {/* Folder organizer panel */}
      {showFolder && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <FolderOpen className="w-4 h-4" /> Klasörleme
          </h3>
          <div className="flex gap-3 flex-wrap">
            <input
              type="text" placeholder="Hedef klasör yolu (örn: C:\faturalar)"
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600"
            />
            <button
              onClick={async () => {
                const dir = await open({ directory: true, multiple: false });
                if (dir && typeof dir === 'string') setOutputDir(dir);
              }}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg flex items-center gap-1"
              title="Klasör seç"
            >
              <FolderOpen className="w-4 h-4" /> Seç
            </button>
            <button onClick={handleOrganize} className="bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-1.5 rounded-lg">
              Klasörlere Ayır
            </button>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <span className="text-xs text-gray-400">Hiyerarşik alt grupla:</span>
            <select
              value={childGroup}
              onChange={(e) => setChildGroup(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200"
            >
              <option value="amount_range">Fiyat aralığı</option>
              <option value="date">Tarih</option>
              <option value="location">Yer</option>
            </select>
            <button onClick={handleHierarchy} className="bg-violet-800 hover:bg-violet-700 text-white text-xs px-3 py-1 rounded-lg">
              Hiyerarşik Ayır
            </button>
          </div>
          {folderMsg && <p className="text-sm text-emerald-400">{folderMsg}</p>}
        </div>
      )}

      {/* AI Chat panel */}
      {showChat && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-medium text-amber-300 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> AI Filtreleme (DeepSeek)
            </h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-amber-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isSmartFilter}
                  onChange={(e) => setIsSmartFilter(e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-gray-855 border-gray-700 text-amber-600 focus:ring-amber-500"
                />
                Akıllı Filtreleme Yetkisi
              </label>
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-amber-200"
                title="AI Model Seç"
              >
                <option value={model1}>{model1} (Hızlı)</option>
                <option value={model2}>{model2} (Akıllı)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={isSmartFilter ? 'Örn: "kamera sistemleri alımları", "5000TL üstü İstanbul faturaları"' : 'Örn: "A firmasının 1000TL üstü İstanbul faturalarını grupla"'}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600"
            />
            <button
              onClick={handleSend}
              disabled={aiChat.loading}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg"
            >
              {aiChat.loading ? '...' : 'Gönder'}
            </button>
          </div>
          {aiChat.response && (
            <div className="text-sm text-amber-200 bg-amber-950/20 border border-amber-900/30 rounded-lg p-3 max-h-96 overflow-y-auto">
              <MarkdownFormatter text={aiChat.response} />
            </div>
          )}
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