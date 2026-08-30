import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Eye, EyeOff, Loader2, Save, Settings, Square } from 'lucide-react';
import { Kullanici } from './AdminPanelScreen';
import { PORTAL_PAGES, YETKI_ROLLER, YetkiSablonu, normalizeYetki } from '../lib/yetkiUtils';
import {
  applySablonToRoleUsers,
  defaultSablonForRole,
  loadYetkiSablonlari,
  saveYetkiSablonu,
} from '../lib/yetkiSablonUtils';

interface AdminYetkiSablonTabProps {
  kullanicilar: Kullanici[];
  setKullanicilar: React.Dispatch<React.SetStateAction<Kullanici[]>>;
  addNotification?: (mesaj: string) => void;
}

export const AdminYetkiSablonTab: React.FC<AdminYetkiSablonTabProps> = ({
  kullanicilar,
  setKullanicilar,
  addNotification,
}) => {
  const [selectedRole, setSelectedRole] = useState<string>(YETKI_ROLLER[0]);
  const [sablonlar, setSablonlar] = useState<YetkiSablonu[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyToUsers, setApplyToUsers] = useState(true);
  const [visiblePages, setVisiblePages] = useState<string[]>([]);
  const [editablePages, setEditablePages] = useState<string[]>([]);

  useEffect(() => {
    loadYetkiSablonlari()
      .then(setSablonlar)
      .finally(() => setLoading(false));
  }, []);

  const currentSablon = useMemo(() => {
    const normalized = normalizeYetki(selectedRole);
    const stored = sablonlar.find((s) => normalizeYetki(s.yetki) === normalized);
    return stored ?? defaultSablonForRole(normalized);
  }, [sablonlar, selectedRole]);

  useEffect(() => {
    const restricted = currentSablon.kisitliSayfalar ?? [];
    const readOnly = currentSablon.saltOkunurSayfalar ?? [];
    const visible = PORTAL_PAGES.map((p) => p.key).filter((k) => !restricted.includes(k));
    const editable = visible.filter((k) => !readOnly.includes(k));
    setVisiblePages(visible);
    setEditablePages(editable);
  }, [currentSablon]);

  const groups = useMemo(
    () => Array.from(new Set(PORTAL_PAGES.map((p) => p.group))),
    []
  );

  const toggleVisible = (key: string) => {
    setVisiblePages((prev) => {
      if (prev.includes(key)) {
        setEditablePages((ed) => ed.filter((k) => k !== key));
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  const toggleEditable = (key: string) => {
    if (!visiblePages.includes(key)) return;
    setEditablePages((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalized = normalizeYetki(selectedRole);
      const allKeys = PORTAL_PAGES.map((p) => p.key);
      const kisitliSayfalar = allKeys.filter((k) => !visiblePages.includes(k));
      const saltOkunurSayfalar = visiblePages.filter((k) => !editablePages.includes(k));

      const sablon: YetkiSablonu = {
        id: normalized,
        yetki: normalized,
        kisitliSayfalar,
        saltOkunurSayfalar,
        guncellemeTarihi: new Date().toISOString(),
      };

      await saveYetkiSablonu(sablon);
      setSablonlar((prev) => {
        const rest = prev.filter((s) => normalizeYetki(s.yetki) !== normalized);
        return [...rest, sablon];
      });

      if (applyToUsers) {
        const count = await applySablonToRoleUsers(sablon, kullanicilar);
        setKullanicilar((prev) =>
          prev.map((u) =>
            normalizeYetki(u.yetki) === normalized
              ? { ...u, kisitliSayfalar, saltOkunurSayfalar }
              : u
          )
        );
        alert(`✅ "${normalized}" yetki şablonu kaydedildi. ${count} kullanıcıya uygulandı.`);
        if (addNotification) {
          addNotification(`${normalized} rol şablonu güncellendi (${count} kullanıcı).`);
        }
      } else {
        alert(`✅ "${normalized}" yetki şablonu kaydedildi (yalnızca yeni atamalara referans).`);
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(
        msg.includes('FIRESTORE_TIMEOUT') || msg.includes('resource-exhausted')
          ? 'Firebase yazma kotası veya bağlantı sorunu. Birkaç dakika sonra tekrar deneyin.'
          : 'Yetki şablonu kaydedilemedi.'
      );
    } finally {
      setSaving(false);
    }
  };

  const roleUserCount = kullanicilar.filter(
    (u) => normalizeYetki(u.yetki) === normalizeYetki(selectedRole)
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 gap-2 text-xs font-bold">
        <Loader2 size={16} className="animate-spin" />
        Yetki şablonları yükleniyor…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[11px] text-amber-950 leading-relaxed">
        <strong>Rol bazlı yetki şablonu:</strong> Combobox&apos;tan rol seçin; o rolün hangi sayfaları
        <em> görebileceğini</em> ve hangilerini <em>düzenleyebileceğini</em> belirleyin. Kayıt Firebase&apos;e kalıcı yazılır.
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 w-full">
          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Yetki / Rol</label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="w-full sm:max-w-xs p-2.5 border rounded-xl bg-white text-xs font-bold"
          >
            {YETKI_ROLLER.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400 mt-1">{roleUserCount} aktif kullanıcı bu role sahip</p>
        </div>

        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={applyToUsers}
            onChange={(e) => setApplyToUsers(e.target.checked)}
            className="rounded"
          />
          Bu role sahip tüm kullanıcılara uygula
        </label>

        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer shrink-0"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Şablonu Kaydet
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {groups.map((groupName) => {
          const pages = PORTAL_PAGES.filter((p) => p.group === groupName);
          return (
            <div key={groupName} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
              <div className="bg-slate-900 text-white px-4 py-2.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                <Settings size={12} />
                {groupName}
              </div>
              <div className="divide-y divide-slate-100">
                {pages.map((page) => {
                  const canSee = visiblePages.includes(page.key);
                  const canEdit = editablePages.includes(page.key);
                  return (
                    <div key={page.key} className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <span className={`font-semibold ${canSee ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                        {page.label}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          title="Görebilir"
                          onClick={() => toggleVisible(page.key)}
                          className={`px-2 py-1 rounded-lg text-[9px] font-bold border cursor-pointer flex items-center gap-1 ${
                            canSee
                              ? 'bg-slate-50 border-slate-200 text-slate-800'
                              : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                        >
                          {canSee ? <Eye size={11} /> : <EyeOff size={11} />}
                          Gör
                        </button>
                        <button
                          type="button"
                          title="Düzenleyebilir"
                          disabled={!canSee}
                          onClick={() => toggleEditable(page.key)}
                          className={`px-2 py-1 rounded-lg text-[9px] font-bold border cursor-pointer flex items-center gap-1 disabled:opacity-30 ${
                            canEdit
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          {canEdit ? <CheckSquare size={11} /> : <Square size={11} />}
                          Düzenle
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminYetkiSablonTab;
