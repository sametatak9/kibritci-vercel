export type CompareFocus =
  | 'miktar'
  | 'firma'
  | 'urun_adi'
  | 'birim'
  | 'fiyat'
  | 'kg_ton_donusum'
  | 'tarih'
  | 'tutar';

export type AnalizFocus = CompareFocus;

export interface CompareKalemRow {
  id: string;
  kaynak: 'SA' | 'İRSALİYE' | 'FATURA';
  kaynakRef: string;
  urunAdi: string;
  miktar: number;
  birim: string;
  birimFiyat?: number;
  selected: boolean;
  originalUrunAdi: string;
  originalMiktar: number;
  originalBirim: string;
}

export interface UserEditLog {
  kalemId: string;
  alan: string;
  eski: string;
  yeni: string;
}

export interface ComparisonReport {
  id: string;
  tarih: string;
  mode: 'irsaliye' | 'fatura';
  saId?: string;
  faturaNo?: string;
  irsaliyeNos?: string[];
  status: string;
  report: string;
  discrepancies: string[];
  compareFocus: CompareFocus[];
  userEdits: UserEditLog[];
  customInstructions?: string;
}

export const COMPARE_FOCUS_LABELS: Record<CompareFocus, string> = {
  miktar: 'Miktarları karşılaştır',
  firma: 'Firma adlarını karşılaştır',
  urun_adi: 'Ürün / kalem isimlerini karşılaştır',
  birim: 'Birimleri karşılaştır (ADET, KG, TON…)',
  fiyat: 'Fiyat ve tutarları karşılaştır',
  kg_ton_donusum: 'KG ↔ TON ↔ TIR dönüşümünü kontrol et',
  tarih: 'Tarih uyumunu kontrol et',
  tutar: 'Toplam tutar uyumunu kontrol et',
};

/** Havuzdan karşılaştırma sekmesine geçerken önceden doldurulan evrak + AI direktifi */
export interface CompareLaunchPayload {
  saId?: string;
  irIds?: string[];
  faturaId?: string;
  compareFocus?: CompareFocus[];
  customInstructions?: string;
  emphasizeFocus?: boolean;
}
