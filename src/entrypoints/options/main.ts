import { mount } from "svelte";

import "@/assets/theme.css";
import { loadJournal } from "@/lib/journal";
import { loadSnapshot } from "@/lib/snapshot";

import App from "./App.svelte";

async function start() {
  const target = document.getElementById("app");

  if (!target) {
    throw new Error("lily: #app ausente");
  }

  const [snapshot, journal] = await Promise.all([loadSnapshot(new Date()), loadJournal()]);

  mount(App, { target, props: { initial: snapshot, initialJournal: journal } });
}

void start();
