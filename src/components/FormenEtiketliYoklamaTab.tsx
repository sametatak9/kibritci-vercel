import React from 'react';
import { Calendar, FileText, Tag } from 'lucide-react';
import type { Personel } from '../types/erp';
import {
  YOKLAMA_ACIKLAMA_MAX,
  yoklamaEtiketBadgeClass,
} from '../lib/yoklamaEtiketUtils';
import { listPersonelTakipEtiketleri } from '../lib/personelTakipEtiketUtils';

export function YoklamaMeslekEtiketBar({
  etiket,
  customEtiket,
  katalog,
  onEtiketChange,
  onCustomChange,
  onApply,
  onReport,
  onTxtReport,
  compact,
}: {
  etiket: string;
  customEtiket: string;
  katalog: string[];
  onEtiketChange: (v: string) => void;
  onCustomChange: (v: string) => void;
  onApply: () => void;
  onReport: () => void;
  onTxtReport?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-violet-200 bg-violet-50/80 ${
        compact ? 'p-2.5' : 'p-3'
      } space-y-2`}
    >
      <div className="flex items-center gap-1.5">
        <span className="bg-violet-100 text-violet-800 text-[9px] font-extrabold px-2 py-0.5 rounded uppercase inline-flex items-center gap-1">
          <Tag size={10} /> Etiket
        </span>
        <span className="text-[9px] text-slate-500 font-medium">
          Geldi personeline meslek grubu yazın. Yeni etiket kalıcı kaydolur.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500">Etiket:</span>
        <select
          value={etiket}
          onChange={(e) => onEtiketChange(e.target.value)}
          className="text-[11px] font-bold bg-white border border-slate-200 rounded-lg p-1.5 max-w-[200px]"
        >
          <option value="">— Etiket yok / kaldır —</option>
          {katalog.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
          <option value="__CUSTOM__">＋ Yeni etiket yaz…</option>
        </select>
        {etiket === '__CUSTOM__' && (
          <input
            type="text"
            value={customEtiket}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder="Örn. İZOLASYON"
            className="w-32 text-[11px] font-bold bg-white border border-slate-200 rounded-lg p-1.5 uppercase"
          />
        )}
        <button
          type="button"
          onClick={onApply}
          className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer"
        >
          <Tag size={12} />
          Günü Etiketle
        </button>
        <button
          type="button"
          onClick={onReport}
          className="bg-slate-900 hover:bg-slate-950 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer"
        >
          <Calendar size={12} />
          Etiketli Rapor
        </button>
        {onTxtReport && (
          <button
            type="button"
            onClick={onTxtReport}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer"
            title="Meslek etiketine göre yalnızca isim listesi (.txt)"
          >
            <FileText size={12} />
            Görevlendirme TXT
          </button>
        )}
      </div>
    </div>
  );
}

interface FormenEtiketliYoklamaTabProps {
  dateLabel: string;
  activeStaff: Personel[];
  presentIds: string[];
  absentIds: string[];
  mesaiSaatleri: Record<string, number>;
  personelEtiketleri: Record<string, string>;
  personelAciklamalari: Record<string, string>;
  etiketKatalogu: string[];
  bulkEtiket: string;
  bulkEtiketCustom: string;
  onBulkEtiketChange: (v: string) => void;
  onBulkEtiketCustomChange: (v: string) => void;
  onBulkApply: () => void;
  onReport: () => void;
  onTxtReport?: () => void;
  onEtiketChange: (personelId: string, etiket: string) => void;
  onAciklamaChange: (personelId: string, aciklama: string) => void;
  onMarkPresent: (personelId: string) => void;
  onMarkAbsent: (personelId: string) => void;
  onSave: () => void;
  saving: boolean;
  hasDraft: boolean;
}

export const FormenEtiketliYoklamaTab: React.FC<FormenEtiketliYoklamaTabProps> = ({
  dateLabel,
  activeStaff,
  presentIds,
  absentIds,
  mesaiSaatleri,
  personelEtiketleri,
  personelAciklamalari,
  etiketKatalogu,
  bulkEtiket,
  bulkEtiketCustom,
  onBulkEtiketChange,
  onBulkEtiketCustomChange,
  onBulkApply,
  onReport,
  onTxtReport,
  onEtiketChange,
  onAciklamaChange,
  onMarkPresent,
  onMarkAbsent,
  onSave,
  saving,
  hasDraft,
}) => {
  const presentSet = new Set(presentIds);
  const absentSet = new Set(absentIds);
  const marked = activeStaff.filter((p) => presentSet.has(p.id) || absentSet.has(p.id));
  const unmarked = activeStaff.filter((p) => !presentSet.has(p.id) && !absentSet.has(p.id));

  return (
    <div className="space-y-3.5 animate-in fade-in duration-150">
      <YoklamaMeslekEtiketBar
        etiket={bulkEtiket}
        customEtiket={bulkEtiketCustom}
        katalog={etiketKatalogu}
        onEtiketChange={onBulkEtiketChange}
        onCustomChange={onBulkEtiketCustomChange}
        onApply={onBulkApply}
        onReport={onReport}
        onTxtReport={onTxtReport}
      />

      <p className="text-[9px] text-slate-500 leading-snug px-0.5">
        {dateLabel} — Geldi/Yok işaretleyin, meslek etiketi ve açıklama yazın. Kayıt ana Yoklama ve
        Puantaj ile aynıdır.
      </p>

      {marked.length === 0 && unmarked.length === 0 ? (
        <div className="bg-white rounded-2xl border p-4 text-center text-[10px] text-slate-400">
          Bu tarihte işaretlenecek personel yok.
        </div>
      ) : null}

      {marked.map((p) => {
        const geldi = presentSet.has(p.id);
        const etiket = personelEtiketleri[p.id] || '';
        const aciklama = personelAciklamalari[p.id] || '';
        return (
          <div
            key={p.id}
            className={`bg-white rounded-2xl border p-3 space-y-2 ${
              geldi ? 'border-emerald-200' : 'border-rose-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-slate-900 truncate">
                  {p.ad} {p.soyad}
                </p>
                <p className="text-[8px] text-slate-400 font-medium truncate">
                  {p.gorev}
                  {mesaiSaatleri[p.id] ? ` · +${mesaiSaatleri[p.id]}s mesai` : ''}
                </p>
                {listPersonelTakipEtiketleri(p).length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {listPersonelTakipEtiketleri(p).map((t) => (
                      <span
                        key={t}
                        className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onMarkPresent(p.id)}
                  className={`text-[8px] font-extrabold px-2 py-1 rounded-lg border ${
                    geldi
                      ? 'bg-emerald-500 text-white border-emerald-600'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  Geldi
                </button>
                <button
                  type="button"
                  onClick={() => onMarkAbsent(p.id)}
                  className={`text-[8px] font-extrabold px-2 py-1 rounded-lg border ${
                    !geldi
                      ? 'bg-rose-500 text-white border-rose-600'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  Yok
                </button>
              </div>
            </div>
            {etiket ? (
              <span
                className={`inline-flex text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${yoklamaEtiketBadgeClass(etiket)}`}
              >
                {etiket}
              </span>
            ) : null}
            <select
              value={etiketKatalogu.includes(etiket) || !etiket ? etiket : '__CUSTOM_ROW__'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__CUSTOM_ROW__') return;
                onEtiketChange(p.id, v);
              }}
              className="w-full text-[10px] font-bold bg-slate-50 border border-slate-200 rounded-lg p-1.5"
            >
              <option value="">— Etiket yok —</option>
              {etiketKatalogu.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={aciklama}
              maxLength={YOKLAMA_ACIKLAMA_MAX}
              placeholder="Açıklama yazın…"
              onChange={(e) => onAciklamaChange(p.id, e.target.value)}
              className="w-full text-[10px] font-semibold bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-slate-800"
            />
          </div>
        );
      })}

      {unmarked.length > 0 && (
        <div className="bg-white rounded-2xl border p-3 space-y-2">
          <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
            İşaretlenmemiş ({unmarked.length})
          </p>
          {unmarked.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 py-1 border-t border-slate-100">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-800 truncate">
                  {p.ad} {p.soyad}
                </p>
                <p className="text-[8px] text-slate-400 truncate">{p.gorev}</p>
                {listPersonelTakipEtiketleri(p).map((t) => (
                  <span
                    key={t}
                    className="inline-block text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 mt-0.5"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onMarkPresent(p.id)}
                  className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] font-extrabold px-2 py-1 rounded-lg"
                >
                  Geldi
                </button>
                <button
                  type="button"
                  onClick={() => onMarkAbsent(p.id)}
                  className="bg-rose-50 text-rose-700 border border-rose-200 text-[8px] font-extrabold px-2 py-1 rounded-lg"
                >
                  Yok
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={saving || (!hasDraft && marked.length === 0)}
        className="w-full bg-slate-900 hover:bg-slate-950 disabled:bg-slate-400 text-white font-extrabold text-[10px] py-2.5 rounded-xl cursor-pointer"
      >
        {saving ? '⏳ KAYDEDİLİYOR...' : '✍️ ETİKETLİ YOKLAMAYI KAYDET'}
      </button>
    </div>
  );
};
