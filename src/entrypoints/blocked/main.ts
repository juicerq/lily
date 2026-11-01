import { mount } from "svelte";

import "@/assets/theme.css";
import { loadSnapshot } from "@/lib/snapshot";

import App from "./App.svelte";

async function start() {
  const target = document.getElementById("app");

  if (!target) {
    throw new Error("lily: #app ausente");
  }

  const url = new URLSearchParams(location.search).get("u");

  mount(App, { target, props: { initial: await loadSnapshot(new Date()), url } });
}

void start();
