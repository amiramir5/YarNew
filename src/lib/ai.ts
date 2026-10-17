import {
  MistakesAnalysis,
  QuizQuestion,
  SlideDeck,
  TopicExplanation,
  ScheduleProposal,
  ProactiveAdvice,
} from '../types';
import { loadSettings } from './storage';
import { getSupabaseClient } from './supabase';

/**
 * Returns configured backend API base URL from VITE_API_BASE_URL
 */
export function getApiBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  return '';
}

/**
 * Creates authentication and content-type headers for AI backend requests
 */
async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data } = await client.auth.getSession();
      const token = data?.session?.access_token;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch (err) {
    console.warn('Failed to retrieve Supabase session token for AI request:', err);
  }
  return headers;
}

/**
 * Clean and parse JSON from AI response text
 */
function cleanAndParseJson<T = any>(text: string): T {
  let cleaned = (text || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  cleaned = cleaned.trim();

  // If there's leading or trailing text around json object or array
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = cleaned.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = cleaned.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  return JSON.parse(cleaned) as T;
}

/**
 * Direct client-side call to Google Gemini REST API
 */
async function callGeminiDirect(params: {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  prompt: string;
  inlineData?: { mimeType: string; data: string };
  temperature?: number;
  responseMimeType?: string;
}): Promise<string> {
  const model = params.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  const parts: any[] = [];
  if (params.inlineData) {
    parts.push({
      inline_data: {
        mime_type: params.inlineData.mimeType,
        data: params.inlineData.data,
      },
    });
  }
  parts.push({ text: params.prompt });

  const body: any = {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      temperature: params.temperature ?? 0.3,
    },
  };

  if (params.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: params.systemInstruction }],
    };
  }

  if (params.responseMimeType === 'application/json') {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const errMsg = errJson?.error?.message || `خطای جمنای (${res.status})`;
    if (res.status === 400 && errMsg.includes('API_KEY_INVALID')) {
      throw new Error('کلید Google Gemini واردشده نامعتبر است. لطفاً کلید صحیح را از Google AI Studio دریافت و در تنظیمات وارد کنید.');
    }
    if (res.status === 429) {
      throw new Error('سهمیه کلید جمنای موقتاً تمام شده است. لطفاً یک دقیقه دیگر تلاش کنید.');
    }
    throw new Error(errMsg);
  }

  const data = await res.json();
  const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidateText) {
    throw new Error('مدل جمنای پاسخی تولید نکرد.');
  }
  return candidateText;
}

/**
 * Direct client-side call to OpenRouter / DeepSeek
 */
async function callOpenRouterDirect(params: {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
  responseMimeType?: string;
}): Promise<string> {
  const model = params.model || 'deepseek/deepseek-chat';
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  const messages: Array<{ role: string; content: string }> = [];
  if (params.systemInstruction) {
    messages.push({ role: 'system', content: params.systemInstruction });
  }
  messages.push({ role: 'user', content: params.prompt });

  const body: any = {
    model,
    messages,
    temperature: params.temperature ?? 0.3,
  };

  if (params.responseMimeType === 'application/json') {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey.trim()}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://konkuryar.app',
      'X-Title': 'KonkurYar Proactive AI Counselor',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const errMsg = errJson?.error?.message || `خطای OpenRouter/DeepSeek (${res.status})`;
    if (res.status === 401) {
      throw new Error('کلید OpenRouter نامعتبر است. لطفاً کلید معتبر را در تنظیمات وارد فرمایید.');
    }
    if (res.status === 402) {
      throw new Error('اعتبار حساب OpenRouter کافی نیست. لطفاً مدل یا کلید را بررسی کنید.');
    }
    throw new Error(errMsg);
  }

  const data = await res.json();
  const choice = data?.choices?.[0]?.message?.content;
  if (!choice) {
    throw new Error('پاسخی از مدل OpenRouter/DeepSeek دریافت نشد.');
  }
  return choice;
}

