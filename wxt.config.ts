import { defineConfig } from "wxt";

const UPDATE_URL = "https://raw.githubusercontent.com/juicerq/lily/main/updates.json";
const forAmo = process.env.LILY_AMO === "1";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "Lily",
    description: "Horários e cotas diárias para os sites que roubam seu tempo.",
    permissions: ["storage", "tabs", "webNavigation", "alarms", "idle", "notifications"],
    icons: { 48: "icon-48.png", 96: "icon-96.png", 128: "icon-128.png" },
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
        ...(forAmo ? {} : { update_url: UPDATE_URL }),
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  },
});
