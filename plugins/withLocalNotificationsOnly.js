const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Sofia schedules only local notifications (chrono-triggers, steep). Remote push
 * is never used, so the aps-environment entitlement added by expo-notifications
 * is removed — this also lets free personal Apple teams sign the app.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