/**
 * Execute AI prompt: prioritizes user personal key, with fallback to backend or client direct
 */
async function executeAiTask(params: {
  apiPath: string;
  backendPayload: any;
  systemInstruction: string;
  userPrompt: string;
  responseMimeType?: string;
  temperature?: number;
  inlineData?: { mimeType: string; data: string };
  customKey?: string;
  preferredModel?: string;
}): Promise<string> {
  const settings = loadSettings();
  const provider = settings.ai.provider || 'gemini';
  const geminiKey = params.customKey || settings.ai.geminiKey?.trim() || '';
  const openrouterKey = settings.ai.openrouterKey?.trim() || '';
  const geminiModel = params.preferredModel || settings.ai.geminiModel || 'gemini-2.5-flash';
  const openrouterModel = settings.ai.openrouterModel || 'deepseek/deepseek-chat';
  const baseUrl = getApiBaseUrl();
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

  // Case 1: User explicitly configured OpenRouter
  if (provider === 'openrouter' && openrouterKey) {
    return await callOpenRouterDirect({
      apiKey: openrouterKey,
      model: openrouterModel,
      systemInstruction: params.systemInstruction,
      prompt: params.userPrompt,
      temperature: params.temperature,
      responseMimeType: params.responseMimeType,
    });
  }

  // Case 2: On GitHub Pages without custom backend server, but user has Gemini key
  if (isGitHubPages && !baseUrl && geminiKey) {
    return await callGeminiDirect({
      apiKey: geminiKey,
      model: geminiModel,
      systemInstruction: params.systemInstruction,
      prompt: params.userPrompt,
      inlineData: params.inlineData,
      temperature: params.temperature,
      responseMimeType: params.responseMimeType,
    });
  }

  // Case 3: On GitHub Pages without server and without any key
  if (isGitHubPages && !baseUrl && !geminiKey && !openrouterKey) {
    throw new Error(
      'برای استفاده از هوش مصنوعی در هاست گیت‌هاب پیجز، لطفاً کلید رایگان Google Gemini را از Google AI Studio (aistudio.google.com/app/apikey) دریافت کرده و در بخش تنظیمات برنامه وارد فرمایید، یا کلید OpenRouter/DeepSeek را ثبت کنید.'
    );
  }

  // Case 4: Try backend endpoint first
  try {
    const url = `${baseUrl}${params.apiPath}`;
    const payload = {
      ...params.backendPayload,
      apiKey: geminiKey || undefined,
      model: geminiModel || undefined,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.ok) {
        if (typeof json.text === 'string') return json.text;
        if (json.data) return typeof json.data === 'string' ? json.data : JSON.stringify(json.data);
      }
      if (json.error) throw new Error(json.error);
    }

    // If backend returns 404 or fails and user has personal key, fallback to direct client!
    if ((res.status === 404 || res.status >= 500) && geminiKey) {
      console.warn(`Backend returned ${res.status}, falling back to direct client-side Gemini...`);
      return await callGeminiDirect({
        apiKey: geminiKey,
        model: geminiModel,
        systemInstruction: params.systemInstruction,
        prompt: params.userPrompt,
        inlineData: params.inlineData,
        temperature: params.temperature,
        responseMimeType: params.responseMimeType,
      });
    }

    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در دریافت پاسخ از سرور (${res.status})`);
  } catch (err: any) {
    // If network error occurred and user has personal key, direct fallback
    if (geminiKey) {
      console.warn('Network error reaching backend, trying direct Gemini client call:', err);
      return await callGeminiDirect({
        apiKey: geminiKey,
        model: geminiModel,
        systemInstruction: params.systemInstruction,
        prompt: params.userPrompt,
        inlineData: params.inlineData,
        temperature: params.temperature,
        responseMimeType: params.responseMimeType,
      });
    }
    if (openrouterKey) {
      console.warn('Network error reaching backend, trying direct OpenRouter client call:', err);
      return await callOpenRouterDirect({
        apiKey: openrouterKey,
        model: openrouterModel,
        systemInstruction: params.systemInstruction,
        prompt: params.userPrompt,
        temperature: params.temperature,
        responseMimeType: params.responseMimeType,
      });
    }
    throw err;
  }
}

const DEFAULT_SYSTEM_INSTRUCTION = `تو طراح ارشد کنکور سراسری تجربی و مشاور رسمی دانشگاه‌های برتر ایران هستی.
اطلاعاتت را بر اساس کتب درسی رسمی ایران (پایه‌های دهم، یازدهم و دوازدهم)، آخرین مصوبات سازمان سنجش، بانک سوالات کانون فرهنگی آموزش (قلم‌چی)، پایگاه هیوا و شبکه ملی مدارس رشد مستند کن.
خروجی باید منحصراً JSON معتبر مطابق فیلدهای خواسته‌شده باشد بدون هیچ متن یا مقدمه اضافی.`;

export async function explainTopic(
  topic: string,
  subject: string,
  customKey?: string,
  model?: string,
  sourceText?: string
): Promise<TopicExplanation> {
  const sourceClause = sourceText
    ? `\nتوجه الزامی: پاسخ باید منحصراً بر پایه متن منبع درسی زیر که توسط کاربر آپلود شده است تدوین شود:\n--- منبع ---\n${sourceText.slice(0, 4000)}\n--- پایان منبع ---\n`
    : '';

  const userPrompt = `موضوع: ${topic}
درس: ${subject}
${sourceClause}
این مبحث را در چارچوب کتاب درسی رسمی و کنکور سراسری تجربی و مصوبات سنجش تشریح کن.
خروجی منحصراً JSON معتبر با این ساختار:
{
  "title": "عنوان مبحث",
  "intro": "یک پاراگراف مقدمه کلیدی (۲ تا ۳ خط)",
  "key_points": [
    {"heading": "تیتر نکته", "explanation": "توضیح مفهومی و کاربردی"}
  ],
  "formulas": ["فرمول یا قاعده تستی طلایی"],
  "pitfalls": ["دام تستی رایج طراحان کنکور"],
  "study_tip": "یک توصیه تکنیکی و نحوه تست‌زنی این مبحث بر اساس الگوهای قلم‌چی و کنکور"
}`;

  const raw = await executeAiTask({
    apiPath: '/api/ai/explain',
    backendPayload: { topic, subject, sourceText },
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    userPrompt,
    responseMimeType: 'application/json',
    temperature: 0.3,
    customKey,
    preferredModel: model,
  });

  return cleanAndParseJson<TopicExplanation>(raw);
}

export async function generateQuiz(
  subject: string,
  chapter: string,
  topic: string,
  level: string,
  count: number,
  sourceText?: string,
  model?: string
): Promise<QuizQuestion[]> {
  const sourceClause = sourceText
    ? `\nسوالات باید منحصراً از متن زیر طراحی شوند:\n--- متن منبع ---\n${sourceText.slice(0, 4000)}\n--- پایان متن ---\n`
    : '';

  const userPrompt = `درس: ${subject}
فصل: ${chapter}
مبحث: ${topic}
سطح دشواری: ${level}
تعداد سوال: ${count}
${sourceClause}
تعدادی تست استاندارد کنکور تجربی ایران همراه با ۴ گزینه، شماره گزینه درست (از ۰ تا ۳) و پاسخ تشریحی جامع با ارجاع به صفحه و قیدهای کتاب درسی طراحی کن.
خروجی منحصراً JSON با ساختار:
{
  "questions": [
    {
      "stem": "متن صورت تست",
      "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
      "correct_index": 0,
      "explanation": "پاسخ تشریحی کامل با تحلیل دام طراح و رد سایر گزینه‌ها",
      "source": "کتاب درسی / تست مشابه کنکور و قلم‌چی"
    }
  ]
}`;

  const raw = await executeAiTask({
    apiPath: '/api/ai/quiz',
    backendPayload: { subject, chapter, topic, level, count, sourceText },
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    userPrompt,
    responseMimeType: 'application/json',
    temperature: 0.4,
    preferredModel: model,
  });

  const parsed = cleanAndParseJson<{ questions: QuizQuestion[] }>(raw);
  return parsed.questions || [];
}

export async function generateSlides(
  topicOrParams: string | { topic?: string; subject: string; grade?: string; chapter?: string; goftar?: string; count?: number; model?: string; sourceText?: string },
  subjectName?: string,
  slideCount?: number
): Promise<SlideDeck> {
  let topic = typeof topicOrParams === 'string' ? topicOrParams : topicOrParams.topic || 'مبحث کنکور';
  let subject = typeof topicOrParams === 'string' ? (subjectName || 'زیست‌شناسی') : topicOrParams.subject;
  let count = typeof topicOrParams === 'string' ? (slideCount || 6) : (topicOrParams.count || 6);
  let grade = typeof topicOrParams === 'object' ? topicOrParams.grade : undefined;
  let chapter = typeof topicOrParams === 'object' ? topicOrParams.chapter : undefined;
  let goftar = typeof topicOrParams === 'object' ? topicOrParams.goftar : undefined;
  let sourceText = typeof topicOrParams === 'object' ? topicOrParams.sourceText : undefined;

  const sourceClause = sourceText
    ? `\nاسلایدها باید منحصراً بر پایه متن منبع زیر تدوین شوند:\n${sourceText.slice(0, 4000)}\n`
    : '';

  const userPrompt = `موضوع: ${topic}
درس: ${subject} ${grade ? `(پایه ${grade})` : ''} ${chapter ? `(فصل: ${chapter})` : ''} ${goftar ? `(گفتار: ${goftar})` : ''}
تعداد اسلاید: ${count}
${sourceClause}
تمام اسلایدها باید ۱۰۰٪ در چارچوب کتاب‌های درسی رسمی وزارت آموزش و پرورش ایران تدوین شوند. قیدهای کتاب درسی، شکل‌ها و دام‌های تستی طراحان کنکور سال‌های اخیر را بگنجان.
خروجی منحصراً JSON با ساختار:
{
  "deck_title": "عنوان کلی اسلایدها",
  "slides": [
    {
      "title": "عنوان اسلاید",
      "bullets": ["نکته خط‌به‌خط ۱", "نکته مفهومی یا قید کتاب ۲", "دام تستی کنکور ۳"],
      "image_prompt": "توصیف دقیق شکل یا نمودار کتاب درسی"
    }
  ]
}`;

  const raw = await executeAiTask({
    apiPath: '/api/ai/slides',
    backendPayload: { topic, subject, grade, chapter, goftar, count, sourceText },
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    userPrompt,
    responseMimeType: 'application/json',
    temperature: 0.3,
  });

  return cleanAndParseJson<SlideDeck>(raw);
}

export async function analyzeMistakes(
  items: Array<{ subject: string; cause: string; question: string }>,
  model?: string
): Promise<MistakesAnalysis> {
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
  "honest": "یک تحلیل صریح، دلسوزانه و انگیزاننده از وضعیت فعلی دانش‌آموز"
}`;

  const raw = await executeAiTask({
    apiPath: '/api/ai/mistakes-analysis',
    backendPayload: { items },
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    userPrompt,
    responseMimeType: 'application/json',
    temperature: 0.3,
    preferredModel: model,
  });

  return cleanAndParseJson<MistakesAnalysis>(raw);
}

