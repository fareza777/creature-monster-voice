import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.f7developer.creaturevoicestudio",
  appName: "Creature Voice Studio",
  webDir: "dist",
  backgroundColor: "#f6f4ef",
  android: {
    backgroundColor: "#f6f4ef",
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: "#f6f4ef",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#f6f4ef",
    },
  },
};

export default config;
