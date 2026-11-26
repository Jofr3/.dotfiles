// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Click to
// switch, right-click for its menu, drag to reorder. Each space's agents (and their
// sub-agents) are listed under it; the separate agents list is gone.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, agents, terminals, focused, setAgentOrder, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window, layout, nextCommand } from "herdr";
import { TYPE, RADIUS, SIZE, TRANSPARENT, findNode, isNarrow, alpha, selectedMetaColor, focusBorder, statusColor, dot, iconBtn, sectionHeader } from "./ui.js";

// Switches space and its remembered side panel together, so the panel doesn't flash.
// The memory ("panel.bySpace") is kept by my-tabs; this is its goToSpace.
function goToSpace(id) {
  const m = shared("panel.bySpace") ?? {};
  if (id in m) {
    const root = layout(), panel = findNode(root, "panel");
    const now = panel && !panel.hidden ? findNode(root, "panel-body")?.active ?? null : null;
    if (panel && m[id] !== now) {
      if (m[id]) { run("layout.select", { stack: "panel-body", child: m[id] }); run("layout.show", { id: "panel" }); }
      else run("layout.hide", { id: "panel" });
    }
  }
  run("space.select", { id });
}

const narrow = () => isNarrow(layout());

// Goes to an agent with its space's remembered side panel in the same moment.
function goToAgent(a) {
  const m = shared("panel.bySpace") ?? {}, active = spaces().find((s) => s.active)?.id;
  if (a.space !== active && a.space in m) {
    const root = layout(), panel = findNode(root, "panel");
    const now = panel && !panel.hidden ? findNode(root, "panel-body")?.active ?? null : null;
    if (panel && m[a.space] !== now) {
      if (m[a.space]) { run("layout.select", { stack: "panel-body", child: m[a.space] }); run("layout.show", { id: "panel" }); }
      else run("layout.hide", { id: "panel" });
    }
  }
  run("pane.focus", { pane: a.pane });
}

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// Per tab: its first agent pane, else focused terminal, else first terminal.
function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const cur = leads.get(p.tab);
    if (!cur || (!cur.program?.agent && (p.program?.agent || (!cur.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

// A tab's label: its name, or the agent's live title when that says more.
function tabTitle(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}

// A sub-agent's status: error counts as blocked, never done (its parent reports).
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// A program's icon in a 16x16 box so every logo has the same weight.
function progIcon(p, size, color) {
  if (!p?.icon) return null;
  const el = p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).size(size).flex_none();
  return h_flex().size(16).flex_none().items_center().justify_center().child(el);
}

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = () => SIZE.row;
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

function avatarInitial(name) {
  const cleaned = String(name ?? "").replace(/^\.+/, "");
  return ([...cleaned][0] ?? [...String(name ?? "")][0] ?? "?").toUpperCase();
}

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

export default class Spaces extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.cursor = null;
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.middlePressed = null;
    this.over = null;
    this.hoveredMachine = null;
    this.machines = [];
    this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("agents.changed") ?? "{}");
    this.hoveredAgent = null;
    cx.timer.every(30000, (cx) => cx.notify()); // agents' "for how long"
    this.syncColors();
    this.refreshMachines(cx);
    // Ask often while a machine is down (so a fixed connection shows within
    // seconds), rarely once all are connected; and at once when a machine's
    // layout changes (it just came up or went away).
    this.machinesAsked = 0;
    this.layoutsSeen = "";
    cx.timer.every(2000, (cx) => {
      const layouts = JSON.stringify(machines());
      const down = this.machines.some((m) => m.state !== "connected");
      if (layouts !== this.layoutsSeen || down || Date.now() - this.machinesAsked > 15000) {
        this.layoutsSeen = layouts;
        this.refreshMachines(cx);
      }
    });
    cx.timer.every(1500, (cx) => this.checkNew(cx));
    cx.spawn(async () => {
      for (;;) {
        const cmd = await nextCommand();
        if (cmd === "focus") this.handle.focus();
      }
    });
  }

  syncColors() {
    const palette = ["ansi5", "ansi4", "ansi2", "ansi3"];
    const sp = spaces();
    const ids = new Set(sp.map((p) => p.id));
    const current = shared("space.colors") ?? {};
    const kept = Object.fromEntries(
      Object.entries(current).filter(([id, c]) => ids.has(id) && c !== "ansi1" && c !== "ansi6"),
    );
    let changed = Object.keys(kept).length !== Object.keys(current).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = (c) => Object.values(kept).filter((v) => v === c).length;
      kept[p.id] = palette.reduce((best, c) => (uses(c) < uses(best) ? c : best));
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
  }

  visibleMachines(rows) {
    const remote = [...new Set([...rows.map((r) => r.w.machine).filter(Boolean), ...this.machines.map((m) => m.name), ...Object.keys(this.reconnecting)])].sort();
    return remote.length ? [null, ...remote] : [null];
  }

  isLoading(m) {
    const ml = machines().find((k) => k.name === m)?.layout;
    return ml === "loading" || (!ml && this.machines.some((k) => k.name === m && k.state === "connected"))
      || spaces().some((s) => (s.machine ?? null) === m && !this.shown.has(s.id));
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    this.syncColors();
    this.ordered(true);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    this.machinesAsked = Date.now();
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  orderingDue(now) {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every(name => machines().some(m => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered(sync = false) {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    if (sync) {
      // Simulate the batch so later indexes include earlier moves. An attempted
      // write can lose a sync conflict: allow the echo to settle before retrying.
      const order = sp.map((w) => w.id);
      const target = out.map((r) => r.w.id);
      const key = JSON.stringify([order, target, machines()]);
      if (order.every((id, i) => id === target[i])) {
        this.ordering = null;
      } else if (this.ordering?.key !== key || this.orderingDue(Date.now())) {
        const moved = new Set();
        this.ordering = { key, at: Date.now(), machines: [] };
        for (let i = 0; i < out.length; i++) {
          const from = order.indexOf(out[i].w.id);
          if (from === i) continue;
          run("space.move", { id: out[i].w.id, index: i + 1 });
          moved.add(out[i].w.machine ?? null);
          order.splice(i, 0, order.splice(from, 1)[0]);
        }
        this.ordering.machines = [...moved];
      }
    }
    return out.filter((r) => this.shown.has(r.w.id));
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed, rows) {
    const ps = panes();
    const nameCounts = {};
    for (const r of rows) nameCounts[r.w.name] = (nameCounts[r.w.name] ?? 0) + 1;
    const hintFor = (w) => {
      if ((nameCounts[w.name] ?? 0) <= 1) return "";
      const cwd = place(w, ps) || "";
      const leaf = base(cwd);
      if (leaf && leaf !== w.name) return leaf;
      const parts = cwd.replace(/\/+$/, "").split("/").filter(Boolean);
      return parts.length >= 2 ? parts[parts.length - 2] : "";
    };
    const draw = (r) => [
      collapsed ? this.compact(r, t, hintFor(r.w)) : this.row(r, t, hintFor(r.w)),
      ...this.agentRows(r, t, collapsed),
    ];
    const loading = (m) => this.isLoading(m);
    const loadingRow = (m) => div().id(`machine-loading-${m ?? "local"}`).h(SIZE.row).flex_none().px(8).text_size(TYPE.sub).text_color(t.muted).child(collapsed ? "…" : "Loading…");
    const machineNames = this.visibleMachines(rows);
    const useGroups = machineNames.length > 1 || (machineNames.length === 1 && machineNames[0] !== null);
    if (collapsed) {
      if (loading(null) && !rows.length) return [loadingRow(null)];
      if (!useGroups) return rows.flatMap(draw);
      let first = true;
      return machineNames.flatMap((m) => {
        const mine = rows.filter((r) => (r.w.machine ?? null) === m);
        if (!mine.length) return [];
        const sep = !first
          ? [h_flex().h(9).flex_none().items_center().justify_center().child(div().h(1).w(16).bg(alpha(t.foreground, 0.14)))]
          : [];
        first = false;
        return [...sep, ...mine.flatMap(draw)];
      });
    }
    if (!useGroups) return loading(null) && !rows.length ? [loadingRow(null)] : rows.flatMap(draw);
    return machineNames.flatMap((m, idx) => {
      const mKey = m ?? "local";
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find((k) => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected" || machines().some((k) => k.name === m && k.layout === "ready");
      const rebuilt = this.rebuilt(machine) || !!repair;
      const folded = this.folded.has(m);
      const hovered = this.hoveredMachine === mKey;
      const rightEl = h_flex().gap(4).flex_none().items_center()
        .when(!connected && !rebuilt, (el) => el.child(div().text_size(TYPE.meta).text_color(t.dim).child((machine?.state ?? "offline").replace(/_/g, " "))))
        .when(rebuilt, (el) => el.child(h_flex().gap(3).items_center().text_size(TYPE.meta)
          .child(div().max_w(120).truncate().child(repair?.error || "rebuilt ·"))
          .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
            .hover((s) => s.text_color(t.foreground))
            .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
            .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
            .child(repair?.busy ? "Connecting…" : "Connect"))))
        .when(connected && hovered, (el) => el.child(h_flex().id(`machine-add-${mKey}`).size(20).flex_none().items_center().justify_center().rounded(RADIUS.xs)
          .text_color(t.muted).hover((s) => s.bg(t.selected).text_color(t.foreground))
          .tooltip(`New space on ${m ?? "this computer"}`)
          .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); })
          .child(svg("mods/my-chrome/plus.svg").size(SIZE.iconSm))));
      const head = sectionHeader(t, {
        id: `machine-${mKey}`,
        open: !folded,
        label: m ?? "This computer",
        statusDot: !rebuilt ? (connected ? (m ? dot(t, "ok", { size: 5 }) : null) : dot(t, "error", { size: 5 })) : null,
        right: (!connected || rebuilt || hovered) ? rightEl : null,
        onToggle: (_e, cx) => {
          this.folded.has(m) ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        },
      })
        .when(idx > 0, (el) => el.mt(8))
        .tooltip(`${m ?? "This computer"}${!connected ? ` · ${(machine?.state ?? "disconnected").replace(/_/g, " ")}` : ""}`)
        .on_hover((on, cx) => {
          if (on) this.hoveredMachine = mKey;
          else if (this.hoveredMachine === mKey) this.hoveredMachine = null;
          cx.notify();
        });
      if (rebuilt) return [head];
      const empty = h_flex().id(`machine-new-${mKey}`).h(SIZE.row).flex_none().px(8).gap(8).items_center().rounded(RADIUS.sm)
        .cursor_pointer().text_size(TYPE.sub).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .child(svg("mods/my-chrome/plus.svg").size(SIZE.iconSm))
        .child("New space");
      const body = mine.length ? mine.flatMap(draw) : (loading(m) ? [loadingRow(m)] : (connected ? [empty] : []));
      return [head, ...(folded ? [] : body)];
    });
  }

  // Only what's unusual, after the name: "herdr · spike ↑2 ↓1". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitTail(g, tree, name, t, selected, disambig = "") {
    const raw = g?.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = g ? (same(raw) || raw === "master" || raw === "main" ? "" : raw) : "";
    const repo = g ? (tree || same(g.name) ? "" : g.name) : "";
    const where = [disambig && disambig !== repo && disambig !== branch ? disambig : "", repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(4)
      .justify_end()
      .items_center()
      .text_size(TYPE.meta)
      .text_color(selected ? selectedMetaColor(t) : t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when((g?.ahead ?? 0) > 0, (el) => el.child(div().flex_none().text_color(statusColor(t, "ok")).child(`\u2191${g.ahead}`)))
      .when((g?.behind ?? 0) > 0, (el) => el.child(div().flex_none().text_color(statusColor(t, "error")).child(`\u2193${g.behind}`)));
  }

  row({ w, i, g, tree }, t, disambig = "") {
    const on = w.active;
    const kbdFocus = this.cursor === w.id;
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex((s) => s.id === this.pressed);
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi5";
    const baseColor = color.startsWith("#") ? color : (t[color] ?? t.ansi5);
    const fill = alpha(baseColor, 0.20);
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(rowHeight())
      .flex_none()
      .justify_center()
      .rounded(RADIUS.sm)
      .cursor_pointer()
      .border_1()
      .border_color(kbdFocus && !on ? focusBorder(t) : TRANSPARENT)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, (line) => line.bottom(0))
          .when(fromIndex > i, (line) => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = w.id;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find((s) => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === w.id && from !== w.id) {
          const index = spaces().findIndex((s) => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) {
          this.cursor = w.id;
          this.handle.focus();
          goToSpace(w.id);
        }
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); this.middlePressed = w.id; })
      .on_mouse_up("middle", (_e, cx) => {
        cx.stop_propagation();
        const id = this.middlePressed; this.middlePressed = null;
        if (id === w.id) run("space.close", { id: w.id });
      })
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .when(Boolean(tree), (el) => el.pl(20).child(svg("mods/my-chrome/branch.svg").size(SIZE.iconSm).text_color(t.muted)))
          .when(!tree, (el) => el.child(h_flex().size(18).flex_none().rounded(RADIUS.xs).bg(fill).items_center().justify_center().text_size(TYPE.meta).font_semibold().text_color(baseColor).child(avatarInitial(w.name))))
          .child(div().flex_shrink(0).max_w(150).truncate().text_color(on ? t.foreground : t.muted).when(on, (el) => el.font_medium()).child(w.name))
          .child(g || disambig ? this.gitTail(g, tree, w.name, t, on, disambig) : div().flex_1()),
      );
  }

  compact({ w }, t, disambig = "") {
    const kbdFocus = this.cursor === w.id;
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi5";
    const baseColor = color.startsWith("#") ? color : (t[color] ?? t.ansi5);
    const fill = alpha(baseColor, 0.22);
    const urgent = w.status === "blocked" || w.status === "done";
    const tip = [w.name, disambig, w.machine].filter(Boolean).join(" · ");
    return h_flex()
      .id(`space-${w.id}`)
      .relative()
      .h(SIZE.row)
      .flex_none()
      .items_center()
      .justify_center()
      .rounded(RADIUS.sm)
      .border_1()
      .border_color(kbdFocus && !w.active ? focusBorder(t) : TRANSPARENT)
      .cursor_pointer()
      .tooltip(tip)
      .when(w.active, (el) => el.bg(t.selected))
      .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => { this.cursor = w.id; this.handle.focus(); goToSpace(w.id); })
      .on_mouse_down("right", () => this.menu(w))
      .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); this.middlePressed = w.id; })
      .on_mouse_up("middle", (_e, cx) => {
        cx.stop_propagation();
        const id = this.middlePressed; this.middlePressed = null;
        if (id === w.id) run("space.close", { id: w.id });
      })
      .child(h_flex().size(20).flex_none().rounded(RADIUS.xs).bg(fill).items_center().justify_center()
        .text_size(TYPE.meta).font_semibold().text_color(baseColor).child(avatarInitial(w.name)))
      .when(urgent, (el) => el.child(div().absolute().top(1).right(2).child(dot(t, w.status, { size: 5 }))));
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("agents.changed", JSON.stringify(this.changed));
  }

  // Live sub-agents of `addr`, depth first, each with its depth.
  tree(all, addr, depth = 1) {
    return all.filter((k) => k.parent === addr && k.state === "live")
      .flatMap((k) => [{ t: k, depth }, ...this.tree(all, k.address, depth + 1)]);
  }

  // Agents per space, in sidebar order (pinned first within a space); also sets
  // the order agent.next/prev follow and shares it with my-tabs.
  agentData(rows, cx) {
    const list = agents();
    this.track(list, Date.now());
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    this.allTerminals = terminals();
    this.shownAgent = focused()?.agent;
    const leads = leadPanes(panes());
    const tabLabels = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, tabTitle(tab, leads.get(tab.id))]));
    this.agentLabel = (a) => {
      const l = tabLabels.get(a.tab) ?? (a.title || "");
      return !l || /^\d+$/.test(l) ? a.program?.name || a.title || a.space_name || l : l;
    };
    const by = new Map();
    for (const a of list) {
      if (!by.has(a.space)) by.set(a.space, []);
      by.get(a.space).push(a);
    }
    for (const [k, v] of by) by.set(k, [...v.filter((a) => a.pinned), ...v.filter((a) => !a.pinned)]);
    const order = rows.flatMap((r) => (by.get(r.w.id) ?? []).map((a) => a.address));
    // Agents of spaces not shown yet still take a turn, at the end.
    for (const a of list) if (!order.includes(a.address)) order.push(a.address);
    setAgentOrder(order);
    const key = JSON.stringify(order);
    if (key !== this.lastOrderKey) {
      this.lastOrderKey = key;
      cx.spawn(async () => {
        if (JSON.stringify(shared("agents.order")) !== key) setShared("agents.order", order);
      });
    }
    return by;
  }

  // The rows under a space: its agents, each followed by its live sub-agents.
  agentRows({ w, tree }, t, collapsed) {
    const list = this.agentsBySpace?.get(w.id) ?? [];
    const indent = tree ? 46 : 26;
    return list.flatMap((a) => {
      const subs = collapsed ? [] : this.tree(this.allTerminals, a.address);
      return [
        collapsed ? this.agentCompact(a, t) : this.agentRow(a, t, indent),
        ...subs.map((s) => this.subRow(s, t, indent)),
      ];
    });
  }

  agentRow(a, t, indent) {
    const on = a.focused;
    const blocked = a.status === "blocked";
    const idle = a.status === "idle" && !on;
    const when = this.changed[a.address]?.at;
    const label = this.agentLabel(a);
    const pic = progIcon(a.program, SIZE.icon, t.foreground);
    const st = blocked || a.status === "idle" ? null : dot(t, a.status, { pulse: a.status === "working" });
    const hovered = this.hoveredAgent === a.address;
    const pin = div().id(`pin-${a.address}`).flex_none().p(2).rounded(RADIUS.xs).text_color(t.muted).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(a.pinned ? "Unpin" : "Pin to the top of its space")
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run("terminal.pin", { terminal: a.address, pinned: !a.pinned });
        this.hoveredAgent = null;
        cx.notify();
      })
      .child(svg(`mods/my-chrome/${a.pinned ? "pin-off" : "pin"}.svg`).size(SIZE.iconSm));
    return h_flex()
      .id(`ag-${a.address}`)
      .ml(indent - 8)
      .px(8)
      .h(SIZE.row - 2)
      .flex_none()
      .gap(8)
      .items_center()
      .rounded(RADIUS.sm)
      .text_size(TYPE.sub)
      .cursor_pointer()
      .tooltip([a.space_name, label].filter(Boolean).join(" · "))
      .when(blocked && !on, (el) => el.bg(alpha(t.blocked, 0.1)))
      .when(on, (el) => el.bg(alpha(t.selected, 0.7)))
      .when(!on, (el) => el.hover((s) => s.bg(blocked ? alpha(t.blocked, 0.16) : t.hover)))
      .on_hover((h, cx) => {
        if (h) this.hoveredAgent = a.address;
        else if (this.hoveredAgent === a.address) this.hoveredAgent = null;
        cx.notify();
      })
      .on_click(() => goToAgent(a))
      .child(h_flex().relative().size(16).flex_none().items_center().justify_center()
        .when(Boolean(pic), (el) => el.child(pic))
        .when(!pic, (el) => el.child(div().size(6).rounded(RADIUS.full).bg(t.dim)))
        .when(Boolean(st), (el) => el.child(div().absolute().bottom(-2).right(-2).child(st))))
      .child(div().flex_1().min_w(0).truncate()
        .text_color(on || !idle ? t.foreground : t.muted)
        .when(on || blocked, (el) => el.font_medium())
        .child(label))
      .when(hovered || a.pinned, (el) => el.child(a.pinned && !hovered
        ? svg("mods/my-chrome/pin.svg").size(SIZE.iconSm).flex_none().text_color(t.dim)
        : pin))
      .when(Boolean(when) && !blocked, (el) => el.child(div().flex_none().text_size(TYPE.meta)
        .text_color(on ? selectedMetaColor(t) : t.dim).child(duration(Date.now() - when))))
      .when(blocked, (el) => el.child(div().flex_none().px(6).h(18).rounded(RADIUS.xs).bg(alpha(t.blocked, 0.16))
        .text_size(TYPE.meta).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you")));
  }

  subRow({ t: k, depth }, t, indent) {
    const st = kidStatus(k, this.listed);
    const on = k.address === this.shownAgent;
    const pic = progIcon(k.program, SIZE.iconSm, t.foreground);
    return h_flex()
      .id(`sub-${k.address}`)
      .ml(indent - 8 + depth * 12)
      .pl(8)
      .pr(8)
      .h(SIZE.row - 4)
      .flex_none()
      .gap(6)
      .items_center()
      .rounded(RADIUS.sm)
      .text_size(TYPE.meta)
      .cursor_pointer()
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => run("terminal.peek", { terminal: k.address }))
      .child(div().w(8).h(1).flex_none().bg(t.input))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted)
        .child(k.name || k.template || k.program?.name || k.address))
      .when(st && st !== "idle", (el) => el.child(dot(t, st, { pulse: st === "working", size: 5 })));
  }

  agentCompact(a, t) {
    const pic = progIcon(a.program, SIZE.icon, t.foreground);
    const st = a.status === "idle" ? null : dot(t, a.status, { pulse: a.status === "working", size: 5 });
    return h_flex()
      .id(`ag-${a.address}`)
      .relative()
      .h(SIZE.row - 4)
      .flex_none()
      .items_center()
      .justify_center()
      .rounded(RADIUS.sm)
      .cursor_pointer()
      .tooltip([a.space_name, this.agentLabel(a)].filter(Boolean).join(" · "))
      .when(a.focused, (el) => el.bg(alpha(t.selected, 0.7)))
      .when(!a.focused, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => goToAgent(a))
      .child(pic ?? div().size(6).rounded(RADIUS.full).bg(t.dim))
      .when(Boolean(st), (el) => el.child(div().absolute().bottom(2).right(6).child(st)));
  }

  render(cx) {
    const t = theme();
    const collapsed = narrow();
    const rows = this.ordered(false);
    this.agentsBySpace = this.agentData(rows, cx);
    const items = this.grouped(t, collapsed, rows);
    const onKey = (e, cx) => {
      if (!rows.length) return;
      const curIdx = rows.findIndex((r) => r.w.id === this.cursor);
      const activeIdx = rows.findIndex((r) => r.w.active);
      const baseIdx = curIdx >= 0 ? curIdx : activeIdx;
      if (e.key === "down" || e.key === "j") {
        this.cursor = rows[Math.min(rows.length - 1, baseIdx + 1)].w.id;
        cx.notify();
        cx.stop_propagation();
      } else if (e.key === "up" || e.key === "k") {
        this.cursor = rows[Math.max(0, baseIdx - 1)].w.id;
        cx.notify();
        cx.stop_propagation();
      } else if (e.key === "enter" && this.cursor) {
        goToSpace(this.cursor);
        cx.stop_propagation();
      }
    };
    return v_flex().id("spaces-root").track_focus(this.handle).on_key_down(onKey)
      .size_full().min_h(0).bg(t.chrome).text_size(TYPE.body)
      .when(!collapsed, (el) => el.child(
        h_flex().pl(14).pr(8).mt(6).h(SIZE.header).flex_none().gap(6).items_center()
          .child(div().text_size(TYPE.sub).font_semibold().text_color(t.foreground).child("Spaces"))
          .child(div().flex_1())
          .child(iconBtn(t, "spaces-add", "mods/my-chrome/plus.svg", "New space", () => run("space.new", { machine: "" }))),
      ))
      .child(v_flex().flex_1().min_h(0).px(6).pb(6).when(collapsed, (el) => el.pt(6)).when(!collapsed, (el) => el.pt(4)).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .on_mouse_up("middle", () => { this.middlePressed = null; })
        .children(items));
  }
}