const COACH_SYSTEM_PROMPT = `تو یک مشاور زبده، باهوش، مهربان و فوق‌العاده هوشیار کنکور سراسری تجربی و دانشگاه‌های ایران هستی.
اطلاعاتت کاملاً به‌روز و مستند بر کتب درسی رسمی (دهم، یازدهم، دوازدهم)، آخرین مصوبات سازمان سنجش، تحلیل‌های کانون قلم‌چی، پایگاه هیوا و شبکه رشد است.
لحن تو صمیمی، دلسوزانه، انرژی‌بخش، دقیق و واقع‌بینانه است (مانند مشاوری که کنار میز مطالعه دانش‌آموز نشسته و حواسش به تمام جزئیات هست).
پاسخ‌هایت باید ساختاریافته، جذاب و کاربردی باشند و در صورت درخواست برنامه، جدول زمانی واضح با تفکیک ساعات روزانه پیشنهاد دهی.
پاسخ‌ها را به زبان فارسی سلیس و بدون عبارات کلیشه‌ای ارائه کن.`;

export async function consultCoach(
  message: string,
  context: any,
  mode: string,
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  model?: string,
  sourceText?: string
): Promise<string> {
  const historyText = (history || [])
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'دانش‌آموز' : 'مشاور'}: ${h.text}`)
    .join('\n');

  const sourceClause = sourceText
    ? `\nتوجه مهم: دانش‌آموز منبع درسی اختصاصی زیر را ضمیمه کرده است. پاسخ تو باید دقیقاً بر پایه این متن داده شود و مطالب متفرقه خارج از این منبع اضافه نشود:\n--- منبع درسی ---\n${sourceText.slice(0, 4000)}\n--- پایان منبع ---\n`
    : '';

  const userPrompt = `زمینه وضعیت درسی و عملکرد دانش‌آموز:
