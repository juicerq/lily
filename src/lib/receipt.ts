import { i18n } from "#i18n";
import { WEEKDAYS, formatDuration, formatMinutes } from "@/lib/format";
import { SLOTS_PER_DAY } from "@/lib/time";
import { slotSeconds, slotTries, type SiteWeek, type WeekSummary } from "@/lib/week";

export const RECEIPT_SIZE = { width: 1080, height: 1350 };

const MAX_SITES = 5;
const LEFT = 90;
const RIGHT = 990;
const FG = "#f0f0f0";
const SOFT = "#8a8a8a";
const MUTE = "#6a6a6a";
const LINE = "#1c1c1c";
const PAINT = "#151515";

export interface ReceiptInput {
  week: WeekSummary;
  label: string;
  previousTotal: number | null;
  issued: string;
  escapeLimit: number;
}

const mono = (size: number) => `400 ${size}px "Space Mono", monospace`;
const doto = (size: number) => `900 ${size}px "Doto", monospace`;

function truncate(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function painter(ctx: CanvasRenderingContext2D) {
  const text = (value: string, x: number, y: number, style: { font: string; color: string; align?: CanvasTextAlign; spacing?: string }) => {
    ctx.font = style.font;
    ctx.fillStyle = style.color;
    ctx.textAlign = style.align ?? "left";
    ctx.letterSpacing = style.spacing ?? "0px";
    ctx.fillText(value, x, y);
    ctx.letterSpacing = "0px";
  };

  const rule = (y: number) => {
    ctx.fillStyle = LINE;
    ctx.fillRect(LEFT, y, RIGHT - LEFT, 2);
  };

  const disc = (x: number, y: number, radius: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const ring = (x: number, y: number, radius: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  };

  return { text, rule, disc, ring };
}

function drawMap(ctx: CanvasRenderingContext2D, week: WeekSummary, top: number) {
  const { text, disc, ring } = painter(ctx);
  const gridLeft = LEFT + 64;
  const cell = (RIGHT - gridLeft) / SLOTS_PER_DAY;
  const row = 30;

  for (const hour of [0, 6, 12, 18]) {
    text(String(hour).padStart(2, "0"), gridLeft + hour * 2 * cell, top - 16, { font: mono(16), color: MUTE });
  }

  week.days.forEach((record, day) => {
    const y = top + day * row;
    const height = row - 6;

    text(WEEKDAYS[day] ?? "", LEFT, y + 19, { font: mono(19), color: SOFT });

    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      if (record?.schedule[slot] === "1") {
        ctx.fillStyle = PAINT;
        ctx.fillRect(gridLeft + slot * cell, y, cell + 0.5, height);
      }
    }

    for (let hour = 0; hour < 24; hour += 6) {
      ctx.fillStyle = LINE;
      ctx.fillRect(gridLeft + hour * 2 * cell, y, 1.5, height);
    }

    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      const minutes = Math.min(30, slotSeconds(record, slot, null) / 60);
      const x = gridLeft + slot * cell + cell / 2;
      const middle = y + height / 2;

      if (minutes >= 0.5) {
        ctx.globalAlpha = 0.45 + 0.55 * (minutes / 30);
        disc(x, middle, 2.5 + (minutes / 30) * 5.5, FG);
        ctx.globalAlpha = 1;
      } else if (slotTries(record, slot, null).length) {
        ring(x, middle, 3.6, SOFT);
      }
    }
  });
}

