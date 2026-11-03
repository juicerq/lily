<img src="public/icon.svg" width="64" height="64" alt="Lily logo">

# Lily

[Português](README.md) · English · [Español](README.es.md)

Blocked hours and daily limits for sites that eat your time.

A Firefox and Zen extension with a monochrome interface and data stored in your browser. Built with Svelte 5, TypeScript and WXT.

[Download the latest version](https://github.com/juicerq/lily/releases/latest) · [Rules and architecture (Portuguese)](docs/spec.md) · [MIT license](LICENSE)

Available in English, Spanish and Brazilian Portuguese. The interface follows your browser language, with English for unsupported languages. Dates follow the interface language; times use 24-hour notation in your local time zone, and the week starts on Monday.

## How it works

Paint the hours of the week when you want to avoid distractions and set a daily limit for each site. For example: YouTube with 1h per day and blocked from 14:00 to 18:00. At 15:00, Lily blocks access even if you have time left; outside those hours, you can use the remaining time until your daily limit runs out.

- **Weekly grid:** half-hour blocks, editable with the mouse or keyboard.
- **Daily limits:** reset at midnight. A limit of 0 always blocks the site; no limit means only blocked hours apply.
- **Usage tracking:** counts in the active tab of the focused window. Pauses after 60s without interaction, unless media is playing.
- **5 min unlock:** wait 30s with the page visible, up to twice a day, outside blocked hours.
- **Warnings:** a notification 1 min before blocked hours start or your daily limit runs out.

### Your week

The week page shows your time on each site, day by day, against its daily limit. A half-hour map shows usage and blocked attempts. Weekly insights find your busiest hours outside the schedule and let you paint them with one click. Save or copy a PNG receipt showing only listed sites.

Open it from the popup or settings. History keeps the last 12 weeks.

### When it is time to stop

The block page explains the reason and shows when the site will be available again. If someone shares an X or Instagram post, “View just this post” shows that post without the feed or unlocking the site. Instagram profiles work the same way with “View just this profile”.

## Install

### Zen

1. Download the `.xpi` file from [Releases](https://github.com/juicerq/lily/releases/latest).
2. In `about:config`, set `xpinstall.signatures.required` to `false` to allow the unsigned package.
3. In `about:addons`, open the gear menu → **Install Add-on From File** and choose the `.xpi`.

After installation, the browser checks [`updates.json`](updates.json) for new versions published in this repository.

### Firefox

Requires Firefox 140 or newer.

## Privacy

Settings, usage counters, the last 12 weeks of history and diagnostics stay in local browser storage. History includes time by domain for sites outside your list to suggest new sites; it never leaves your browser, and the exported image shows only listed sites. Lily does not send usage data to servers, uses no analytics and bundles its fonts. The browser checks GitHub to update installations from the `.xpi`. Embedded posts or profiles load from X or Instagram when you choose to view them.

Permissions allow Lily to observe tabs and navigation to track usage and redirect blocked sites, detect inactivity, schedule blocks, store data and show notifications. See the [specification (Portuguese)](docs/spec.md).

## License

Code is under the [MIT license](LICENSE). Doto and Space Mono fonts are distributed under the SIL Open Font License; their license texts are in [`public/fonts`](public/fonts).
