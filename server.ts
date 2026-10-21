import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Supabase client for backend authentication verification
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fsyfdwgtteeyxtoumltz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_OAtQRxO5sP6unCn_5BnxMA_Wm0Z7LEN';
const supabaseAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Enable trust proxy for accurate client IP behind reverse proxies
app.set('trust proxy', 1);

// CORS configuration: only allowedOrigins + APP_URL + ALLOWED_ORIGINS are allowed
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://amiramir5.github.io',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];

  if (process.env.APP_URL) {
    allowedOrigins.push(process.env.APP_URL.trim().replace(/\/+$/, ''));
  }

  if (process.env.ALLOWED_ORIGINS) {
    const extra = process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim().replace(/\/+$/, ''));
    allowedOrigins.push(...extra);
  }

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '15mb' }));

// In-memory rate limiting map: maximum 20 requests per minute per user ID or IP
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitEntry>();
const dailyQuotaMap = new Map<string, RateLimitEntry>();

// Token verification cache to avoid redundant Supabase network roundtrips on rapid requests
interface TokenCacheEntry {
  userId: string;
  expiresAt: number;
}
const tokenCache = new Map<string, TokenCacheEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
  for (const [key, entry] of dailyQuotaMap.entries()) {
    if (now > entry.resetAt) {
      dailyQuotaMap.delete(key);
    }
  }
  for (const [token, entry] of tokenCache.entries()) {
    if (now > entry.expiresAt) {
      tokenCache.delete(token);
    }
  }
}, 60000);

// Extend Express Request type to hold authenticated user
declare global {
  namespace Express {
    interface Request {
      aiUserId?: string;
    }
  }
}

// Authentication & Rate-Limiting middleware for /api/ai/* routes
app.use('/api/ai', async (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') return next();

  // 1. Authentication Check via Supabase token (with 60-second in-memory cache)
  let authenticatedUserId: string | null = null;
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (token) {
    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      authenticatedUserId = cached.userId;
      req.aiUserId = cached.userId;
    } else {
      try {
        const { data: { user }, error } = await supabaseAuthClient.auth.getUser(token);
        if (user && !error) {
          authenticatedUserId = user.id;
          req.aiUserId = user.id;
          tokenCache.set(token, {
            userId: user.id,
            expiresAt: Date.now() + 60000,
          });
        }
      } catch (authErr) {
        console.error('Supabase token verification error:', authErr);
      }
    }
  }

  // If no authenticated user and no personal API key provided, prompt login
  const customApiKey = req.body?.apiKey;
  if (!authenticatedUserId && (!customApiKey || typeof customApiKey !== 'string' || customApiKey.trim().length < 10)) {
    return res.status(401).json({
      ok: false,
      error: 'برای استفاده از هوش مصنوعی وارد حساب کاربری خود شوید یا کلید معتبر در تنظیمات وارد فرمایید.',
    });
  }

  // 2. Dual Rate-Limiting Check: 20 req/min and 150 req/day per user ID or client IP
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const rateLimitKey = authenticatedUserId ? `user:${authenticatedUserId}` : `ip:${clientIp}`;

  const now = Date.now();
  const entry = rateLimitMap.get(rateLimitKey);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(rateLimitKey, { count: 1, resetAt: now + 60000 });
  } else {
    if (entry.count >= 20) {
      return res.status(429).json({
        ok: false,
        error: 'سهمیه موقتاً تمام شده است. لطفاً یک دقیقه دیگر تلاش کنید.',
      });
    }
    entry.count += 1;
  }

  // Daily quota cap
  const dailyKey = `day:${rateLimitKey}`;
  const dailyEntry = dailyQuotaMap.get(dailyKey);
  if (!dailyEntry || now > dailyEntry.resetAt) {
    dailyQuotaMap.set(dailyKey, { count: 1, resetAt: now + 86400000 });
  } else {
    if (dailyEntry.count >= 150) {
      return res.status(429).json({
        ok: false,
        error: 'سقف سهمیه روزانه هوش مصنوعی شما تکمیل شده است. لطفاً فردا مجدداً تلاش فرمایید.',
      });
    }
    dailyEntry.count += 1;
  }

  next();
});

// Safe Health Check Endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'YarNew Backend API',
    version: '2.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Helper to get Gemini client