function drawBars(ctx: CanvasRenderingContext2D, site: SiteWeek, left: number, baseline: number) {
  const { text } = painter(ctx);
  const width = 32;
  const gap = 12;
  const height = 44;

  if (site.quota === 0) {
    site.tries.forEach((count, day) => {
      text(count ? String(count) : "·", left + day * (width + gap) + width / 2, baseline, { font: mono(20), color: count ? FG : MUTE, align: "center" });
    });
    return;
  }

  const scale = Math.max((site.quota ?? 0) * 60 * 1.15, ...site.days, 1);

  site.days.forEach((seconds, day) => {
    const barHeight = seconds > 0 ? Math.max(2, (seconds / scale) * height) : 1;

    ctx.fillStyle = seconds === 0 ? "#262626" : site.exhausted[day] ? FG : MUTE;
    ctx.fillRect(left + day * (width + gap), baseline - barHeight, width, barHeight);
  });

  if (site.quota !== null) {
    const y = baseline - ((site.quota * 60) / scale) * height;

    ctx.strokeStyle = MUTE;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(left - 4, y);
    ctx.lineTo(left + 7 * width + 6 * gap + 4, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function quotaLine(site: SiteWeek) {
  const tries = site.tries.reduce((total, count) => total + count, 0);

  if (site.quota === 0) {
    return i18n.t("receiptZeroQuota", [i18n.t("attempts", tries)]);
  }

  const quota = site.quota === null ? i18n.t("unlimited") : i18n.t("receiptQuota", [formatMinutes(site.quota)]);
  const exhausted = site.exhausted.filter(Boolean).length;

  return i18n.t("receiptQuotaLine", [quota, exhausted, tries]);
}

export async function drawReceipt(canvas: HTMLCanvasElement, input: ReceiptInput) {
  await Promise.all([document.fonts.load(doto(64)), document.fonts.load(mono(30))]);

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("lily: canvas 2d indisponível");
  }

  canvas.width = RECEIPT_SIZE.width;
  canvas.height = RECEIPT_SIZE.height;

  const { text, rule } = painter(ctx);
  const { week } = input;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  text("lily", LEFT, 150, { font: doto(68), color: FG });
  text(i18n.t("receiptHeading"), RIGHT, 112, { font: mono(20), color: MUTE, align: "right", spacing: "4px" });
  text(input.label, RIGHT, 156, { font: mono(32), color: FG, align: "right" });
  rule(206);

  text(formatDuration(week.total), LEFT, 350, { font: doto(112), color: FG });
  text(i18n.t("receiptListed"), LEFT, 398, { font: mono(19), color: MUTE, spacing: "3px" });

  if (input.previousTotal !== null) {
    const diff = week.total - input.previousTotal;

    text(i18n.t("receiptVersus", [`${diff < 0 ? "−" : "+"}${formatDuration(Math.abs(diff))}`]), LEFT, 438, { font: mono(22), color: SOFT });
  }

  text(String(week.tries), 660, 296, { font: doto(68), color: FG });
  text(i18n.t("receiptAttempts"), 660, 332, { font: mono(17), color: MUTE, spacing: "3px" });
  text(`${week.escapes}/${input.escapeLimit}`, 660, 410, { font: doto(68), color: FG });
  text(i18n.t("receiptUnlocks"), 660, 446, { font: mono(17), color: MUTE, spacing: "3px" });
  rule(488);

  drawMap(ctx, week, 562);
  rule(790);

  const barsLeft = 520;
  const shown = week.sites.slice(0, MAX_SITES);

  WEEKDAYS.forEach((name, day) => {
    text(name.charAt(0), barsLeft + day * 44 + 16, 834, { font: mono(17), color: MUTE, align: "center" });
  });

  shown.forEach((site, index) => {
    const y = 892 + index * 70;

    text(truncate(site.domain, 24), LEFT, y, { font: mono(26), color: FG });
    text(quotaLine(site), LEFT, y + 30, { font: mono(17), color: MUTE });
    drawBars(ctx, site, barsLeft, y + 10);
    text(site.quota === 0 ? "—" : formatDuration(site.total), RIGHT, y, { font: mono(28), color: FG, align: "right" });
  });

  rule(1236);

  const hidden = week.sites.length - shown.length;
  const legend = i18n.t("receiptLegend") + (hidden > 0 ? i18n.t("receiptHidden", [hidden]) : "");

  text(legend, LEFT, 1282, { font: mono(16), color: MUTE });
  text(i18n.t("receiptIssued", [input.issued]), RIGHT, 1282, { font: mono(16), color: MUTE, align: "right" });
}
