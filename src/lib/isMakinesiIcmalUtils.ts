import type { CariKart, OperatorFaaliyet } from '../types/erp';
import {
  ayAdi,
  firmaAnahtar,
  firmaEslesir,
  getTaseronCariKartlar,
  makineEtiketi,
  makineKaynakGrupLabel,
  normFirma,
  resolveMakineKaynakGrup,
  type MakineKaynakGrup,
} from './taseronUtils';
import { buildKibritciReportHtml, downloadKibritciReportHtml, openKibritciReportPrint } from './kibritciReportTemplate';

/** Tip kolonları — KİRALIK artık kaynak grubu; tip olarak JCB/KATO/DİĞER kullanılır */
export const IS_MAKINESI_ICMAL_TIPLER = ['JCB', 'KATO', 'DİĞER'] as const;
export type IsMakinesiIcmalTip = (typeof IS_MAKINESI_ICMAL_TIPLER)[number];

export type IsMakinesiIcmalKayit = {
  id: string;
  tarih: string;
  operatorIsim: string;
  makine: string;
  tip: IsMakinesiIcmalTip;
  kaynakGrup: MakineKaynakGrup;
  baslangicSaat: string;
  bitisSaat: string;
  calismaSuresi: number;
  yapilanIs: string;
  fotoUrl?: string;
  onayli: boolean;
};

export type IsMakinesiIcmalSatir = {
  key: string;
  firmaAdi: string;
  firmaId?: string;
  saatler: Record<IsMakinesiIcmalTip, number>;
  toplamSaat: number;
  kayitSayisi: number;
  onayliSaat: number;
  bekleyenSaat: number;
  kayitlar: IsMakinesiIcmalKayit[];
};

export type IsMakinesiIcmalBlok = {
  kaynakGrup: MakineKaynakGrup;
  etiket: string;
  satirlar: IsMakinesiIcmalSatir[];
  tipToplamlari: Record<IsMakinesiIcmalTip, number>;
  genelToplamSaat: number;
  genelKayitSayisi: number;
  genelOnayliSaat: number;
  genelBekleyenSaat: number;
  firmaSayisi: number;
};

export type IsMakinesiIcmalOzet = {
  ay: number;
  yil: number;
  donemLabel: string;
  anaFirma: IsMakinesiIcmalBlok;
  kiralik: IsMakinesiIcmalBlok;
  /** Geriye uyum / üst özet */
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
  // KİRALIK tip → DİĞER (kaynak grubu zaten ayrı)
  return 'DİĞER';
}

function emptySaatler(): Record<IsMakinesiIcmalTip, number> {
  return { JCB: 0, KATO: 0, DİĞER: 0 };
}

function emptyBlok(kaynakGrup: MakineKaynakGrup): IsMakinesiIcmalBlok {
  return {
    kaynakGrup,
    etiket: makineKaynakGrupLabel(kaynakGrup),
    satirlar: [],
    tipToplamlari: emptySaatler(),
    genelToplamSaat: 0,
    genelKayitSayisi: 0,
    genelOnayliSaat: 0,
    genelBekleyenSaat: 0,
    firmaSayisi: 0,
  };
}

function isOnayli(f: OperatorFaaliyet): boolean {
  const d = String(f.onayDurumu || f.durum || '').toLocaleUpperCase('tr-TR');
  return d === 'ONAYLANDI';
}

export function isOperatorFaaliyetOnayli(f: OperatorFaaliyet): boolean {
  return isOnayli(f);
}

function faaliyetDonemde(f: OperatorFaaliyet, ay: number, yil: number): boolean {
  const raw = String(f.tarih || '');
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Number(m[1]) === yil && Number(m[2]) === ay;
  const tr = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (tr) return Number(tr[3]) === yil && Number(tr[2]) === ay;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  return d.getMonth() + 1 === ay && d.getFullYear() === yil;
}

export function isOperatorFaaliyetDonemde(f: OperatorFaaliyet, ay: number, yil: number): boolean {
  return faaliyetDonemde(f, ay, yil);
}

