import type { FaaliyetIlerlemeKaydi, SahaFaaliyeti } from '../types/erp';
import { faaliyetAsamaLabel, ilerlemeDurumuLabel } from './faaliyetEtiketUtils';

const esc = (value: string | number | boolean | undefined | null): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function buildSabahIlerlemeKaydi(opts: {
  aciklama: string;
  isNiteligi: string;
  fotoUrls?: string[];
  yazar?: string;
  yazarRol?: string;
}): FaaliyetIlerlemeKaydi {
  const text =
    opts.aciklama.trim() ||
    `${opts.isNiteligi.trim()} — sabah görevlendirme`;
  return {
    id: `ilr_sabah_${Date.now()}`,
    tarih: new Date().toISOString(),
    yorum: text,
    fotoUrls: opts.fotoUrls?.length ? opts.fotoUrls : undefined,
    yazar: opts.yazar,
    yazarRol: opts.yazarRol || 'PROGRAM',
    asama: 'BASLANGIC',
  };
}

export function appendSabahIlerlemeIfNew(
  existing: FaaliyetIlerlemeKaydi[] | undefined,
  kayit: FaaliyetIlerlemeKaydi
): FaaliyetIlerlemeKaydi[] {
  const list = existing || [];
  if (list.some((k) => k.asama === 'BASLANGIC' && k.yorum === kayit.yorum)) {
    return list;
  }
  return [...list, kayit];
}

function formatZaman(iso: string): string {
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const ASAMA_BG: Record<string, string> = {
  BASLANGIC: '#e0f2fe',
  ILERLEME: '#fef3c7',
  BITIS: '#dcfce7',
};

/** HTML: görev kartına eklenecek gün içi ilerleme zaman çizelgesi */
export function buildIlerlemeTimelineHtml(
  f: SahaFaaliyeti,
  options?: { fotoClickAttr?: boolean }
): string {
  const kayitlar = (f.ilerlemeKayitlari || [])
    .slice()
    .sort((a, b) => String(a.tarih || '').localeCompare(String(b.tarih || '')));

  if (kayitlar.length === 0) {
    return `<p style="margin:10px 0 0;font-size:11px;color:#94a3b8;font-style:italic;">Gün içi ilerleme kaydı yok — sabah atamasından sonra foto + açıklama ile ekleyin.</p>`;
  }

  const durum = ilerlemeDurumuLabel(f.ilerlemeDurumu);

  const items = kayitlar
    .map((k) => {
      const asama = k.asama ? faaliyetAsamaLabel(k.asama) : 'Not';
      const bg = k.asama ? ASAMA_BG[k.asama] || '#f1f5f9' : '#f1f5f9';
      const fotolar = k.fotoUrls || [];
      const fotoHtml =
        fotolar.length > 0
          ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;margin-top:8px">
              ${fotolar
                .map(
                  (url, idx) =>
                    `<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc">
                      <img src="${esc(url)}" alt="" style="display:block;width:100%;height:100px;object-fit:cover" />
                      <div style="font-size:8px;font-weight:700;color:#64748b;padding:2px 6px;text-align:center">${idx + 1}/${fotolar.length}</div>
                    </div>`
                )
                .join('')}
            </div>`
          : '';

      return `
        <li style="margin:0 0 10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;list-style:none">
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px">
            <span style="font-size:9px;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:999px;background:${bg};color:#0f172a">${esc(asama)}</span>
            <span style="font-size:10px;font-weight:700;color:#64748b">${esc(formatZaman(k.tarih))}</span>
            ${k.yazar ? `<span style="font-size:9px;color:#94a3b8;margin-left:auto">${esc(k.yazar)}</span>` : ''}
          </div>
          ${k.yorum ? `<p style="margin:0;font-size:12px;line-height:1.5;color:#1e293b;white-space:pre-wrap">${esc(k.yorum)}</p>` : ''}
          ${fotoHtml}
        </li>`;
    })
    .join('');

  return `
    <div style="margin-top:12px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#92400e;margin-bottom:8px">
        Gün içi ilerleme (${kayitlar.length}) · Durum: ${esc(durum)}
      </div>
      <ol style="margin:0;padding:0">${items}</ol>
    </div>`;
}
