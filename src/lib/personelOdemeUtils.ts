import { Personel } from '../types/erp';
import { isTaseronPersonel } from './yoklamaUtils';

export function validateTC(tc: string): boolean {
  if (!tc || tc.length !== 11) return false;
  return /^\d{11}$/.test(tc);
}

export function validateIBAN(iban: string): boolean {
  if (!iban) return false;
  const cleaned = iban.replace(/\s/g, '');
  return cleaned.startsWith('TR') && cleaned.length === 26;
}

export function hasValidSgk(personel: Personel): boolean {
  const s = String(personel.sgkDurumu || '').trim();
  return s === "SGK'lı" || s === 'SGK’lı';
}

export type OdemeEngelTip = 'TC' | 'IBAN' | 'SGK';

export interface OdemeEngeli {
  personel: Personel;
  engeller: OdemeEngelTip[];
}

/** Aktif ana firma personeli — maaş ödemesi için eksik TC / IBAN / SGK */
export function listOdemeEngelleri(personeller: Personel[]): OdemeEngeli[] {
  return (personeller || [])
    .filter((p) => (p.durum === true || String(p.durum) === 'true') && !isTaseronPersonel(p))
    .map((personel) => {
      const engeller: OdemeEngelTip[] = [];
      if (!validateTC(personel.tcNo || '')) engeller.push('TC');
      if (!validateIBAN(personel.ibanNo || '')) engeller.push('IBAN');
      if (!hasValidSgk(personel)) engeller.push('SGK');
      return { personel, engeller };
    })
    .filter((row) => row.engeller.length > 0)
    .sort((a, b) =>
      `${a.personel.ad} ${a.personel.soyad}`.localeCompare(
        `${b.personel.ad} ${b.personel.soyad}`,
        'tr'
      )
    );
}
