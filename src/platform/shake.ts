import { Accelerometer } from 'expo-sensors';

/** Shake to undo — the physical gesture iOS taught everyone. */
export function onShake(fn: () => void): () => void {
  let last = 0;
  let hits = 0;
  let windowStart = 0;
  Accelerometer.setUpdateInterval(60);
  const sub = Accelerometer.addListener(({ x, y, z }) => {
    const g = Math.sqrt(x * x + y * y + z * z);
    const now = Date.now();
    if (g < 2.3) return;
    if (now - windowStart > 700) {
      windowStart = now;
      hits = 0;
    }
    hits++;
    if (hits >= 3 && now - last > 1500) {
      last = now;
      hits = 0;
      fn();
    }
  });
  return () => sub.remove();
}
