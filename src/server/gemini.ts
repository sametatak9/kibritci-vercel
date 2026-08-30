import { GoogleGenAI } from '@google/genai';

export type GeminiKeyFormat = 'auth' | 'standard' | 'unknown' | 'missing';

let aiClient: GoogleGenAI | null = null;

/** Ortam değişkeninden anahtarı okur — tırnak/boşluk temizler */
export function resolveGeminiApiKey(): string | undefined {
  const raw = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!raw) return undefined;
  return raw.trim().replace(/^['"]|['"]$/g, '');
}

/** Birden fazla anahtar desteği (virgülle ayrılmış veya GEMINI_API_KEY_2, _3 vb.) */
export function getAllGeminiApiKeys(): string[] {
  const keys: string[] = [];
  const raw1 = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (raw1) {
    const split = raw1.split(/[,|]/).map((k) => k.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    keys.push(...split);
  }
  for (let i = 2; i <= 5; i++) {
    const raw = process.env[`GEMINI_API_KEY_${i}`];
    if (raw) {
      const k = raw.trim().replace(/^['"]|['"]$/g, '');
      if (k && !keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

export function detectGeminiKeyFormat(key?: string): GeminiKeyFormat {
  if (!key) return 'missing';
  if (key.startsWith('AQ.')) return 'auth';
  if (key.startsWith('AIza')) return 'standard';
  return 'unknown';
}

export function getGeminiKeyInfo(): { format: GeminiKeyFormat; preview: string; length: number } {
  const key = resolveGeminiApiKey();
  const format = detectGeminiKeyFormat(key);
  if (!key) return { format: 'missing', preview: '(tanımsız)', length: 0 };
  const visible = key.length <= 12 ? '***' : `${key.slice(0, 6)}…${key.slice(-4)}`;
  return { format, preview: visible, length: key.length };
}

export function formatGeminiKeyHint(format: GeminiKeyFormat): string {
  switch (format) {
    case 'auth':
      return 'Auth key (AQ.…) — Google AI Studio\'nun yeni formatı, geçerlidir.';
    case 'standard':
      return 'Standard key (AIza…) — Kısıtlamasız eski anahtarlar 19 Haziran 2026\'dan itibaren reddedilir. Auth key (AQ.) kullanın.';
    case 'unknown':
      return 'Anahtar formatı tanınmadı. https://aistudio.google.com/apikey adresinden yeni key oluşturun.';
    default:
      return 'GEMINI_API_KEY ortam değişkeni tanımlı değil.';
  }
}

function isGeminiQuotaError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error);
  if (/429|RESOURCE_EXHAUSTED|quota exceeded|exceeded your current quota|prepayment credits are depleted|billing#prepay/i.test(raw)) {
    return true;
  }
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed?.error?.message ?? parsed?.message ?? '';
    return /429|RESOURCE_EXHAUSTED|quota exceeded|exceeded your current quota|prepayment credits are depleted|billing#prepay/i.test(String(inner));
  } catch {
    return false;
  }
}

export function parseGeminiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  // JSON gövdesi içinde kota hatası
  let msg = raw;
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed?.error?.message ?? parsed?.message;
    if (typeof inner === 'string') msg = inner;
  } catch {
    /* düz metin */
  }

  if (/429|RESOURCE_EXHAUSTED|quota exceeded|exceeded your current quota|prepayment credits are depleted|billing#prepay/i.test(msg)) {
    const modelMatch = msg.match(/model:\s*([\w.-]+)/i);
    const model = modelMatch?.[1] ?? 'Gemini';
    return [
      `Gemini API kredisi/kotası tükendi (${model}).`,
      'prepayment credits depleted hatası, proje bakiyesinin bittiğini gösterir.',
      '• Google AI Studio → Projects → Billing bölümünden bakiye/faturalandırma açın',
      '• Sonra Render/Vercel üzerinde redeploy yapın',
      '• Detay: https://ai.google.dev/gemini-api/docs/billing#prepay',
    ].join('\n');
  }

  if (/Request had invalid authentication credentials|Expected OAuth 2 access token|invalid authentication credentials|API key not valid|invalid.?api.?key|401|403|PERMISSION_DENIED/i.test(msg)) {
    return [
      'Gemini API anahtarı reddedildi.',
      '• AI Studio\'dan yeni Auth key (AQ.…) oluşturun: https://aistudio.google.com/apikey',
      '• Render/Vercel: Environment Variables → GEMINI_API_KEY (tırnaksız, boşluksuz)',
      '• Değişiklikten sonra redeploy yapın',
      '• Eski AIza anahtarı kısıtlamasızsa artık çalışmaz — Auth key kullanın',
    ].join('\n');
  }
  if (/GEMINI_API_KEY|GOOGLE_API_KEY/i.test(msg)) {
    return msg;
  }
  return msg;
}

export function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = resolveGeminiApiKey();
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY tanımlı değil. Yerelde .env.local dosyasına, Vercel\'de Project Settings → Environment Variables bölümüne ekleyin.'
      );
    }

    const format = detectGeminiKeyFormat(key);
    if (format === 'unknown') {
      throw new Error(
        `GEMINI_API_KEY formatı tanınmıyor (${key.slice(0, 8)}…). AI Studio'dan yeni key alın: https://aistudio.google.com/apikey`
      );
    }

    // Auth (AQ.) ve Standard (AIza) anahtarları desteklenir
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

/** Bağlantı testi — health endpoint ve npm run test:gemini için */
export async function testGeminiConnection(): Promise<{
  ok: boolean;
  keyInfo: ReturnType<typeof getGeminiKeyInfo>;
  modelResponse?: string;
  error?: string;
}> {
  const keyInfo = getGeminiKeyInfo();
  if (keyInfo.format === 'missing') {
    return { ok: false, keyInfo, error: formatGeminiKeyHint('missing') };
  }

  try {
    const ai = getGeminiClient();
    let lastError: unknown = null;

    const modelsToTest = [
      'gemini-flash-lite-latest',
      'gemini-flash-latest',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash-latest',
      'gemini-2.0-flash',
    ];
    for (const model of modelsToTest) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: 'Reply with exactly: OK',
          config: { maxOutputTokens: 128, temperature: 0 },
        });
        const text = response.text?.trim();
        if (text) {
          return { ok: true, keyInfo, modelResponse: `${text} (${model})` };
        }
      } catch (err) {
        lastError = err;
        console.warn(`Gemini test model ${model} failed:`, err);
      }
    }

    return { ok: false, keyInfo, error: parseGeminiError(lastError) };
  } catch (err) {
    return { ok: false, keyInfo, error: parseGeminiError(err) };
  }
}
