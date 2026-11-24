// A lazy file browser for the focused pane's folder, with bounded read-only previews.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, nextCommand } from "herdr";
import { TYPE, RADIUS, SIZE, monoFont, alpha, selectedMetaColor, statusColor, dot, iconBtn, panelHeader, emptyState, isDimEntry } from "./ui.js";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.cursor = -1;
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
    cx.spawn(async () => {
      for (;;) {
        const cmd = await nextCommand();
        if (cmd === "focus") this.handle.focus();
      }
    });
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key() === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.cursor = -1; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        const dirMarks = {};
        const prio = { U: 5, D: 4, M: 3, A: 2, "?": 1 };
        if (top?.code === 0) {
          const gitRoot = top.stdout.trim();
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            const rel = entry.slice(3);
            const m = xy === "??" ? "?" : xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
            const full = `${gitRoot}/${rel}`;
            marks[full] = m;
            // Propagate git status upward so collapsed folders show dirty indicators.
            let dir = full.replace(/\/[^/]*$/, "");
            while (dir.length >= gitRoot.length && dir.startsWith(gitRoot)) {
              if ((prio[m] ?? 0) > (prio[dirMarks[dir]] ?? 0)) dirMarks[dir] = m;
              if (dir === gitRoot) break;
              dir = dir.replace(/\/[^/]*$/, "");
            }
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.dirMarks = dirMarks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: monoFont(), font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  flatRows(prefix, depth, out) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      out.push({ entry, path, depth });
      if (entry.dir && this.folders.has(path)) this.flatRows(path, depth + 1, out);
    }
    return out;
  }

  renderRow({ entry, path, depth }, idx, t) {
    const open = this.folders.has(path);
    const fullPath = `${this.root}/${path}`;
    const mark = this.marks[fullPath];
    const dirMark = entry.dir && !open ? this.dirMarks?.[fullPath] : null;
    const dim = isDimEntry(entry.name);
    const selected = this.cursor === idx;
    const activeMark = mark || dirMark;
    const markKind = activeMark === "?" ? "idle" : activeMark === "A" ? "added" : activeMark === "D" || activeMark === "U" ? "deleted" : "modified";
    const markColor = activeMark === "?" ? (selected ? selectedMetaColor(t) : t.muted) : statusColor(t, markKind);
    return h_flex()
      .id(`file-${path}`)
      .relative()
      .h(SIZE.row)
      .flex_none()
      .pl(8 + depth * 16)
      .pr(8)
      .gap(6)
      .items_center()
      .rounded(RADIUS.sm)
      .cursor_pointer()
      .when(selected, (el) => el.bg(t.selected))
      .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => {
        this.cursor = idx;
        this.handle.focus();
        if (entry.dir) this.toggle(path, cx);
        else this.show(path, cx);
      })
      .child(entry.dir
        ? svg(`mods/my-files/chevron-${open ? "down" : "right"}.svg`).size(SIZE.iconSm).flex_none().text_color(t.dim)
        : div().w(SIZE.iconSm).flex_none())
      .child(entry.dir
        ? svg("mods/my-files/folder.svg").size(SIZE.icon).flex_none()
            .text_color(dim ? (selected ? selectedMetaColor(t) : t.dim) : t.muted)
        : div().w(SIZE.icon).flex_none())
      .child(div().flex_1().min_w(0).truncate()
        .text_color(dim ? (selected ? selectedMetaColor(t) : t.dim) : selected || entry.dir ? t.foreground : alpha(t.foreground, 0.88))
        .when(selected || entry.dir, (el) => el.font_medium())
        .child(entry.name))
      .when(Boolean(activeMark), (el) => el.child(h_flex().w(14).flex_none().items_center().justify_center().child(div().size(5).flex_none().rounded(RADIUS.full).bg(markColor))));
  }

  render(cx) {
    if (key() !== this.context?.key) this.refresh(cx);
    const t = theme();
    const list = this.file ? [] : this.flatRows("", 0, []);
    const onKey = (e, cx) => {
      if (this.file) {
        if (e.key === "escape" || e.key === "backspace") { this.show(null); cx.notify(); cx.stop_propagation(); }
        return;
      }
      if (!list.length) return;
      if (e.key === "down" || e.key === "j") { this.cursor = Math.min(list.length - 1, this.cursor + 1); cx.notify(); cx.stop_propagation(); }
      else if (e.key === "up" || e.key === "k") { this.cursor = Math.max(0, this.cursor - 1); cx.notify(); cx.stop_propagation(); }
      else if (e.key === "enter" || e.key === "right") {
        const cur = list[this.cursor];
        if (!cur) return;
        if (cur.entry.dir) { if (e.key === "enter" || !this.folders.has(cur.path)) this.toggle(cur.path, cx); }
        else if (e.key === "enter") this.show(cur.path, cx);
        cx.stop_propagation();
      } else if (e.key === "left") {
        const cur = list[this.cursor];
        if (cur?.entry.dir && this.folders.has(cur.path)) { this.toggle(cur.path, cx); cx.stop_propagation(); }
      }
    };
    const headerActions = [];
    if (!this.file && this.folders.size > 0) {
      headerActions.push(iconBtn(t, "files-collapse", "mods/my-chrome/minus.svg", "Collapse all folders", (_e, cx) => {
        this.folders.clear();
        cx.notify();
      }));
    }
    const fileParts = this.file ? this.file.split("/") : [];
    const previewName = fileParts.length ? fileParts[fileParts.length - 1] : null;
    const previewDir = fileParts.length > 1 ? fileParts.slice(0, -1).join("/") : (this.root?.split(/[\\/]/).pop() ?? "");
    return v_flex().id("files").track_focus(this.handle).on_key_down(onKey)
      .size_full().min_h(0).overflow_hidden().bg(t.chrome).text_color(t.foreground).text_size(TYPE.body)
      .child(panelHeader(t, {
        title: previewName ?? "Files",
        meta: previewName ? previewDir : (this.root?.split(/[\\/]/).pop() ?? ""),
        back: this.file ? { id: "files-back", tip: "Back to tree (Esc)", action: (_e, cx) => { this.show(null); cx.notify(); } } : null,
        actions: headerActions,
      }))
      .when(!this.file && (Boolean(this.error) || !list.length), (el) => el.child(
        emptyState(t, {
          icon: "mods/my-files/file.svg",
          title: this.error ? "Cannot load files" : this.loading ? "Loading files…" : this.root ? "Empty folder" : "No folder",
          subtitle: this.error || null,
          loading: !this.error && this.loading,
        }),
      ))
      .when(!this.file && !this.error && list.length > 0, (el) => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().pt(6).px(6).pb(16)
        .children(list.map((item, idx) => this.renderRow(item, idx, t)))
        .when(this.limited, (x) => x.child(div().p(8).text_size(TYPE.meta).text_color(t.muted).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), (el) => el.child(
        this.code
          ? v_flex().flex_1().min_h(0).bg(t.background).child(Editor.new(this.code).flex_1().min_h(0))
          : emptyState(t, {
              icon: "mods/my-files/file.svg",
              title: this.fileError || "Loading file…",
              loading: !this.fileError,
            }),
      ));
  }
}
