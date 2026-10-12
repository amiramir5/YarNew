import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS configuration for GitHub Pages, local dev, and custom hosts
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://amiramir5.github.io',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];

  if (process.env.ALLOWED_ORIGINS) {
    const extra = process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    allowedOrigins.push(...extra);
  }

  if (origin && (allowedOrigins.includes(origin) || origin.endsWith('.github.io') || origin.endsWith('.run.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
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

// Verified candidate models (active in @google/genai)
const CANDIDATE_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

async function generateWithFallback(ai: GoogleGenAI, params: any, preferredModel?: string) {
  const modelsToTry = preferredModel && CANDIDATE_MODELS.includes(preferredModel)
    ? [preferredModel, ...CANDIDATE_MODELS.filter((m) => m !== preferredModel)]
    : (preferredModel ? [preferredModel, ...CANDIDATE_MODELS] : CANDIDATE_MODELS);

  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        ...params,
        model,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} attempt failed:`, err?.message || err);
      // If authentication failure, don't keep cycling aliases
      if (err?.status === 401 || err?.message?.includes('401') || err?.message?.includes('UNAUTHENTICATED') || err?.message?.includes('API_KEY_INVALID')) {
        break;
      }
    }
  }
  throw lastError;
}

const SYSTEM_PROMPT = `Act as an expert Iranian educational/career counselor specializing in Iran's university admissions system (Konkur, Sanjesh, academic records, quotas, ranking, major selection, and admission outcomes).

Your information must be genuinely up to date:
- Before answering any time-sensitive question, search the web and verify the latest information, preferably from official Sanjesh, Ministry of Education, universities, and official notices.
- Know the latest developments and announcements, including what happened today.
- Never rely on outdated rules when newer regulations or announcements exist.
- Distinguish confirmed official information from unofficial reports, estimates, and your own analysis.

You must be highly knowledgeable about:
- Konkur regulations and scoring systems
- Academic-record/Final-exam effects and changes by year
- Quotas, regional classifications, and other admission quotas
- Rank, score, percentile, and how the Sanjesh report card works
- Course-by-course admission statistics
- Historical acceptance records and last-admitted ranks where reliable data exists
- University/major capacities, admission methods, and changes
- Day, evening, self-funded, Azad, Payam Noor, non-profit, and other Iranian higher-education options
- Major selection strategy and realistic acceptance ranges
- Comparing a student's profile against historical admission data

When analyzing a student's chances, do not invent acceptance statistics. Clearly label estimates and explain the evidence behind them.

For every important factual claim, provide the source and URL. If reliable evidence cannot be found, explicitly say:
"I don't know — no reliable source was found."

Respond in Persian.`;

// AI API: Topic Explanation
app.post('/api/ai/explain', async (req: Request, res: Response) => {
  try {
    const { topic, subject, apiKey, model } = req.body;
    if (!topic || !subject) {
      return res.status(400).json({ ok: false, error: 'موضوع و درس الزامی هستند.' });
    }

    const ai = getGeminiClient(apiKey);
    const userPrompt = `موضوع: ${topic}
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

    const response = await generateWithFallback(ai, {
      contents: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }, model);

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    // Validate required fields
    if (!parsed.title || !Array.isArray(parsed.key_points)) {
      return res.status(502).json({ ok: false, error: 'پاسخ دریافتی از هوش مصنوعی ساختار استاندارد ندارد.' });
    }

    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Explain error:', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'خطا در ارتباط با مدل هوش مصنوعی. لطفاً اتصال اینترنت یا کلید API خود را بررسی کنید.',
    });
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
      contents: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
      config: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    }, model);

    const text = response.text || '{"questions":[]}';
    const parsed = JSON.parse(text);

    // Validate questions schema and correct_index bounds
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return res.status(502).json({ ok: false, error: 'پاسخ هوش مصنوعی شامل لیست سوالات معتبر نبود.' });
    }

    for (const q of parsed.questions) {
      if (!q.stem || !Array.isArray(q.options) || q.options.length < 2) {
        return res.status(502).json({ ok: false, error: 'یکی از سوالات دارای گزینه‌های ناقص است.' });
      }
      const cIdx = Number(q.correct_index);
      if (isNaN(cIdx) || cIdx < 0 || cIdx >= q.options.length) {
        q.correct_index = 0; // Guard against out of bounds
      }
    }

    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Quiz error:', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'خطا در تولید آزمون هوشمند.',
    });
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
      contents: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }, model);

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Performance insights error:', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'خطا در دریافت تحلیل عملکرد از هوش مصنوعی.',
    });
  }
});