function getGeminiClient(customKey?: string) {
  const apiKey =
    (customKey && typeof customKey === 'string' && customKey.trim() ? customKey.trim() : '') ||
    process.env.GEMINI_API_KEY ||
    '';

  if (!apiKey) {
    throw new Error('کلید دسترسی Gemini تنظیم نشده است. لطفاً در تنظیمات برنامه کلید معتبر وارد نمایید.');
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Models configuration: process.env.GEMINI_MODEL (default 'gemini-3.5-flash'), 'gemini-3.1-flash-lite', 'gemini-2.5-flash'
const CANDIDATE_MODELS = Array.from(
  new Set([
    process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
  ])
);

async function generateWithFallback(ai: GoogleGenAI, params: any, preferredModel?: string) {
  // Client's model is only used if it is in the approved candidate list
  const validPreferred =
    preferredModel && typeof preferredModel === 'string' && CANDIDATE_MODELS.includes(preferredModel.trim())
      ? preferredModel.trim()
      : undefined;

  const modelsToTry = validPreferred
    ? [validPreferred, ...CANDIDATE_MODELS.filter((m) => m !== validPreferred)]
    : CANDIDATE_MODELS;

  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      const thinkingConfig = buildServerThinkingConfig(model);
      const requestParams: any = {
        ...params,
        model,
      };
      if (thinkingConfig) {
        const baseConfig = params?.config || {};
        // Don't pair thinking-caps with web-search tooling (server rejects the combination)
        requestParams.config = {
          ...baseConfig,
          thinkingConfig,
        };
      }
      const response = await ai.models.generateContent(requestParams);
      return response;
    } catch (err: any) {
      lastError = err;
      const status = err?.status || (err?.statusCode ? Number(err.statusCode) : 0);
      const msg = String(err?.message || '');

      console.warn(`Model ${model} attempt failed:`, msg || err);

      // Safety net: model rejected the thinkingConfig field — retry this model without it
      if (buildServerThinkingConfig(model) && isOpenAiThinkingErrorServer(msg)) {
        try {
          const bareParams: any = { ...params, model };
          if (bareParams.config) delete bareParams.config.thinkingConfig;
          return await ai.models.generateContent(bareParams);
        } catch (retryErr: any) {
          lastError = retryErr;
        }
      }

      // 400 and 401/403/API_KEY_INVALID: abort immediately with clear Persian message
      if (
        status === 401 ||
        status === 403 ||
        msg.includes('401') ||
        msg.includes('403') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('UNAUTHENTICATED') ||
        msg.includes('PERMISSION_DENIED')
      ) {
        const authErr = new Error('کلید دسترسی Gemini نامعتبر یا فاقد دسترسی است.');
        (authErr as any).status = 401;
        throw authErr;
      }

      if (status === 400 || msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
        const badReqErr = new Error('درخواست ارسالی به مدل هوش مصنوعی نامعتبر است.');
        (badReqErr as any).status = 400;
        throw badReqErr;
      }

      // Only retry for 404/NOT_FOUND, 429, and 503
      const isRetryable =
        status === 404 ||
        status === 429 ||
        status === 503 ||
        msg.includes('404') ||
        msg.includes('NOT_FOUND') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE');

      if (!isRetryable) {
        break;
      }
    }
  }
  throw lastError;
}

