// The project's server, browsed over SFTP/FTP as its .vscode/sftp.json (VS Code SFTP format) says.
// The project is the focused pane's folder; its config is the nearest .vscode/sftp.json above it.
// remote.py does the talking (OpenSSH sftp over a shared connection, or curl for FTP), so
// secrets never reach this script. Each project keeps its own tree, open folders and preview
// while you work elsewhere, so coming back shows it as it was, without reconnecting.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, writeTextFile, appHome, home, run, theme, settings, notify, nextCommand } from "herdr";
import { TYPE, RADIUS, SIZE, monoFont, alpha, selectedMetaColor, statusColor, dot, iconBtn, chip, button, panelHeader, emptyState, isDimEntry } from "./ui.js";

const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html", blade: "html", twig: "html" };
const TEMPLATE = (name) => JSON.stringify({
  name, host: "example.com", protocol: "sftp", port: 22, username: "user",
  privateKeyPath: `${home()}/.ssh/keys/jofre_key.pem`, remotePath: "/", uploadOnSave: false,
  ignore: [".vscode", ".git", ".DS_Store", "vendor", "node_modules"],
}, null, 2) + "\n";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, machine: space?.machine ?? null };
}

async function helper(args) {
  const r = await exec("python3", ["-I", `${appHome()}/mods/remote/remote.py`, ...args]);
  let value;
  try { value = JSON.parse(r.stdout); } catch { throw new Error(r.stderr.trim() || "remote.py gave no answer"); }
  if (value?.error) throw new Error(value.error);
  return value;
}

// The nearest .vscode/sftp.json at or above `dir`, else null (and the git top or dir to create one in).
async function findConfig(dir) {
  for (let d = dir; d && d !== "/"; d = d.replace(/\/[^/]*$/, "")) {
    if (await readTextFile(`${d}/.vscode/sftp.json`).catch(() => null) !== null) return { config: `${d}/.vscode/sftp.json`, project: d };
    if (d === home()) break;
  }
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: dir }).catch(() => null);
  return { config: null, project: top?.code === 0 ? top.stdout.trim() : dir };
}

// One project's view of its server. Work in flight writes into its own state, even after a switch.
function project(found) {
  return { ...found, servers: null, server: 0, error: null, loading: false, limited: false, gen: 0,
    entries: new Map(), folders: new Set(), files: new Set(), pending: new Set(), busy: new Set(),
    file: null, code: null, fileError: null, confirm: null };
}

