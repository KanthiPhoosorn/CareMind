import { ExpoConfig, ConfigContext } from 'expo/config';
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'CareMind',
  slug: 'caremind',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'caremind',
  splash: { backgroundColor: '#2563EB' },
  ios: { supportsTablet: true, bundleIdentifier: 'com.caremind.app' },
  android: { adaptiveIcon: { backgroundColor: '#2563EB' }, package: 'com.caremind.app' },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY,
  },
});
