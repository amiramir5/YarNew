import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapSessionToDatabase,
  mapDatabaseToSession,
  mapExamToDatabase,
  mapDatabaseToExam,
  mapMistakeToDatabase,
  mapDatabaseToMistake,
  validateAllSchemas,
} from '../src/lib/schemaValidator';
import { Session, Exam, MistakeCard } from '../src/types';

describe('Database Schema & Bidirectional Mapper Contract', () => {
  it('validates all canonical schemas contractually', () => {
    const result = validateAllSchemas();
    assert.equal(result.valid, true, `Validation failed: ${result.errors.join(', ')}`);
  });

  it('correctly maps Session to Supabase schema without data loss', () => {
    const mockSession: Session = {
      id: 'sess-123',
      created_at: 1775980800000,
      updated_at: 1775984405000,
      deleted_at: null,
      device_id: 'client-unit-test',
      day: '2026-10-12',
      subject: 'bio',
      book: 'دهم',
      chapter: 'فصل ۱',
      goftar: 'گفتار ۲',
      seconds: 3600,
      type: 'آموزش',
      correct: 25,
      wrong: 3,
      blank: 2,
      note: 'تست زیست مبحث ۱',
    };

    const dbRecord = mapSessionToDatabase(mockSession, 'user-abc', 'PAIR123', 'test@example.com');
    assert.equal(dbRecord.id, 'sess-123');
    assert.equal(dbRecord.user_id, 'user-abc');
    assert.equal(dbRecord.pair_code, 'PAIR123');
    assert.equal(dbRecord.user_email, 'test@example.com');
    assert.equal(dbRecord.day, '2026-10-12');
    assert.equal(dbRecord.subject, 'bio');
    assert.equal(dbRecord.book, 'دهم');
    assert.equal(dbRecord.chapter, 'فصل ۱');
    assert.equal(dbRecord.goftar, 'گفتار ۲');
    assert.equal(dbRecord.seconds, 3600);
    assert.equal(dbRecord.correct, 25);
    assert.equal(dbRecord.wrong, 3);
    assert.equal(dbRecord.blank, 2);

    const reconstructed = mapDatabaseToSession(dbRecord);
    assert.equal(reconstructed.id, mockSession.id);
    assert.equal(reconstructed.subject, mockSession.subject);
    assert.equal(reconstructed.seconds, mockSession.seconds);
    assert.equal(reconstructed.correct, mockSession.correct);
    assert.equal(reconstructed.wrong, mockSession.wrong);
    assert.equal(reconstructed.blank, mockSession.blank);
  });

  it('correctly maps Exam to Supabase schema', () => {
    const mockExam: Exam = {
      id: 'exam-456',
      created_at: 1775980800000,
      updated_at: 1775984405000,
      deleted_at: null,
      device_id: 'client-unit-test',
      subject: 'زیست‌شناسی جامع',
      day: '2026-10-10',
      correct: 30,
      wrong: 5,
      blank: 5,
      duration: 60,
      percent: 71.5,
      note: 'آزمون آزمایشی مرحله ۱',
    };

    const dbRecord = mapExamToDatabase(mockExam, 'user-abc', 'PAIR123', 'test@example.com');
    assert.equal(dbRecord.id, 'exam-456');
    assert.equal(dbRecord.user_id, 'user-abc');
    assert.equal(dbRecord.subject, 'زیست‌شناسی جامع');
    assert.equal(dbRecord.percent, 71.5);
    assert.equal(dbRecord.percentage, 71.5);
    assert.equal(dbRecord.duration, 60);

    const reconstructed = mapDatabaseToExam(dbRecord);
    assert.equal(reconstructed.id, mockExam.id);
    assert.equal(reconstructed.subject, mockExam.subject);
    assert.equal(reconstructed.percent, 71.5);
    assert.equal(reconstructed.duration, 60);
  });

  it('correctly maps MistakeCard with Leitner box and storage image path', () => {
    const mockMistake: MistakeCard = {
      id: 'mistake-789',
      created_at: 1775980800000,
      updated_at: 1775984405000,
      deleted_at: null,
      device_id: 'client-unit-test',
      subject: 'شیمی',
      chapter: 'استوکیومتری',
      cause: 'اشتباه در موازنه اکسیژن',
      question: 'استوکیومتری واکنش احتراق متان',
      source: 'قلمچی',
      importance: 4,
      image_data: 'mistakes/user-abc/chem_789.webp',
      box: 2,
      next_review: '2026-10-15',
      history: [{ ts: 1775980800000, right: true, box: 2, interval: 1 }],
    };

    const dbRecord = mapMistakeToDatabase(mockMistake, 'user-abc', 'PAIR123', 'test@example.com');
    assert.equal(dbRecord.id, 'mistake-789');
    assert.equal(dbRecord.box, 2);
    assert.equal(dbRecord.leitner_box, 2);
    assert.equal(dbRecord.importance, 4);
    assert.equal(dbRecord.image_data, 'mistakes/user-abc/chem_789.webp');

    const reconstructed = mapDatabaseToMistake(dbRecord);
    assert.equal(reconstructed.id, mockMistake.id);
    assert.equal(reconstructed.box, 2);
    assert.equal(reconstructed.cause, mockMistake.cause);
    assert.equal(reconstructed.image_data, mockMistake.image_data);
  });
});
