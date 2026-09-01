/** Canlı ERP — Vercel sunucusu + Gemini API bu adreste çalışır */
export const PRODUCTION_APP_URL = 'https://kibritci-web.vercel.app';

/**
 * API yanıtlarını güvenli JSON olarak okur.
 * HTML/ boş yanıt durumunda anlaşılır hata verir.
 */
export async function fetchApiJson<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error(
      "Sunucuya bağlanılamadı. Siteyi https://kibritci-web.vercel.app adresinden açın ve Vercel'de GEMINI_API_KEY tanımlı olduğundan emin olun."
    );
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  if (!contentType.includes('application/json')) {
    const snippet = text.slice(0, 120).replace(/\s+/g, ' ').trim();
    if (!snippet) {
      throw new Error(
        `AI sunucusu boş yanıt verdi (HTTP ${res.status}). Doğru adres: ${PRODUCTION_APP_URL}`
      );
    }
    if (snippet.startsWith('<!') || snippet.toLowerCase().includes('html') || snippet.startsWith('The page')) {
      throw new Error(
        `AI API yanıt vermedi (HTML döndü). ${PRODUCTION_APP_URL} adresini kullanın; Vercel'de GEMINI_API_KEY tanımlı olmalı.`
      );
    }
    if (res.status === 404) {
      throw new Error(
        `AI API bulunamadı (404). Lütfen ${PRODUCTION_APP_URL} adresinden giriş yapın.`
      );
    }
    throw new Error(`Beklenmeyen sunucu yanıtı: ${snippet || res.statusText}`);
  }

  let json: T & { error?: string; success?: boolean };
  try {
    json = JSON.parse(text) as T & { error?: string; success?: boolean };
  } catch {
    throw new Error(`Sunucu geçersiz JSON döndürdü: ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    const errMsg = (json as { error?: string }).error || `Sunucu hatası (${res.status})`;
    if (res.status === 504) {
      throw new Error(
        `504 Gateway Timeout — AI işlemi süre limitini aştı. Daha küçük dosya (JPG fotoğraf) deneyin. ${errMsg}`
      );
    }
    throw new Error(errMsg);
  }

  return json as T;
}

export type GeminiHealthDetails = {
  success: boolean;
  message?: string;
  error?: string;
  keyFormat?: string;
  keyPreview?: string;
  keyHint?: string;
};

/** Admin paneli — maskelenmiş anahtar önizlemesi + format ipucu (tam anahtar asla dönmez) */
export async function fetchGeminiHealthDetails(): Promise<GeminiHealthDetails> {
  try {
    const data = await fetchApiJson<GeminiHealthDetails>('/api/gemini-health');
    return {
      ...data,
      error: data.error ? formatGeminiAlert(data.error) : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: formatGeminiAlert(err instanceof Error ? err.message : 'Gemini API kontrol edilemedi.'),
    };
  }
}

/** Giriş sonrası AI API'nin ayakta olup olmadığını kontrol eder */
export async function probeGeminiApi(): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await fetchApiJson<{ success?: boolean; message?: string; error?: string }>(
      '/api/gemini-health'
    );
    if (data.success) {
      return { ok: true, message: data.message || 'Gemini API çalışıyor.' };
    }
    const err = data.error || 'Gemini API yanıt vermedi.';
    return { ok: false, message: formatGeminiAlert(err) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gemini API kontrol edilemedi.';
    return { ok: false, message: formatGeminiAlert(msg) };
  }
}

/** Banner'da ham JSON yerine okunabilir Türkçe mesaj */
export function formatGeminiAlert(raw: string): string {
  if (/429|RESOURCE_EXHAUSTED|quota exceeded|exceeded your current quota|prepayment credits are depleted|billing#prepay/i.test(raw)) {
    return [
      'Gemini kredisi/kotası tükendi (prepayment credits depleted).',
      'Google AI Studio > Projects > Billing bölümünden bakiye/faturalandırma açın.',
      'Sonra Vercel deploy yenileyin.',
      'Detay: https://ai.google.dev/gemini-api/docs/billing#prepay',
    ].join(' ');
  }
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed?.error?.message;
    if (typeof inner === 'string' && /429|quota|prepayment credits are depleted|billing#prepay/i.test(inner)) {
      return formatGeminiAlert(inner);
    }
  } catch {
    /* düz metin */
  }
  if (raw.length > 280) {
    return raw.slice(0, 280) + '…';
  }
  return raw;
}
