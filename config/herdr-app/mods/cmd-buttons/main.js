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
// Color: blue running or succeeded, orange waiting for input, red failed.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import {
  appHome, home, hc, exec, run, theme, terminals, focused, spaces, props, shared, setShared,
  openOverlay, closeOverlay, readTextFile, writeTextFile, nextCommand,
} from "herdr";

const DIR = "mods/cmd-buttons";
const FILE = () => `${appHome()}/cmd-buttons.json`;
export const ICONS = [
  "terminal", "play", "rocket", "hammer", "wrench", "bug", "flask", "code", "package",
  "database", "server", "cloud", "globe", "upload", "download", "refresh", "zap",
  "git-branch", "search", "eye", "send", "star", "trash", "folder", "file-text", "settings",
];
const FADE = 3000;
const COLOR = { running: "#4f8ff7", ok: "#4f8ff7", input: "#f0883e", error: "#e5534b" };
// A last line like this, unchanged for a moment, is a question for the user.
const PROMPT = /(\?|>|:|›|❯|\[y\/n\]|\(y\/n\)|\[y\/N\]|\[Y\/n\])$/i;
const LABEL = { running: "Running", ok: "Done", input: "Needs input", error: "Failed" };

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
        { type: "block", size: { px: 32 }, content: { mod: "cmd-buttons", props: { view: "title", id: b.id, terminal } } },
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
  else start(b).catch(() => {});
}

// ---- drawing helpers -------------------------------------------------------

export function iconEl(icon, size, color) {
  const name = icon || "terminal";
  if (ICONS.includes(name)) return svg(`${DIR}/icons/${name}.svg`).size(size).flex_none().text_color(color);
  if (/\.svg$/i.test(name)) return svg(name).size(size).flex_none().text_color(color);
  if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return image(name).size(size).flex_none();
  return div().flex_none().text_size(size).line_height(1).text_color(color).child(name);
}