${JSON.stringify(context || {}, null, 2)}
${sourceClause}
تاریخچه مکالمه اخیر:
${historyText}

پیام جدید دانش‌آموز:
${message}

پاسخ مشاوره‌ای خود را با تحلیل دقیق و راهکارهای کاملاً عملیاتی بنویس.`;

  return await executeAiTask({
    apiPath: '/api/ai/coach',
    backendPayload: { message, context, mode, history, sourceText },
    systemInstruction: COACH_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.35,
    preferredModel: model,
  });
}

export async function extractOcrText(imageBase64: string, model?: string): Promise<string> {
  let mimeType = 'image/jpeg';
  let cleanData = imageBase64;
  const match = /^data:([^;]+);base64,(.+)$/.exec(imageBase64);
  if (match) {
    mimeType = match[1];
    cleanData = match[2];
  }

  const userPrompt = 'متن دقیق، تمام گزینه‌ها، فرمول‌ها و نکات موجود در این تصویر تست کنکور را به صورت فارسی استخراج کن.';

  return await executeAiTask({
    apiPath: '/api/ai/ocr',
    backendPayload: { imageBase64 },
    systemInstruction: 'متن و فرمول‌های تصویر را با دقت بسیار بالا به فارسی بنویس.',
    userPrompt,
    inlineData: { mimeType, data: cleanData },
    temperature: 0.1,
    preferredModel: model,
  });
}

export interface PhotoSolveResult {
  transcribed_question: string;
  book_reference: string;
  correct_option: string;
  detailed_explanation: string;
  rejected_options?: Array<{ option: string; reason: string }>;
  traps_and_pitfalls?: string;
  study_tip?: string;
}

export async function solvePhotoQuestion(params: {
  imageBase64?: string;
  subject: string;
  chapter?: string;
  goftar?: string;
  customText?: string;
  model?: string;
  sourceText?: string;
}): Promise<PhotoSolveResult> {
  let inlineData: { mimeType: string; data: string } | undefined;
  if (params.imageBase64) {
    let mimeType = 'image/jpeg';
    let cleanData = params.imageBase64;
    const match = /^data:([^;]+);base64,(.+)$/.exec(params.imageBase64);
    if (match) {
      mimeType = match[1];
      cleanData = match[2];
    }
    inlineData = { mimeType, data: cleanData };
  }

  const sourceClause = params.sourceText
    ? `\nمنبع درسی ضمیمه‌شده: پاسخ منحصراً بر پایه این متن داده شود:\n${params.sourceText.slice(0, 4000)}\n`
    : '';

  const userPrompt = `تو مولف ارشد کتب درسی رسمی ایران و طراح تست‌های سراسری تجربی و کانون قلم‌چی هستی.
