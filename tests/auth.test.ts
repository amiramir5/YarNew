import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAuthRedirectUrl,
  DEFAULT_PRODUCTION_URL,
  translateSupabaseAuthError,
  isPasswordRecoveryRequested,
  consumePasswordRecoveryRequested,
  checkAuthUrl,
  updateUserPassword,
  resetPasswordForEmail,
  signInWithEmail,
  signUpWithEmail,
} from '../src/lib/auth';

describe('Supabase Auth Redirect URL & Production Configuration', () => {
  it('returns canonical production GitHub Pages URL by default', () => {
    const url = getAuthRedirectUrl();
    assert.equal(url, 'https://amiramir5.github.io/YarNew/');
    assert.equal(url, DEFAULT_PRODUCTION_URL);
    assert.ok(url.endsWith('/'));
    assert.ok(!url.includes('localhost'), 'Must never point to localhost');
  });
});

describe('Supabase Auth Error Translation to Persian', () => {
  it('accurately translates invalid login credentials', () => {
    const msg = translateSupabaseAuthError('Invalid login credentials');
    assert.equal(msg, 'ایمیل یا رمز عبور اشتباه است. لطفاً مجدداً بررسی فرمایید.');

    const grantMsg = translateSupabaseAuthError('invalid_grant: user not authorized');
    assert.equal(grantMsg, 'ایمیل یا رمز عبور اشتباه است. لطفاً مجدداً بررسی فرمایید.');
  });

  it('accurately translates expired recovery and confirmation links', () => {
    const expiredMsg = translateSupabaseAuthError('Email link is invalid or has expired');
    assert.equal(
      expiredMsg,
      'پیوند بازیابی یا تأیید ایمیل منقضی شده یا نامعتبر است. لطفاً مجدداً درخواست ارسال نمایید.'
    );

    const otpMsg = translateSupabaseAuthError('otp_expired: token expired');
    assert.equal(
      otpMsg,
      'پیوند بازیابی یا تأیید ایمیل منقضی شده یا نامعتبر است. لطفاً مجدداً درخواست ارسال نمایید.'
    );
  });

  it('accurately translates missing auth recovery session', () => {
    const sessionMsg = translateSupabaseAuthError('Auth session missing!');
    assert.equal(
      sessionMsg,
      'نشست بازیابی رمز یافت نشد یا منقضی شده است. لطفاً مجدداً درخواست بازیابی ثبت کنید.'
    );
  });

  it('accurately translates rate limit notices', () => {
    const rateMsg = translateSupabaseAuthError('Over email rate limit');
    assert.equal(
      rateMsg,
      'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه دیگر مجدداً تلاش فرمایید.'
    );
  });

  it('accurately translates short password and existing user messages', () => {
    const passMsg = translateSupabaseAuthError('Password should be at least 6 characters');
    assert.equal(passMsg, 'رمز عبور باید حداقل ۶ کاراکتر باشد.');

    const userMsg = translateSupabaseAuthError('User already registered');
    assert.equal(userMsg, 'این آدرس ایمیل قبلاً در سیستم ثبت‌نام شده است. لطفاً وارد شوید.');
  });
});

describe('Password Recovery Pending State & Flags', () => {
  it('correctly tracks and consumes password recovery state', () => {
    // Consume initial state
    consumePasswordRecoveryRequested();
    assert.equal(isPasswordRecoveryRequested(), false);

    // checkAuthUrl runs safely in Node/SSR environment without throwing
    const result = checkAuthUrl();
    assert.equal(typeof result.isRecovery, 'boolean');
    assert.equal(result.error, null);
  });
});

describe('Password Update & Reset Input Validations', () => {
  it('rejects passwords shorter than 6 characters before calling network', async () => {
    const shortResult = await updateUserPassword('12345');
    assert.equal(shortResult.ok, false);
    assert.match(shortResult.message, /حداقل ۶ کاراکتر/);

    const emptyResult = await updateUserPassword('');
    assert.equal(emptyResult.ok, false);
    assert.match(emptyResult.message, /حداقل ۶ کاراکتر/);
  });

  it('rejects empty email on resetPasswordForEmail', async () => {
    const emptyEmail = await resetPasswordForEmail('   ');
    assert.equal(emptyEmail.ok, false);
    assert.match(emptyEmail.message, /آدرس ایمیل/);
  });

  it('rejects invalid inputs on signInWithEmail', async () => {
    const noEmail = await signInWithEmail('', '123456');
    assert.equal(noEmail.ok, false);
    assert.match(noEmail.error!, /آدرس ایمیل/);

    const shortPass = await signInWithEmail('test@example.com', '123');
    assert.equal(shortPass.ok, false);
    assert.match(shortPass.error!, /حداقل ۶ کاراکتر/);
  });

  it('rejects invalid inputs on signUpWithEmail', async () => {
    const noEmail = await signUpWithEmail('', '123456');
    assert.equal(noEmail.ok, false);
    assert.match(noEmail.error!, /آدرس ایمیل/);

    const shortPass = await signUpWithEmail('test@example.com', '123');
    assert.equal(shortPass.ok, false);
    assert.match(shortPass.error!, /حداقل ۶ کاراکتر/);
  });
});
