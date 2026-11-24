// Agents in grouped or priority views; parents take their most urgent sub-agent's place.
// A viewed done agent stays in Done until left.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, layout, nextCommand } from "herdr";
import { TYPE, RADIUS, SIZE, TRANSPARENT, findNode, isNarrow, alpha, selectedMetaColor, focusBorder, statusColor, dot, menuFrame, menuRow, iconBtn, sectionHeader } from "./ui.js";

// Goes to an agent with its space's remembered side panel in the same moment, so the panel
// doesn't flash. The memory ("panel.bySpace") is kept by my-tabs; my-spaces does the same.
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

const narrow = () => isNarrow(layout());

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "arrow-up-down" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon normalized inside a 16x16 box so every logo renders at uniform visual weight.
function icon(p, size, color) {
  if (!p?.icon) return null;
  const el = p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).size(size).flex_none();
  return h_flex().size(16).flex_none().items_center().justify_center().child(el);
}

export default class Agents extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    if (props()?.sortMenu) {
      this.at = Math.max(0, SORTS.findIndex((s) => s.id === sortOf().id));
      this.handle.focus();
      return;
    }
    this.cursor = -1;
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    cx.timer.every(30000, (cx) => cx.notify());
    cx.spawn(async () => {
      for (;;) {
        const cmd = await nextCommand();
        if (cmd === "focus") this.handle.focus();
      }
    });
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
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    const choose = (i) => {
      const s = SORTS[i];
      if (!s) return;
      setShared("agents.sort", s.id);
      closeOverlay(props().overlay);
    };
    return menuFrame(t, "ag-sort-menu")
      .track_focus(this.handle)
      .text_size(TYPE.body)
      .on_key_down((e, cx) => {
        if (e.key === "down" || e.key === "j") this.at = (this.at + 1) % SORTS.length;
        else if (e.key === "up" || e.key === "k") this.at = (this.at + SORTS.length - 1) % SORTS.length;
        else if (e.key === "enter") choose(this.at);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(div().px(8).pt(4).pb(4).text_size(TYPE.meta).font_medium().text_color(t.muted).child("Sort agents"))
      .children(SORTS.map((s, i) => menuRow(t, `sort-${s.id}`, {
        icon: `mods/my-chrome/${s.icon}.svg`,
        label: s.label,
        selected: i === this.at,
        checked: s.id === on,
        onClick: () => choose(i),
      })));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, SIZE.icon, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(32)
      .pr(8)
      .rounded(RADIUS.sm)
      .h(SIZE.row)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(TYPE.sub)
      .cursor_pointer()
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => this.peek(k.address))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(18).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(RADIUS.sm))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).when(on, (el) => el.font_medium()).child(k.name || k.template || k.program?.name || k.address))
      .when(st !== "idle", (el) => el.child(this.status(t, { status: st }, compact)));
  }

  // Quiet-by-default: filled status dot for active states; nothing for idle.
  statusDot(t, st) {
    if (!st || st === "idle") return null;
    return dot(t, st, { pulse: st === "working" });
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    if (a.status === "blocked" && compact) {
      return div().size(16).flex_none().rounded(RADIUS.xs).bg(alpha(t.blocked, 0.16)).text_size(TYPE.meta).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    }
    if (a.status === "blocked") {
      return div().flex_none().px(6).h(18).rounded(RADIUS.xs).bg(alpha(t.blocked, 0.16)).text_size(TYPE.meta).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    }
    return this.statusDot(t, a.status);
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    this.hold(list);
    const byPriority = sort.id === "priority";
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    const order = list.map((a) => a.address);
    setAgentOrder(order);
    // Defer shared order sync outside render() so render stays side-effect-free for shared state.
    const orderKey = JSON.stringify(order);
    if (orderKey !== this.lastOrderKey) {
      this.lastOrderKey = orderKey;
      cx.spawn(async () => {
        if (JSON.stringify(shared("agents.order")) !== orderKey) setShared("agents.order", order);
      });
    }

    const indexByAddr = new Map(list.map((a, i) => [a.address, i]));
    const withKids = (a) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, indexByAddr.get(a.address) ?? -1, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(4)
        .gap(3)
        .flex()
        .items_center()
        .rounded(RADIUS.xs)
        .text_size(TYPE.meta)
        .text_color(open ? t.muted : (t[top] ?? t.muted))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/my-chrome/chevron-${open ? "down" : "right"}.svg`).size(SIZE.iconSm).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    const leads = leadPanes(panes());
    const tabLabels = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, title(tab, leads.get(tab.id))]));
    const labels = new Map(list.map((a) => [a.address, tabLabels.get(a.tab) ?? (a.title || a.program?.name || "")]));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map((a) => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      const tip = [a.space_name, more || label(a)].filter(Boolean).join(" · ");
      if (collapsed) {
        const isFocused = a.focused;
        const isCursor = this.cursor === i && !isFocused;
        const statusEl = this.statusDot(t, a.status);
        return h_flex()
          .id(`ag-${a.address}`)
          .relative()
          .h(SIZE.row)
          .flex_none()
          .items_center()
          .justify_center()
          .rounded(RADIUS.sm)
          .cursor_pointer()
          .tooltip(tip)
          .border_1()
          .border_color(isCursor ? focusBorder(t) : TRANSPARENT)
          .when(isFocused, (el) => el.bg(t.selected))
          .when(!isFocused, (el) => el.hover((s) => s.bg(t.hover)))
          .on_click(() => { this.cursor = i; this.handle.focus(); goToAgent(a); })
          .child(pic ?? div().text_size(TYPE.sub).text_color(isFocused ? t.foreground : t.muted).child(String(i + 1)))
          .when(Boolean(statusEl), (el) => el.child(div().absolute().bottom(1).right(1).child(statusEl)));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(RADIUS.xs)
        .text_color(t.muted)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/my-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(SIZE.icon));
      const primary = more ?? (/^\d+$/.test(label(a)) ? a.program?.name || a.space_name || label(a) : label(a) || a.space_name);
      const blocked = a.status === "blocked";
      const isFocused = a.focused;
      const isCursor = this.cursor === i && !isFocused;
      const isBlockedPill = blocked && !(byPriority && !isPinned);
      const badgeDot = !isBlockedPill ? this.statusDot(t, a.status) : null;
      return h_flex()
        .relative()
        .id(`ag-${a.address}`)
        .px(8)
        .h(SIZE.row)
        .gap(8)
        .flex_none()
        .items_center()
        .rounded(RADIUS.sm)
        .tooltip([a.space_name, machine, primary].filter(Boolean).join(" · "))
        .border_1()
        .border_color(isCursor ? focusBorder(t) : TRANSPARENT)
        .when(blocked && !isFocused, (el) => el.bg(alpha(t.blocked, 0.1)))
        .when(isFocused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .when(!isFocused, (el) => el.hover((s) => s.bg(blocked ? alpha(t.blocked, 0.16) : t.hover)))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => { this.cursor = i; this.handle.focus(); goToAgent(a); })
        .child(h_flex().id(`agent-fold-${a.address}`).relative().size(18).flex_none().items_center().justify_center()
          .when(subs.length > 0, (el) => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          }))
          .when(Boolean(pic), (el) => el.child(pic))
          .when(Boolean(badgeDot), (el) => el.child(div().absolute().bottom(-2).right(-2).child(badgeDot))))
        .child(div().flex_1().min_w(0).truncate()
          .text_color(isFocused || !idle ? t.foreground : t.muted)
          .when(isFocused || blocked, (el) => el.font_medium())
          .child(primary))
        .when(subs.length > 0, (el) => el.child(fold(a, subs)))
        .when(this.hovered === a.address, (el) => el.child(pin))
        .when(Boolean(when), (el) => el.child(div().flex_none().text_size(TYPE.meta).text_color(isFocused ? selectedMetaColor(t) : t.dim).child(duration(now - when))))
        .when(isBlockedPill, (el) => el.child(this.status(t, a, false)));
    };

    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    const showGroupHeaders = groups.length > 1;

    const header = (g, idx) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return sectionHeader(t, {
        id: g.id,
        open,
        label: g.label,
        count: (byPriority && groups.length > 1) || !open ? g.members.length : null,
        labelColor: g.status ? statusColor(t, g.status) : t.muted,
        statusDot: !open && !byPriority && top && top !== "idle" ? this.statusDot(t, top) : null,
        onToggle: (_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        },
      }).when(idx > 0, (el) => el.mt(8));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : showGroupHeaders
        ? groups.flatMap((g, idx) => [header(g, idx), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))])
        : list.flatMap(withKids);

    const onKey = (e, cx) => {
      if (!list.length) return;
      if (e.key === "down" || e.key === "j") { this.cursor = Math.min(list.length - 1, this.cursor + 1); cx.notify(); cx.stop_propagation(); }
      else if (e.key === "up" || e.key === "k") { this.cursor = Math.max(0, this.cursor - 1); cx.notify(); cx.stop_propagation(); }
      else if (e.key === "enter") { const a = list[this.cursor]; if (a) goToAgent(a); cx.stop_propagation(); }
    };

    return v_flex()
      .id("agents-root")
      .track_focus(this.handle)
      .on_key_down(onKey)
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .text_size(TYPE.body)
      .when(collapsed, (el) => el.child(h_flex().h(9).flex_none().items_center().justify_center().child(div().h(1).w(16).bg(alpha(t.foreground, 0.14)))))
      .when(!collapsed, (el) => el
        .child(
          h_flex()
            .id("ag-header")
            .pl(14)
            .pr(8)
            .mt(6)
            .h(SIZE.header)
            .flex_none()
            .gap(6)
            .items_center()
            .child(div().text_size(TYPE.sub).font_semibold().text_color(t.foreground).child("Agents"))
            .child(div().flex_1())
            .child(iconBtn(t, "ag-sort", `mods/my-chrome/${sort.icon}.svg`, `Sort agents: ${sort.label}`, () => openOverlay({ mod: "my-agents", kind: "popup", width: 200, height: 96, props: { sortMenu: true } }))),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(14).py(8).text_size(TYPE.sub).text_color(t.dim).child("No active agents yet.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(6).pb(6).pt(4).overflow_y_scrollbar().children(rows));
  }
}