export default class Remote extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.cursor = -1;
    this.cwd = undefined; this.machine = undefined;
    this.lookups = new Map();   // folder -> { config, project }
    this.projects = new Map();  // config path (or project folder without one) -> state
    this.st = null;
    cx.spawn(async () => {
      for (;;) {
        const cmd = await nextCommand();
        if (cmd === "focus") this.handle.focus();
      }
    });
  }

  // Follows the focused folder to its project; a project seen before comes back as it was.
  locate(cx, again = false) {
    const { cwd, machine } = location();
    this.cwd = cwd; this.machine = machine;
    if (!cwd || machine) { this.st = null; return; }
    const known = !again && this.lookups.get(cwd);
    if (known) return this.enter(known, cx);
    const asked = cwd;
    cx.spawn(async cx => {
      const found = await findConfig(cwd).catch(() => ({ config: null, project: cwd }));
      this.lookups.set(asked, found);
      if (this.cwd === asked) { this.enter(found, cx); cx.notify(); }
    });
  }

  enter(found, cx) {
    const key = found.config ?? `dir:${found.project}`;
    let st = this.projects.get(key);
    if (!st) { st = project(found); this.projects.set(key, st); if (found.config) this.connect(st, cx); }
    if (this.st !== st) this.cursor = -1;
    this.st = st;
  }

  connect(st, cx) {
    const gen = ++st.gen;
    st.loading = true; st.error = null;
    cx.spawn(async cx => {
      try {
        st.servers = await helper(["info", st.config]);
        if (gen === st.gen) await this.load(st, "", gen);
      } catch (e) { if (gen === st.gen) st.error = String(e.message ?? e); }
      finally { if (gen === st.gen) st.loading = false; cx.notify(); }
    });
  }

  async load(st, path, gen) {
    const r = await helper(["list", st.config, String(st.server), path]);
    if (gen !== st.gen) return;
    st.entries.set(path, r.entries);
    if (r.limited) st.limited = true;
  }

  refresh(st, cx) {
    if (!st.servers) return this.connect(st, cx);
    const gen = ++st.gen, open = [...st.folders];
    st.entries = new Map(); st.error = null; st.limited = false; st.loading = true;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...open]) await this.load(st, path, gen).catch(e => { if (!path) throw e; st.folders.delete(path); });
      } catch (e) { if (gen === st.gen) st.error = String(e.message ?? e); }
      finally { if (gen === st.gen) st.loading = false; cx.notify(); }
    });
    cx.notify();
  }

  toggle(st, entry, path, cx) {
    if (st.folders.has(path)) {
      for (const f of [...st.folders]) if (f === path || f.startsWith(path + "/")) { st.folders.delete(f); st.entries.delete(f); }
      return cx.notify();
    }
    st.folders.add(path);
    if (st.pending.has(path)) return cx.notify();
    const gen = st.gen;
    st.pending.add(path);
    cx.spawn(async cx => {
      try { await this.load(st, path, gen); }
      catch (e) {
        if (gen !== st.gen) return;
        st.folders.delete(path);
        // A link that isn't a folder is a file.
        if (entry.link) { st.files.add(path); this.show(st, path, cx); } else st.error = String(e.message ?? e);
      } finally { st.pending.delete(path); cx.notify(); }
    });
    cx.notify();
  }

  show(st, path, cx) {
    st.code?.release?.(); st.code = null; st.file = path; st.fileError = null;
    if (!path) return cx.notify();
    const gen = st.gen;
    cx.spawn(async cx => {
      try {
        const r = await helper(["get", st.config, String(st.server), path]);
        if (st.file !== path || gen !== st.gen) return;
        if (r.binary) { st.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        st.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: r.truncated ? r.text + "\n… (file truncated)" : r.text,
          font_family: monoFont(), font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch (e) { if (st.file === path) st.fileError = String(e.message ?? e); }
      finally { cx.notify(); }
    });
    cx.notify();
  }

  // Replaces the local copy with the server's. Uncommitted local work asks first (st.confirm).
  download(st, path, force, cx) {
    if (st.busy.has(path)) return;
    st.busy.add(path); st.confirm = null;
    cx.spawn(async cx => {
      try {
        const r = await helper(["download", st.config, String(st.server), path, ...(force ? ["force"] : [])]);
        if (r.confirm) { st.confirm = { path, message: r.confirm }; return; }
        notify({ title: `Downloaded ${path.split("/").pop()}`, body: r.local.replace(home(), "~"), level: "success", timeout: 3000 });
      } catch (e) {
        notify({ title: `Couldn't download ${path.split("/").pop()}`, body: String(e.message ?? e), level: "error" });
      } finally { st.busy.delete(path); cx.notify(); }
    });
    cx.notify();
  }

  openTerminal(st, cx) {
    cx.spawn(async cx => {
      try { run("pane.split", { direction: "down", argv: await helper(["shell", st.config, String(st.server)]) }); }
      catch (e) { st.error = String(e.message ?? e); cx.notify(); }
    });
  }

  edit(st, cx) {
    const config = st.config ?? `${st.project}/.vscode/sftp.json`;
    cx.spawn(async cx => {
      try {
        if (!st.config) {
          await exec("mkdir", ["-p", `${st.project}/.vscode`]);
          await writeTextFile(config, TEMPLATE(st.project.split("/").pop()), null);
          // The folder now has a config: look again, from scratch.
          this.lookups.clear(); this.projects.delete(`dir:${st.project}`);
          this.locate(cx, true);
        } else {
          // Saving the config may change the server: reconnect on the next look.
          this.projects.delete(st.config);
          this.lookups.clear();
          this.cwd = undefined;
        }
        run("pane.split", { direction: "right", argv: ["nvim", config] });
      } catch (e) { st.error = String(e.message ?? e); cx.notify(); }
    });
  }

  flatRows(st, prefix, depth, out) {
    for (const entry of st.entries.get(prefix) ?? []) {
      if (entry.name === ".git") continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const folder = (entry.dir || entry.link) && !st.files.has(path);
      out.push({ entry, path, depth, folder });
      if (folder && st.folders.has(path)) this.flatRows(st, path, depth + 1, out);
    }
    return out;
  }

  renderRow(st, { entry, path, depth, folder }, idx, t) {
    const open = st.folders.has(path);
    const hovered = this.hovered === path, busy = st.busy.has(path);
    const dim = isDimEntry(entry.name);
    const selected = this.cursor === idx;
    return h_flex().id(`r-${path}`).relative().h(SIZE.row).flex_none().pl(8 + depth * 16).pr(8).gap(6).items_center().rounded(RADIUS.sm).cursor_pointer()
      .when(selected, (el) => el.bg(t.selected))
      .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
      .on_hover((on, cx) => { if (on) this.hovered = path; else if (this.hovered === path) this.hovered = null; cx.notify(); })
      .on_click((_e, cx) => {
        this.cursor = idx;
        this.handle.focus();
        if (folder) this.toggle(st, entry, path, cx);
        else this.show(st, path, cx);
      })
      .child(folder ? svg(`mods/my-files/chevron-${open ? "down" : "right"}.svg`).size(SIZE.iconSm).flex_none().text_color(t.dim) : div().w(SIZE.iconSm).flex_none())
      .child(folder
        ? svg("mods/my-files/folder.svg").size(SIZE.icon).flex_none()
            .text_color(dim ? (selected ? selectedMetaColor(t) : t.dim) : t.muted)
        : div().w(SIZE.icon).flex_none())
      .child(div().flex_1().min_w(0).truncate()
        .text_color(entry.link ? statusColor(t, "done") : dim ? (selected ? selectedMetaColor(t) : t.dim) : selected || folder ? t.foreground : alpha(t.foreground, 0.88))
        .when(selected || folder, (el) => el.font_medium())
        .child(entry.name))
      .when(st.pending.has(path) || busy, (el) => el.child(div().text_size(TYPE.meta).text_color(t.muted).child("…")))
      .when(!folder && hovered && !busy, (el) => el.child(chip(t, `dl-${path}`, "Download",
        (_e, cx) => this.download(st, path, false, cx), { icon: "mods/my-chrome/download.svg" })));
  }

  render(cx) {
    const now = location();
    if (now.cwd !== this.cwd || now.machine !== this.machine) this.locate(cx);
    const t = theme(), st = this.st, server = st?.servers?.[st.server];
    const list = st && st.config && !st.file ? this.flatRows(st, "", 0, []) : [];

    const onKey = (e, cx) => {
      if (st?.file) {
        if (e.key === "escape" || e.key === "backspace") { this.show(st, null, cx); cx.stop_propagation(); }
        return;
      }
      if (!list.length) return;
      if (e.key === "down" || e.key === "j") { this.cursor = Math.min(list.length - 1, this.cursor + 1); cx.notify(); cx.stop_propagation(); }
      else if (e.key === "up" || e.key === "k") { this.cursor = Math.max(0, this.cursor - 1); cx.notify(); cx.stop_propagation(); }
      else if (e.key === "enter" || e.key === "right") {
        const cur = list[this.cursor];
        if (!cur) return;
        if (cur.folder) { if (e.key === "enter" || !st.folders.has(cur.path)) this.toggle(st, cur.entry, cur.path, cx); }
        else if (e.key === "enter") this.show(st, cur.path, cx);
        cx.stop_propagation();
      } else if (e.key === "left") {
        const cur = list[this.cursor];
        if (cur?.folder && st.folders.has(cur.path)) { this.toggle(st, cur.entry, cur.path, cx); cx.stop_propagation(); }
      }
    };

    let body;
    if (this.machine) body = emptyState(t, { icon: "mods/remote/cloud.svg", title: "Local spaces only", subtitle: "Remote SFTP browsing works for spaces on this computer." });
    else if (!this.cwd) body = emptyState(t, { icon: "mods/remote/cloud.svg", title: "No folder" });
    else if (!st) body = emptyState(t, { icon: "mods/remote/cloud.svg", title: "Looking for .vscode/sftp.json…", loading: true });
    else if (st.file) body = st.code
      ? v_flex().flex_1().min_h(0).bg(t.background).child(Editor.new(st.code).flex_1().min_h(0))
      : emptyState(t, { icon: "mods/remote/cloud.svg", title: st.fileError || "Downloading…", loading: !st.fileError });
    else if (!st.config) body = emptyState(t, {
      icon: "mods/remote/cloud.svg",
      title: "No remote configured",
      subtitle: "Sync files in this space to a server over SFTP.",
      action: button(t, "create", "Set up remote sync", (_e, cx) => this.edit(st, cx), { variant: "secondary" }),
    });
    else if (st.error || !list.length) body = emptyState(t, {
      icon: "mods/remote/cloud.svg",
      title: st.error ? "Connection error" : st.loading ? `Connecting to ${server?.host ?? "server"}…` : "Empty folder",
      subtitle: st.error || null,
      loading: !st.error && st.loading,
    });
    else body = v_flex().id(`tree-${st.config}`).flex_1().min_h(0).overflow_y_scrollbar().pt(6).px(6).pb(16)
      .when((st.servers?.length ?? 0) > 1, (el) => el.child(h_flex().flex_wrap().gap(4).pb(6).children(st.servers.map((s, i) =>
        chip(t, `srv-${i}`, s.name, (_e, cx) => {
          if (i !== st.server) { st.server = i; st.folders = new Set(); st.files = new Set(); this.cursor = -1; this.refresh(st, cx); }
        }, {
          bg: i === st.server ? t.selected : t.surface,
          fg: i === st.server ? t.foreground : t.muted,
          hoverBg: i === st.server ? t.selected : t.hover,
          height: 22,
        })))))
      .children(list.map((item, idx) => this.renderRow(st, item, idx, t)))
      .when(st.limited, (el) => el.child(div().p(8).text_size(TYPE.meta).text_color(t.muted).child("Listing limited to 1,000 entries per folder")));

    const file = st?.file;
    const fileParts = file ? file.split("/") : [];
    const previewDir = fileParts.length > 1 ? fileParts.slice(0, -1).join("/") : (server?.name ?? "");
    const actions = [];
    if (file) {
      actions.push(chip(t, "download", st.busy.has(file) ? "…" : "Download",
        st.busy.has(file) ? null : (_e, cx) => this.download(st, file, false, cx), {
          icon: st.busy.has(file) ? null : "mods/my-chrome/download.svg",
          height: SIZE.btn,
          tip: "Download to local workspace",
        }));
    }
    if (server) {
      if (!file && st.folders.size > 0) {
        actions.push(iconBtn(t, "remote-collapse", "mods/my-chrome/minus.svg", "Collapse all folders", (_e, cx) => {
          st.folders.clear();
          cx.notify();
        }));
      }
      actions.push(iconBtn(t, "reload", "mods/my-chrome/refresh-cw.svg", file ? "Reload file" : "Refresh listing", (_e, cx) => file ? this.show(st, file, cx) : this.refresh(st, cx)));
      if (server.protocol === "sftp") {
        actions.push(iconBtn(t, "term", "mods/my-chrome/terminal.svg", "Open SSH terminal", (_e, cx) => this.openTerminal(st, cx)));
      }
    }
    if (st?.config) {
      actions.push(iconBtn(t, "edit", "mods/my-chrome/pencil.svg", "Edit sftp.json", (_e, cx) => this.edit(st, cx)));
    }

    const serverTitle = server ? (server.name && server.name !== "My Server" ? server.name : server.host || server.name) : null;
    const connState = server ? (st?.error ? "error" : st?.loading ? "working" : "ok") : null;
    const serverTip = server ? `${server.protocol} · ${server.username}@${server.host}:${server.remotePath}` : null;
    return v_flex().id("remote").track_focus(this.handle).on_key_down(onKey)
      .size_full().min_h(0).overflow_hidden().bg(t.chrome).text_color(t.foreground).text_size(TYPE.body)
      .child(panelHeader(t, {
        title: file ? file.split("/").pop() : "Remote",
        badgeEl: connState && !file ? dot(t, connState, { pulse: connState === "working", size: 6 }) : null,
        meta: file ? previewDir : serverTitle,
        metaTip: !file ? serverTip : null,
        back: file ? { id: "back", tip: "Back to tree (Esc)", action: (_e, cx) => this.show(st, null, cx) } : null,
        actions,
      }))
      .child(body)
      .when(Boolean(st?.confirm), (el) => el.child(v_flex().flex_none().p(12).gap(8).border_t_1().border_color(t.border).bg(t.surface).text_size(TYPE.sub)
        .child(div().text_color(t.foreground).child(`${st.confirm.path}: ${st.confirm.message}.`))
        .child(h_flex().gap(6)
          .child(button(t, "overwrite", "Overwrite local file", (_e, cx) => this.download(st, st.confirm.path, true, cx), { variant: "danger", height: 26 }))
          .child(button(t, "keep", "Keep mine", (_e, cx) => { st.confirm = null; cx.notify(); }, { height: 26 })))));
  }
}