// AI API: Slide Deck Generator
app.post('/api/ai/slides', async (req: Request, res: Response) => {
  try {
    const { topic, subject = 'زیست‌شناسی', grade, chapter, goftar, count = 6, apiKey, model } = req.body;
    const cleanCount = Math.min(Math.max(Number(count) || 6, 3), 15);
    const ai = getGeminiClient(apiKey);

    const userPrompt = `تو استاد برجسته و طراح ارشد کنکور سراسری تجربی هستی.
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

    const response = await generateWithFallback(ai, {
      contents: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }, model);

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    if (!parsed.deck_title || !Array.isArray(parsed.slides)) {
      return res.status(502).json({ ok: false, error: 'پاسخ اسلایدها ساختار نامعتبر دارد.' });
    }

    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Slides error:', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'خطا در ساخت اسلایدهای آموزشی.',
    });
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
      contents: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }, model);

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Mistakes analysis error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err.message || 'خطا در تحلیل شناختی اشتباهات' });
  }
});

// AI API: Study Coach Chat
app.post('/api/ai/coach', async (req: Request, res: Response) => {
  try {
    const { message, context, mode, history = [], apiKey, model } = req.body;
    const ai = getGeminiClient(apiKey);

    const promptText = `اطلاعات و وضعیت ثبت‌شده داوطلب در سیستم:
${JSON.stringify(context || {}, null, 2)}

تاریخچه گفتگوی اخیر:
${(history || []).slice(-6).map((h: any) => `${h.role === 'user' ? 'داوطلب' : 'مشاور'}: ${h.text}`).join('\n')}

حالت پیام: ${mode || 'عمومی'}
پرسش یا پیام داوطلب: ${message || 'وضعیت من را تحلیل کن و یک برنامه تخصصی و عملیاتی بگو'}

دستورالعمل پاسخ:
- به عنوان مشاور ارشد و متخصص کنکور و پذیرش دانشگاه‌ها پاسخ بده.
- تحلیل‌هایت دقیق، مستند، حرفه‌ای و کاربردی باشد.
- برای هر ادعای آماری یا ضوابط کلیدی کنکور و سوابق تحصیلی، منبع معتبر ذکر کن.
- ساختاربندی و دسته‌بندی منظم و شفاف با تیترها و نکات کلیدی به زبان فارسی ارائه کن.`;

    const response = await generateWithFallback(ai, {
      contents: `${SYSTEM_PROMPT}\n\n${promptText}`,
      config: {
        temperature: 0.3,
        tools: [{ googleSearch: {} }],
      },
    }, model);

    return res.json({ ok: true, text: response.text || '' });
  } catch (err: any) {
    console.error('Coach error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err.message || 'خطا در ارتباط با مشاور هوشمند' });
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
    console.error('OCR error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err.message || 'خطا در استخراج متن از تصویر' });
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

    contents.push({ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` });

    const response = await generateWithFallback(ai, {
      contents,
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }, model);

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    if (!parsed.detailed_explanation && !parsed.correct_option) {
      return res.status(502).json({ ok: false, error: 'پاسخ دریافتی برای سوال تصویری ناقص است.' });
    }

    return res.json({ ok: true, data: parsed });
  } catch (err: any) {
    console.error('Photo solve error:', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'خطا در حل تصویری سوال. لطفاً وضوح تصویر یا اتصال هوش مصنوعی را بررسی کنید.',
    });
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
    console.error('Extract doc error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err.message || 'خطا در خواندن فایل یا PDF کتاب' });
  }
});

// AI API: Test OpenRouter Connection
app.post('/api/ai/test-openrouter', async (req: Request, res: Response) => {
  try {
    const { apiKey, model = 'openrouter/free' } = req.body;
    if (!apiKey) {
      return res.status(400).json({ ok: false, error: 'کلید OpenRouter وارد نشده است' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'openrouter/free',
        messages: [{ role: 'user', content: 'پاسخ کوتاه بده: سلام' }],
        max_tokens: 15,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ ok: false, error: `خطای OpenRouter (${response.status}): ${errText.slice(0, 100)}` });
    }

    return res.json({ ok: true, message: 'اتصال به OpenRouter با موفقیت تایید شد.' });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || 'خطا در اتصال به OpenRouter' });
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