درس: ${params.subject}
فصل انتخابی: ${params.chapter || 'تشخیص خودکار'}
گفتار / مبحث: ${params.goftar || 'تشخیص خودکار'}
متن تکمیلی: ${params.customText || 'بررسی سوال موجود در تصویر'}
${sourceClause}

دستورالعمل بدون تخطی:
۱. تحلیل ۱۰۰٪ منطبق بر کتاب‌های درسی رسمی ایران (پایه‌های دهم، یازدهم و دوازدهم) و خط‌به‌خط قیدها باشد.
۲. گزینه درست را با استناد دقیق مشخص کن.
۳. علت نادرستی تک‌تک گزینه‌های دیگر را با استدلال خط کتاب بیان کن.
۴. دام تستی طراح را کالبدشکافی کن.

خروجی منحصراً JSON به این ساختار:
{
  "transcribed_question": "متن صورت سوال و گزینه‌ها",
  "book_reference": "پایه، فصل و گفتار دقیق کتاب درسی مرتبط",
  "correct_option": "شماره یا عبارت گزینه صحیح",
  "detailed_explanation": "پاسخ تشریحی کامل و تحلیلی منطبق بر خط کتاب درسی",
  "rejected_options": [
    {"option": "گزینه نادرست ۱", "reason": "علت رد بر اساس متن کتاب درسی"},
    {"option": "گزینه نادرست ۲", "reason": "علت رد بر اساس متن کتاب درسی"}
  ],
  "traps_and_pitfalls": "دام‌های تستی و اشتباهات رایج داوطلبان در قلم‌چی و کنکور",
  "study_tip": "توصیه طلایی برای یادآوری این مبحث در جلسه آزمون"
}`;

  const raw = await executeAiTask({
    apiPath: '/api/ai/photo-solve',
    backendPayload: params,
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    userPrompt,
    inlineData,
    responseMimeType: 'application/json',
    temperature: 0.2,
    preferredModel: params.model,
  });

  return cleanAndParseJson<PhotoSolveResult>(raw);
}

export async function getPerformanceInsights(metrics: {
  weekMinutes: number;
  totalMinutes: number;
  streak: number;
  testsCount: number;
  avgExamPercent: number | null;
  subjectMinutes: Record<string, number>;
}, model?: string): Promise<{
  status: string;
  strengths: string[];
  weaknesses: string[];
  actionItems: string[];
  summary: string;
}> {
  const userPrompt = `متریک‌های عملکرد داوطلب کنکور:
