// Command buttons: a row of buttons at the top of the sidebar, each running a
// saved command in a floating terminal (a dialog: a click outside hides it). The
// terminal outlives the window and restarts: the core keeps it.
//
// One mod, several views (props().view):
//   bar      the row of buttons (the layout block)
//   edit     add / edit one button (dialog, props { id? })
//   manage   every button: reorder, edit, delete (dialog)
//   menu     a button's right-click menu (popup, props { id })
//   title    the floating window's title bar (props { id, terminal })
//
// Buttons live in ~/.config/herdr-app/cmd-buttons.json (hand-editable):
//   { "buttons": [ { "id", "name", "command", "icon", "folder" } ] }
// icon: a name from ICONS, a .svg/.png path in ~/.config/herdr-app, or text (an emoji).
// folder: where it runs; empty means the focused terminal's folder.
// longRunning: no Run again anywhere; a click only shows it while its terminal lives.
// openOnRun (default true): false runs it without opening its window (a click while
// it runs, or Show output, opens it).
//
// Color: cyan healthy long-running or succeeded, gold active, rose needs input or failed.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState } from "gpui-base";
import {
  appHome, home, hc, exec, run, theme, terminals, focused, spaces, props, shared, setShared,
  openOverlay, closeOverlay, readTextFile, writeTextFile, nextCommand, layout, notify,
} from "herdr";
import { TYPE, RADIUS, SIZE, TRANSPARENT, monoFont, isNarrow, alpha, selectedMetaColor, statusColor, dot, button, toggle, textInput, menuFrame, menuRow, iconBtn as uiIconBtn, badge, chip, dialogFrame, floatingTitleBar } from "./ui.js";

const narrow = () => isNarrow(layout());

const DIR = "mods/cmd-buttons";
const FILE = () => `${appHome()}/cmd-buttons.json`;
export const ICONS = [
  "terminal", "play", "rocket", "hammer", "wrench", "bug", "flask", "code", "package",
  "database", "server", "cloud", "globe", "upload", "download", "refresh", "zap",
  "git-branch", "search", "eye", "send", "star", "trash", "folder", "file-text", "settings",
];
const FADE = 3000;
const color = (t, state, longRunning = false) => statusColor(t, longRunning && state === "running" ? "ok" : state);
// A last line like this, unchanged for a moment, is a question for the user.
const PROMPT = /(\?|>|:|›|❯|\[y\/n\]|\(y\/n\)|\[y\/N\]|\[Y\/n\])$/i;
const LABEL = { running: "Running", ok: "Done", input: "Needs input", error: "Failed" };
const stateLabelOf = (b, s) => {
  if (!s) return null;
  if (s.state === "error") return `Failed (${s.code})`;
  if (b.longRunning && s.state === "running") return "Active";
  return LABEL[s.state];
};

function shortLabel(b, list) {
  const full = (b.name || b.command || "").trim();
  const words = full.split(/\s+/);
  if (words.length > 1) {
    const first = words[0].toLowerCase();
    const sharedPrefix = list.filter((x) => (x.name || x.command || "").trim().toLowerCase().startsWith(`${first} `)).length > 1;
    if (sharedPrefix) return words.slice(1).join(" ");
  }
  return full;
}

// ---- buttons ---------------------------------------------------------------

function parse(raw) {
  try {
    const list = JSON.parse(raw ?? "{}").buttons;
    return Array.isArray(list) ? list.filter((b) => b && b.id && b.command) : [];
  } catch { return null; }
}
export const buttons = () => shared("cmdbuttons.list") ?? [];

async function load() {
  const raw = await readTextFile(FILE());
  const list = parse(raw);
  if (list && JSON.stringify(list) !== JSON.stringify(shared("cmdbuttons.list"))) setShared("cmdbuttons.list", list);
  return raw;
}

async function save(list) {
  setShared("cmdbuttons.list", list);
  const before = await readTextFile(FILE());
  await writeTextFile(FILE(), JSON.stringify({ buttons: list }, null, 2) + "\n", before);
}

// ---- runs ------------------------------------------------------------------
// shared "cmdbuttons.runs": { [button id]: { terminal, pid, exit?, stopped? } }

const runs = () => shared("cmdbuttons.runs") ?? {};
function setRun(id, value) {
  const all = { ...runs() };
  if (value) all[id] = value; else delete all[id];
  setShared("cmdbuttons.runs", all);
}

// { state: running|input|ok|error, code, live, terminal } or null (never ran, stopped).
// A finished run whose color has faded (never a long-running one).
export function faded(b, s) {
  return Boolean(!b.longRunning && s?.terminal && (s.state === "ok" || s.state === "error")
    && (shared("cmdbuttons.faded") ?? []).includes(s.terminal));
}

