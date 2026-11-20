// Keybinds settings: view, record, change, add and remove shortcuts in keys.json.
// Writes keys.json directly (no Save step), keeping its sections and order.
// Open with mod.open:keybinds (bound to ctrl-shift-, in keys.json).

import { View, div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, InputState, Input } from "gpui-base";
import { commands, theme, appHome, readTextFile, writeTextFile, props, closeOverlay, shared } from "herdr";

const FILE = () => `${appHome()}/keys.json`;
const ERR = () => `${appHome()}/keys.error`;

const MODIFIER_KEYS = new Set(["shift", "control", "ctrl", "alt", "option", "cmd", "super", "meta", "platform", "function", "fn", "capslock"]);
// Keys programs rely on (AGENTS.md): binding them takes them from typing.
const RESERVED = new Set(["ctrl-c", "ctrl-d", "ctrl-l", "ctrl-r", "ctrl-w", "ctrl-a", "ctrl-e", "ctrl-u", "ctrl-k", "ctrl-z", "ctrl-["]);
const PROTECTED = "ctrl-alt-shift-escape";

const SECTION_TITLES = { global: "Everywhere", terminal: "In a terminal" };
const sectionTitle = (s) =>
  SECTION_TITLES[s] ?? (s.startsWith("layout:") ? `Layout: ${s.slice(7)}` : s.startsWith("mod:") ? `Mod: ${s.slice(4)}` : s);

function actionText(a) {
  return typeof a === "string" ? a : JSON.stringify(a);
}

function describe(a) {
  if (typeof a !== "string") return `${a?.command ?? "?"} ${JSON.stringify(a?.args ?? {})}`;
  if (a === "terminal") return "pass to the program";
  if (a.startsWith("send:")) return "type " + JSON.stringify(a.slice(5));
  const i = a.indexOf(":");
  const name = i < 0 ? a : a.slice(0, i);
  const arg = i < 0 ? "" : a.slice(i + 1);
  const words = name.replace(/[._]/g, " ");
  return arg ? `${words} ${arg}` : words;
}

function parseAction(text) {
  const s = text.trim();
  if (!s) return { error: "Type an action" };
  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s);
      if (typeof o?.command !== "string") return { error: "An object action needs a \"command\"" };
      return { value: o };
    } catch (e) {
      return { error: "Invalid JSON" };
    }
  }
  return { value: s };
}

export default class Keybinds extends View {
  init(_props, cx) {
    this.data = null; // parsed keys.json
    this.raw = null; // its text, for safe writes
    this.loadError = null;
    this.fileError = null; // keys.error contents
    this.status = null;
    this.section = "global";
    this.filter = "";
    this.recording = null; // { section, key | null (new) }
    this.editing = null; // { section, key, isNew }
    this.editError = null;
    this.actionText = "";

    this.search = InputState.new({ placeholder: "Filter by key or action…" });
    this.search.on("change", (_e, cx) => { this.filter = this.search.value(); cx.notify(); });

    this.actionInput = InputState.new({ placeholder: "e.g. tab.new, pane.split:right, send:\\u001bb, terminal" });
    this.actionInput.on("change", (_e, cx) => { this.actionText = this.actionInput.value(); this.editError = null; cx.notify(); });
    this.actionInput.on("submit", (_e, cx) => this.commitAction(cx));

    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(400, () => this.handle.focus());

    cx.spawn(async (cx) => { await this.load(); cx.notify(); });
    // Pick up edits made elsewhere (an agent, an editor).
    cx.timer.every(2000, (cx) => {
      cx.spawn(async (cx) => {
        const text = await readTextFile(FILE());
        const err = await readTextFile(ERR());
        let changed = false;
        if (text !== this.raw && !this.editing && !this.recording) { await this.load(text); changed = true; }
        if ((err ?? null) !== this.fileError) { this.fileError = err ?? null; changed = true; }
        if (changed) cx.notify();
      });
    });
  }

  async load(text) {
    if (text === undefined) text = await readTextFile(FILE());
    this.fileError = (await readTextFile(ERR())) ?? null;
    if (text == null) {
      this.raw = null;
      this.data = { global: {}, terminal: {} };
      return;
    }
    try {
      const d = JSON.parse(text);
      this.raw = text;
      this.data = d && typeof d === "object" ? d : {};
      this.loadError = null;
    } catch (e) {
      this.raw = text;
      this.loadError = "keys.json isn't valid JSON right now, so it can't be edited here. Fix it in an editor.";
    }
  }

  sections() {
    const have = Object.keys(this.data ?? {});
    const out = ["global", "terminal"];
    const shown = shared("layout");
    if (shown) out.push(`layout:${shown}`);
    for (const s of have) if (!out.includes(s)) out.push(s);
    return out;
  }

