import { doc, setDoc } from 'firebase/firestore';
import { db, cleanUndefined } from './firebase';

export type PersonelCikisTalebiPayload = {
  personelId?: string;
  personelIsim: string;
  personelGorev?: string;
  personelMaas?: number;
  cikisTarihi?: string;
  cikisNedeni: string;
  gonderen: string;
  /** örn. KAMPCI_TAHLIYE / FORMEN */
  kaynak?: string;
  hedefYoneticiRole?: string;
};

/** Yönetim onay havuzuna işten çıkış talebi yazar (personelCikisTalepleri). */
export async function submitPersonelCikisTalebi(
  opts: PersonelCikisTalebiPayload
): Promise<string> {
  const docId = `CIKIS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cikisTarihi = opts.cikisTarihi || new Date().toISOString().slice(0, 10);
  await setDoc(
    doc(db, 'personelCikisTalepleri', docId),
    cleanUndefined({
      id: docId,
      personelId: opts.personelId || '',
      personelIsim: opts.personelIsim,
      personelGorev: opts.personelGorev || '',
      personelMaas: opts.personelMaas ?? 0,
      cikisTarihi,
      cikisNedeni: opts.cikisNedeni,
      hedefYoneticiRole: opts.hedefYoneticiRole || 'YÖNETİCİ',
      durum: 'BEKLEMEDE',
      tarih: new Date().toISOString(),
      gonderenFormen: opts.gonderen,
      kaynak: opts.kaynak || 'MANUEL',
    })
  );
  return docId;
}