export function statusOf(b, waiting) {
  const r = runs()[b.id];
  if (!r || r.stopped) return null;
  const t = terminals().find((x) => x.address === r.terminal);
  const ended = (code) => ({ state: code === 0 ? "ok" : "error", code, live: t?.state === "live", terminal: r.terminal });
  const label = t?.labels?.["cmdbtn.exit"];
  if (label !== undefined) return ended(Number(label));
  const asking = (waiting ?? new Set(shared("cmdbuttons.waiting") ?? [])).has(r.terminal);
  if (t?.state === "live") return { state: asking ? "input" : "running", live: true, terminal: r.terminal };
  if (r.exit !== undefined && r.exit !== null) return ended(r.exit);
  return null;
}

function where(b) {
  if (b.folder) return b.folder.replace(/^~(?=\/|$)/, home());
  const f = focused();
  const space = f && spaces().find((s) => s.id === f.space);
  return (!space?.machine && f?.cwd) || home();
}

export function openWindow(b, terminal) {
  openOverlay({
    // A dialog: a click outside it hides it (the command keeps running; click
    // its button to look again). Esc goes to the terminal, not to the dialog.
    kind: "dialog", width: 760, height: 460,
    layout: {
      type: "column",
      children: [
        { type: "block", size: { px: SIZE.chrome }, content: { mod: "cmd-buttons", props: { view: "title", id: b.id, terminal } } },
        { type: "block", padding: [8, 12], background: "background", content: { terminal } },
      ],
    },
  });
}

// Runs b (again): the old terminal goes, a new one opens in its window.
export async function start(b, show = b.openOnRun !== false) {
  const old = runs()[b.id];
  if (old?.terminal && terminals().some((x) => x.address === old.terminal && x.state === "live")) {
    await hc(["kill", old.terminal]).catch(() => {});
  }
  const r = await hc([
    "run", "--bg", "--json", "--no-parent", "--no-notify", "--label", `cmdbtn=${b.id}`,
    "--cwd", where(b), "--", "sh", `${appHome()}/${DIR}/run.sh`, b.command,
  ]);
  let address;
  try { address = JSON.parse(r.stdout).address; } catch {}
  if (!address) throw new Error((r.stderr || r.stdout || "hc run failed").trim());
  let pid = null;
  try { pid = JSON.parse((await hc(["get", address, "--json"])).stdout).pid ?? null; } catch {}
  setRun(b.id, { terminal: address, pid });
  if (show) openWindow(b, address);
}

export async function stop(b) {
  const r = runs()[b.id];
  if (r?.terminal) await hc(["kill", r.terminal]).catch(() => {});
  setRun(b.id, r ? { ...r, stopped: true } : null);
}

// What a click does: show it while it's still going, else run it.
export function press(b) {
  const s = statusOf(b);
  if (s?.live && (b.longRunning || s.state === "running" || s.state === "input")) openWindow(b, s.terminal);
  else start(b).catch((e) => notify({ title: `Couldn't start ${b.name || b.command}`, body: String(e?.message ?? e), level: "error" }));
}

// ---- drawing helpers -------------------------------------------------------

export function iconEl(icon, size, color) {
  const name = icon || "terminal";
  if (ICONS.includes(name)) return svg(`${DIR}/icons/${name}.svg`).size(size).flex_none().text_color(color);
  if (/\.svg$/i.test(name)) return svg(name).size(size).flex_none().text_color(color);
  if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return image(name).size(size).flex_none();
  return div().flex_none().text_size(size).line_height(1).text_color(color).child(name);
}

const btn = (t, id, text, primary, action) => button(t, id, text, action, { variant: primary ? "primary" : "ghost" });

const iconBtn = (t, id, icon, tip, action, color) =>
  uiIconBtn(t, id, `${DIR}/icons/${icon}.svg`, tip, action, { color });

export function openEditor(id) {
  openOverlay({ mod: "cmd-buttons", kind: "dialog", width: 440, height: 418, props: { view: "edit", id: id ?? null } });
}
export function openManager() {
  const count = buttons().length;
  const height = Math.min(480, Math.max(210, 126 + count * 52));
  openOverlay({ mod: "cmd-buttons", kind: "dialog", width: 440, height, props: { view: "manage" } });
}

// ---- the mod ---------------------------------------------------------------