function mergeSatir(into: IsMakinesiIcmalSatir, from: IsMakinesiIcmalSatir) {
  for (const tip of IS_MAKINESI_ICMAL_TIPLER) into.saatler[tip] += from.saatler[tip];
  into.toplamSaat += from.toplamSaat;
  into.kayitSayisi += from.kayitSayisi;
  into.onayliSaat += from.onayliSaat;
  into.bekleyenSaat += from.bekleyenSaat;
  if (!into.firmaId && from.firmaId) {
    into.firmaId = from.firmaId;
    into.key = from.key;
    into.firmaAdi = from.firmaAdi;
  }
  const seen = new Set(into.kayitlar.map((k) => k.id));
  for (const k of from.kayitlar) {
    if (seen.has(k.id)) continue;
    into.kayitlar.push(k);
    seen.add(k.id);
  }
}

function finalizeBlok(
  byKey: Map<string, IsMakinesiIcmalSatir>,
  kaynakGrup: MakineKaynakGrup
): IsMakinesiIcmalBlok {
  const merged = new Map<string, IsMakinesiIcmalSatir>();
  for (const row of byKey.values()) {
    const mk = firmaAnahtar(row.firmaAdi) || row.key;
    const existing = merged.get(mk);
    if (!existing) {
      merged.set(mk, { ...row, saatler: { ...row.saatler }, kayitlar: [...row.kayitlar] });
    } else {
      mergeSatir(existing, row);
    }
  }

  const satirlar = Array.from(merged.values())
    .map((s) => {
      s.kayitlar.sort(
        (a, b) =>
          String(a.tarih).localeCompare(String(b.tarih)) ||
          a.operatorIsim.localeCompare(b.operatorIsim, 'tr')
      );
      return s;
    })
    .sort((a, b) => a.firmaAdi.localeCompare(b.firmaAdi, 'tr', { sensitivity: 'base' }));

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
    kaynakGrup,
    etiket: makineKaynakGrupLabel(kaynakGrup),
    satirlar,
    tipToplamlari,
    genelToplamSaat,
    genelKayitSayisi,
    genelOnayliSaat,
    genelBekleyenSaat,
    firmaSayisi: satirlar.length,
  };
}

