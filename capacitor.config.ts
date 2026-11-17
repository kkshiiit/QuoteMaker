import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.quotemaker.mobile',
  appName: 'QuoteMaker',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
