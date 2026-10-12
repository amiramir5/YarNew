import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeWithLastWriteWins } from '../src/lib/cloudSync';
import { Session } from '../src/types';

describe('Cloud Synchronization & Conflict Resolution Engine', () => {
  it('correctly merges local and remote items with Last-Write-Wins', () => {
    const localItems: Session[] = [
      {
        id: 'sess-1',
        created_at: 1000,
        updated_at: 10000,
        deleted_at: null,
        device_id: 'client',
        day: '2026-10-12',
        subject: 'bio',
        seconds: 1800,
        correct: 10,
        wrong: 2,
        blank: 0,
        note: '',
        type: 'آموزش',
      },
      {
        id: 'sess-2',
        created_at: 1000,
        updated_at: 20000,
        deleted_at: null,
        device_id: 'client',
        day: '2026-10-12',
        subject: 'chem',
        seconds: 2400,
        correct: 15,
        wrong: 1,
        blank: 0,
        note: '',
        type: 'آموزش',
      },
    ];

    const remoteItems: Session[] = [
      // sess-1 has newer remote timestamp
      {
        id: 'sess-1',
        created_at: 1000,
        updated_at: 15000,
        deleted_at: null,
        device_id: 'client',
        day: '2026-10-12',
        subject: 'bio',
        seconds: 3600,
        correct: 20,
        wrong: 2,
        blank: 0,
        note: '',
        type: 'آموزش',
      },
      // sess-2 has older remote timestamp
      {
        id: 'sess-2',
        created_at: 1000,
        updated_at: 10000,
        deleted_at: null,
        device_id: 'client',
        day: '2026-10-12',
        subject: 'chem',
        seconds: 1200,
        correct: 5,
        wrong: 1,
        blank: 0,
        note: '',
        type: 'آموزش',
      },
      // sess-3 is new remote item
      {
        id: 'sess-3',
        created_at: 1000,
        updated_at: 25000,
        deleted_at: null,
        device_id: 'client',
        day: '2026-10-12',
        subject: 'math',
        seconds: 3000,
        correct: 12,
        wrong: 0,
        blank: 0,
        note: '',
        type: 'آموزش',
      },
    ];

    const merged = mergeWithLastWriteWins(localItems, remoteItems);

    assert.equal(merged.length, 3);

    const merged1 = merged.find((s) => s.id === 'sess-1');
    assert.equal(merged1?.seconds, 3600); // remote wins because it is newer

    const merged2 = merged.find((s) => s.id === 'sess-2');
    assert.equal(merged2?.seconds, 2400); // local wins because it is newer

    const merged3 = merged.find((s) => s.id === 'sess-3');
    assert.equal(merged3?.seconds, 3000); // added from remote
  });

  it('respects soft deletes and preserves tombstone when deleted_at is newer', () => {
    const localItems: Session[] = [
      {
        id: 'sess-deleted',
        created_at: 1000,
        updated_at: 10000,
        deleted_at: null,
        device_id: 'client',
        day: '2026-10-12',
        subject: 'bio',
        seconds: 1800,
        correct: 10,
        wrong: 2,
        blank: 0,
        note: '',
        type: 'آموزش',
      },
    ];

    const remoteItems: Session[] = [
      {
        id: 'sess-deleted',
        created_at: 1000,
        updated_at: 20000,
        deleted_at: 20000,
        device_id: 'client',
        day: '2026-10-12',
        subject: 'bio',
        seconds: 1800,
        correct: 10,
        wrong: 2,
        blank: 0,
        note: '',
        type: 'آموزش',
      },
    ];

    const merged = mergeWithLastWriteWins(localItems, remoteItems);
    const item = merged.find((s) => s.id === 'sess-deleted');
    assert.ok(item?.deleted_at, 'Deleted status should be preserved by Last-Write-Wins');
  });
});
