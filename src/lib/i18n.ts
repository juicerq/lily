import { i18n } from "#i18n";

export function localizePage(title: string) {
  document.documentElement.lang = i18n.t("locale");
  document.title = title;
}