${JSON.stringify(metrics, null, 2)}

تحلیل هوشمند و متوازن از ساعت مطالعه، درصدها، زنجیره استمرار و توزیع دروس ارائه بده.
خروجی منحصراً JSON:
{
  "status": "عالی / در مسیر رشد / نیازمند اصلاح تعادل",
  "strengths": ["نقطه قوت ۱", "نقطه قوت ۲"],
  "weaknesses": ["نقطه ضعف یا کم‌کاری در درس خاص"],
  "actionItems": ["اقدام عملی فوری ۱", "اقدام عملی ۲"],
  "summary": "یک پاراگراف جمع‌بندی الهام‌بخش و هدف‌دار"
}`;

  const raw = await executeAiTask({
    apiPath: '/api/ai/performance-insights',
    backendPayload: { metrics },
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    userPrompt,
    responseMimeType: 'application/json',
    temperature: 0.3,
    preferredModel: model,
  });

  return cleanAndParseJson(raw);
}

export async function extractDocumentText(fileBase64: string, mimeType: string, model?: string): Promise<string> {
  let cleanMime = mimeType;
  let cleanData = fileBase64;
  const match = /^data:([^;]+);base64,(.+)$/.exec(fileBase64);
  if (match) {
    cleanMime = match[1];
    cleanData = match[2];
  }

  const userPrompt = 'متن آموزشی و کنکوری این مدرک را به دقت استخراج کن. فقط نکات و متن درسی را بدون حاشیه بنویس.';

  return await executeAiTask({
    apiPath: '/api/ai/extract-doc',
    backendPayload: { fileBase64, mimeType },
    systemInstruction: 'متن مدارک و جزوات درسی را با دقت کامل استخراج کن.',
    userPrompt,
    inlineData: { mimeType: cleanMime, data: cleanData },
    temperature: 0.1,
    preferredModel: model,
  });
}

/**
 * Proactive Schedule Proposal Generator
 */
export async function generateProactiveSchedule(params: {
  goalMinutes?: number;
  weakSubjects?: string[];
  dayName?: string;
  gradeFocus?: string;
  wakeTime?: string;
  model?: string;
}): Promise<ScheduleProposal> {
  const userPrompt = `دانش‌آموز کنکور تجربی نیازمند یک جدول برنامه درسی متعادل روزانه است:
