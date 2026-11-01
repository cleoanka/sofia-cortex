import * as Haptics from 'expo-haptics';

/** The haptic symphony — one vocabulary for the whole app. */
export const haptic = {
  tick: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  cascade: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 110);
  },
  lens: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
  thud: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  soft: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  select: () => Haptics.selectionAsync(),
  warn: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};
