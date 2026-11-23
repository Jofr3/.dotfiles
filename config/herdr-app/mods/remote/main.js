// The project's server, browsed over SFTP/FTP as its .vscode/sftp.json (VS Code SFTP format) says.
// The project is the focused pane's folder; its config is the nearest .vscode/sftp.json above it.
// remote.py does the talking (OpenSSH sftp over a shared connection, or curl for FTP), so
// secrets never reach this script. Each project keeps its own tree, open folders and preview
// while you work elsewhere, so coming back shows it as it was, without reconnecting.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, writeTextFile, appHome, home, run, theme, settings, notify } from "herdr";

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
  init() {
    this.cwd = undefined; this.machine = undefined;
    this.lookups = new Map();   // folder -> { config, project }
    this.projects = new Map();  // config path (or project folder without one) -> state
    this.st = null;
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
          font_family: settings().font_family, font_size: 12,
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

  rows(st, prefix, depth, out, t) {
    for (const entry of st.entries.get(prefix) ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const folder = (entry.dir || entry.link) && !st.files.has(path), open = st.folders.has(path);
      const hovered = this.hovered === path, busy = st.busy.has(path);
      out.push(h_flex().id(`r-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
        .on_hover((on, cx) => { if (on) this.hovered = path; else if (this.hovered === path) this.hovered = null; cx.notify(); })
        .on_click((_e, cx) => folder ? this.toggle(st, entry, path, cx) : this.show(st, path, cx))
        .child(folder ? svg(`mods/my-files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/my-files/${folder ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().text_color(entry.link ? t.ansi6 : t.foreground).child(entry.name))
        .when(st.pending.has(path) || busy, el => el.child(div().text_size(11).text_color(t.dim).child("…")))
        .when(!folder && hovered && !busy, el => el.child(h_flex().id(`dl-${path}`).px(6).h(20).gap(4).items_center().rounded(5).text_size(11)
          .text_color(t.muted).bg(t.surface).hover(s => s.bg(t.selected).text_color(t.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); this.download(st, path, false, cx); })
          .child(svg("mods/my-chrome/download.svg").size(11)).child("Download"))));
      if (folder && open) this.rows(st, path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    const now = location();
    if (now.cwd !== this.cwd || now.machine !== this.machine) this.locate(cx);
    const t = theme(), st = this.st, server = st?.servers?.[st.server];
    const tool = (id, label, action) => div().id(id).h(24).px(7).flex_none().flex().items_center().rounded(6).text_size(12).text_color(t.muted)
      .cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground)).on_click(action).child(label);
    const message = (text, el) => v_flex().p(12).gap(10).text_size(12).text_color(t.dim).child(text).when(Boolean(el), x => x.child(el));

    let body;
    if (this.machine) body = message("Remote browsing works for spaces on this computer.");
    else if (!this.cwd) body = message("No folder");
    else if (!st) body = message("Looking for .vscode/sftp.json…");
    else if (st.file) body = st.code ? Editor.new(st.code).flex_1().min_h(0) : message(st.fileError || "Downloading…");
    else if (!st.config) body = message(`No .vscode/sftp.json in ${st.project.replace(home(), "~")}`,
      div().id("create").px(10).py(6).flex_none().rounded(6).bg(t.solid).text_color(t.solid_foreground).cursor_pointer()
        .on_click((_e, cx) => this.edit(st, cx)).child("Create sftp.json"));
    else body = v_flex().id(`tree-${st.config}`).flex_1().min_h(0).overflow_y_scrollbar().p(6)
      .when((st.servers?.length ?? 0) > 1, el => el.child(h_flex().flex_wrap().gap(4).pb(6).children(st.servers.map((s, i) =>
        div().id(`srv-${i}`).px(8).py(3).rounded(6).text_size(11).cursor_pointer()
          .bg(i === st.server ? t.selected : t.surface).text_color(i === st.server ? t.foreground : t.muted)
          .on_click((_e, cx) => { if (i !== st.server) { st.server = i; st.folders = new Set(); st.files = new Set(); this.refresh(st, cx); } })
          .child(s.name)))))
      .children(this.rows(st, "", 0, [], t))
      .when(Boolean(st.error) || !st.entries.get("")?.length, el => el.child(message(st.error || (st.loading ? `Connecting to ${server?.host ?? "server"}…` : "Empty folder"))))
      .when(st.limited, el => el.child(message("Listing limited to 1,000 entries per folder")));

    const file = st?.file;
    return v_flex().id("remote").size_full().min_h(0).overflow_hidden().bg(t.background).border_l_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(10).gap(4).items_center().border_b(1).border_color(t.border)
        .when(Boolean(file), el => el.child(tool("back", svg("mods/my-chrome/arrow-left.svg").size(14), (_e, cx) => this.show(st, null, cx))))
        .child(v_flex().flex_1().min_w(0).pl(4)
          .child(div().font_semibold().truncate().child(file ?? server?.name ?? "Remote"))
          .when(Boolean(server) && !file, el => el.child(div().text_size(11).text_color(t.dim).truncate()
            .child(`${server.protocol} · ${server.username}@${server.host}:${server.remotePath}`))))
        .when(Boolean(file), el => el.child(tool("download", st.busy.has(file) ? "…" : h_flex().gap(4).items_center().child(svg("mods/my-chrome/download.svg").size(12)).child("Download"), (_e, cx) => this.download(st, file, false, cx))))
        .when(Boolean(server), el => el
          .child(tool("reload", svg("mods/my-chrome/refresh-cw.svg").size(13.5), (_e, cx) => file ? this.show(st, file, cx) : this.refresh(st, cx)))
          .when(server?.protocol === "sftp", el => el.child(tool("term", svg("mods/my-chrome/terminal.svg").size(13.5), (_e, cx) => this.openTerminal(st, cx)))))
        .when(Boolean(st?.config), el => el.child(tool("edit", svg("mods/my-chrome/pencil.svg").size(13.5), (_e, cx) => this.edit(st, cx)))))
      .child(body)
      .when(Boolean(st?.confirm), el => el.child(v_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border).bg(t.surface).text_size(12)
        .child(div().text_color(t.foreground).child(`${st.confirm.path}: ${st.confirm.message}.`))
        .child(h_flex().gap(6)
          .child(div().id("overwrite").px(10).py(4).rounded(6).bg(t.blocked).text_color(t.background).cursor_pointer()
            .on_click((_e, cx) => this.download(st, st.confirm.path, true, cx)).child("Overwrite local file"))
          .child(div().id("keep").px(10).py(4).rounded(6).text_color(t.muted).cursor_pointer().hover(s => s.bg(t.hover))
            .on_click((_e, cx) => { st.confirm = null; cx.notify(); }).child("Keep mine")))));
  }
}
