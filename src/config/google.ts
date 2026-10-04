import { Platform } from 'react-native';

import config from '../../google.config.json';

// OAuth client IDs identify this app to Google. They are not secrets, so they
// live in google.config.json and ship inside every build. Environment
// variables override them (useful for a separate dev project).
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || config.webClientId;
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || config.iosClientId;

/** Whether this build has the client ID it needs to connect to Google. */
export const isGoogleConfigured = Platform.OS === 'ios' ? !!GOOGLE_IOS_CLIENT_ID : !!GOOGLE_WEB_CLIENT_ID;
