import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.f7developer.creaturevoicestudio",
  appName: "Creature Voice Studio",
  webDir: "dist",
  backgroundColor: "#05070d",
  android: {
    backgroundColor: "#05070d",
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: "#05070d",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#05070d",
    },
  },
};

export default config;