export default class CmdButtons extends View {
  init(_props, cx) {
    this.view = props()?.view ?? "bar";
    this.waiting = new Set();
    this.faded = new Set(); // terminals whose finished color has faded
    this.endedAt = {};
    this.handle = cx.focus_handle();
    if (this.view === "bar") this.initBar(cx);
    else if (this.view === "edit") this.initEdit(cx);
    else if (this.view === "manage") { this.at = 0; this.hovered = null; this.confirm = null; this.handle.focus(); }
    else if (this.view === "menu") { this.at = 0; this.confirm = null; this.handle.focus(); }
    if (this.view !== "bar" && !shared("cmdbuttons.list")) cx.spawn(async (cx) => { await load().catch(() => {}); cx.notify(); });
  }

  render(cx) {
    switch (this.view) {
      case "edit": return this.renderEdit(cx);
      case "manage": return this.renderManage(cx);
      case "menu": return this.renderMenu(cx);
      case "title": return this.renderTitle(cx);
      default: return this.renderBar(cx);
    }
  }

  // ---- bar ----

  initBar(cx) {
    // The file: read now, and again now and then for hand edits.
    this.raw = undefined;
    const reload = (cx) => cx.spawn(async (cx) => {
      try {
        const raw = await readTextFile(FILE());
        if (raw !== this.raw) { this.raw = raw; const list = parse(raw); if (list) setShared("cmdbuttons.list", list); }
      } catch {}
      cx.notify();
    });
    reload(cx);
    cx.timer.every(3000, (cx) => reload(cx));
    // Prompts: who's blocked reading its terminal. Only while something runs.
    cx.timer.every(1500, (cx) => this.poll(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        cx.notify(); // a reloaded build's loop ends here instead of taking the command
        if (c === "settings" || c === "manage") openManager();
        else if (c === "add") openEditor(null);
        else if (/^run[1-9]$/.test(c)) { const b = buttons()[Number(c.slice(3)) - 1]; if (b) press(b); }
      }
    });
  }

  // Finished runs (not long running) lose their color FADE ms after they end.
  fade(cx) {
    const now = Date.now();
    let changed = false;
    for (const b of buttons()) {
      const s = statusOf(b, this.waiting);
      if (b.longRunning || !s?.terminal || (s.state !== "ok" && s.state !== "error")) continue;
      this.endedAt[s.terminal] ??= now;
      if (now - this.endedAt[s.terminal] >= FADE && !this.faded.has(s.terminal)) { this.faded.add(s.terminal); changed = true; }
    }
    if (changed) {
      // Shared, so the manager fades them too. Only current runs are kept.
      const current = new Set(buttons().map((b) => runs()[b.id]?.terminal).filter(Boolean));
      for (const k of this.faded) if (!current.has(k)) this.faded.delete(k);
      setShared("cmdbuttons.faded", [...this.faded]);
      cx.notify();
    }
  }

  poll(cx) {
    this.fade(cx);
    if (this.polling) return;
    const live = [];
    const all = runs();
    // Runs of buttons that are gone (deleted, or edited out of the file).
    if (shared("cmdbuttons.list")) {
      const ids = new Set(buttons().map((b) => b.id));
      const kept = Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)));
      if (Object.keys(kept).length !== Object.keys(all).length) setShared("cmdbuttons.runs", kept);
    }
    // A button without a run, with a live terminal labeled as its own (its run
    // was lost): take that one back, newest first.
    for (const b of buttons()) {
      if (all[b.id]) continue;
      const own = terminals().filter((x) => x.state === "live" && x.labels?.cmdbtn === b.id).pop();
      if (own) {
        setRun(b.id, { terminal: own.address, pid: null });
        cx.spawn(async () => {
          try { const pid = JSON.parse((await hc(["get", own.address, "--json"])).stdout).pid; const now = runs()[b.id]; if (now?.terminal === own.address) setRun(b.id, { ...now, pid }); } catch {}
        });
        return;
      }
    }
    for (const b of buttons()) {
      const r = all[b.id];
      if (!r || r.stopped) continue;
      const t = terminals().find((x) => x.address === r.terminal);
      if (t?.state === "live" && t.labels?.["cmdbtn.exit"] === undefined && r.pid) live.push([r.terminal, r.pid]);
      // Ended and gone from the live list: remember how, once.
      if ((!t || t.state !== "live") && r.exit === undefined) {
        this.polling = true;
        cx.spawn(async (cx) => {
          let exit = null, ended = false;
          try {
            const g = JSON.parse((await hc(["get", r.terminal, "--json"])).stdout);
            ended = g.state !== "live";
            const label = g.labels?.["cmdbtn.exit"];
            exit = label !== undefined ? Number(label) : g.reason === "exited" ? g.exit_code : null;
          } catch (e) { ended = /not found|no such|unknown/i.test(String(e?.message ?? e)); }
          // Just started (not in the live list yet) stays as it is.
          const now = runs()[b.id];
          if (ended && now?.terminal === r.terminal) setRun(b.id, { ...now, exit, stopped: now.stopped || exit === null });
          this.polling = false;
          cx.notify();
        });
        return;
      }
    }
    if (!live.length) { if (this.waiting.size) { this.waiting = new Set(); setShared("cmdbuttons.waiting", []); cx.notify(); } return; }
    this.polling = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", [`${appHome()}/${DIR}/waiting.sh`, ...live.map(([, pid]) => String(pid))]);
        const pids = new Set(r.stdout.split("\n").map((s) => s.trim()).filter(Boolean));
        const next = new Set(live.filter(([, pid]) => pids.has(String(pid))).map(([tm]) => tm));
        // Event-loop programs (Node prompts) wait in epoll like servers do: there,
        // a prompt-looking last line that stayed put since the last look.
        const screens = {};
        for (const [tm] of live) {
          if (next.has(tm)) continue;
          const out = await hc(["read", tm]).catch(() => null);
          const last = (out?.stdout ?? "").split("\n").map((l) => l.trimEnd()).filter(Boolean).pop() ?? "";
          screens[tm] = out?.stdout ?? "";
          if (PROMPT.test(last) && this.screens?.[tm] === screens[tm]) next.add(tm);
        }
        this.screens = screens;
        if ([...next].join() !== [...this.waiting].join()) { this.waiting = next; setShared("cmdbuttons.waiting", [...next]); cx.notify(); }
      } catch {}
      this.polling = false;
    });
  }

  renderBar() {
    const t = theme();
    const list = buttons();
    const collapsed = narrow();
    if (collapsed) {
      const states = list.map((b) => ({ b, s: statusOf(b, this.waiting) })).filter((x) => x.s);
      const active = states.find((x) => x.s.state === "error")
        ?? states.find((x) => x.s.state === "input")
        ?? states.find((x) => x.s.state === "running");
      const dotKind = active ? (active.b.longRunning && active.s.state === "running" ? "ok" : active.s.state) : null;
      const activeCount = states.filter((x) => x.s.state === "running" || x.s.state === "input").length;
      const collapsedTip = activeCount > 0 ? `Command buttons (${list.length} · ${activeCount} active)` : `Command buttons (${list.length})`;
      return h_flex().id("root").size_full().bg(t.chrome).border_b_1().border_color(t.border)
        .items_center().justify_center()
        .child(h_flex().id("cmd-collapsed").relative().size(SIZE.btn).rounded(RADIUS.sm)
          .items_center().justify_center().cursor_pointer()
          .text_color(t.muted)
          .hover((st) => st.bg(t.hover).text_color(t.foreground))
          .tooltip(collapsedTip)
          .on_click(() => openManager())
          .child(svg(`${DIR}/icons/square-terminal.svg`).size(SIZE.icon))
          .when(Boolean(dotKind), (el) => el.child(
            div().absolute().top(1).right(1).child(dot(t, dotKind, {
              pulse: active.s.state === "input",
              size: 5,
            })),
          )));
    }
    return h_flex().id("root").size_full().bg(t.chrome).border_b_1().border_color(t.border)
      .pl(8).pr(8).gap(2).items_center()
      .on_mouse_down("right", () => {})
      .child(h_flex().id("cmd-row").flex_1().min_w(0).h_full().gap(2).items_center().overflow_x_scroll()
        .children(list.map((b, i) => this.barButton(b, i, list, t))))
      .when(list.length > 0, (el) => el.child(iconBtn(t, "cmd-manage-btn", "sliders", "Manage command buttons", () => openManager())))
      .when(list.length === 0, (el) => el.child(iconBtn(t, "cmd-add", "plus", "Add command button", () => openEditor(null))));
  }

  barButton(b, _i, list, t) {
    const s = statusOf(b, this.waiting);
    const c = s ? color(t, s.state, b.longRunning) : null;
    const isFaded = Boolean(s?.terminal && this.faded.has(s.terminal) && !b.longRunning);
    const shown = Boolean(c) && !isFaded;
    const going = shown && (s?.state === "running" || s?.state === "input");
    const dotKind = s ? (b.longRunning && s.state === "running" ? "ok" : s.state) : null;
    const healthyDaemon = shown && b.longRunning && s?.state === "running";
    const tinted = shown && !healthyDaemon;
    const tipState = stateLabelOf(b, s);
    const tip = `${b.name || b.command}${tipState ? ` · ${tipState.toLowerCase()}` : ""} · right-click for menu`;
    const label = shortLabel(b, list);

    return h_flex().id(`cmd-${b.id}`).h(SIZE.btn).px(7).gap(5).flex_none().rounded(RADIUS.sm)
      .items_center().cursor_pointer()
      .bg(tinted ? alpha(c, 0.14) : TRANSPARENT)
      .hover((st) => st.bg(tinted ? alpha(c, 0.22) : t.hover))
      .tooltip(tip)
      .on_click(() => press(b))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "cmd-buttons", kind: "popup", width: 190, height: 220, props: { view: "menu", id: b.id } });
      })
      .child(iconEl(b.icon, SIZE.icon, tinted ? c : t.muted))
      .child(div().max_w(88).truncate().text_size(TYPE.sub).text_color(shown ? t.foreground : t.muted)
        .when(shown, (el) => el.font_medium())
        .child(label))
      .when(shown && (going || s?.state === "error"), (el) => el.child(dot(t, dotKind, { pulse: s.state === "input" })));
  }

  // ---- edit ----

  initEdit() {
    const b = buttons().find((x) => x.id === props()?.id) ?? {};
    this.editing = b.id ?? null;
    this.icon = b.icon || "terminal";
    this.pickingIcon = false;
    this.long = Boolean(b.longRunning);
    this.open = b.openOnRun !== false;
    this.error = "";
    this.focus = "command";
    const field = (key, value, placeholder) => {
      const s = InputState.new({ value: value ?? "", placeholder });
      s.on("focus", (_e, cx) => { this.focus = key; cx.notify(); });
      s.on("submit", (_e, cx) => this.submitEdit(cx));
      s.on("change", (_e, cx) => cx.notify());
      return s;
    };
    this.name = field("name", b.name, "Optional (defaults to command)");
    this.command = field("command", b.command, "e.g. npm run dev");
    this.folder = field("folder", b.folder, "Optional (defaults to active folder)");
    this.command.focus();
  }

  toggle(t, id, key, title, hint) {
    return toggle(t, id, this[key], title, hint, (_e, cx) => { this[key] = !this[key]; cx.notify(); });
  }

  submitEdit(cx) {
    const command = this.command.value().trim();
    if (!command) { this.error = "A command is needed."; cx.notify(); return; }
    const entry = {
      id: this.editing ?? `b${Date.now().toString(36)}`,
      name: this.name.value().trim() || command.split(/\s+/)[0],
      command,
      icon: this.icon,
      folder: this.folder.value().trim(),
      longRunning: this.long,
      openOnRun: this.open,
    };
    const list = [...buttons()];
    const i = list.findIndex((x) => x.id === entry.id);
    if (i >= 0) list[i] = entry; else list.push(entry);
    const overlay = props().overlay;
    cx.spawn(async (cx) => {
      try { await save(list); closeOverlay(overlay); }
      catch (e) { this.error = `Couldn't save: ${e?.message ?? e}`; cx.notify(); }
    });
  }

  renderEdit() {
    const t = theme();
    const p = props() ?? {};
    const label = (text, { err = "", first = false } = {}) => h_flex().flex_none().pt(first ? 0 : 10).pb(4).items_center().justify_between()
      .child(div().text_size(TYPE.meta).font_medium().text_color(t.muted).child(text))
      .when(Boolean(err), (el) => el.child(div().text_size(TYPE.meta).font_medium().text_color(color(t, "error")).child(err)));
    const input = (key, state, opts = {}) => textInput(t, state, this.focus === key, opts);
    const iconCell = (name) => h_flex().id(`ic-${name}`).size(28).flex_none().rounded(RADIUS.sm)
      .items_center().justify_center().cursor_pointer()
      .when(this.icon === name, (el) => el.bg(alpha(t.accent, 0.18)))
      .hover((s) => s.bg(this.icon === name ? alpha(t.accent, 0.24) : t.hover))
      .tooltip(name)
      .on_click((_e, cx) => { this.icon = name; this.pickingIcon = false; cx.notify(); })
      .child(svg(`${DIR}/icons/${name}.svg`).size(SIZE.icon).text_color(this.icon === name ? t.accent : t.muted));

    const canSave = Boolean(this.command.value().trim());
    const body = v_flex().id("cmd-edit-body").flex_1().min_h(0).overflow_y_scrollbar()
      .child(label("Command", { err: this.error === "A command is needed." ? this.error : "", first: true }))
      .child(input("command", this.command, { mono: true }))
      .child(label("Name"))
      .child(h_flex().gap(8).items_center()
        .child(h_flex().id("ed-icon-trigger").w(52).h(34).px(8).gap(4).flex_none().rounded(RADIUS.sm).items_center().justify_center()
          .bg(this.pickingIcon ? alpha(t.accent, 0.16) : t.background)
          .border_1().border_color(this.pickingIcon ? t.accent : TRANSPARENT)
          .cursor_pointer().hover((s) => s.bg(this.pickingIcon ? alpha(t.accent, 0.22) : t.hover))
          .tooltip(`Icon: ${this.icon} (click to change)`)
          .on_click((_e, cx) => { this.pickingIcon = !this.pickingIcon; cx.notify(); })
          .child(iconEl(this.icon, SIZE.icon, this.pickingIcon ? t.accent : t.foreground))
          .child(svg("mods/my-chrome/chevron-down.svg").size(SIZE.iconSm).flex_none().text_color(t.dim)))
        .child(input("name", this.name).flex_1().min_w(0)))
      .when(this.pickingIcon, (el) => el.child(
        v_flex().flex_none().mt(8).p(8).gap(4).rounded(RADIUS.sm).bg(t.background)
          .child(h_flex().w_full().justify_between().children(ICONS.slice(0, 13).map(iconCell)))
          .child(h_flex().w_full().justify_between().children(ICONS.slice(13).map(iconCell))),
      ))
      .child(label("Folder"))
      .child(input("folder", this.folder, { mono: Boolean(this.folder.value()) }))
      .child(this.toggle(t, "ed-long", "long", "Long running", "Keeps running in the background"))
      .child(this.toggle(t, "ed-open", "open", "Open on run", "Opens output window on start"));

    const footer = h_flex().gap(8).items_center()
      .when(Boolean(this.error) && this.error !== "A command is needed.", (el) => el.child(div().flex_1().min_w(0).truncate().text_size(TYPE.meta).text_color(color(t, "error")).child(this.error)))
      .when(!this.error || this.error === "A command is needed.", (el) => el.child(div().flex_1()))
      .child(btn(t, "ed-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
      .child(button(t, "ed-save", "Save", (_e, cx) => this.submitEdit(cx), { variant: "primary", disabled: !canSave, tip: canSave ? "Save command button" : "Enter a command to save" }));

    return dialogFrame(t, {
      id: "cmd-edit",
      handle: this.handle,
      onKeyDown: (e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } },
      title: this.editing ? "Edit command button" : "New command button",
      onClose: () => closeOverlay(p.overlay),
      body,
      footer,
    });
  }

  // ---- manage ----

  renderManage() {
    const t = theme();
    const p = props() ?? {};
    const list = buttons();
    if (list.length && this.at >= list.length) this.at = list.length - 1;
    const drop = (to) => {
      const from = list.findIndex((x) => x.id === this.dragging);
      if (from < 0 || from === to) return;
      const next = [...list];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      save(next).catch(() => {});
    };
    const fromIndex = list.findIndex((x) => x.id === this.dragging);
    const row = (b, i) => {
      const st = statusOf(b);
      const s = faded(b, st) ? null : st;
      const c = s ? color(t, s.state, b.longRunning) : t.muted;
      const going = Boolean(s?.live && (s.state === "running" || s.state === "input"));
      const dotKind = s ? (b.longRunning && s.state === "running" ? "ok" : s.state) : null;
      const target = this.dragging && this.over === b.id && this.dragging !== b.id;
      const kbdSel = this.at === i && list.length > 0;
      const isHovered = this.hovered === b.id || this.dragging === b.id;
      const stateLabel = stateLabelOf(b, s);
      const metaCmd = b.folder && b.folder !== "~/" ? `${b.command} · ${b.folder}` : b.command;
      const canDrag = list.length > 1;
      return h_flex().id(`mg-${b.id}`).relative().h(48).pl(10).pr(6).gap(10).items_center().rounded(RADIUS.sm)
        .when(kbdSel && !this.dragging, (el) => el.bg(t.selected))
        .when(!this.dragging && !kbdSel, (el) => el.hover((st) => st.bg(t.hover)))
        .when(this.dragging === b.id, (el) => el.opacity(0.45))
        .when(target, (el) => el.child(div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, (l) => l.bottom(0)).when(fromIndex > i, (l) => l.top(0))))
        .on_hover((on, cx) => {
          if (on) this.hovered = b.id;
          else if (this.hovered === b.id) this.hovered = null;
          cx.notify();
        })
        .on_click((_e, cx) => { this.at = i; cx.notify(); })
        .on_mouse_move((_e, cx) => { if (this.dragging && this.over !== b.id) { this.over = b.id; cx.notify(); } })
        .on_mouse_up("left", (_e, cx) => {
          if (this.dragging) { drop(i); this.dragging = null; this.over = null; cx.notify(); }
        })
        .child(h_flex().id(`mg-grip-${b.id}`).size(20).flex_none().items_center().justify_center().rounded(RADIUS.xs)
          .when(isHovered && canDrag, (el) => el.cursor_grab().text_color(t.muted).hover((st) => st.text_color(t.foreground))
            .tooltip("Drag to reorder")
            .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.dragging = b.id; this.over = b.id; cx.notify(); })
            .child(svg(`${DIR}/icons/grip.svg`).size(SIZE.icon)))
          .when(!isHovered || !canDrag, (el) => el.child(iconEl(b.icon, 16, s && !(b.longRunning && s.state === "running") ? c : t.muted))))
        .child(v_flex().flex_1().min_w(0)
          .child(h_flex().gap(6).items_center().min_w(0)
            .child(div().min_w(0).truncate().text_size(TYPE.body).font_medium().child(b.name || b.command))
            .when(Boolean(stateLabel && dotKind), (el) => el.child(h_flex().gap(4).flex_none().items_center()
              .child(dot(t, dotKind, { size: 5 }))
              .child(div().text_size(TYPE.meta).font_medium().text_color(c).child(stateLabel)))))
          .child(div().pt(1).min_w(0).truncate().text_size(TYPE.meta).text_color(kbdSel && !this.dragging ? selectedMetaColor(t) : t.dim).font_family(monoFont()).child(metaCmd)))
        .when(this.confirm === b.id, (el) => el
          .child(div().text_size(TYPE.sub).text_color(color(t, "error")).child("Delete?"))
          .child(button(t, `mg-no-${b.id}`, "Keep", (_e, cx) => { this.confirm = null; cx.notify(); }, { variant: "ghost", height: 24 }))
          .child(button(t, `mg-yes-${b.id}`, "Delete", (_e, cx) => {
            this.confirm = null;
            stop(b).catch(() => {});
            setRun(b.id, null);
            save(list.filter((x) => x.id !== b.id)).catch(() => {});
            cx.notify();
          }, { variant: "danger", height: 24 })))
        .when(this.confirm !== b.id, (el) => el.child(
          h_flex().gap(2).flex_none().items_center()
            .when(going, (x) => x
              .when(isHovered, (h) => h.child(iconBtn(t, `mg-show-${b.id}`, "terminal", "Show output", () => { closeOverlay(p.overlay); press(b); })))
              .child(uiIconBtn(t, `mg-stop-${b.id}`, "mods/my-chrome/square.svg", "Stop process", () => { stop(b).catch(() => {}); }, { hoverColor: color(t, "error") })))
            .when(!going, (x) => x.child(iconBtn(t, `mg-run-${b.id}`, "play", "Run", () => { closeOverlay(p.overlay); press(b); })))
            .when(isHovered, (x) => x
              .child(iconBtn(t, `mg-ed-${b.id}`, "pencil", "Edit", () => openEditor(b.id)))
              .child(uiIconBtn(t, `mg-rm-${b.id}`, `${DIR}/icons/trash.svg`, "Delete", (_e, cx) => { this.confirm = b.id; cx.notify(); }, { hoverColor: color(t, "error") }))),
        ));
    };

    const body = v_flex().id("mg-list").flex_1().min_h(0).gap(2).overflow_y_scrollbar()
      .on_mouse_up("left", (_e, cx) => { if (this.dragging) { this.dragging = null; this.over = null; cx.notify(); } })
      .when(!list.length, (el) => el.child(h_flex().flex_1().items_center().justify_center().py(24).text_color(t.muted).text_size(TYPE.sub).child("No buttons yet.")))
      .children(list.map(row));

    const selBtn = list[this.at];
    const selStatus = selBtn ? statusOf(selBtn) : null;
    const selActive = Boolean(selBtn && selStatus?.live && (selStatus.state === "running" || selStatus.state === "input"));
    const footerHint = selActive ? "↑↓ select · Enter show · s stop · e edit · d delete" : "↑↓ select · Enter run · e edit · d delete";
    const footer = h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.meta).text_color(t.dim).child(footerHint))
      .child(btn(t, "mg-add", "Add button", true, () => openEditor(null)));

    return dialogFrame(t, {
      id: "cmd-manage",
      handle: this.handle,
      onKeyDown: (e, cx) => {
        if (e.key === "escape") {
          if (this.confirm) { this.confirm = null; cx.notify(); }
          else closeOverlay(p.overlay);
          cx.stop_propagation();
        }
        else if ((e.key === "down" || e.key === "j") && list.length) { this.at = Math.min(list.length - 1, this.at + 1); cx.notify(); cx.stop_propagation(); }
        else if ((e.key === "up" || e.key === "k") && list.length) { this.at = Math.max(0, this.at - 1); cx.notify(); cx.stop_propagation(); }
        else if (e.key === "enter" && list[this.at]) { closeOverlay(p.overlay); press(list[this.at]); cx.stop_propagation(); }
        else if (e.key === "s" && selBtn && selActive) { stop(selBtn).catch(() => {}); cx.stop_propagation(); }
        else if (e.key === "e" && list[this.at]) { openEditor(list[this.at].id); cx.stop_propagation(); }
        else if ((e.key === "d" || e.key === "backspace") && list[this.at]) { this.confirm = list[this.at].id; cx.notify(); cx.stop_propagation(); }
      },
      title: "Command buttons",
      onClose: () => closeOverlay(p.overlay),
      body,
      footer,
    })
      .when(Boolean(this.dragging), (el) => el.cursor_grabbing())
      .on_mouse_up("left", (_e, cx) => { if (this.dragging) { this.dragging = null; this.over = null; cx.notify(); } });
  }

  // ---- menu ----

  menuItems(b) {
    const s = statusOf(b);
    const going = s?.live && (s.state === "running" || s.state === "input");
    return [
      // Long running ones show theirs with a click instead.
      ...(!b.longRunning && s?.live ? [["Show output", "terminal", () => openWindow(b, s.terminal)]] : []),
      // Long running: no Run again, only Run once it isn't going anymore.
      ...(b.longRunning && s?.live ? [] : [[s && !b.longRunning ? "Run again" : "Run", "play", () => start(b).catch(() => {})]]),
      ...(going ? [["Stop", "mods/my-chrome/square.svg", () => stop(b).catch(() => {})]] : []),
      ["Edit…", "pencil", () => openEditor(b.id)],
      ["All buttons…", "settings", () => openManager()],
    ];
  }

  renderMenu() {
    const t = theme();
    const p = props() ?? {};
    const b = buttons().find((x) => x.id === p.id);
    const list = b ? this.menuItems(b) : [];
    const choose = (i) => { const it = list[i]; if (!it) return; closeOverlay(p.overlay); it[2](); };
    return menuFrame(t, "cmd-menu").track_focus(this.handle).min_h(0).text_size(TYPE.body)
      .on_key_down((e, cx) => {
        if (e.key === "down" || e.key === "j") this.at = (this.at + 1) % list.length;
        else if (e.key === "up" || e.key === "k") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") choose(this.at);
        else if (e.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.notify();
      })
      .children(list.map((it, i) => menuRow(t, `cm-${i}`, {
        icon: it[1].includes("/") ? it[1] : `${DIR}/icons/${it[1]}.svg`,
        label: it[0],
        selected: i === this.at,
        onClick: () => choose(i),
      })));
  }

  // ---- title (the floating window's bar; presses it doesn't stop drag the window) ----

  renderTitle() {
    const t = theme();
    const p = props() ?? {};
    const b = buttons().find((x) => x.id === p.id) ?? { id: p.id, name: "Command", command: "" };
    const s = statusOf(b);
    const mine = s?.terminal === p.terminal;
    const state = mine ? s.state : null;
    const c = state ? color(t, state, b.longRunning) : t.muted;
    const going = state === "running" || state === "input";
    return floatingTitleBar(t, {
      id: "cmd-title",
      iconEl: iconEl(b.icon, SIZE.icon, c),
      title: b.name || b.command,
      subtitle: b.command && b.name && b.name !== b.command ? b.command : null,
      badges: state ? [
        badge(t, stateLabelOf(b, s), {
          fg: c,
          bg: alpha(c, 0.16),
        }),
      ] : [],
      actions: !b.longRunning ? [iconBtn(t, "tt-rerun", "refresh", "Run again", () => start(b, true).catch(() => {}))] : [],
      onStop: going || s?.live ? () => {
        if (going) stop(b).catch(() => {});
        else if (s?.live) hc(["kill", s.terminal]).catch(() => {});
        closeOverlay(p.overlay);
      } : null,
      stopTip: "Stop process and close",
      onHide: () => closeOverlay(p.overlay),
    });
  }
}
