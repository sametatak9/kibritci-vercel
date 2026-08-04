import type { CariKart, OperatorFaaliyet } from '../types/erp';
import { ayAdi, firmaAnahtar, firmaEslesir, getTaseronCariKartlar, normFirma } from './taseronUtils';
import { buildKibritciReportHtml, downloadKibritciReportHtml, openKibritciReportPrint } from './kibritciReportTemplate';

/** İcmal sütunları — yemek icmalindeki öğün kolonlarına denk */
export const IS_MAKINESI_ICMAL_TIPLER = ['JCB', 'KATO', 'KİRALIK', 'DİĞER'] as const;
export type IsMakinesiIcmalTip = (typeof IS_MAKINESI_ICMAL_TIPLER)[number];

export type IsMakinesiIcmalSatir = {
  key: string;
  firmaAdi: string;
  firmaId?: string;
  saatler: Record<IsMakinesiIcmalTip, number>;
  toplamSaat: number;
  kayitSayisi: number;
  onayliSaat: number;
  bekleyenSaat: number;
};

export type IsMakinesiIcmalOzet = {
  ay: number;
  yil: number;
  donemLabel: string;
  satirlar: IsMakinesiIcmalSatir[];
  tipToplamlari: Record<IsMakinesiIcmalTip, number>;
  genelToplamSaat: number;
  genelKayitSayisi: number;
  genelOnayliSaat: number;
  genelBekleyenSaat: number;
  firmaSayisi: number;
};

function tipNormalize(raw: string | undefined | null): IsMakinesiIcmalTip {
  const t = String(raw || 'DİĞER')
    .trim()
    .toLocaleUpperCase('tr-TR');
  if (t === 'JCB') return 'JCB';
  if (t === 'KATO') return 'KATO';
  if (t === 'KİRALIK' || t === 'KIRALIK') return 'KİRALIK';
  return 'DİĞER';
}

function emptySaatler(): Record<IsMakinesiIcmalTip, number> {
  return { JCB: 0, KATO: 0, KİRALIK: 0, DİĞER: 0 };
}

function isOnayli(f: OperatorFaaliyet): boolean {
  const d = String(f.onayDurumu || f.durum || '').toLocaleUpperCase('tr-TR');
  return d === 'ONAYLANDI';
}

function faaliyetDonemde(f: OperatorFaaliyet, ay: number, yil: number): boolean {
  const raw = String(f.tarih || '');
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Number(m[1]) === yil && Number(m[2]) === ay;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  return d.getMonth() + 1 === ay && d.getFullYear() === yil;
}

/**
 * Dönemsel firma bazlı iş makinesi icmali.
 * Kaynak: operatör faaliyetleri + (opsiyonel) kesinti raporlarına gömülü faaliyetler.
 * Varsayılan: yalnızca ONAYLANDI kayıtlar.
 */
