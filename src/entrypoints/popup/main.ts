import { mount } from "svelte";
import { browser } from "wxt/browser";

import "@/assets/theme.css";
import { loadSnapshot } from "@/lib/snapshot";

import App from "./App.svelte";

function visibleUrl(url: string | undefined) {
  if (!url) {
    return null;
  }

  if (!url.startsWith(browser.runtime.getURL("/blocked.html"))) {
    return url;
  }

  return new URL(url).searchParams.get("u");
}

async function start() {
  const target = document.getElementById("app");

  if (!target) {
    throw new Error("lily: #app ausente");
  }

  const [snapshot, [tab]] = await Promise.all([
    loadSnapshot(new Date()),
    browser.tabs.query({ active: true, currentWindow: true }),
  ]);

  mount(App, { target, props: { initial: snapshot, tabUrl: visibleUrl(tab?.url) } });
}

void start();