export function buildIsMakinesiIcmal(opts: {
  faaliyetler: OperatorFaaliyet[];
  cariKartlar: CariKart[];
  ay: number;
  yil: number;
  onlyOnayli?: boolean;
  kesintiRaporlari?: Array<{
    kesintiTipi?: string;
    donemAy?: string;
    donemYil?: string;
    makineKaynakGrup?: MakineKaynakGrup;
    faaliyetler?: OperatorFaaliyet[];
  }>;
}): IsMakinesiIcmalOzet {
  const { faaliyetler, cariKartlar, ay, yil, onlyOnayli = true, kesintiRaporlari = [] } = opts;
  const cariler = getTaseronCariKartlar(cariKartlar);
  const anaMap = new Map<string, IsMakinesiIcmalSatir>();
  const kiralikMap = new Map<string, IsMakinesiIcmalSatir>();
  const ayStr = String(ay).padStart(2, '0');
  const yilStr = String(yil);

  const resolveFirma = (f: OperatorFaaliyet) => {
    const ad = String(f.firmaAdi || '').trim() || 'Belirtilmemiş';
    const byIdCari = f.firmaId ? cariler.find((c) => c.id === f.firmaId) : undefined;
    const byName = cariler.find((c) => firmaEslesir(c.unvan, ad));
    const cari = byIdCari || byName;
    const unvan = cari?.unvan || ad;
    const nameKey = firmaAnahtar(unvan) || normFirma(unvan) || 'belirsiz';
    return { key: nameKey, unvan, firmaId: cari?.id };
  };

  const byId = new Map<string, OperatorFaaliyet>();
  let anon = 0;
  for (const f of faaliyetler) {
    if (!f) continue;
    byId.set(f.id || `__live_${anon++}`, f);
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
      const grup = r.makineKaynakGrup || resolveMakineKaynakGrup(f);
      byId.set(id, {
        ...f,
        tarih: f.tarih && faaliyetDonemde(f, ay, yil) ? f.tarih : `${yilStr}-${ayStr}-15`,
        kesintiYansitildi: true,
        onayDurumu: f.onayDurumu || 'ONAYLANDI',
        makineKaynak: f.makineKaynak || (grup === 'KIRALIK' ? 'KIRALIK' : 'DEMIRBAS'),
      });
    }
  }

  for (const [fid, f] of byId.entries()) {
    if (!faaliyetDonemde(f, ay, yil)) continue;
    const onayli = isOnayli(f) || Boolean(f.kesintiYansitildi);
    if (onlyOnayli && !onayli) continue;

    const saat = Number(f.calismaSuresi) || 0;
    if (saat <= 0) continue;

    const kaynakGrup = resolveMakineKaynakGrup(f);
    const map = kaynakGrup === 'KIRALIK' ? kiralikMap : anaMap;
    const { key, unvan, firmaId } = resolveFirma(f);
    let row = map.get(key);
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
        kayitlar: [],
      };
      map.set(key, row);
    } else if (firmaId && !row.firmaId) {
      row.firmaId = firmaId;
      row.firmaAdi = unvan;
    }

    const tip = tipNormalize(f.operatorTipi);
    row.saatler[tip] += saat;
    row.toplamSaat += saat;
    row.kayitSayisi += 1;
    if (onayli) row.onayliSaat += saat;
    else row.bekleyenSaat += saat;

    row.kayitlar.push({
      id: fid,
      tarih: f.tarih,
      operatorIsim: f.operatorIsim || '—',
      makine: makineEtiketi(f),
      tip,
      kaynakGrup,
      baslangicSaat: f.baslangicSaat || '—',
      bitisSaat: f.bitisSaat || '—',
      calismaSuresi: saat,
      yapilanIs: String(f.yapilanIs || '').trim() || 'Açıklama girilmemiş',
      fotoUrl: f.fotoUrl,
      onayli,
    });
  }

  const anaFirma = finalizeBlok(anaMap, 'ANA_FIRMA');
  const kiralik = finalizeBlok(kiralikMap, 'KIRALIK');

  const tipToplamlari = emptySaatler();
  for (const tip of IS_MAKINESI_ICMAL_TIPLER) {
    tipToplamlari[tip] = anaFirma.tipToplamlari[tip] + kiralik.tipToplamlari[tip];
  }

  return {
    ay,
    yil,
    donemLabel: `${ayAdi(ay)} ${yil}`,
    anaFirma,
    kiralik,
    satirlar: [...anaFirma.satirlar, ...kiralik.satirlar],
    tipToplamlari,
    genelToplamSaat: anaFirma.genelToplamSaat + kiralik.genelToplamSaat,
    genelKayitSayisi: anaFirma.genelKayitSayisi + kiralik.genelKayitSayisi,
    genelOnayliSaat: anaFirma.genelOnayliSaat + kiralik.genelOnayliSaat,
    genelBekleyenSaat: anaFirma.genelBekleyenSaat + kiralik.genelBekleyenSaat,
    firmaSayisi: new Set([
      ...anaFirma.satirlar.map((s) => s.key),
      ...kiralik.satirlar.map((s) => s.key),
    ]).size,
  };
}