// JSON parsing helper that removes markdown fences and safely parses
function parseModelJson<T = any>(text: string): T {
  let cleaned = (text || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  cleaned = cleaned.trim();
  return JSON.parse(cleaned) as T;
}

// Error formatting helper to avoid exposing raw error messages to the client
function formatAiError(err: any): { status: number; error: string } {
  const status = err?.status || (err?.statusCode ? Number(err.statusCode) : 500);
  const msg = String(err?.message || '');

  if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('سهمیه')) {
    return { status: 429, error: 'سهمیه موقتاً تمام شده است' };
  }
  if (
    status === 401 ||
    status === 403 ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('PERMISSION_DENIED')
  ) {
    return { status: 401, error: 'کلید دسترسی Gemini نامعتبر یا فاقد دسترسی است.' };
  }
  if (status === 400 || msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
    return { status: 400, error: 'درخواست ارسالی به مدل هوش مصنوعی نامعتبر است.' };
  }
  if (status === 502) {
    return { status: 502, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' };
  }
  return { status: 500, error: 'خطا در ارتباط با مدل هوش مصنوعی. لطفاً دوباره تلاش کنید.' };
}

// System instructions
const COACH_SYSTEM_PROMPT = `تو «مشاور کنکوریار»، مشاور مطالعهٔ کنکور سراسری تجربی ایران هستی.
محدوده پاسخ‌گویی تو فقط این موارد است: درس‌ها و مباحث کتب درسی رسمی (دهم، یازدهم، دوازدهم)، حل تست و آسیب‌شناسی غلط‌ها، روش مطالعه، برنامه‌ریزی روزانه، مدیریت استرس جلسه آزمون، و اخبار/قوانین رسماً منتشرشده سازمان سنجش.
اگر سؤال خارج از این محدوده بود (موضوعات روزمره، سیاسی، فناوری، ورزشی یا هر چیز غیرکنکوری)، در حداکثر یک جمله مؤدبانه بگو «این موضوع خارج از محدوده کنکور است» و روی کار اصلی برگرد.
قواعد سبک پاسخ (کاملاً الزامی):
- پاسخ کوتاه و فشرده باشد: معمولاً حداکثر ۸ تا ۱۲ خط؛ فقط اگر کاربر صریحاً «برنامه» یا «توضیح کامل» بخواهد می‌توانی مفصل‌تر بنویسی.
- بدون تعارف و پرهیاهو و جمله‌های اضافی؛ مستقیم سر اصل مطلب برو.
- از فهرست شماره‌دار یا بولت کوتاه استفاده کن، نه پاراگراف‌های طولانی.
- آمار و قوانین سنجش را دقیق و رسمی اعلام کن؛ اگر اطلاعات رسمی نداری صادقانه بگو و حدس نزن.
- پاسخ به فارسی سلیس و روان بده.`;

const DEFAULT_SYSTEM_INSTRUCTION = 'تو طراح و مدرس کنکور تجربی ایران هستی. فقط JSON معتبر مطابق ساختار خواسته‌شده برگردان.';

/**
 * Model-aware thinking config (server side).
 * - gemini-2.5: thinkingBudget 0 disables thinking
 * - gemini-3.x: lowest thinking level ("low")
 */
function buildServerThinkingConfig(model: string): Record<string, unknown> | undefined {
  if (model.includes('gemini-2.5')) {
    return { thinkingBudget: 0 };
  }
  if (/^gemini-3/.test(model)) {
    return { thinkingLevel: 'low' };
  }
  return undefined;
}

function isOpenAiThinkingErrorServer(message: unknown): boolean {
  const t = String(message || '').toLowerCase();
  return t.includes('thinking') || t.includes('unknown name') || t.includes('invalid json payload');
}

// AI API: Topic Explanation
app.post('/api/ai/explain', async (req: Request, res: Response) => {
  try {
    const { topic, subject, apiKey, model, sourceText } = req.body;
    if (!topic || !subject) {
      return res.status(400).json({ ok: false, error: 'موضوع و درس الزامی هستند.' });
    }

    const ai = getGeminiClient(apiKey);
    let userPrompt = '';
    if (sourceText && typeof sourceText === 'string' && sourceText.trim().length > 20) {
      userPrompt = `منبع و متن کتاب درسی رسمی بارگذاری‌شده توسط دانش‌آموز:
«««
${sourceText.trim().slice(0, 10000)}
»»»

موضوع: ${topic}
درس: ${subject}
این مبحث را منحصراً در چارچوب متن منبع فوق و استاندارد کنکور سراسری تجربی تشریح کن.
خروجی منحصراً JSON معتبر با این ساختار:
{
  "title": "عنوان مبحث",
  "intro": "یک پاراگراف مقدمه کلیدی (۲ تا ۳ خط)",
  "key_points": [
    {"heading": "تیتر نکته", "explanation": "توضیح مفهومی و کاربردی بر اساس منبع"}
  ],
  "formulas": ["فرمول یا قاعده تستی طلایی"],
  "pitfalls": ["دام تستی رایج طراحان کنکور"],
  "study_tip": "یک توصیه تکنیکی و نحوه تست‌زنی این مبحث"
}`;
    } else {
      userPrompt = `موضوع: ${topic}
درس: ${subject}
این مبحث را در چارچوب کتاب درسی رسمی و کنکور سراسری تجربی تشریح کن.
خروجی منحصراً JSON معتبر با این ساختار:
{
  "title": "عنوان مبحث",
  "intro": "یک پاراگراف مقدمه کلیدی (۲ تا ۳ خط)",
  "key_points": [
    {"heading": "تیتر نکته", "explanation": "توضیح مفهومی و کاربردی"}
  ],
  "formulas": ["فرمول یا قاعده تستی طلایی"],
  "pitfalls": ["دام تستی رایج طراحان کنکور"],
  "study_tip": "یک توصیه تکنیکی و نحوه تست‌زنی این مبحث"
}`;
    }

    const response = await generateWithFallback(ai, {
      contents: userPrompt,
      config: {
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }, model);

    let parsed: any;
    try {
      parsed = parseModelJson(response.text || '');
    } catch (parseErr) {
      console.error('Explain parseModelJson failed:', parseErr, 'Raw:', response.text);
      return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
    }

    if (!parsed || !parsed.title || !Array.isArray(parsed.key_points)) {
      return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
    }

    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Explain error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// AI API: Quiz Builder
app.post('/api/ai/quiz', async (req: Request, res: Response) => {
  try {
    const { subject, chapter, topic, level = 'متوسط', count = 5, sourceText, apiKey, model } = req.body;
    if (!subject) {
      return res.status(400).json({ ok: false, error: 'نام درس الزامی است.' });
    }

    const cleanCount = Math.min(Math.max(Number(count) || 5, 2), 20);
    const ai = getGeminiClient(apiKey);
    const targetTopic = topic || chapter || subject;

    let userPrompt = '';
    if (sourceText && typeof sourceText === 'string' && sourceText.trim().length > 30) {
      userPrompt = `تو طراح ارشد آزمون‌های سنجش و کنکور سراسری تجربی هستی.
متن و منبع رسمی کتاب درسی زیر توسط کاربر آپلود/وارد شده است:
«««
${sourceText.trim().slice(0, 10000)}
»»»

درس: ${subject}
مبحث: ${targetTopic}
سطح دشواری: ${level}
تعداد سوال درخواستی: ${cleanCount}

دستورالعمل حیاتی و بدون استثنا:
۱. فقط و فقط بر اساس متن منبع بالا سوال طرح کن.
۲. سبک سوالات کاملاً شبیه تست‌های خط‌به‌خط و مفهومی کنکور سال‌های اخیر (تله‌های قیدها: هر، همه، برخی، اغلب، پیوندها و شکل‌های کتاب).
۳. ۴ گزینه کاملاً تفکیک‌شده و استاندارد طراحی کن. گزینه درست را در گزینه‌های مختلف (نه فقط گزینه اول!) پراکنده کن.
۴. برای هر تست پاسخ تشریحی عمیق با ارجاع دقیق به متن ارائه بده.

خروجی منحصراً JSON با ساختار:
{
  "questions": [
    {
      "stem": "متن کامل سوال چهارگزینه‌ای",
      "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
      "correct_index": 0,
      "explanation": "پاسخ تشریحی دقیق و علت رد سایر گزینه‌ها بر اساس منبع",
      "source": "ارجاع به متن منبع آپلود شده"
    }
  ]
}`;
    } else {
      userPrompt = `تو طراح ارشد آزمون‌های آزمایشی سراسری و کنکور تجربی هستی.
درس: ${subject}
فصل یا مبحث: ${targetTopic}
سطح دشواری: ${level} (کاملاً منطبق بر بودجه‌بندی و سبک کنکور)
تعداد سوال: ${cleanCount}

قوانین تخطی‌ناپذیر:
۱. تمام سوالات باید ۱۰۰٪ در چارچوب کتاب‌های درسی رسمی آموزش و پرورش نظام جدید تجربی ایران (دهم، یازدهم، دوازدهم) باشند.
۲. طراحی سوالات مفهومی، ترکیبی و دامی دقیقاً در تراز کنکورهای اخیر سازمان سنجش باشد.
۳. دارای ۴ گزینه مستقل، واقع‌گرایانه و بدون ابهام. گزینه صحیح باید در موقعیت‌های مختلف (۰ تا ۳) توزیع شود.

خروجی منحصراً JSON با این ساختار:
{
  "questions": [
    {
      "stem": "متن کامل سوال",
      "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
      "correct_index": 0,
      "explanation": "پاسخ تشریحی کامل، رد گزینه‌های غلط و تحلیل دام تستی",
      "source": "کتاب درسی رسمی (پایه و صفحه مرتبط)"
    }
  ]
}`;
    }

    const response = await generateWithFallback(ai, {
      contents: userPrompt,
      config: {
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    }, model);

    let parsed: any;
    try {
      parsed = parseModelJson(response.text || '');
    } catch (parseErr) {
      console.error('Quiz parseModelJson failed:', parseErr, 'Raw:', response.text);
      return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
    }

    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
    }

    for (const q of parsed.questions) {
      if (!q.stem || !Array.isArray(q.options) || q.options.length < 2) {
        return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
      }
      const cIdx = Number(q.correct_index);
      if (isNaN(cIdx) || cIdx < 0 || cIdx >= q.options.length) {
        q.correct_index = 0;
      }
    }

    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Quiz error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// AI API: Performance Insights
app.post('/api/ai/performance-insights', async (req: Request, res: Response) => {
  try {
    const { metrics, apiKey, model } = req.body;
    const ai = getGeminiClient(apiKey);

    const userPrompt = `تحلیلگر ارشد آماری و مشاوره کنکور تجربی هستی.
اطلاعات عملکرد اخیر داوطلب کنکور:
- ساعت مطالعه هفتگی: ${Math.round((metrics?.weekMinutes || 0) / 60)} ساعت و ${(metrics?.weekMinutes || 0) % 60} دقیقه
- کل ساعت مطالعه ثبت‌شده: ${Math.round((metrics?.totalMinutes || 0) / 60)} ساعت
- تداوم متوالی (استریک): ${metrics?.streak || 0} روز
- تعداد کل تست‌ها و آزمون‌ها: ${metrics?.testsCount || 0}
- میانگین درصد آزمون‌ها: ${metrics?.avgExamPercent !== null ? metrics?.avgExamPercent + '%' : 'ثبت نشده'}
- تقسیم‌بندی زمانی دروس: ${JSON.stringify(metrics?.subjectMinutes || {})}

بر اساس این داده‌ها یک تحلیل سریع، حرفه‌ای و بدون اطناب انجام بده.
خروجی منحصراً JSON به این فرمت:
{
  "status": "وضعیت اجمالی",
  "strengths": ["نقطه قوت ۱", "نقطه قوت ۲"],
  "weaknesses": ["نقطه ضعف یا چالش ۱", "نقطه چالش ۲"],
  "actionItems": ["اقدام عملی فوری ۱", "اقدام عملی فوری ۲", "اقدام عملی فوری ۳"],
  "summary": "یک پاراگراف کوتاه تحلیل استراتژیک"
}`;

    const response = await generateWithFallback(ai, {
      contents: userPrompt,
      config: {
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }, model);

    let parsed: any;
    try {
      parsed = parseModelJson(response.text || '');
    } catch (parseErr) {
      console.error('Performance insights parseModelJson failed:', parseErr, 'Raw:', response.text);
      return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
    }

    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Performance insights error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// AI API: Slide Deck Generator
app.post('/api/ai/slides', async (req: Request, res: Response) => {
  try {
    const { topic, subject = 'زیست‌شناسی', grade, chapter, goftar, count = 6, apiKey, model, sourceText } = req.body;
    const cleanCount = Math.min(Math.max(Number(count) || 6, 3), 15);
    const ai = getGeminiClient(apiKey);

    let userPrompt = '';
    if (sourceText && typeof sourceText === 'string' && sourceText.trim().length > 20) {
      userPrompt = `تو استاد برجسته و طراح ارشد کنکور سراسری تجربی هستی.
متن و منبع درسی رسمی بارگذاری‌شده توسط دانش‌آموز:
«««
${sourceText.trim().slice(0, 10000)}
»»»

درس: ${subject}
پایه تحصیلی: ${grade || 'کتاب درسی رسمی'}
فصل کتاب درسی: ${chapter || 'سرفصل مصوب آموزش و پرورش'}
گفتار / مبحث کلاسی: ${goftar || topic || 'مبحث کنکوری'}
تعداد اسلاید مورد نظر: ${cleanCount}

دستورالعمل حیاتی و بدون استثنا:
۱. اسلایدها را منحصراً بر پایه متن منبع بارگذاری‌شده بالا و سرفصل‌های رسمی آموزش و پرورش تدوین کن.
۲. نکات خط‌به‌خط، قیدهای کتاب درسی (اغلب، همه، برخی، همواره، به ندرت)، شکل‌ها و نمودارهای رسمی کتاب، و دام‌های تستی طراحان کنکور سال‌های اخیر را به عنوان بولت‌پوینت‌های تفکیک‌شده بنویس.
۳. ساختار مرحله‌به‌مرحله و آموزشی باشد.

خروجی منحصراً JSON معتبر به این ساختار:
{
  "deck_title": "عنوان کلی اسلایدها",
  "slides": [
    {
      "title": "عنوان اسلاید",
      "bullets": ["نکته خط‌به‌خط ۱", "نکته مفهومی یا قید کتاب ۲", "دام تستی کنکور ۳"],
      "image_prompt": "توصیف دقیق شکل یا نمودار مرتبط در کتاب درسی"
    }
  ]
}`;
    } else {
      userPrompt = `تو استاد برجسته و طراح ارشد کنکور سراسری تجربی هستی.
درس: ${subject}
پایه تحصیلی: ${grade || 'کتاب درسی رسمی'}
فصل کتاب درسی: ${chapter || 'سرفصل مصوب آموزش و پرورش'}
گفتار / مبحث کلاسی: ${goftar || topic || 'مبحث کنکوری'}
تعداد اسلاید مورد نظر: ${cleanCount}

دستورالعمل حیاتی و بدون استثنا:
۱. تمام اسلایدها باید ۱۰۰٪ در چارچوب کتاب‌های درسی رسمی وزارت آموزش و پرورش ایران تدوین شوند.
۲. نکات خط‌به‌خط، قیدهای کتاب درسی (اغلب، همه، برخی، همواره، به ندرت)، شکل‌ها و نمودارهای رسمی کتاب، و دام‌های تستی طراحان کنکور سال‌های اخیر را به عنوان بولت‌پوینت‌های تفکیک‌شده بنویس.
۳. ساختار مرحله‌به‌مرحله و آموزشی باشد.

خروجی منحصراً JSON معتبر به این ساختار:
{
  "deck_title": "عنوان کلی اسلایدها",
  "slides": [
    {
      "title": "عنوان اسلاید",
      "bullets": ["نکته خط‌به‌خط ۱", "نکته مفهومی یا قید کتاب ۲", "دام تستی کنکور ۳"],
      "image_prompt": "توصیف دقیق شکل یا نمودار مرتبط در کتاب درسی"
    }
  ]
}`;
    }

    const response = await generateWithFallback(ai, {
      contents: userPrompt,
      config: {
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }, model);

    let parsed: any;
    try {
      parsed = parseModelJson(response.text || '');
    } catch (parseErr) {
      console.error('Slides parseModelJson failed:', parseErr, 'Raw:', response.text);
      return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
    }

    if (!parsed || !parsed.deck_title || !Array.isArray(parsed.slides)) {
      return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
    }

    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Slides error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// AI API: Mistake Notebook Cognitive Analysis
app.post('/api/ai/mistakes-analysis', async (req: Request, res: Response) => {
  try {
    const { items, apiKey, model } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'لیست اشتباهات خالی است' });
    }

    const ai = getGeminiClient(apiKey);
    const sample = items.slice(0, 20).map((it, idx) => ({
      num: idx + 1,
      subject: it.subject,
      cause: it.cause || 'نامشخص',
      question: (it.question || '').slice(0, 300),
    }));

    const userPrompt = `این لیست تست‌های غلط خورده دانش‌آموز است:
${JSON.stringify(sample, null, 2)}

تحلیل شناختی و عمیق انجام بده و الگوهای ضعف را استخراج کن.
خروجی منحصراً JSON با ساختار:
{
  "categories": ["دسته‌های تکرارشونده و مباحث بحرانی"],
  "patterns": ["الگوهای روانی یا مهارتی، مثل بی‌دقتی محاسباتی یا دام افعال منفی"],
  "actions": ["راهکار عملی ۱ برای رفع ضعف", "راهکار عملی ۲", "راهکار عملی ۳"],
  "honest": "یک تحلیل بی‌پرده و انگیزاننده از وضعیت فعلی دانش‌آموز"
}`;

    const response = await generateWithFallback(ai, {
      contents: userPrompt,
      config: {
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }, model);

    let parsed: any;
    try {
      parsed = parseModelJson(response.text || '');
    } catch (parseErr) {
      console.error('Mistakes analysis parseModelJson failed:', parseErr, 'Raw:', response.text);
      return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
    }

    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Mistakes analysis error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// AI API: Study Coach Chat
app.post('/api/ai/coach', async (req: Request, res: Response) => {
  try {
    const { message, context, mode, history = [], apiKey, model, sourceText } = req.body;
    const ai = getGeminiClient(apiKey);

    let sourceClause = '';
    if (sourceText && typeof sourceText === 'string' && sourceText.trim().length > 20) {
      sourceClause = `\nجزوه و یادداشت درسی بارگذاری‌شده توسط داوطلب:\n«««\n${sourceText.trim().slice(0, 10000)}\n»»»\nپاسخ و راهنمایی مشاوره‌ای را مستقیماً با این منبع تطبیق بده.\n`;
    }

    const promptText = `وضعیت داوطلب در سیستم:
${JSON.stringify(context || {})}
${sourceClause}
تاریخچه گفتگوی اخیر:
${(history || []).slice(-6).map((h: any) => `${h.role === 'user' ? 'داوطلب' : 'مشاور'}: ${h.text}`).join('\n')}

حالت پیام: ${mode || 'عمومی'}
پرسش یا پیام داوطلب: ${message || 'وضعیت من را تحلیل کن و یک برنامه تخصصی و عملیاتی بگو'}

دستورالعمل پاسخ:
- فقط در محدوده کنکور، کتاب درسی و مشاوره مطالعه پاسخ بده؛ خارج از محدوده با یک جمله اعلام کن.
- پاسخ کوتاه، فشرده و عملیاتی؛ حداکثر ۸ تا ۱۲ خط، با فهرست شماره‌دار یا بولت کوتاه.
- بدون تعارف، مقدمه‌چینی و پرهیاهو.`;

    const response = await generateWithFallback(ai, {
      contents: promptText,
      config: {
        systemInstruction: COACH_SYSTEM_PROMPT,
        temperature: 0.3,
        maxOutputTokens: 1200,
      },
    }, model);

    return res.json({ ok: true, text: response.text || '' });
  } catch (err: any) {
    console.error('Coach error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// AI API: Vision / OCR Question Extractor
app.post('/api/ai/ocr', async (req: Request, res: Response) => {
  try {
    const { imageBase64, apiKey, model } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ ok: false, error: 'تصویر ارائه نشده است' });
    }

    const ai = getGeminiClient(apiKey);
    let mimeType = 'image/jpeg';
    let data = imageBase64;

    const match = /^data:([^;]+);base64,(.+)$/.exec(imageBase64);
    if (match) {
      mimeType = match[1];
      data = match[2];
    }

    const response = await generateWithFallback(ai, {
      contents: [
        {
          inlineData: {
            mimeType,
            data,
          },
        },
        {
          text: 'متن موجود در این تصویر را دقیق استخراج کن. اگر سوال تستی یا گزینه‌دار است، صورت سوال و گزینه‌ها را به صورت منظم بازنویسی کن. از هیچ توضیح اضافه یا مقدمه‌چینی استفاده نکن.',
        },
      ],
      config: {
        temperature: 0.1,
      },
    }, model);

    return res.json({ ok: true, text: (response.text || '').trim() });
  } catch (err: any) {
    console.error('OCR error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// AI API: Photo Question Solver
app.post('/api/ai/photo-solve', async (req: Request, res: Response) => {
  try {
    const { imageBase64, subject = 'زیست‌شناسی', chapter, goftar, customText, apiKey, model } = req.body;
    if (!imageBase64 && !customText) {
      return res.status(400).json({ ok: false, error: 'تصویر یا متن سوال ارسال نشده است' });
    }

    const ai = getGeminiClient(apiKey);
    const contents: any[] = [];

    if (imageBase64) {
      let mimeType = 'image/jpeg';
      let data = imageBase64;
      const match = /^data:([^;]+);base64,(.+)$/.exec(imageBase64);
      if (match) {
        mimeType = match[1];
        data = match[2];
      }
      contents.push({
        inlineData: { mimeType, data },
      });
    }

    const userPrompt = `تو مولف ارشد کتاب‌های درسی رسمی وزارت آموزش و پرورش ایران و طراح کنکور سراسری تجربی هستی.
درس: ${subject}
فصل انتخابی: ${chapter || 'تشخیص خودکار از روی کتاب درسی'}
گفتار / مبحث: ${goftar || 'تشخیص خودکار'}
متن یا سوال تکمیلی: ${customText || 'بررسی سوال موجود در تصویر'}

دستورالعمل الزامی و بدون تخطی:
۱. تمام تحلیل‌ها باید ۱۰۰٪ منطبق بر کتاب‌های درسی رسمی ایران (پایه‌های دهم، یازدهم و دوازدهم) باشد.
۲. گزینه درست را با استناد دقیق به متن، تصاویر و قیدهای کتاب درسی مشخص کن.
۳. علت نادرستی تک‌تک گزینه‌های دیگر را با استدلال خط‌به‌خط کتاب بنویس.
۴. دام تستی طراح کنکور را کالبدشکافی کن.

خروجی منحصراً JSON به این ساختار:
{
  "transcribed_question": "متن صورت سوال و گزینه‌ها",
  "book_reference": "پایه، فصل و گفتار دقیق کتاب درسی مرتبط با این سوال",
  "correct_option": "شماره یا عبارت گزینه صحیح",
  "detailed_explanation": "پاسخ تشریحی کامل و تحلیلی منطبق بر خط کتاب درسی",
  "rejected_options": [
    {"option": "گزینه نامعتبر ۱", "reason": "علت رد بر اساس متن کتاب درسی"},
    {"option": "گزینه نامعتبر ۲", "reason": "علت رد بر اساس متن کتاب درسی"}
  ],
  "traps_and_pitfalls": "دام‌های تستی و اشتباهات رایج داوطلبان در این تیپ سوال",
  "study_tip": "توصیه طلایی برای یادآوری این مبحث در جلسه آزمون"
}`;

    contents.push({ text: userPrompt });

    const response = await generateWithFallback(ai, {
      contents,
      config: {
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }, model);

    let parsed: any;
    try {
      parsed = parseModelJson(response.text || '');
    } catch (parseErr) {
      console.error('Photo solve parseModelJson failed:', parseErr, 'Raw:', response.text);
      return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
    }

    if (!parsed || (!parsed.detailed_explanation && !parsed.correct_option)) {
      return res.status(502).json({ ok: false, error: 'پاسخ مدل قابل خواندن نبود، دوباره تلاش کنید' });
    }

    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Photo solve error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// AI API: Document / PDF / Textbook Extractor
app.post('/api/ai/extract-doc', async (req: Request, res: Response) => {
  try {
    const { fileBase64, mimeType = 'application/pdf', apiKey, model } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ ok: false, error: 'فایل ارسال نشده است' });
    }

    const ai = getGeminiClient(apiKey);
    let cleanMime = mimeType;
    let cleanData = fileBase64;

    const match = /^data:([^;]+);base64,(.+)$/.exec(fileBase64);
    if (match) {
      cleanMime = match[1];
      cleanData = match[2];
    }

    const response = await generateWithFallback(ai, {
      contents: [
        {
          inlineData: {
            mimeType: cleanMime,
            data: cleanData,
          },
        },
        {
          text: 'متن آموزشی و کنکوری این صفحات را به دقت استخراج کن. فقط محتوای متنی، نکات و تعاریف کتاب را بدون اضافه کردن نظرات یا متن خارج از درس بنویس.',
        },
      ],
      config: {
        temperature: 0.1,
      },
    }, model);

    return res.json({ ok: true, text: (response.text || '').trim() });
  } catch (err: any) {
    console.error('Extract doc error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// AI API: Proactive Schedule Generator
app.post('/api/ai/proactive-schedule', async (req: Request, res: Response) => {
  try {
    const { goalMinutes, weakSubjects, dayName, gradeFocus, wakeTime, apiKey, model } = req.body;
    const ai = getGeminiClient(apiKey);

    const userPrompt = `دانش‌آموز کنکور تجربی نیازمند یک جدول برنامه درسی متعادل روزانه است:
هدف مطالعه: ${goalMinutes || 600} دقیقه (${((goalMinutes || 600) / 60).toFixed(1)} ساعت)
دروس نیازمند تقویت: ${(weakSubjects || ['زیست', 'شیمی']).join('، ')}
روز: ${dayName || 'فردا'}
تمرکز پایه: ${gradeFocus || 'ترکیبی دهم، یازدهم و دوازدهم'}
ساعت بیداری پیشنهادی: ${wakeTime || '۰۶:۰۰'}

یک جدول برنامه زمانی رنگی و دقیق با بازه‌های ۷۵ تا ۹۰ دقیقه‌ای به همراه پارت تست‌زنی و مرور شبانه تنظیم کن.
رنگ‌ها باید از میان این کلاس‌های رنگی باشند: 'blue', 'emerald', 'amber', 'purple', 'rose', 'cyan'.
خروجی منحصراً JSON با ساختار:
{
  "title": "برنامه متوازن روزانه کنکوریار",
  "day": "${dayName || 'فردا'}",
  "wake_time": "${wakeTime || '06:00'}",
  "description": "توضیح کوتاه مشاور درباره چیدمان پارت‌ها و رعایت پیش‌نیازها",
  "blocks": [
    {
      "time": "06:30 - 08:00",
      "subject": "زیست‌شناسی",
      "topic": "گفتار ۱ فصل ۳ دوازدهم + تست مفهومی",
      "type": "study",
      "color": "blue"
    },
    {
      "time": "08:15 - 09:45",
      "subject": "شیمی",
      "topic": "مسائل استوکیومتری یازدهم",
      "type": "test",
      "color": "purple"
    }
  ]
}`;

    const response = await generateWithFallback(ai, {
      contents: userPrompt,
      config: {
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }, model);

    const parsed = parseModelJson(response.text || '');
    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Proactive schedule error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// AI API: Proactive Advices Generator
app.post('/api/ai/proactive-advices', async (req: Request, res: Response) => {
  try {
    const { todayMinutes, goalMinutes, subjectMinutes, dueLeitnerCount, daysToExam, examTitle, streak, apiKey, model } = req.body;
    const ai = getGeminiClient(apiKey);

    const userPrompt = `اطلاعات لحظه‌ای دانش‌آموز:
- ساعت مطالعه امروز: ${Math.round(todayMinutes || 0)} دقیقه از هدف ${goalMinutes || 600} دقیقه
- تفکیک مطالعه دروس امروز: ${JSON.stringify(subjectMinutes || {})}
- کارت‌های لایتنر مانده برای مرور امروز: ${dueLeitnerCount || 0} کارت
- روزهای باقیمانده تا ${examTitle || 'کنکور'}: ${daysToExam || 0} روز
- زنجیره تداوم: ${streak || 0} روز

با هوش و دلسوزی موقعیت را ارزیابی کن و بین ۱ تا ۳ توصیه مشاوره‌ای پیش‌فعال و فوری تولید کن.
خروجی منحصراً JSON به این ساختار:
{
  "advices": [
    {
      "id": "adv_1",
      "type": "balance",
      "title": "عنوان هشدار یا توصیه",
      "message": "متن صمیمی و انگیزه‌بخش مشاور برای اصلاح وضعیت",
      "severity": "warning",
      "suggestedAction": {
        "type": "create_schedule",
        "label": "تنظیم برنامه متوازن پیشنهادی"
      }
    }
  ]
}`;

    const response = await generateWithFallback(ai, {
      contents: userPrompt,
      config: {
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }, model);

    const parsed = parseModelJson(response.text || '');
    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Proactive advices error:', err);
    const { status, error } = formatAiError(err);
    return res.status(status).json({ ok: false, error });
  }
});

// Mount Vite in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KonkoorYar 2.0 Server listening on port ${PORT}`);
  });
}

startServer();
