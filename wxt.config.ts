import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "Lily",
    description: "Horários e cotas diárias para os sites que roubam seu tempo.",
    permissions: ["storage", "tabs", "webNavigation", "alarms", "idle", "notifications"],
    icons: { 48: "icon.svg", 96: "icon.svg" },
    action: {
      default_title: "Lily",
      default_icon: "mark-dark.svg",
      theme_icons: [
        { light: "mark-dark.svg", dark: "mark-light.svg", size: 16 },
        { light: "mark-dark.svg", dark: "mark-light.svg", size: 32 },
      ],
    },
    browser_specific_settings: {
      gecko: {
        id: "lily@juicerq",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  },
});