export function buildIsMakinesiIcmal(opts: {
  faaliyetler: OperatorFaaliyet[];
  cariKartlar: CariKart[];
  ay: number;
  yil: number;
  /** false ise onay bekleyenler de dahil */
  onlyOnayli?: boolean;
  /** Kesinti raporlarındaki gömülü faaliyetleri de birleştir (çift sayma yok) */
  kesintiRaporlari?: Array<{
    kesintiTipi?: string;
    donemAy?: string;
    donemYil?: string;
    faaliyetler?: OperatorFaaliyet[];
  }>;
}): IsMakinesiIcmalOzet {
  const { faaliyetler, cariKartlar, ay, yil, onlyOnayli = true, kesintiRaporlari = [] } = opts;
  const cariler = getTaseronCariKartlar(cariKartlar);
  const byKey = new Map<string, IsMakinesiIcmalSatir>();
  const ayStr = String(ay).padStart(2, '0');
  const yilStr = String(yil);

  const resolveFirma = (f: OperatorFaaliyet) => {
    const ad = String(f.firmaAdi || '').trim() || 'Belirtilmemiş';
    const byId = f.firmaId ? cariler.find((c) => c.id === f.firmaId) : undefined;
    const byName = cariler.find((c) => firmaEslesir(c.unvan, ad));
    const cari = byId || byName;
    const unvan = cari?.unvan || ad;
    const key = cari?.id || firmaAnahtar(unvan) || normFirma(unvan) || 'belirsiz';
    return { key, unvan, firmaId: cari?.id };
  };

  /** id → faaliyet (canlı liste öncelikli) */
  const byId = new Map<string, OperatorFaaliyet>();
  let anon = 0;
  for (const f of faaliyetler) {
    if (!f) continue;
    const id = f.id || `__live_${anon++}`;
    byId.set(id, f);
  }
  for (const r of kesintiRaporlari) {
    if (r.kesintiTipi && r.kesintiTipi !== 'IS_MAKINESI') continue;
    const raporDonemOk =
      !r.donemAy || !r.donemYil || (r.donemAy === ayStr && r.donemYil === yilStr);
    if (!raporDonemOk) continue;
    for (const f of r.faaliyetler || []) {
      if (!f) continue;
      const id = f.id || `__rapor_${anon++}`;
      if (byId.has(id)) continue;
      // Rapora alınmış kayıt: dönem rapordan gelsin (tarih sapması olmasın)
      byId.set(id, {
        ...f,
        tarih: f.tarih && faaliyetDonemde(f, ay, yil) ? f.tarih : `${yilStr}-${ayStr}-15`,
        kesintiYansitildi: true,
        onayDurumu: f.onayDurumu || 'ONAYLANDI',
      });
    }
  }

  for (const f of byId.values()) {
    if (!faaliyetDonemde(f, ay, yil)) continue;
    const onayli = isOnayli(f) || Boolean(f.kesintiYansitildi);
    if (onlyOnayli && !onayli) continue;

    const saat = Number(f.calismaSuresi) || 0;
    if (saat <= 0) continue;

    const { key, unvan, firmaId } = resolveFirma(f);
    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        firmaAdi: unvan,
        firmaId,
        saatler: emptySaatler(),
        toplamSaat: 0,
        kayitSayisi: 0,
        onayliSaat: 0,
        bekleyenSaat: 0,
      };
      byKey.set(key, row);
    }

    const tip = tipNormalize(f.operatorTipi);
    row.saatler[tip] += saat;
    row.toplamSaat += saat;
    row.kayitSayisi += 1;
    if (onayli) row.onayliSaat += saat;
    else row.bekleyenSaat += saat;
  }

  const satirlar = Array.from(byKey.values()).sort((a, b) =>
    a.firmaAdi.localeCompare(b.firmaAdi, 'tr', { sensitivity: 'base' })
  );

  const tipToplamlari = emptySaatler();
  let genelToplamSaat = 0;
  let genelKayitSayisi = 0;
  let genelOnayliSaat = 0;
  let genelBekleyenSaat = 0;
  for (const s of satirlar) {
    for (const tip of IS_MAKINESI_ICMAL_TIPLER) tipToplamlari[tip] += s.saatler[tip];
    genelToplamSaat += s.toplamSaat;
    genelKayitSayisi += s.kayitSayisi;
    genelOnayliSaat += s.onayliSaat;
    genelBekleyenSaat += s.bekleyenSaat;
  }

  return {
    ay,
    yil,
    donemLabel: `${ayAdi(ay)} ${yil}`,
    satirlar,
    tipToplamlari,
    genelToplamSaat,
    genelKayitSayisi,
    genelOnayliSaat,
    genelBekleyenSaat,
    firmaSayisi: satirlar.length,
  };
}

