import React from 'react';
import { Info } from 'lucide-react';

type TabKey =
  | 'fatura-giris'
  | 'fatura-baglama'
  | 'fatura-bagli'
  | 'irsaliye-giris'
  | 'irsaliye-baglama'
  | 'irsaliye-bagli'
  | 'evrak-baglama'
  | 'yz';

const MESSAGES: Record<TabKey, { title: string; body: string }> = {
  'fatura-giris': {
    title: 'Fatura Giriş — Kayıt & Arşiv',
    body:
      'Gelen faturaları sisteme kaydedin ve arşivleyin. AI okuyucu ile hızlı giriş yapabilirsiniz.',
  },
  'fatura-baglama': {
    title: 'Fatura Bağlama — Finans Kontrol',
    body:
      'Ödeme evrakını (fatura) irsaliyeler ve isteğe bağlı satın alma siparişi ile eşleştirin. 1. aşama: evrak ID seçimi · 2. aşama: kalem bazlı miktar/birim onayı. Tamamlanan gruplar YZ Karşılaştır havuzuna düşer.',
  },
  'fatura-bagli': {
    title: 'Bağlı Evraklar — Arşiv Listesi',
    body:
      'Onaylanmış bağlantı grupları burada listelenir. İmzalı evrak yükleyerek veya e-imza ile yöneticilere onaylatabilirsiniz. «Evrak Detay» ile kontrol edin.',
  },
  'irsaliye-giris': {
    title: 'İrsaliye Giriş — Sevkiyat Kaydı',
    body:
      'Teslim alınan irsaliye/fişleri kaydedin. AI ile otomatik okuma desteklenir.',
  },
  'irsaliye-baglama': {
    title: 'İrsaliye Bağlama — Sevkiyat ↔ Sipariş',
    body:
      'Bir satın alma siparişine birden fazla irsaliye bağlayabilir veya satın alma olmadan doğrudan fatura ile eşleştirebilirsiniz. Kalem bağlantısında birim farkları (TIR/KG/TON) işaretlenir; YZ analizde kullanılır.',
  },
  'irsaliye-bagli': {
    title: 'Bağlı İrsaliyeler',
    body:
      'Bağlanmış sevkiyat evrakları. İmzalı evrak yükleme veya e-imza onayı ile «Onaylandı» durumuna geçer.',
  },
  'evrak-baglama': {
    title: 'Merkezi Evrak Bağlama',
    body:
      'Satın alma, irsaliye ve fatura evraklarını tek ekranda eşleştirin. En az iki evrak seçin. Kalem adımında eksik miktarları bir kez elle girebilirsiniz; YZ karşılaştırma havuzunda sıra her zaman SA → İrsaliye → Fatura olur.',
  },
  yz: {
    title: 'YZ Karşılaştır — Finans Denetim Raporu',
    body:
      'Bağlı evrak grupları (Sipariş → İrsaliyeler → Fatura) burada sıralanır. «Evrak Detay Gör» ile kontrol edin, «Analiz Yap» ile odak seçerek Kibritçi logolu rapor üretin. Raporlar arşivde saklanır.',
  },
};

export const EvrakTabBilgi: React.FC<{ tab: TabKey }> = ({ tab }) => {
  const msg = MESSAGES[tab];
  return (
    <div className="flex gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
      <Info className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
      <div>
        <p className="font-bold text-slate-800 mb-0.5">{msg.title}</p>
        <p className="leading-relaxed">{msg.body}</p>
      </div>
    </div>
  );
};