const btn = (t, id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
  .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
  .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
  .hover((s) => s.opacity(0.88)).on_click(action).child(text);

const iconBtn = (t, id, icon, tip, action, color) => h_flex().id(id).size(24).flex_none().rounded(6)
  .items_center().justify_center().cursor_pointer().hover((s) => s.bg(t.hover))
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
  .on_click((e, cx) => { cx.stop_propagation(); action(e, cx); })
  .tooltip(tip).child(svg(`${DIR}/icons/${icon}.svg`).size(13).text_color(color ?? t.muted));

// A small labeled chip: the folder keeps its width, the command shrinks first.
const tag = (t, icon, text, fixed) => h_flex().h(19).px(6).gap(4).items_center().rounded(5)
  .bg(t.raised).border_1().border_color(t.border).text_size(11).text_color(t.muted).font_family("JetBrains Mono")
  .when(fixed, (el) => el.flex_none().max_w(160)).when(!fixed, (el) => el.min_w(0).flex_shrink(1))
  .child(svg(`${DIR}/icons/${icon}.svg`).size(11).flex_none().text_color(t.dim))
  .child(div().min_w(0).truncate().child(text));

export function openEditor(id) {
  openOverlay({ mod: "cmd-buttons", kind: "dialog", width: 460, height: 610, props: { view: "edit", id: id ?? null } });
}
export function openManager() {
  openOverlay({ mod: "cmd-buttons", kind: "dialog", width: 560, height: 480, props: { view: "manage" } });
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
    else if (this.view === "manage" || this.view === "menu") { this.at = 0; this.confirm = null; this.handle.focus(); }
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
    return h_flex().id("root").size_full().bg(t.chrome).px(10).gap(6).items_center()
      .on_mouse_down("right", () => {})
      .child(h_flex().id("cmd-row").flex_1().min_w(0).h_full().gap(5).items_center().overflow_x_scroll()
        .children(list.map((b) => this.barButton(b, t))));
  }

  barButton(b, t) {
    const s = statusOf(b, this.waiting);
    const c = s ? COLOR[s.state] : null;
    // A finished run's color fades after a moment, unless it's long running.
    const faded = Boolean(s?.terminal && this.faded.has(s.terminal) && !b.longRunning);
    const shown = Boolean(c) && !faded;
    const tip = `${b.name || b.command}${s ? ` · ${s.state === "error" ? `failed (${s.code})` : LABEL[s.state].toLowerCase()}` : ""}`;
    return h_flex().id(`cmd-${b.id}`).relative().size(30).flex_none().rounded(8).items_center().justify_center()
      .cursor_pointer()
      .when(!shown, (el) => el.hover((st) => st.bg(t.hover)))
      .tooltip(tip)
      .on_click(() => press(b))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "cmd-buttons", kind: "popup", width: 190, height: 220, props: { view: "menu", id: b.id } });
      })
      // Inactive: a thin border, crossfading with the colored tint below.
      .child(div().id(`edge-${b.id}`).absolute().inset(0).rounded(8).border_1().border_color(t.border)
        .opacity(shown ? 0 : 1).transition("opacity", 900))
      // The tint and the colored icon lie over the plain button and fade out.
      .child(div().id(`tint-${b.id}`).absolute().inset(0).rounded(8).border_1()
        .when(Boolean(c), (el) => el.bg(`${c}2e`).border_color(`${c}80`))
        .opacity(shown ? 1 : 0).transition("opacity", 900))
      .child(div().relative().size(16).flex_none()
        .child(div().id(`icm-${b.id}`).absolute().inset(0).opacity(shown ? 0 : 1).transition("opacity", 900)
          .child(iconEl(b.icon, 16, t.muted)))
        .when(Boolean(c), (el) => el.child(div().id(`ic-${b.id}`).absolute().inset(0)
          .opacity(shown ? 1 : 0).transition("opacity", 900)
          .child(iconEl(b.icon, 16, c)))));
  }

  // ---- edit ----

  initEdit(cx) {
    const b = buttons().find((x) => x.id === props()?.id) ?? {};
    this.editing = b.id ?? null;
    this.icon = b.icon || "terminal";
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
    this.name = field("name", b.name, "Optional: the command's first word");
    this.command = field("command", b.command, "npm run dev");
    this.folder = field("folder", b.folder, "Empty: the focused terminal's folder");
    this.command.focus();
    cx.timer.after(400, () => this.command.focus());
  }

  toggle(t, id, key, title, hint) {
    const on = this[key];
    return h_flex().id(id).pt(12).gap(10).items_center().cursor_pointer()
      .on_click((_e, cx) => { this[key] = !this[key]; cx.notify(); })
      .child(h_flex().w(30).h(18).flex_none().rounded(9).p(2).bg(on ? t.accent : t.input)
        .when(on, (el) => el.justify_end())
        .child(div().size(14).rounded(7).bg("#ffffff")))
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_size(12.5).child(title))
        .child(div().text_size(11.5).text_color(t.dim).child(hint)));
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

  renderEdit(cx) {
    const t = theme();
    const p = props() ?? {};
    const label = (text) => div().pt(14).pb(6).text_size(11.5).text_color(t.dim).child(text);
    const input = (key, state) => Input.new(state).h(34).px(10).rounded(8).border_1()
      .border_color(this.focus === key ? t.accent : t.input).bg(t.background).text_size(12.8).text_color(t.foreground);
    const preview = this.icon;
    return v_flex().id("cmd-edit").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .size_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().gap(10)
        .child(h_flex().size(30).rounded(8).items_center().justify_center().bg(`${COLOR.ok}2e`).border_1().border_color(`${COLOR.ok}80`)
          .child(iconEl(preview, 16, COLOR.ok)))
        .child(div().flex_1().text_size(15).font_semibold().child(this.editing ? "Edit command button" : "New command button")))
      .child(label("Command"))
      .child(input("command", this.command))
      .child(label("Name"))
      .child(input("name", this.name))
      .child(label("Folder"))
      .child(input("folder", this.folder))
      .child(this.toggle(t, "ed-long", "long", "Long running", "A server or a tunnel: no Run again, so it isn't restarted by accident."))
      .child(this.toggle(t, "ed-open", "open", "Open on run", "Show its window when it starts. Off: it runs in the background; click it to look."))
      .child(label("Icon"))
      .child(h_flex().flex_wrap().gap(4).children(ICONS.map((name) => h_flex().id(`ic-${name}`).size(30).rounded(7)
        .items_center().justify_center().cursor_pointer().border_1()
        .border_color(this.icon === name ? t.accent : "#00000000")
        .when(this.icon === name, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .tooltip(name)
        .on_click((_e, cx) => { this.icon = name; cx.notify(); })
        .child(svg(`${DIR}/icons/${name}.svg`).size(15).text_color(this.icon === name ? t.foreground : t.muted)))))
      .child(div().flex_1())
      .when(Boolean(this.error), (el) => el.child(div().pt(8).text_size(12).text_color(COLOR.error).child(this.error)))
      .child(h_flex().pt(16).gap(8).justify_end()
        .child(btn(t, "ed-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(btn(t, "ed-save", "Save", true, (_e, cx) => this.submitEdit(cx))));
  }

  // ---- manage ----

  renderManage() {
    const t = theme();
    const p = props() ?? {};
    const list = buttons();
    // Drag by the grip; drop on another row puts it there.
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
      const c = s ? COLOR[s.state] : t.muted;
      const target = this.dragging && this.over === b.id && this.dragging !== b.id;
      return h_flex().id(`mg-${b.id}`).relative().h(46).pl(2).pr(10).gap(8).items_center().rounded(8)
        .when(!this.dragging, (el) => el.hover((st) => st.bg(t.hover)))
        .when(this.dragging === b.id, (el) => el.opacity(0.45))
        .when(target, (el) => el.child(div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, (l) => l.bottom(0)).when(fromIndex > i, (l) => l.top(0))))
        .on_mouse_move((_e, cx) => { if (this.dragging && this.over !== b.id) { this.over = b.id; cx.notify(); } })
        .on_mouse_up("left", (_e, cx) => {
          if (this.dragging) { drop(i); this.dragging = null; this.over = null; cx.notify(); }
        })
        .child(h_flex().id(`mg-grip-${b.id}`).w(16).h(28).flex_none().items_center().justify_center().rounded(5)
          .cursor_grab().text_color(t.dim).hover((st) => st.text_color(t.foreground))
          .tooltip("Drag to reorder")
          .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.dragging = b.id; this.over = b.id; cx.notify(); })
          .child(svg(`${DIR}/icons/grip.svg`).size(14)))
        .child(h_flex().size(28).flex_none().rounded(7).items_center().justify_center()
          .border_1().when(Boolean(s), (el) => el.bg(`${c}2e`).border_color(`${c}80`))
          .when(!s, (el) => el.border_color(t.border)).child(iconEl(b.icon, 15, c)))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_size(13).child(b.name || b.command))
          .child(h_flex().pt(3).gap(5).min_w(0).items_center()
            .child(tag(t, "folder", b.folder || "focused folder", true))
            .child(tag(t, "terminal", b.command, false))))
        .when(this.confirm === b.id, (el) => el
          .child(div().text_size(12).text_color(COLOR.error).child("Delete?"))
          .child(btn(t, `mg-no-${b.id}`, "Keep", false, (_e, cx) => { this.confirm = null; cx.notify(); }).h(26).px(10))
          .child(btn(t, `mg-yes-${b.id}`, "Delete", true, (_e, cx) => {
            this.confirm = null;
            stop(b).catch(() => {});
            setRun(b.id, null);
            save(list.filter((x) => x.id !== b.id)).catch(() => {});
            cx.notify();
          }).h(26).px(10)))
        .when(this.confirm !== b.id, (el) => el
          .child(iconBtn(t, `mg-run-${b.id}`, "play", "Run", () => { closeOverlay(p.overlay); press(b); }))
          .child(iconBtn(t, `mg-ed-${b.id}`, "pencil", "Edit", () => openEditor(b.id)))
          .child(iconBtn(t, `mg-rm-${b.id}`, "trash", "Delete", (_e, cx) => { this.confirm = b.id; cx.notify(); })));
    };
    return v_flex().id("cmd-manage").track_focus(this.handle)
      .when(Boolean(this.dragging), (el) => el.cursor_grabbing())
      .on_mouse_up("left", (_e, cx) => { if (this.dragging) { this.dragging = null; this.over = null; cx.notify(); } })
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .size_full().min_h(0).p(18).gap(4).bg(t.popover).text_color(t.foreground)
      .child(div().pb(12).text_size(15).font_semibold().child("Command buttons"))
      .child(v_flex().id("mg-list").flex_1().min_h(0).overflow_y_scrollbar()
        .on_mouse_up("left", (_e, cx) => { if (this.dragging) { this.dragging = null; this.over = null; cx.notify(); } })
        .when(!list.length, (el) => el.child(div().py(24).text_color(t.dim).text_size(12.5).child("No buttons yet.")))
        .children(list.map(row)))
      .child(h_flex().pt(12).gap(8).justify_end()
        .child(btn(t, "mg-close", "Close", false, () => closeOverlay(p.overlay)))
        .child(btn(t, "mg-add", "Add button", true, () => openEditor(null))));
  }

  // ---- menu ----

  menuItems(b) {
    const s = statusOf(b);
    const going = s?.live && (s.state === "running" || s.state === "input");
    return [
      // Long running ones show theirs with a click instead.
      ...(!b.longRunning && s?.live ? [["Show output", "eye", () => openWindow(b, s.terminal)]] : []),
      // Long running: no Run again, only Run once it isn't going anymore.
      ...(b.longRunning && s?.live ? [] : [[s && !b.longRunning ? "Run again" : "Run", "play", () => start(b).catch(() => {})]]),
      ...(going ? [["Stop", "stop", () => stop(b).catch(() => {})]] : []),
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
    return v_flex().id("cmd-menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") choose(this.at);
        else if (e.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.notify();
      })
      .children(list.map((it, i) => h_flex().id(`cm-${i}`).h(30).px(8).gap(9).rounded(7).items_center()
        .text_color(t.foreground).when(i === this.at, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
        .on_click(() => choose(i))
        .child(svg(`${DIR}/icons/${it[1]}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(it[0]))));
  }

  // ---- title (the floating window's bar; presses it doesn't stop drag the window) ----

  renderTitle(cx) {
    const t = theme();
    const p = props() ?? {};
    const b = buttons().find((x) => x.id === p.id) ?? { id: p.id, name: "Command", command: "" };
    const s = statusOf(b);
    const mine = s?.terminal === p.terminal;
    const state = mine ? s.state : null;
    const c = state ? COLOR[state] : t.muted;
    const going = state === "running" || state === "input";
    return h_flex().id("cmd-title").size_full().px(10).gap(8).items_center().bg(t.chrome)
      .border_b_1().border_color(t.border).text_size(12.5)
      .child(iconEl(b.icon, 14, c))
      .child(div().flex_shrink(0).max_w(220).truncate().font_medium().text_color(t.foreground).child(b.name || b.command))
      .child(div().flex_1())
      .when(Boolean(state), (el) => el.child(h_flex().flex_none().gap(5).items_center().px(7).h(20).rounded(10)
        .bg(`${c}26`).text_size(11).text_color(c)
        .child(div().size(6).rounded(3).bg(c).when(going, (d) => d.loop("opacity", { from: 0.35, to: 1, period: 1100 })))
        .child(state === "error" ? `Failed (${s.code})` : LABEL[state])))
      .when(!b.longRunning, (el) => el.child(iconBtn(t, "tt-rerun", "refresh", "Run again", () => start(b, true).catch(() => {}))))
      .child(iconBtn(t, "tt-hide", "minus", "Hide (keeps running)", () => closeOverlay(p.overlay)))
      .child(iconBtn(t, "tt-close", "x", "Stop and close", () => {
        // Still going: it's stopped. Already ended: its color stays.
        if (going) stop(b).catch(() => {});
        else if (s?.live) hc(["kill", s.terminal]).catch(() => {});
        closeOverlay(p.overlay);
      }));
  }
}
