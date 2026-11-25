import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { CortexEngine } from '../src/engine/CortexEngine';
import { memoryDriver } from './bunDriver';

// UI actions run against the real engine; only the native modules are stubbed.
let engine: CortexEngine;
mock.module('../src/platform/db', () => ({ getEngine: () => engine }));
mock.module('expo-haptics', () => ({
  impactAsync: async () => {},
  notificationAsync: async () => {},
  selectionAsync: async () => {},
  ImpactFeedbackStyle: {},
  NotificationFeedbackType: {},
}));
mock.module('expo-notifications', () => ({
  setNotificationHandler: () => {},
  cancelScheduledNotificationAsync: async () => {},
  scheduleNotificationAsync: async () => 'rid',
  getPermissionsAsync: async () => ({ granted: true }),
  requestPermissionsAsync: async () => ({ granted: true }),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const { appendLine } = await import('../src/ui/actions');
const { nav } = await import('../src/state/nav');

function mk() {
  let t = 1_000;
  let i = 0;
  engine = new CortexEngine(memoryDriver(), () => ++t, () => 'n' + String(++i).padStart(5, '0'));
  return engine;
}

describe('appendLine', () => {
  beforeEach(() => nav().showToast('', false));

  test('locked plan: • on an empty draft task warns instead of throwing SealedError', () => {
    const e = mk();
    const plan = e.create(null, { title: 'Plan', isTask: true });
    e.create(plan, { title: 'Açık görev', isTask: true });
    const draft = e.create(plan, { isTask: true });
    e.setSealed(plan, true);

    expect(() => appendLine(plan, false, 'bullet')).not.toThrow();
    expect(e.get(draft)!.isTask).toBe(true);
    expect(e.get(draft)!.fmt?.l).toBeUndefined();
    expect(nav().toast?.text).toBe('Plan kilitli — önce görevleri bitir');
  });

  test('unlocked page: • turns the empty draft task into a bullet line', () => {
    const e = mk();
    const page = e.create(null, { title: 'Sayfa' });
    const draft = e.create(page, { isTask: true });

    appendLine(page, false, 'bullet');
    expect(e.get(draft)!.isTask).toBe(false);
    expect(e.get(draft)!.fmt?.l).toBe('bullet');
    expect(e.children(page)).toEqual([draft]);
  });
});
