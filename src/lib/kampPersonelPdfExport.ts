import { KampKaydi, KampOdasi, Personel } from '../types/erp';
import { wrapCorporateReportHtml } from './corporateReportHtml';

export function generateKampPersonelPdfHtml(
  activeResidents: KampKaydi[],
  personeller: Personel[],
  kampOdalari: KampOdasi[]
): string {
  // 1. Group residents by firm (upper cased)
  const grouped: Record<string, { name: string; tc: string; roomNo: string; campus: string; entryDate: string }[]> = {};

  activeResidents.forEach((k) => {
    const p = personeller.find((x) => x.id === k.personelId);
    const isAnaFirma = k.firmaTipi === 'ANA_FIRMA' || 
      (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'KİBRİTÇİ İNŞAAT') ||
      (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'ANA FİRMA') ||
      (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'ANA FIRMA') ||
      (p?.firmaTipi === 'ANA_FIRMA');
    const firmName = isAnaFirma ? 'KİBRİTÇİ İNŞAAT' : (k.calistigiFirma || p?.firmaAdi || 'TAŞERON').trim().toLocaleUpperCase('tr-TR');
    const name = p ? `${p.ad} ${p.soyad}` : (k.personelIsim || 'Bilinmiyor');
    const tc = p?.tcNo || '';
    const room = kampOdalari.find((r) => r.id === (k.odaId || k.roomId));
    const roomNo = room ? room.odaNo : '';
    const campus = room ? room.yerleskeAdi : '';
    const entryDate = k.girisTarihi || '';

    if (!grouped[firmName]) {
      grouped[firmName] = [];
    }
    grouped[firmName].push({ name, tc, roomNo, campus, entryDate });
  });

  // Sort firm names
  const sortedFirms = Object.keys(grouped).sort();

  // 2. Build HTML body
  let bodyHtml = `
    <div class="mb-6">
      <h2 class="text-xl font-bold text-[#1e4e78] border-b pb-2 uppercase tracking-wide">KAMP SAKİNLERİ YERLEŞİM RAPORU</h2>
    </div>
  `;

  sortedFirms.forEach((firm) => {
    bodyHtml += `
      <div class="mb-8 avoid-break">
        <h3 class="text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 uppercase mb-3 tracking-wide">🏢 FİRMA: ${firm}</h3>
        <table class="w-full text-left border-collapse text-[10px]">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-300 text-slate-700 uppercase font-black tracking-wider text-[9px]">
              <th class="p-2 border-r border-slate-200 w-12 text-center">SIRA NO</th>
              <th class="p-2 border-r border-slate-200">AD SOYAD</th>
              <th class="p-2 border-r border-slate-200 w-32">TC KİMLİK NO</th>
              <th class="p-2 border-r border-slate-200">YERLEŞKE / BLOK - ODA</th>
              <th class="p-2 w-28 text-center">ODA GİRİŞ TARİHİ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 text-slate-800 font-medium">
    `;

    // Sort residents of this firm by name
    const residents = grouped[firm].sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    residents.forEach((res, idx) => {
      bodyHtml += `
        <tr class="hover:bg-slate-50/50">
          <td class="p-2 border-r border-slate-200 text-center text-slate-500 font-mono">${idx + 1}</td>
          <td class="p-2 border-r border-slate-200 font-bold">${res.name}</td>
          <td class="p-2 border-r border-slate-200 font-mono text-slate-600">${res.tc || '-'}</td>
          <td class="p-2 border-r border-slate-200">${res.campus ? `${res.campus} / ` : ''}Oda ${res.roomNo}</td>
          <td class="p-2 text-center text-slate-600 font-mono">${res.entryDate}</td>
        </tr>
      `;
    });

    bodyHtml += `
          </tbody>
        </table>
        <div class="text-[9px] text-slate-500 text-right mt-2 font-bold">Toplam Sakin: ${residents.length}</div>
      </div>
    `;
  });

  return wrapCorporateReportHtml(bodyHtml, {
    title: 'Kamp Sakinleri Raporu',
    docCode: 'KAMP-YSK-01',
    orientation: 'portrait',
    extraCss: `
      @media print {
        .avoid-break { page-break-inside: avoid; break-inside: avoid; }
      }
    `
  });
}