  // Applies fn to a copy of the data, then writes keys.json.
  save(cx, fn, message) {
    if (this.loadError) return;
    const next = JSON.parse(JSON.stringify(this.data ?? {}));
    fn(next);
    for (const s of Object.keys(next)) {
      if (next[s] && typeof next[s] === "object" && Object.keys(next[s]).length === 0 && s !== "global" && s !== "terminal") delete next[s];
    }
    const text = JSON.stringify(next, null, 2) + "\n";
    const expected = this.raw;
    cx.spawn(async (cx) => {
      try {
        await writeTextFile(FILE(), text, expected);
        this.raw = text;
        this.data = next;
        this.status = { ok: true, text: message };
      } catch (e) {
        // Changed underneath us: reload and say so.
        await this.load();
        this.status = { ok: false, text: "keys.json changed elsewhere; reloaded it. Try again." };
      }
      cx.notify();
    });
  }

  // Replace a key in a section, keeping its place in the order.
  static renameKey(sec, oldKey, newKey, value) {
    const out = {};
    for (const [k, v] of Object.entries(sec)) {
      if (k === newKey && k !== oldKey) continue;
      if (k === oldKey) out[newKey] = value;
      else out[k] = v;
    }
    if (!(newKey in out)) out[newKey] = value;
    return out;
  }

  startRecord(section, key, cx) {
    this.recording = { section, key };
    this.editing = null;
    this.handle.focus();
    cx.notify();
  }

  recorded(stroke, cx) {
    const { section, key } = this.recording;
    this.recording = null;
    if (stroke === PROTECTED) {
      this.status = { ok: false, text: "ctrl-alt-shift-escape is the escape hatch and can't be rebound." };
      return cx.notify();
    }
    const sec = this.data?.[section] ?? {};
    if (key === null) {
      // New binding: key first, then action.
      if (stroke in sec) {
        this.status = { ok: false, text: `${stroke} already does “${describe(sec[stroke])}” here; edit that row instead.` };
        return cx.notify();
      }
      this.startEdit(section, stroke, true, "", cx);
      return;
    }
    if (stroke === key) return cx.notify();
    const replaced = stroke in sec ? sec[stroke] : undefined;
    this.save(cx, (d) => { d[section] = Keybinds.renameKey(d[section] ?? {}, key, stroke, d[section][key]); },
      replaced !== undefined ? `${key} → ${stroke} (replaced “${describe(replaced)}”)` : `${key} → ${stroke}`);
  }

  startEdit(section, key, isNew, value, cx) {
    this.editing = { section, key, isNew };
    this.editError = null;
    this.actionText = value;
    this.actionInput.set_value(value);
    this.actionInput.focus();
    cx.notify();
  }

  commitAction(cx, text) {
    if (!this.editing) return;
    const p = parseAction(text ?? this.actionText);
    if (p.error) { this.editError = p.error; return cx.notify(); }
    const { section, key } = this.editing;
    this.editing = null;
    this.handle.focus();
    this.save(cx, (d) => { d[section] = { ...(d[section] ?? {}), [key]: p.value }; }, `${key} now does “${describe(p.value)}”`);
  }

  remove(section, key, cx) {
    this.save(cx, (d) => { if (d[section]) delete d[section][key]; }, `Removed ${key}`);
  }

  // Pieces ---------------------------------------------------------------

  button(t, id, label, onClick, primary) {
    return h_flex().id(id).h(30).px(12).items_center().rounded(7).flex_none()
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(onClick).child(label);
  }

  keyChip(t, id, text, active, onClick) {
    const parts = text ? text.split(/-(?!$)/) : [];
    return h_flex().id(id).h(28).px(6).gap(3).items_center().rounded(6).cursor_pointer().flex_none()
      .border_1().border_color(active ? t.accent : "#00000000").bg(active ? t.background : "#00000000")
      .hover((s) => s.bg(t.hover))
      .on_click(onClick)
      .when(active, (el) => el.child(div().px(4).text_size(12).text_color(t.accent).child("Press keys…  (Esc cancels)")))
      .when(!active, (el) => el.children(parts.map((p, i) =>
        div().px(6).h(20).flex().items_center().rounded(4).bg(t.raised).border_1().border_color(t.border)
          .text_size(11.5).font_medium().text_color(t.foreground).child(p))));
  }