هدف مطالعه: ${params.goalMinutes || 600} دقیقه (${((params.goalMinutes || 600) / 60).toFixed(1)} ساعت)
دروس نیازمند تقویت: ${(params.weakSubjects || ['زیست', 'شیمی']).join('، ')}
روز: ${params.dayName || 'فردا'}
تمرکز پایه: ${params.gradeFocus || 'ترکیبی دهم، یازدهم و دوازدهم'}
ساعت بیداری پیشنهادی: ${params.wakeTime || '۰۶:۰۰'}

یک جدول برنامه زمانی رنگی و دقیق با بازه‌های ۷۵ تا ۹۰ دقیقه‌ای به همراه پارت تست‌زنی و مرور شبانه تنظیم کن.
رنگ‌ها باید از میان این کلاس‌های رنگی باشند: 'blue', 'emerald', 'amber', 'purple', 'rose', 'cyan'.
خروجی منحصراً JSON با ساختار:
{
  "title": "برنامه متوازن روزانه کنکوریار",
  "day": "${params.dayName || 'فردا'}",
  "wake_time": "${params.wakeTime || '06:00'}",
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

  const raw = await executeAiTask({
    apiPath: '/api/ai/proactive-schedule',
    backendPayload: params,
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    userPrompt,
    responseMimeType: 'application/json',
    temperature: 0.3,
    preferredModel: params.model,
  });

  return cleanAndParseJson<ScheduleProposal>(raw);
}

/**
 * Proactive Advice & Warning Generator
 */
