// Google Play treats these as required for installation: the Wi-Fi permission comes from expo-network,
// and the portrait lock from "orientation": "portrait". Many people in Syria use mobile data only, so
// they must not be filtered out. The app keeps working exactly as before (still locked to portrait,
// still uses whatever connection is available); only the store listing stops requiring them.
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = ['android.hardware.wifi', 'android.hardware.screen.portrait'];

module.exports = function withOptionalAndroidFeatures(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] ?? [];
    for (const name of OPTIONAL_FEATURES) {
      const existing = manifest['uses-feature'].find((feature) => feature.$['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return modConfig;
  });
};
