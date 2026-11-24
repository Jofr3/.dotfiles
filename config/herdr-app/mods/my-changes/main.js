import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, appHome, home, notify, nextCommand, layout } from "herdr";
import { TYPE, RADIUS, SIZE, monoFont, findNode, alpha, selectedMetaColor, statusColor, countBadge, chip, button, textInput, panelHeader, emptyState } from "./ui.js";

// Upload: a changed file goes to the project's server, as its .vscode/sftp.json says, through
// the remote mod's helper (mods/remote/remote.py). Two clicks: the first asks, the second sends.
async function uploader(args) {
  const r = await exec("python3", ["-I", `${appHome()}/mods/remote/remote.py`, ...args]);
  let value;
  try { value = JSON.parse(r.stdout); } catch { throw new Error(r.stderr.trim() || "remote.py gave no answer"); }
  if (value?.error) throw new Error(value.error);
  return value;
}
// The nearest .vscode/sftp.json at or above dir (this computer only), else null.
async function sftpConfig(dir) {
  for (let d = dir; d && d !== "/"; d = d.replace(/\/[^/]*$/, "")) {
    if (await readTextFile(`${d}/.vscode/sftp.json`).catch(() => null) !== null) return `${d}/.vscode/sftp.json`;
    if (d === home()) break;
  }
  return null;
}

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Numbers each diff line with both old and new line numbers so a frame only draws rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@\s*(.*)$/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", lineNum: next || old, context: match[3]?.trim() || "", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, oldNum: old++, newNum: null, text: line.slice(1) || " " };
    if (kind === "+") return { kind, oldNum: null, newNum: next++, text: line.slice(1) || " " };
    if (kind === " ") return { kind, oldNum: old++, newNum: next++, text: line.slice(1) || " " };
    return { kind: "", oldNum: null, newNum: null, text: line };
  });
}

function commonDirPrefix(files) {
  if (files.length < 2) return "";
  const dirs = files.map((f) => {
    const parts = f.path.split("/");
    parts.pop();
    return parts;
  });
  let common = dirs[0];
  for (let i = 1; i < dirs.length; i++) {
    let j = 0;
    while (j < common.length && j < dirs[i].length && common[j] === dirs[i][j]) j++;
    common = common.slice(0, j);
    if (!common.length) return "";
  }
  return common.length ? common.join("/") + "/" : "";
}