export async function generateProactiveAdvice(params: {
  todayMinutes: number;
  goalMinutes: number;
  subjectMinutes: Record<string, number>;
  dueLeitnerCount: number;
  daysToExam: number;
  examTitle: string;
  streak: number;
  model?: string;
}): Promise<ProactiveAdvice[]> {
  const userPrompt = `اطلاعات لحظه‌ای دانش‌آموز:
- ساعت مطالعه امروز: ${Math.round(params.todayMinutes)} دقیقه از هدف ${params.goalMinutes} دقیقه
- تفکیک مطالعه دروس امروز: ${JSON.stringify(params.subjectMinutes)}
- کارت‌های لایتنر مانده برای مرور امروز: ${params.dueLeitnerCount} کارت
- روزهای باقیمانده تا ${params.examTitle}: ${params.daysToExam} روز
- زنجیره تداوم: ${params.streak} روز

با هوش و دلسوزی موقعیت را ارزیابی کن:
۱. آیا مطالعه امروز نسبت به هدف کم بوده؟
۲. آیا فقط یک درس خوانده شده و تعادل دروس به هم خورده؟
۳. آیا پایه‌ها فراموش شده‌اند؟
۴. آیا کارت‌های لایتنر امروز مانده و خطر فراموشی هست؟

بین ۱ تا ۳ توصیه مشاوره‌ای پیش‌فعال و فوری تولید کن.
خروجی منحصراً JSON به این ساختار:
{
  "advices": [
    {
      "id": "adv_1",
      "type": "balance",
      "title": "عدم تعادل در مطالعه دروس امروز",
      "message": "متن صمیمی و انگیزه‌بخش مشاور برای اصلاح وضعیت",
      "severity": "warning",
      "suggestedAction": {
        "type": "create_schedule",
        "label": "تنظیم برنامه متوازن پیشنهادی"
      }
    }
  ]
}`;

  try {
    const raw = await executeAiTask({
      apiPath: '/api/ai/proactive-advices',
      backendPayload: params,
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
      userPrompt,
      responseMimeType: 'application/json',
      temperature: 0.3,
      preferredModel: params.model,
    });

    const parsed = cleanAndParseJson<{ advices: ProactiveAdvice[] }>(raw);
    return parsed.advices || [];
  } catch (err) {
    console.warn('Failed to fetch AI proactive advice, generating rule-based advice fallback:', err);
    // Rule-based fallback if offline/no response
    const fallbacks: ProactiveAdvice[] = [];
    if (params.todayMinutes < params.goalMinutes * 0.4) {
      fallbacks.push({
        id: 'rule_study_vol',
        type: 'study_volume',
        title: 'زمان مطالعه کمتر از حد انتظار',
        message: `امروز تا الان ${Math.round(params.todayMinutes / 60)} ساعت خوندی؛ هنوز وقت داری با یک پارت متمرکز به هدف ${Math.round(params.goalMinutes / 60)} ساعته برسی!`,
        severity: 'info',
        suggestedAction: { type: 'start_timer', label: 'شروع تایمر مطالعه' },
        created_at: Date.now(),
      });
    }

    if (params.dueLeitnerCount > 0) {
      fallbacks.push({
        id: 'rule_leitner',
        type: 'leitner_due',
        title: `${params.dueLeitnerCount} کارت مرور لایتنر منتظر شماست`,
        message: 'مرور به موقع تست‌های غلط خورده، تثبیت حافظه بلندمدت و جلوگیری از تکرار اشتباه در کنکور است.',
        severity: 'warning',
        suggestedAction: { type: 'view_leitner', label: 'ورود به جعبه لایتنر' },
        created_at: Date.now(),
      });
    }

    return fallbacks;
  }
}

/**
 * Universal AI Connection Tester for Gemini & OpenRouter
 */
export async function testAiConnection(
  customKeyOrProvider?: string,
  modelOrKey?: string,
  extraModel?: string
): Promise<{ ok: boolean; message: string }> {
  let provider = 'gemini';
  let key: string | undefined;
  let targetModel: string | undefined;

  if (customKeyOrProvider === 'openrouter') {
    provider = 'openrouter';
    key = modelOrKey;
    targetModel = extraModel || 'deepseek/deepseek-chat';
  } else if (customKeyOrProvider === 'gemini') {
    provider = 'gemini';
    key = modelOrKey;
    targetModel = extraModel || 'gemini-2.5-flash';
  } else {
    key = customKeyOrProvider;
    targetModel = modelOrKey;
  }

  try {
    if (provider === 'openrouter' && key) {
      const res = await callOpenRouterDirect({
        apiKey: key,
        model: targetModel || 'deepseek/deepseek-chat',
        prompt: 'سلام! یک جمله کوتاه تاییدی بنویس که اتصال برقرار است.',
        temperature: 0.1,
      });
      if (res && res.trim().length > 0) {
        return { ok: true, message: `اتصال OpenRouter (${targetModel}) با موفقیت تایید شد.` };
      }
    } else {
      const res = await explainTopic('سینتیک شیمیایی', 'شیمی', key, targetModel);
      if (res && res.title) {
        return { ok: true, message: 'اتصال هوش مصنوعی Gemini تایید شد و پاسخ آزمایشی با موفقیت دریافت گردید.' };
      }
    }
    return { ok: false, message: 'پاسخ دریافتی ناقص بود.' };
  } catch (err: any) {
    return { ok: false, message: err.message || 'خطا در برقراری ارتباط با مدل هوش مصنوعی' };
  }
}
