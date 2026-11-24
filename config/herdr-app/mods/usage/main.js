// Usage indicator for Claude Code and Antigravity (5-hour and weekly limits).
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, home, readTextFile, theme, layout, run } from "herdr";
import { TYPE, RADIUS, isNarrow, alpha, statusColor } from "./ui.js";

const POLL_MS = 120_000;
const CACHE_KEY = "usage.cache.v1";
const EXPANDED_PX = 272;
const COLLAPSED_PX = 76;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function clampPct(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function formatReset(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = DAYS[d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `resets on ${day} ${hh}:${mm}`;
}

function barColor(t, pct) {
  if (pct == null) return alpha(t.foreground, 0.25);
  if (pct >= 95) return statusColor(t, "blocked");
  if (pct >= 80) return statusColor(t, "working");
  return alpha(t.foreground, 0.72);
}

function pctColor(t, pct) {
  if (pct == null) return t.dim;
  if (pct >= 95) return statusColor(t, "blocked");
  if (pct >= 80) return statusColor(t, "working");
  return t.foreground;
}

async function fetchClaude() {
  const raw = await readTextFile(`${home()}/.claude/.credentials.json`);
  if (!raw) return { error: "No Claude credentials" };
  const creds = JSON.parse(raw);
  const token = creds?.claudeAiOauth?.accessToken;
  if (!token) return { error: "Not signed in" };

  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-code/2.0",
    },
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json();
  return {
    fiveHour: {
      pct: clampPct(data?.five_hour?.utilization),
      resetsAt: data?.five_hour?.resets_at ?? null,
    },
    weekly: {
      pct: clampPct(data?.seven_day?.utilization),
      resetsAt: data?.seven_day?.resets_at ?? null,
    },
  };
}

async function fetchAntigravity() {
  const res = await exec("agy", ["-p", "/usage", "--output-format", "json"]);
  if (res.code !== 0) return { error: res.stderr?.trim() || `agy exited ${res.code}` };
  const data = JSON.parse(res.stdout);
  const groups = data?.command?.data?.groups ?? [];
  const primary = groups.find((g) => /gemini/i.test(g.name)) ?? groups[0];
  if (!primary) return { error: "No quota data" };
  const buckets = primary.buckets ?? [];
  const b5h = buckets.find((b) => b.window === "5h");
  const bWk = buckets.find((b) => b.window === "weekly");
  const toUsed = (b) => {
    if (!b || b.disabled) return null;
    if (typeof b.remaining_fraction !== "number") return null;
    return clampPct((1 - b.remaining_fraction) * 100);
  };
  return {
    fiveHour: {
      pct: toUsed(b5h),
      resetsAt: b5h?.reset_time ?? null,
    },
    weekly: {
      pct: toUsed(bWk),
      resetsAt: bWk?.reset_time ?? null,
    },
  };
}

function renderBar(t, label, entry) {
  const pct = entry?.pct ?? null;
  const pctText = pct != null ? `${pct}%` : "—";
  const resetText = formatReset(entry?.resetsAt);
  const fillW = pct != null ? `${pct}%` : "0%";

  return v_flex()
    .w_full()
    .gap(3)
    .child(
      h_flex()
        .w_full()
        .items_center()
        .justify_between()
        .child(div().text_size(TYPE.meta).text_color(t.muted).child(label))
        .child(div().text_size(TYPE.meta).font_medium().text_color(pctColor(t, pct)).child(pctText)),
    )
    .child(
      div()
        .w_full()
        .h(5)
        .rounded(RADIUS.full)
        .bg(alpha(t.foreground, 0.12))
        .overflow_hidden()
        .child(
          div()
            .h_full()
            .w(fillW)
            .rounded(RADIUS.full)
            .bg(barColor(t, pct)),
        ),
    )
    .when(Boolean(resetText), (el) =>
      el.child(div().text_size(10).text_color(t.dim).child(resetText)),
    );
}

function renderSection(t, { id, name, icon, data, loading, onRefresh }) {
  const err = data?.error;
  return v_flex()
    .w_full()
    .gap(5)
    .child(
      h_flex()
        .id(`usage-hdr-${id}`)
        .w_full()
        .items_center()
        .justify_between()
        .cursor_pointer()
        .tooltip(err ? `${name}: ${err} (click to refresh)` : `Refresh ${name} usage`)
        .on_click(onRefresh)
        .child(
          h_flex()
            .gap(6)
            .items_center()
            .child(image(icon).size(13).flex_none())
            .child(div().text_size(TYPE.sub).font_semibold().text_color(t.foreground).child(name)),
        )
        .when(Boolean(err), (el) =>
          el.child(div().text_size(10).text_color(statusColor(t, "error")).child("error")),
        )
        .when(!err && loading, (el) =>
          el.child(div().text_size(10).text_color(t.dim).child("…")),
        ),
    )
    .child(renderBar(t, "5-hour", data?.fiveHour))
    .child(renderBar(t, "Weekly", data?.weekly));
}

function renderCompactItem(t, { id, name, icon, data, onRefresh }) {
  const p5 = data?.fiveHour?.pct;
  const pW = data?.weekly?.pct;
  const tip = data?.error
    ? `${name}: ${data.error}`
    : `${name}\n5-hour: ${p5 != null ? `${p5}%` : "—"}\nWeekly: ${pW != null ? `${pW}%` : "—"}`;

  const miniBar = (pct) =>
    div()
      .w(24)
      .h(3)
      .rounded(RADIUS.full)
      .bg(alpha(t.foreground, 0.14))
      .overflow_hidden()
      .child(div().h_full().w(`${pct ?? 0}%`).rounded(RADIUS.full).bg(barColor(t, pct)));

  return v_flex()
    .id(`usage-compact-${id}`)
    .items_center()
    .gap(3)
    .cursor_pointer()
    .tooltip(tip)
    .on_click(onRefresh)
    .child(image(icon).size(14).flex_none())
    .child(miniBar(p5))
    .child(miniBar(pW));
}

export default class Usage extends View {
  init(_props, cx) {
    let cached = {};
    try {
      cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") ?? {};
    } catch {
      cached = {};
    }
    this.claude = cached.claude ?? null;
    this.antigravity = cached.antigravity ?? null;
    this.loadingClaude = false;
    this.loadingAgy = false;

    const want = isNarrow(layout()) ? COLLAPSED_PX : EXPANDED_PX;
    cx.spawn(async () => run("layout.resize", { id: "usage", px: want }));

    this.refreshAll(cx);
    cx.timer.every(POLL_MS, (cx) => this.refreshAll(cx));
  }

  saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        claude: this.claude,
        antigravity: this.antigravity,
      }));
    } catch {}
  }

  refreshClaude(cx) {
    if (this.loadingClaude) return;
    this.loadingClaude = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.claude = await fetchClaude();
      } catch (e) {
        this.claude = { ...(this.claude ?? {}), error: String(e?.message ?? e) };
      }
      this.loadingClaude = false;
      this.saveCache();
      cx.notify();
    });
  }

  refreshAntigravity(cx) {
    if (this.loadingAgy) return;
    this.loadingAgy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.antigravity = await fetchAntigravity();
      } catch (e) {
        this.antigravity = { ...(this.antigravity ?? {}), error: String(e?.message ?? e) };
      }
      this.loadingAgy = false;
      this.saveCache();
      cx.notify();
    });
  }

  refreshAll(cx) {
    this.refreshClaude(cx);
    this.refreshAntigravity(cx);
  }

  render(cx) {
    const t = theme();
    const collapsed = isNarrow(layout());

    if (collapsed) {
      return v_flex()
        .size_full()
        .bg(t.chrome)
        .border_t_1()
        .border_b_1()
        .border_color(t.border)
        .py(6)
        .gap(8)
        .items_center()
        .justify_center()
        .child(renderCompactItem(t, {
          id: "claude",
          name: "Claude Code",
          icon: "icons/claude.svg",
          data: this.claude,
          onRefresh: () => this.refreshClaude(cx),
        }))
        .child(renderCompactItem(t, {
          id: "agy",
          name: "Antigravity",
          icon: "icons/antigravity.svg",
          data: this.antigravity,
          onRefresh: () => this.refreshAntigravity(cx),
        }));
    }

    return v_flex()
      .size_full()
      .bg(t.chrome)
      .border_t_1()
      .border_b_1()
      .border_color(t.border)
      .px(12)
      .py(10)
      .gap(12)
      .justify_center()
      .child(renderSection(t, {
        id: "claude",
        name: "Claude Code",
        icon: "icons/claude.svg",
        data: this.claude,
        loading: this.loadingClaude,
        onRefresh: () => this.refreshClaude(cx),
      }))
      .child(renderSection(t, {
        id: "agy",
        name: "Antigravity",
        icon: "icons/antigravity.svg",
        data: this.antigravity,
        loading: this.loadingAgy,
        onRefresh: () => this.refreshAntigravity(cx),
      }));
  }
}