export default class Changes extends View {
  init(_props, cx) {
    this.uploading = new Set(); this.asking = null; this.hovered = null; this.sftp = null;
    this.files = []; this.rows = []; this.diffWidth = 0; this.message = ""; this.cursor = -1; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
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
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null; this.cursor = -1; this.asking = null; this.hovered = null;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const br = head.code === 0 ? await git(["rev-parse", "--abbrev-ref", "HEAD"]) : null;
        const branch = br?.code === 0 ? br.stdout.trim() : null;
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh ? "?" : xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          files.push({ path, status: s, fresh, ...stat });
        }
        if (key() !== context) return;
        if (this.root !== root || this.on !== on) this.sftp = on ? null : await sftpConfig(root);
        if (key() !== context) return;
        this.root = root; this.on = on; this.branch = branch; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === path) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    const maxNum = this.rows.reduce((m, r) => Math.max(m, r.oldNum ?? 0, r.newNum ?? 0), 0);
    const digits = Math.max(3, String(maxNum).length);
    this.gutterW = Math.ceil(digits * 8 + 10);
    this.diffWidth = Math.max(0, ...lines.map((line) => Math.ceil(line.length * 7.4) + this.gutterW + 40));
  }

  pick(path, cx) {
    this.open = path; this.setLines([]); this.note = null;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  commit(cx) {
    if (!this.message.trim() || !this.root || this.busy || this.loading || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (key() === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (key() === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  diffRow({ kind, oldNum, newNum, lineNum, context, text }, t) {
    if (kind === "@") {
      const label = context ? `Line ${lineNum} · ${context}` : `Line ${lineNum}`;
      return h_flex().w_full().min_w(this.diffWidth).px(12).h(20).flex_none().items_center()
        .bg(t.surface).text_size(TYPE.meta).text_color(t.dim)
        .child(div().flex_1().min_w(0).truncate().tooltip(text).child(label));
    }
    const added = kind === "+";
    const deleted = kind === "-";
    const tint = added ? alpha(statusColor(t, "added"), 0.16) : deleted ? alpha(statusColor(t, "deleted"), 0.13) : null;
    const markerColor = added ? statusColor(t, "added") : deleted ? statusColor(t, "deleted") : t.dim;
    const marker = added ? "+" : deleted ? "−" : " ";
    const num = newNum ?? oldNum;
    const gw = this.gutterW ?? 34;
    return h_flex().w_full().min_w(this.diffWidth).h(20).flex_none().items_center()
      .bg(t.background)
      .child(div().w(gw).h_full().pr(8).flex_none().flex().items_center().justify_end().bg(t.background).whitespace_nowrap().overflow_hidden().text_color(t.dim).child(num == null ? "" : String(num)))
      .child(
        h_flex().flex_1().h_full().items_center().when(Boolean(tint), (e) => e.bg(tint))
          .child(div().w(16).flex_none().text_center().font_medium().text_color(markerColor).child(marker))
          .child(div().flex_1().pr(16).whitespace_nowrap().text_color(added || deleted ? t.foreground : t.muted).child(text)),
      );
  }

  upload(path, cx) {
    if (this.asking !== path) { this.asking = path; return cx.notify(); }
    const config = this.sftp, file = `${this.root}/${path}`, name = path.split("/").pop();
    this.asking = null; this.uploading.add(path);
    cx.spawn(async (cx) => {
      try {
        const r = await uploader(["upload", config, "0", file]);
        notify({ title: `Uploaded ${name}`, body: r.remote, level: "success", timeout: 3000 });
      } catch (e) {
        notify({ title: `Couldn't upload ${name}`, body: String(e.message ?? e), level: "error" });
      } finally { this.uploading.delete(path); cx.notify(); }
    });
    cx.notify();
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const hasChanges = this.files.length > 0;
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    const prefix = commonDirPrefix(this.files);
    const openRel = this.open ? (prefix && this.open.startsWith(prefix) ? this.open.slice(prefix.length) : this.open) : "";
    const openParts = openRel ? openRel.split("/") : [];
    const openName = openParts.pop() ?? "";
    const openDir = openParts.length ? openParts.join("/") : "";
    const openFileObj = this.open ? this.files.find((f) => f.path === this.open) : null;
    const panelPx = findNode(layout(), "panel")?.size?.px ?? 368;
    const nameMaxW = Math.round(panelPx * 0.62);
    const showBranch = Boolean(this.branch) && this.branch !== "main" && this.branch !== "master";

    const statSummary = (a, d) => h_flex().gap(5).flex_none().items_center().font_family(monoFont()).text_size(TYPE.meta).font_medium()
      .tooltip(`+${a} added, −${d} deleted`)
      .when(a > 0, (el) => el.child(div().text_color(statusColor(t, "added")).child(`+${a}`)))
      .when(d > 0, (el) => el.child(div().text_color(statusColor(t, "deleted")).child(`−${d}`)));

    const headerActions = [];
    if (this.open) {
      const fa = openFileObj?.add ?? 0, fd = openFileObj?.del ?? 0;
      if (fa > 0 || fd > 0) headerActions.push(statSummary(fa, fd));
    } else if (add > 0 || del > 0) {
      headerActions.push(statSummary(add, del));
    }

    return v_flex().id("changes").size_full().min_h(0).overflow_hidden().bg(t.chrome).text_color(t.foreground).text_size(TYPE.body).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
        else if (this.open && !this.typing && (e.key === "escape" || e.key === "backspace")) { this.open = null; this.setLines([]); cx.stop_propagation(); cx.notify(); }
        else if (e.key === "enter" && (e.modifiers?.control || e.modifiers?.platform) && enabled) { this.commit(cx); cx.stop_propagation(); }
        else if (!this.open && !this.typing && hasChanges && (e.key === "down" || e.key === "j" || e.key === "up" || e.key === "k")) {
          this.cursor = (e.key === "down" || e.key === "j")
            ? Math.min(this.files.length - 1, this.cursor + 1)
            : Math.max(0, this.cursor - 1);
          cx.notify(); cx.stop_propagation();
        } else if (!this.open && !this.typing && e.key === "enter" && this.files[this.cursor]) {
          this.pick(this.files[this.cursor].path, cx); cx.stop_propagation();
        }
      })
      .child(panelHeader(t, this.open ? {
        title: openName,
        meta: openDir || null,
        back: { id: "changes-back", tip: "Back to changes (Esc)", action: (_e, cx) => { this.open = null; this.setLines([]); cx.notify(); } },
        actions: headerActions,
      } : {
        title: "Changes",
        badgeEl: hasChanges ? countBadge(t, this.files.length) : null,
        meta: showBranch ? this.branch : null,
        actions: headerActions,
      }))
      .when(!hasChanges, (el) => el.child(
        !this.error && !this.loading && Boolean(this.root)
          ? emptyState(t, {
              icon: "mods/my-chrome/circle-check.svg",
              iconColor: statusColor(t, "ok"),
              title: "Working tree clean",
              subtitle: this.branch ? `On branch ${this.branch}` : null,
            })
          : emptyState(t, {
              icon: !this.error && this.loading ? "mods/my-changes/changes.svg" : null,
              title: this.error || (this.loading ? "Loading changes…" : "No folder"),
              loading: !this.error && this.loading,
            }),
      ))
      .when(hasChanges && !this.open, (el) => el
        .child(v_flex().id("changes-list").flex_1().min_h(0).overflow_y_scrollbar().when(this.files.length > 20, (s) => s.mode("always")).py(6).px(6).children(this.files.map((f, idx) => {
          const rel = prefix && f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path;
          const parts = rel.split("/"), name = parts.pop();
          const folder = parts.length ? parts.join("/") : "";
          const selected = this.cursor === idx;
          const stColor = f.status === "?" ? (selected ? selectedMetaColor(t) : t.dim) : f.status === "A" ? statusColor(t, "added") : f.status === "D" || f.status === "U" ? statusColor(t, "deleted") : statusColor(t, "modified");
          return h_flex().id(`change-${f.path}`).relative().h(SIZE.row).flex_none().px(8).gap(6).items_center().rounded(RADIUS.sm).cursor_pointer()
            .when(selected, (e) => e.bg(t.selected))
            .when(!selected, (e) => e.hover((s) => s.bg(t.hover)))
            .on_click((_e, cx) => { this.cursor = idx; this.handle.focus(); this.pick(f.path, cx); })
            .on_hover((on, cx) => { if (on) this.hovered = f.path; else if (this.hovered === f.path) { this.hovered = null; if (this.asking === f.path) this.asking = null; } cx.notify(); })
            .child(div().w(14).flex_none().text_size(TYPE.meta).font_semibold().text_color(stColor).child(f.status))
            .child(h_flex().flex_1().min_w(0).gap(6).items_center()
              .child(div().flex_shrink(0).max_w(nameMaxW).truncate().text_color(selected ? t.foreground : alpha(t.foreground, 0.88)).when(selected, (x) => x.font_medium()).child(name))
              .when(Boolean(folder), (x) => x.child(div().flex_1().min_w(0).truncate().text_size(TYPE.meta).text_color(selected ? selectedMetaColor(t) : t.dim).child(folder))))
            .when(add > 0, (e) => e.child(div().w(38).flex_none().text_right().font_family(monoFont()).text_size(TYPE.meta).text_color(f.add > 0 ? statusColor(t, "added") : t.dim).child(f.add > 0 ? `+${f.add}` : "")))
            .when(del > 0, (e) => e.child(div().w(38).flex_none().text_right().font_family(monoFont()).text_size(TYPE.meta).text_color(f.del > 0 ? statusColor(t, "deleted") : t.dim).child(f.del > 0 ? `−${f.del}` : "")))
            .when(Boolean(this.sftp) && f.status !== "D" && (this.hovered === f.path || this.uploading.has(f.path) || this.asking === f.path), (e) => {
              const asking = this.asking === f.path, sending = this.uploading.has(f.path);
              return e.child(chip(t, `up-${f.path}`, sending ? "Uploading…" : asking ? "Upload to server?" : "↑ Upload",
                sending ? null : (_e, cx) => this.upload(f.path, cx), {
                  bg: asking ? t.blocked : t.surface,
                  fg: asking ? t.solid_foreground : t.muted,
                  hoverBg: asking ? t.blocked : t.hover,
                }));
            });
        })))
        .when(this.limited, (x) => x.child(div().px(14).py(4).text_size(TYPE.meta).text_color(t.dim).child("Showing the first 1,000 changed files")))
        .when(Boolean(this.note), (e) => e.child(div().px(14).py(6).text_size(TYPE.meta).text_color(statusColor(t, "error")).child(this.note)))
        .child(h_flex().flex_none().px(14).py(10).gap(8).border_t_1().border_color(t.border).bg(t.chrome)
          .child(textInput(t, this.input, this.typing, { height: 30, textSize: TYPE.sub }).flex_1().min_w(0))
          .child(button(t, "commit", this.busy ? "Committing…" : "Commit", (_e, cx) => this.commit(cx), {
            variant: "primary",
            disabled: !enabled,
            height: 30,
            tip: !enabled && !this.busy ? "Write a commit message to commit" : `Stage & commit all ${this.files.length} changed files (Enter)`,
          }))))
      .when(hasChanges && Boolean(this.open), (el) => el
        .child(div().flex_1().min_h(0).relative().bg(t.background).font_family(monoFont()).text_size(TYPE.sub)
          .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
            .child(div().w_full().min_w(this.diffWidth).h_full().pb(10).child(v_virtual_list("changes-diff", this.rows.length, 20, (i) => String(i),
              (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
          .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
          .child(Scrollbar.horizontal("changes-diff-x").when(this.diffWidth > panelPx - 12, (sb) => sb.mode("always")).viewport_from_layout().absolute().inset_0()))
        .when(Boolean(this.note), (e) => e.child(div().px(14).py(6).text_size(TYPE.meta).text_color(statusColor(t, "error")).child(this.note))));
  }
}
