import { useState, useEffect } from 'react';
import { useStore } from './store';
import { Table, LayoutGrid, FileText, ChevronDown, ChevronUp, X, Trash2, Cpu } from 'lucide-react';
import type { Invoice, GroupedInvoices } from './types';
import { convertFileSrc } from '@tauri-apps/api/core';

const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

export default function InvoiceGrid() {
  const { filtered, grouped, invoices, removeInvoice, fixInvoiceWithAi } = useStore();
  const [view, setView] = useState<'table' | 'cards' | 'groups'>('table');
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (preview) {
      setShowRaw(false);
    }
  }, [preview]);

  const getPdfSrc = (path: string) => {
    if (isTauri) {
      try {
        return convertFileSrc(path);
      } catch (e) {
        console.error(e);
      }
    }
    return '';
  };

  if (invoices.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* View toggles */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView('table')}
          className={`text-xs px-3 py-1 rounded-lg flex items-center gap-1 ${view === 'table' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
        >
          <Table className="w-3.5 h-3.5" /> Tablo
        </button>
        <button
          onClick={() => setView('cards')}
          className={`text-xs px-3 py-1 rounded-lg flex items-center gap-1 ${view === 'cards' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
        >
          <LayoutGrid className="w-3.5 h-3.5" /> Kart
        </button>
        {grouped.length > 0 && (
          <button
            onClick={() => setView('groups')}
            className={`text-xs px-3 py-1 rounded-lg flex items-center gap-1 ${view === 'groups' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
          >
            <FileText className="w-3.5 h-3.5" /> Gruplar ({grouped.length})
          </button>
        )}
      </div>

      {view === 'groups' && grouped.length > 0 && (
        <GroupedView groups={grouped} onPreview={setPreview} onDelete={removeInvoice} onFix={fixInvoiceWithAi} />
      )}

      {view === 'table' && (
        <TableView invoices={filtered} onPreview={setPreview} onDelete={removeInvoice} onFix={fixInvoiceWithAi} />
      )}

      {view === 'cards' && (
        <CardView invoices={filtered} onPreview={setPreview} onDelete={removeInvoice} onFix={fixInvoiceWithAi} />
      )}

      {/* Invoice preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-white truncate">{preview.filename}</h3>
              <button onClick={() => setPreview(null)} className="text-gray-500 hover:text-white ml-2 flex-shrink-0"><X className="w-4 h-4" /></button>
            </div>
            {/* Parsed fields */}
            <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-2 text-xs border-b border-gray-800">
              <div className="flex justify-between"><span className="text-gray-500">D\u00fczenleyen</span><span className="text-gray-200 text-right max-w-[60%] truncate" title={preview.issuer}>{preview.issuer || '\u2014'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Al\u0131c\u0131</span><span className="text-gray-200 text-right max-w-[60%] truncate" title={preview.recipient}>{preview.recipient || '\u2014'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tutar</span><span className="text-emerald-400 font-mono">{preview.amount.toLocaleString('tr-TR', {minimumFractionDigits:2})} TL</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tarih</span><span className="text-gray-200">{preview.date || '\u2014'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Yer</span><span className="text-gray-200">{preview.location || '\u2014'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Fatura No</span><span className="text-gray-200 font-mono">{preview.invoice_number || '\u2014'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Vergi No</span><span className="text-gray-200 font-mono">{preview.tax_number || '\u2014'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">A\u00e7\u0131klama</span><span className="text-gray-200 text-right max-w-[60%] truncate">{preview.description || '\u2014'}</span></div>
              <div className="flex justify-between col-span-2"><span className="text-gray-500">Tam Yol</span><span className="text-gray-600 text-right text-xs truncate max-w-[80%]">{preview.full_path}</span></div>
            </div>
            {/* PDF or Full raw text */}
            <div className="flex-1 flex flex-col min-h-[450px] px-5 py-3">
              <div className="flex items-center justify-between mb-2 select-none">
                <span className="text-xs text-gray-500 font-semibold">
                  {preview.filename.toLowerCase().endsWith('.pdf') ? "Orijinal Fatura PDF Belgesi" : "Ham Metin İçeriği"}
                </span>
                {preview.filename.toLowerCase().endsWith('.pdf') && (
                  <button
                    onClick={() => setShowRaw(!showRaw)}
                    className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    {showRaw ? "Orijinal PDF'i Göster" : "Ham Metni Göster"}
                  </button>
                )}
              </div>
              {showRaw || !preview.filename.toLowerCase().endsWith('.pdf') ? (
                <pre className="text-xs text-gray-300 bg-gray-800 rounded-lg p-3 whitespace-pre-wrap break-words flex-1 overflow-y-auto max-h-[450px]">{preview.raw_text}</pre>
              ) : (
                <iframe
                  src={getPdfSrc(preview.full_path)}
                  className="w-full h-full min-h-[400px] border border-gray-800 rounded-lg bg-gray-950/50"
                  title="Fatura PDF Önizleme"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



function TableView({ invoices, onPreview, onDelete, onFix }: { invoices: Invoice[]; onPreview: (inv: Invoice) => void; onDelete: (id: string) => void; onFix: (id: string) => void }) {

  if (invoices.length === 0) return <p className="text-gray-500 text-sm py-4 text-center">Sonuç bulunamadı</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 text-gray-400 text-xs">
            <th className="text-left px-3 py-2">Dosya</th>
            <th className="text-left px-3 py-2">Düzenleyen</th>
            <th className="text-left px-3 py-2">Alıcı</th>
            <th className="text-right px-3 py-2">Tutar</th>
            <th className="text-left px-3 py-2">Tarih</th>
            <th className="text-left px-3 py-2">Yer</th>
            <th className="w-16 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-t border-gray-800 hover:bg-gray-800/50 transition-colors group">
              <td
                className="px-3 py-2 text-blue-400 max-w-[150px] truncate cursor-pointer hover:underline"
                title={`${inv.filename} — tıkla ham metni gör`}
                onClick={() => onPreview(inv)}
              >{inv.filename}</td>
              <td className="px-3 py-2 text-gray-300">{inv.issuer || <span className="text-gray-600 italic">—</span>}</td>
              <td className="px-3 py-2 text-gray-300">{inv.recipient || <span className="text-gray-600 italic">—</span>}</td>
              <td className="px-3 py-2 text-right font-mono text-emerald-400">
                {inv.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
              </td>
              <td className="px-3 py-2 text-gray-400">{inv.date || <span className="text-gray-600 italic">—</span>}</td>

              <td className="px-3 py-2 text-gray-400 max-w-[100px] truncate" title={inv.location}>{inv.location || <span className="text-gray-600 italic">—</span>}</td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    onClick={() => onFix(inv.id)}
                    className="text-gray-500 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="AI ile Düzelt"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(inv.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Faturayı sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardView({ invoices, onPreview, onDelete, onFix }: { invoices: Invoice[]; onPreview: (inv: Invoice) => void; onDelete: (id: string) => void; onFix: (id: string) => void }) {

  if (invoices.length === 0) return <p className="text-gray-500 text-sm py-4 text-center">Sonuç bulunamadı</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {invoices.map((inv) => (
        <div key={inv.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-1.5 hover:border-gray-600 transition-colors">
          <div className="flex items-start justify-between">
            <span
              className="text-xs text-gray-400 truncate max-w-[55%] cursor-pointer hover:text-blue-400"
              title={inv.filename}
              onClick={() => onPreview(inv)}
            >{inv.filename}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-medium text-emerald-400">{inv.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
              <button
                onClick={() => onFix(inv.id)}
                className="text-gray-500 hover:text-blue-400 transition-colors"
                title="AI ile Düzelt"
              >
                <Cpu className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(inv.id)}
                className="text-gray-500 hover:text-red-400 transition-colors"
                title="Faturayı sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs text-gray-500">
              {inv.issuer && <span className="mr-2">{inv.issuer}</span>}
              {inv.recipient && <span>→ {inv.recipient}</span>}
              {!inv.issuer && !inv.recipient && <span className="italic text-gray-700">Düzenleyen/alıcı yok</span>}
            </div>

          </div>
          <div className="text-xs text-gray-600 flex justify-between mt-2 pt-1 border-t border-gray-800">
            <span>{inv.date || '—'}</span>
            <span className="truncate max-w-[50%]" title={inv.location}>{inv.location || '—'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupedView({ groups, onPreview, onDelete, onFix }: { groups: GroupedInvoices[]; onPreview: (inv: Invoice) => void; onDelete: (id: string) => void; onFix: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {groups.map(([name, invoices]) => (
        <GroupCard key={name} name={name} invoices={invoices} onPreview={onPreview} onDelete={onDelete} onFix={onFix} />
      ))}
    </div>
  );
}

function GroupCard({ name, invoices, onPreview, onDelete, onFix }: { name: string; invoices: Invoice[]; onPreview: (inv: Invoice) => void; onDelete: (id: string) => void; onFix: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  const total = invoices.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          <span className="text-sm font-medium text-gray-200">{name || '(Belirsiz)'}</span>
          <span className="text-xs text-gray-500">{invoices.length} fatura</span>
        </div>
        <span className="text-sm font-mono text-emerald-400">{total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
      </button>
      {open && (
        <div className="border-t border-gray-800 px-4 py-2">
          <TableView invoices={invoices} onPreview={onPreview} onDelete={onDelete} onFix={onFix} />
        </div>
      )}
    </div>
  );
}