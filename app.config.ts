import type { ExpoConfig } from 'expo/config';

// Google OAuth client IDs are read from environment variables so they never
// have to be committed. See README.md → "Google Sheets backup setup".
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

// The iOS URL scheme is the iOS client ID reversed, e.g.
// 1234-abc.apps.googleusercontent.com → com.googleusercontent.apps.1234-abc
const iosUrlScheme = iosClientId
  ? iosClientId.split('.').reverse().join('.')
  : 'com.googleusercontent.apps.replace-me';

const config: ExpoConfig = {
  name: 'Asset Manager',
  slug: 'asset-manager',
  scheme: 'assetmanager',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.APP_BUNDLE_ID ?? 'com.assetmanager.app',
  },
  android: {
    package: process.env.APP_BUNDLE_ID ?? 'com.assetmanager.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    '@react-native-community/datetimepicker',
    ['@react-native-google-signin/google-signin', { iosUrlScheme }],
  ],
};

export default config;