function fmtSaat(n: number): string {
  if (!n) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

export function buildIsMakinesiIcmalHtml(ozet: IsMakinesiIcmalOzet, opts?: { onlyOnayli?: boolean }): string {
  const onlyOnayli = opts?.onlyOnayli !== false;
  const tipHeads = IS_MAKINESI_ICMAL_TIPLER.map(
    (t) => `<th style="padding:8px;text-align:right">${t}</th>`
  ).join('');

  const rows = ozet.satirlar
    .map(
      (s, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
        <td style="padding:8px;font-weight:700;text-transform:uppercase">${esc(s.firmaAdi)}</td>
        ${IS_MAKINESI_ICMAL_TIPLER.map(
          (t) =>
            `<td style="padding:8px;text-align:right;font-family:Consolas,monospace">${fmtSaat(s.saatler[t])}</td>`
        ).join('')}
        <td style="padding:8px;text-align:right;font-family:Consolas,monospace;font-weight:900">${fmtSaat(s.toplamSaat)}</td>
        <td style="padding:8px;text-align:center;font-family:Consolas,monospace;color:#64748b">${s.kayitSayisi}</td>
      </tr>`
    )
    .join('');

  const tipFoot = IS_MAKINESI_ICMAL_TIPLER.map(
    (t) =>
      `<td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace">${fmtSaat(ozet.tipToplamlari[t])}</td>`
  ).join('');

  const bodyHtml = `
    <div style="border:2px solid #fbbf24;background:linear-gradient(135deg,#fffbeb,#f8fafc);border-radius:14px;padding:16px;margin-bottom:16px">
      <div style="font-size:10px;font-weight:900;letter-spacing:.08em;color:#b45309;text-transform:uppercase">
        İş Makinesi İcmali · Firma Bazlı Saat Toplamı
      </div>
      <p style="margin:8px 0 0;font-size:13px;color:#78350f;line-height:1.5;font-weight:600">
        Dönem: <strong>${esc(ozet.donemLabel)}</strong>
        · ${ozet.firmaSayisi} firma · ${ozet.genelKayitSayisi} kayıt
        · toplam <strong>${fmtSaat(ozet.genelToplamSaat)} saat</strong>
      </p>
      <p style="margin:6px 0 0;font-size:11px;color:#92400e;line-height:1.45">
        Kaynak: operatör faaliyetleri (${onlyOnayli ? 'yalnızca onaylı' : 'onaylı + bekleyen'}).
        Kesinti taslağına alınmış olsun/olmasın dönem saatleri burada güncel tutulur.
      </p>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <thead>
        <tr style="background:#1e3a5f;color:#fff">
          <th style="padding:8px;text-align:left">AÇIKLAMA (FİRMA)</th>
          ${tipHeads}
          <th style="padding:8px;text-align:right">TOPLAM</th>
          <th style="padding:8px;text-align:center">KAYIT</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows ||
          `<tr><td colspan="7" style="padding:20px;text-align:center;color:#94a3b8">Bu dönem için onaylı iş makinesi faaliyeti yok.</td></tr>`
        }
      </tbody>
      <tfoot>
        <tr style="background:#0f172a;color:#fff;font-weight:900">
          <td style="padding:10px 8px">TOPLAM</td>
          ${tipFoot}
          <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace;font-size:14px">${fmtSaat(ozet.genelToplamSaat)}</td>
          <td style="padding:10px 8px;text-align:center;font-family:Consolas,monospace">${ozet.genelKayitSayisi}</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff;text-align:center">
        <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Firma</div>
        <div style="font-size:18px;font-weight:900;margin-top:4px">${ozet.firmaSayisi}</div>
      </div>
      <div style="border:1px solid #fde68a;border-radius:12px;padding:12px;background:#fffbeb;text-align:center">
        <div style="font-size:9px;font-weight:800;color:#b45309;text-transform:uppercase">Toplam saat</div>
        <div style="font-size:18px;font-weight:900;margin-top:4px;font-family:Consolas,monospace">${fmtSaat(ozet.genelToplamSaat)}</div>
      </div>
      <div style="border:1px solid #bbf7d0;border-radius:12px;padding:12px;background:#ecfdf5;text-align:center">
        <div style="font-size:9px;font-weight:800;color:#047857;text-transform:uppercase">Onaylı saat</div>
        <div style="font-size:18px;font-weight:900;margin-top:4px;font-family:Consolas,monospace;color:#047857">${fmtSaat(ozet.genelOnayliSaat)}</div>
      </div>
    </div>
  `;

  return buildKibritciReportHtml({
    title: 'KİBRİTÇİ İNŞAAT',
    subtitle: `${ozet.donemLabel} — İŞ MAKİNESİ İCMALİ`,
    meta: [
      `${ozet.firmaSayisi} firma`,
      `${fmtSaat(ozet.genelToplamSaat)} sa`,
      onlyOnayli ? 'Onaylı' : 'Tümü',
    ],
    bodyHtml,
  });
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function indirIsMakinesiIcmal(ozet: IsMakinesiIcmalOzet, onlyOnayli = true) {
  const html = buildIsMakinesiIcmalHtml(ozet, { onlyOnayli });
  const ay = String(ozet.ay).padStart(2, '0');
  downloadKibritciReportHtml(html, `Is_Makinesi_Icmal_${ozet.yil}_${ay}.html`);
}

export function yazdirIsMakinesiIcmal(ozet: IsMakinesiIcmalOzet, onlyOnayli = true) {
  const html = buildIsMakinesiIcmalHtml(ozet, { onlyOnayli });
  openKibritciReportPrint(html, `İş Makinesi İcmali · ${ozet.donemLabel}`);
}
