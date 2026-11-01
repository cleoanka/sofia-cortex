import { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

/**
 * Motion law: calm and decisive. Timing curves only — no springs, no scale,
 * no bounce. 150 ms for state, 200 ms for spatial moves.
 */
export const ease = Easing.out(Easing.cubic);
export const t150 = { duration: 150, easing: ease } as const;
export const t200 = { duration: 200, easing: ease } as const;

export const fadeIn = FadeIn.duration(150).easing(ease);
export const fadeOut = FadeOut.duration(120).easing(ease);
export const layout = LinearTransition.duration(180).easing(ease);