function fmtSaat(n: number): string {
  if (!n) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBlokOzet(blok: IsMakinesiIcmalBlok): string {
  const tipHeads = IS_MAKINESI_ICMAL_TIPLER.map(
    (t) => `<th style="padding:8px;text-align:right">${t}</th>`
  ).join('');
  const rows = blok.satirlar
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
      `<td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace">${fmtSaat(blok.tipToplamlari[t])}</td>`
  ).join('');
  const renk = blok.kaynakGrup === 'KIRALIK' ? '#0f766e' : '#1e3a5f';
  const bg = blok.kaynakGrup === 'KIRALIK' ? '#0f766e' : '#0f172a';

  return `
    <div style="border:2px solid ${blok.kaynakGrup === 'KIRALIK' ? '#99f6e4' : '#fde68a'};border-radius:14px;padding:14px;margin-bottom:14px;background:${blok.kaynakGrup === 'KIRALIK' ? '#f0fdfa' : '#fffbeb'}">
      <div style="font-size:11px;font-weight:900;letter-spacing:.06em;color:${renk};text-transform:uppercase;margin-bottom:8px">
        ${esc(blok.etiket)} · ${blok.firmaSayisi} firma · ${fmtSaat(blok.genelToplamSaat)} sa · ${blok.genelKayitSayisi} kayıt
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff">
        <thead>
          <tr style="background:${renk};color:#fff">
            <th style="padding:8px;text-align:left">AÇIKLAMA (FİRMA)</th>
            ${tipHeads}
            <th style="padding:8px;text-align:right">TOPLAM</th>
            <th style="padding:8px;text-align:center">KAYIT</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows ||
            `<tr><td colspan="6" style="padding:16px;text-align:center;color:#94a3b8">Bu grupta kayıt yok.</td></tr>`
          }
        </tbody>
        <tfoot>
          <tr style="background:${bg};color:#fff;font-weight:900">
            <td style="padding:10px 8px">TOPLAM · ${esc(blok.etiket)}</td>
            ${tipFoot}
            <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace">${fmtSaat(blok.genelToplamSaat)}</td>
            <td style="padding:10px 8px;text-align:center;font-family:Consolas,monospace">${blok.genelKayitSayisi}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

function renderBlokDetay(blok: IsMakinesiIcmalBlok): string {
  if (!blok.satirlar.length) return '';
  return blok.satirlar
    .map((s) => {
      const detayRows = s.kayitlar
        .map((k, i) => {
          const fotoCell = k.fotoUrl
            ? `<a href="${esc(k.fotoUrl)}" target="_blank" rel="noopener"><img src="${esc(k.fotoUrl)}" alt="Kanıt" style="max-width:64px;max-height:48px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1"/></a>`
            : '<span style="color:#94a3b8">—</span>';
          return `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
            <td style="padding:6px 8px;white-space:nowrap;font-family:Consolas,monospace;font-size:11px">${esc(k.tarih)}</td>
            <td style="padding:6px 8px;font-size:11px">${esc(k.operatorIsim)}</td>
            <td style="padding:6px 8px;font-size:11px">${esc(k.makine)}</td>
            <td style="padding:6px 8px;white-space:nowrap;font-size:11px;color:#64748b">${esc(k.baslangicSaat)}–${esc(k.bitisSaat)}</td>
            <td style="padding:6px 8px;text-align:right;font-family:Consolas,monospace;font-weight:800">${fmtSaat(k.calismaSuresi)} sa</td>
            <td style="padding:6px 8px;font-size:11px;line-height:1.4;font-weight:600;color:#0f172a">${esc(k.yapilanIs)}</td>
            <td style="padding:6px 8px;text-align:center">${fotoCell}</td>
          </tr>`;
        })
        .join('');
      const headBg = blok.kaynakGrup === 'KIRALIK' ? '#0f766e' : '#92400e';
      const footBg = blok.kaynakGrup === 'KIRALIK' ? '#134e4a' : '#78350f';
      return `
        <section style="margin:18px 0;page-break-inside:avoid">
          <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;padding:10px 12px;border-radius:12px;background:${blok.kaynakGrup === 'KIRALIK' ? '#f0fdfa' : '#fffbeb'};border:1px solid ${blok.kaynakGrup === 'KIRALIK' ? '#99f6e4' : '#fde68a'}">
            <div>
              <div style="font-size:10px;font-weight:900;letter-spacing:.06em;color:${headBg};text-transform:uppercase">${esc(blok.etiket)}</div>
              <div style="font-size:15px;font-weight:900;color:#0f172a;text-transform:uppercase">${esc(s.firmaAdi)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase">Kesilecek toplam</div>
              <div style="font-size:18px;font-weight:900;color:${headBg};font-family:Consolas,monospace">${fmtSaat(s.toplamSaat)} sa</div>
              <div style="font-size:10px;color:#64748b">${s.kayitSayisi} kayıt</div>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
            <thead>
              <tr style="background:${headBg};color:#fff">
                <th style="padding:7px 8px;text-align:left">Tarih</th>
                <th style="padding:7px 8px;text-align:left">Operatör</th>
                <th style="padding:7px 8px;text-align:left">Makine</th>
                <th style="padding:7px 8px;text-align:left">Saat</th>
                <th style="padding:7px 8px;text-align:right">Süre</th>
                <th style="padding:7px 8px;text-align:left">İş / Kesinti Açıklaması</th>
                <th style="padding:7px 8px;text-align:center">Foto</th>
              </tr>
            </thead>
            <tbody>${detayRows}</tbody>
            <tfoot>
              <tr style="background:${footBg};color:#fff;font-weight:900">
                <td colspan="4" style="padding:8px">FİRMA TOPLAMI · ${esc(blok.etiket)}</td>
                <td style="padding:8px;text-align:right;font-family:Consolas,monospace">${fmtSaat(s.toplamSaat)} sa</td>
                <td colspan="2" style="padding:8px;font-size:10px">${s.kayitSayisi} kayıt</td>
              </tr>
            </tfoot>
          </table>
        </section>`;
    })
    .join('');
}

export function buildIsMakinesiIcmalHtml(ozet: IsMakinesiIcmalOzet, opts?: { onlyOnayli?: boolean }): string {
  const onlyOnayli = opts?.onlyOnayli !== false;
  const bodyHtml = `
    <div style="border:2px solid #fbbf24;background:linear-gradient(135deg,#fffbeb,#f8fafc);border-radius:14px;padding:16px;margin-bottom:16px">
      <div style="font-size:10px;font-weight:900;letter-spacing:.08em;color:#b45309;text-transform:uppercase">
        İş Makinesi İcmali · Ana Firma / Kiralık Ayrı
      </div>
      <p style="margin:8px 0 0;font-size:13px;color:#78350f;line-height:1.5;font-weight:600">
        Dönem: <strong>${esc(ozet.donemLabel)}</strong>
        · genel ${fmtSaat(ozet.genelToplamSaat)} sa · ${ozet.genelKayitSayisi} kayıt
      </p>
      <p style="margin:6px 0 0;font-size:11px;color:#92400e;line-height:1.45">
        Ana firma makinesi ile kiralık makine kayıtları karışmaz; kesinti raporları da ayrı üretilir
        (${onlyOnayli ? 'yalnızca onaylı' : 'onaylı + bekleyen'}).
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
        <div style="border:1px solid #fde68a;border-radius:10px;padding:10px;background:#fff;text-align:center">
          <div style="font-size:9px;font-weight:800;color:#b45309;text-transform:uppercase">Ana Firma Makinesi</div>
          <div style="font-size:16px;font-weight:900;margin-top:4px;font-family:Consolas,monospace">${fmtSaat(ozet.anaFirma.genelToplamSaat)} sa</div>
          <div style="font-size:10px;color:#78716c">${ozet.anaFirma.firmaSayisi} firma · ${ozet.anaFirma.genelKayitSayisi} kayıt</div>
        </div>
        <div style="border:1px solid #99f6e4;border-radius:10px;padding:10px;background:#fff;text-align:center">
          <div style="font-size:9px;font-weight:800;color:#0f766e;text-transform:uppercase">Kiralık Makine</div>
          <div style="font-size:16px;font-weight:900;margin-top:4px;font-family:Consolas,monospace">${fmtSaat(ozet.kiralik.genelToplamSaat)} sa</div>
          <div style="font-size:10px;color:#78716c">${ozet.kiralik.firmaSayisi} firma · ${ozet.kiralik.genelKayitSayisi} kayıt</div>
        </div>
      </div>
    </div>

    <h3 style="margin:0 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;color:#1e3a5f;letter-spacing:.04em">
      1 · Özet icmal (kaynaklara göre ayrı)
    </h3>
    ${renderBlokOzet(ozet.anaFirma)}
    ${renderBlokOzet(ozet.kiralik)}

    <h3 style="margin:24px 0 4px;font-size:12px;font-weight:900;text-transform:uppercase;color:#92400e;letter-spacing:.04em;page-break-before:always">
      2 · Ana Firma Makinesi · kayıt kayıt açıklamalar
    </h3>
    ${renderBlokDetay(ozet.anaFirma) || `<p style="color:#94a3b8;font-size:12px">Ana firma makinesi kaydı yok.</p>`}

    <h3 style="margin:24px 0 4px;font-size:12px;font-weight:900;text-transform:uppercase;color:#0f766e;letter-spacing:.04em;page-break-before:always">
      3 · Kiralık Makine · kayıt kayıt açıklamalar
    </h3>
    ${renderBlokDetay(ozet.kiralik) || `<p style="color:#94a3b8;font-size:12px">Kiralık makine kaydı yok.</p>`}
  `;

  return buildKibritciReportHtml({
    title: 'KİBRİTÇİ İNŞAAT',
    subtitle: `${ozet.donemLabel} — İŞ MAKİNESİ İCMALİ`,
    meta: [
      `Ana ${fmtSaat(ozet.anaFirma.genelToplamSaat)} sa`,
      `Kiralık ${fmtSaat(ozet.kiralik.genelToplamSaat)} sa`,
      `${ozet.genelKayitSayisi} kayıt`,
    ],
    bodyHtml,
  });
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
