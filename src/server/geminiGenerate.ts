import type { GenerateContentConfig } from '@google/genai';
import { GoogleGenAI } from '@google/genai';
import { getAllGeminiApiKeys, parseGeminiError } from './gemini';

const IS_VERCEL = Boolean(process.env.VERCEL);

/**
 * En kararlı ücretsiz modeller başa alındı:
 * 1. gemini-1.5-flash (En güvenilir ücretsiz kota)
 * 2. gemini-1.5-flash-8b (Yüksek hızlı, hafif)
 * 3. gemini-flash-lite-latest
 * 4. gemini-flash-latest
 * 5. gemini-2.0-flash-lite
 * 6. gemini-2.0-flash (Kotası sıfır olan hesaplarda kilitlenmemesi için en sona alındı)
 */
export const GEMINI_MODEL_FALLBACK = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash',
];

const ATTEMPT_TIMEOUT_MS = IS_VERCEL ? 9_000 : 45_000;

// Kotası dolan modelleri 5 dakika boyunca geçici bellek kara listesine alır
const modelQuotaBlacklist = new Map<string, number>();

function isModelBlacklisted(model: string, apiKey: string): boolean {
  const key = `${apiKey.slice(0, 10)}_${model}`;
  const until = modelQuotaBlacklist.get(key);
  if (!until) return false;
  if (Date.now() > until) {
    modelQuotaBlacklist.delete(key);
    return false;
  }
  return true;
}

function blacklistModel(model: string, apiKey: string) {
  const key = `${apiKey.slice(0, 10)}_${model}`;
  // 5 dakika boyunca bu model/key ikilisini pas geç
  modelQuotaBlacklist.set(key, Date.now() + 5 * 60 * 1000);
}

function isQuotaOrExhaustedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  return (
    status === 429 ||
    /429|RESOURCE_EXHAUSTED|quota exceeded|exceeded your current quota|limit: 0|prepayment credits/i.test(msg)
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} ${Math.round(ms / 1000)} sn içinde yanıt vermedi. Sunucu zaman aşımını önlemek için işlem durduruldu.`
          )
        ),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function generateGeminiWithFallback(options: {
  contents: any;
  config?: GenerateContentConfig;
  label?: string;
}): Promise<{ text: string; model: string }> {
  const keys = getAllGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error(
      'GEMINI_API_KEY ortam değişkeni tanımlı değil. Lütfen .env.local veya Render/Vercel ortam değişkenlerine ekleyin.'
    );
  }

  const label = options.label || 'Yapay zeka analizi';
  let lastError: unknown = null;

  for (const apiKey of keys) {
    const ai = new GoogleGenAI({ apiKey });

    for (const model of GEMINI_MODEL_FALLBACK) {
      if (isModelBlacklisted(model, apiKey)) {
        continue; // Kota engelli modeli 0ms gecikmeyle atla!
      }

      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: options.contents,
            config: options.config,
          }),
          ATTEMPT_TIMEOUT_MS,
          label
        );

        const text = response.text?.trim();
        if (text) {
          return { text, model };
        }
        throw new Error('Yapay zeka boş yanıt döndürdü');
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini Fallback] '${model}' denenirken hata oluştu:`, (err as Error)?.message || err);

        if (isQuotaOrExhaustedError(err)) {
          // Kota hatasında tek saniye bile bekleme — bu modeli hemen kara listeye al ve sonraki modele geç!
          blacklistModel(model, apiKey);
        }
      }
    }
  }

  if (lastError instanceof Error) {
    throw new Error(parseGeminiError(lastError));
  }
  throw new Error(parseGeminiError(lastError));
}
