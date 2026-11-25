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
const os = { seq: 0, scheduled: new Map<string, number>() };
mock.module('expo-notifications', () => ({
  setNotificationHandler: () => {},
  cancelScheduledNotificationAsync: async (rid: string) => void os.scheduled.delete(rid),
  scheduleNotificationAsync: async (req: { trigger: { date: Date } }) => {
    const rid = 'r' + ++os.seq;
    os.scheduled.set(rid, req.trigger.date.getTime());
    return rid;
  },
  getLastNotificationResponse: () => null,
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  getPermissionsAsync: async () => ({ granted: true }),
  requestPermissionsAsync: async () => ({ granted: true }),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

mock.module('react-native', () => ({ Linking: {} }));

const { appendLine, deleteNode } = await import('../src/ui/actions');
const { routeFromUrl } = await import('../src/platform/devRoute');
const { installNotificationRouting, setReminder } = await import('../src/platform/notify');
const { nav } = await import('../src/state/nav');

let t = 1_000;
function mk() {
  let i = 0;
  os.scheduled.clear();
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

describe('reminders across undo', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  test('delete cancels the alarm; undo re-schedules it', async () => {
    const e = mk();
    const off = installNotificationRouting();
    const note = e.create(null, { title: 'Ara' });
    const at = Date.now() + 3_600_000;
    await setReminder(note, at, null);
    const first = e.get(note)!.reminderId!;
    expect(os.scheduled.get(first)).toBe(at);

    expect(deleteNode(note)).toBe(true);
    await settle();
    expect(os.scheduled.has(first)).toBe(false);

    expect(e.undo()).toBe('Sil');
    await settle();
    const revived = e.get(note)!.reminderId!;
    expect(revived).not.toBe(first);
    expect(os.scheduled.get(revived)).toBe(at);
    expect(e.get(note)!.reminderAt).toBe(at);
    // Bookkeeping stays out of history: the delete is still the step to redo.
    expect(e.canRedo).toBe(true);
    off();
  });

  test('undoing "remove reminder" re-schedules it; a time already past is dropped', async () => {
    const e = mk();
    const off = installNotificationRouting();
    const note = e.create(null, { title: 'Ara' });
    const at = Date.now() + 3_600_000;
    await setReminder(note, at, 'İlk adım');
    t += 5_000; // a later, separate step (edits within 4 s coalesce)
    await setReminder(note, null, null);
    expect(os.scheduled.size).toBe(0);
    e.undo();
    await settle();
    expect(os.scheduled.get(e.get(note)!.reminderId!)).toBe(at);
    expect(e.get(note)!.reminderHook).toBe('İlk adım');

    const past = e.create(null, { title: 'Dün' });
    await setReminder(past, Date.now() + 50, null);
    deleteNode(past);
    await new Promise((r) => setTimeout(r, 80));
    e.undo();
    await settle();
    expect(e.get(past)!.reminderAt).toBeNull();
    expect(e.get(past)!.reminderId).toBeNull();
    off();
  });
});

describe('deep links', () => {
  test('a malformed %-escape is ignored instead of throwing URIError', () => {
    const e = mk();
    const id = e.create(null, { title: 'Işık' });
    expect(() => routeFromUrl('sofia://node/%E0')).not.toThrow();
    expect(routeFromUrl('sofia://node/%E0')).toBeNull();
    expect(routeFromUrl('sofia://node/I%C5%9F%C4%B1k')).toEqual([{ name: 'home' }, { name: 'node', id }]);
    expect(routeFromUrl('sofia://autopilot')).toEqual([{ name: 'home' }, { name: 'autopilot', scope: null }]);
  });
});