  suggestions(t) {
    const q = this.actionText.trim().toLowerCase().split(":")[0];
    if (q.startsWith("{")) return [];
    const extra = [
      { name: "terminal", args: [], about: "Let the program in the terminal have this key." },
      { name: "send:", args: [], about: "Type text into the terminal, e.g. send:\\u001bb" },
    ];
    const all = [...commands(), ...extra];
    const list = all.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.about ?? "").toLowerCase().includes(q));
    if (list.length === 1 && list[0].name === this.actionText.trim()) return [];
    return list.slice(0, 8);
  }

  editor(t) {
    const e = this.editing;
    const sugg = this.suggestions(t);
    return v_flex().w_full().gap(8).p(12).rounded(9).bg(t.surface).border_1().border_color(t.accent)
      .child(h_flex().gap(10).items_center()
        .child(this.keyChip(t, "kb-edit-key", e.key, false, () => {}))
        .child(div().text_size(12.5).text_color(t.dim).child("does"))
        .child(Input.new(this.actionInput).flex_1().h(32).px(10).rounded(7).border_1().border_color(this.editError ? t.blocked : t.input).bg(t.background).text_size(12.8).text_color(t.foreground))
        .child(this.button(t, "kb-edit-save", "Save", (_e, cx) => this.commitAction(cx), true))
        .child(this.button(t, "kb-edit-cancel", "Cancel", (_e, cx) => { this.editing = null; this.handle.focus(); cx.notify(); })))
      .when(Boolean(this.editError), (el) => el.child(div().text_size(12).text_color(t.blocked).child(this.editError)))
      .when(sugg.length > 0, (el) => el.child(v_flex().gap(1).children(sugg.map((c) => {
        const needsArg = (c.args ?? []).some((a) => a.required);
        const argNames = (c.args ?? []).map((a) => a.required ? a.name : `${a.name}?`).join(", ");
        return h_flex().id(`kb-sug-${c.name}`).px(8).py(5).gap(10).rounded(6).cursor_pointer().items_center()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => {
            const v = c.name.endsWith(":") ? c.name : needsArg ? `${c.name}:` : c.name;
            if (!needsArg && !c.name.endsWith(":")) return this.commitAction(cx, v);
            this.actionText = v;
            this.actionInput.set_value(v);
            this.actionInput.focus();
            cx.notify();
          })
          .child(div().w(170).flex_none().text_size(12.5).text_color(t.accent).truncate().child(c.name))
          .child(div().flex_1().min_w(0).text_size(12).text_color(t.dim).truncate().child((argNames ? `{${argNames}}  ` : "") + (c.about ?? "")));
      }))));
  }

  row(t, section, key, action, cx) {
    const sec = section;
    const recording = this.recording && this.recording.section === sec && this.recording.key === key;
    const notes = [];
    if (RESERVED.has(key)) notes.push("programs use this key");
    if (sec === "terminal" && this.data?.global?.[key] !== undefined) notes.push(`overrides “${describe(this.data.global[key])}” everywhere else`);
    if (sec !== "global" && sec !== "terminal" && this.data?.global?.[key] !== undefined) notes.push("overrides the Everywhere binding here");
    if (sec === "global" && this.data?.terminal?.[key] !== undefined) notes.push("terminal binding wins in terminals");
    return h_flex().id(`kb-row-${sec}-${key}`).w_full().min_h(42).px(8).gap(12).items_center()
      .border_b(1).border_color(t.border)
      .child(div().w(260).flex_none().child(this.keyChip(t, `kb-key-${sec}-${key}`, key, recording, (_e, cx) => this.startRecord(sec, key, cx))))
      .child(v_flex().id(`kb-act-${sec}-${key}`).flex_1().min_w(0).gap(1).py(4).px(6).rounded(6).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.startEdit(sec, key, false, actionText(action), cx))
        .child(div().text_size(13).text_color(t.foreground).truncate().child(describe(action)))
        .child(div().text_size(11.5).text_color(t.dim).truncate().child(actionText(action) + (notes.length ? `   · ${notes.join(" · ")}` : ""))))
      .child(div().id(`kb-del-${sec}-${key}`).w(26).h(26).flex_none().flex().items_center().justify_center().rounded(6)
        .text_size(15).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.blocked))
        .on_click((_e, cx) => this.remove(sec, key, cx))
        .child("×"));
  }

  body(t, cx) {
    if (!this.data && !this.loadError) return div().text_size(13).text_color(t.dim).child("Loading…");
    if (this.loadError) return div().text_size(13).text_color(t.blocked).child(this.loadError);
    const sec = this.section;
    const entries = Object.entries(this.data?.[sec] ?? {});
    const f = this.filter.trim().toLowerCase();
    const rows = entries.filter(([k, a]) => !f || k.toLowerCase().includes(f) || actionText(a).toLowerCase().includes(f) || describe(a).toLowerCase().includes(f));
    const addingNew = this.recording && this.recording.section === sec && this.recording.key === null;
    const editingNew = this.editing && this.editing.section === sec && this.editing.isNew;
    return v_flex().w_full().gap(10)
      .child(h_flex().w_full().gap(10).items_center()
        .child(Input.new(this.search).flex_1().h(32).px(10).rounded(8).border_1().border_color(t.input).bg(t.background).text_size(12.8).text_color(t.foreground))
        .child(this.button(t, "kb-add", "Add shortcut", (_e, cx) => this.startRecord(sec, null, cx), true)))
      .when(addingNew, (el) => el.child(h_flex().w_full().p(12).gap(10).items_center().rounded(9).bg(t.surface).border_1().border_color(t.accent)
        .child(div().text_size(13).text_color(t.accent).child("Press the new shortcut…"))
        .child(div().flex_1())
        .child(this.button(t, "kb-add-cancel", "Cancel", (_e, cx) => { this.recording = null; cx.notify(); }))))
      .when(Boolean(this.editing && this.editing.section === sec), (el) => el.child(this.editor(t)))
      .child(v_flex().w_full()
        .when(rows.length === 0, (el) => el.child(div().py(16).text_size(13).text_color(t.dim)
          .child(f ? "No shortcut matches." : "No shortcuts in this section yet. Add one above.")))
        .children(rows.map(([k, a]) => (this.editing && !editingNew && this.editing.section === sec && this.editing.key === k) ? null : this.row(t, sec, k, a, cx)).filter(Boolean)));
  }

  render(cx) {
    const t = theme();
    const secs = this.sections();
    const nav = v_flex().flex_none().w(200).h_full().p(10).gap(2).border_r(1).border_color(t.border)
      .child(div().px(10).pt(6).pb(12).text_size(16).font_semibold().text_color(t.foreground).child("Keybinds"))
      .children(secs.map((s) => {
        const on = s === this.section;
        const n = Object.keys(this.data?.[s] ?? {}).length;
        return h_flex().id(`kb-s-${s}`).gap(10).px(10).py(7).items_center().rounded(7).cursor_pointer()
          .bg(on ? t.raised : "#00000000").hover((st) => st.bg(t.raised))
          .on_click((_e, cx) => { this.section = s; this.editing = null; this.recording = null; this.handle.focus(); cx.notify(); })
          .child(div().flex_1().min_w(0).truncate().text_size(13.5).text_color(on ? t.foreground : t.muted).child(sectionTitle(s)))
          .child(div().text_size(11.5).text_color(t.dim).child(n ? String(n) : ""));
      }))
      .child(div().flex_1())
      .child(div().px(10).pb(6).text_size(11.5).line_height("16px").text_color(t.dim)
        .child("Click a shortcut to record a new one, or its action to change what it does. Changes save to keys.json right away. ctrl-alt-shift-escape always resets."));

    const footer = h_flex().w_full().h(40).px(20).gap(10).items_center().border_t(1).border_color(t.border).flex_none()
      .child(div().flex_1().min_w(0).truncate().text_size(12)
        .text_color(this.fileError ? t.blocked : this.status && !this.status.ok ? t.blocked : t.dim)
        .child(this.fileError ? `keys.json error: ${this.fileError.trim()}` : this.status?.text ?? `${sectionTitle(this.section)} · ${this.section === "terminal" ? "wins over Everywhere while a terminal has focus" : this.section.startsWith("layout:") ? "only while that layout shows" : this.section.startsWith("mod:") ? "sent to that mod" : "works anywhere in the app"}`))
      .child(div().text_size(11).text_color(t.dim).child("Esc closes"));

    return h_flex().id("keybinds").track_focus(this.handle).size_full().min_h(0).bg(t.popover).text_color(t.foreground)
      .on_key_down((e, cx) => {
        if (this.recording) {
          cx.stop_propagation();
          if (e.keystroke === "escape") { this.recording = null; return cx.notify(); }
          if (MODIFIER_KEYS.has((e.key ?? "").toLowerCase())) return;
          return this.recorded(e.keystroke, cx);
        }
        if (e.keystroke === "escape") {
          cx.stop_propagation();
          if (this.editing) { this.editing = null; this.handle.focus(); return cx.notify(); }
          return closeOverlay(props()?.overlay);
        }
      })
      .child(nav)
      .child(v_flex().flex_1().min_w(0).h_full()
        .child(div().relative().flex_1().min_h(0).w_full()
          .child(div().id("kb-body").size_full().overflow_y_scroll()
            .child(div().px(24).py(20).child(this.body(t, cx))))
          .child(Scrollbar.vertical("kb-body").mode("always").absolute().inset_0()))
        .child(footer));
  }
}
