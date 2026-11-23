import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, focused, run, openOverlay, theme, window, shared, setShared, layout, settings, nextCommand } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The side panel (which one, or closed) is remembered per space in shared "panel.bySpace",
// which my-spaces reads too. A switch that sets the panel in the same moment as the space
// (goToSpace: the sidebar, and the space keys through this mod's commands) draws both at
// once, so nothing flashes. Other switches (Herdr's agents list, toasts) are caught in
// render and fixed a moment late.
const MEMORY = "panel.bySpace";
const memory = () => shared(MEMORY) ?? {};
const shownPanel = root => { const panel = find(root, "panel"); return panel && !panel.hidden ? find(root, "panel-body")?.active ?? null : null; };
function applyPanel(want) {
  if (want === shownPanel(layout())) return;
  if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
  else run("layout.hide", { id: "panel" });
}
function goToSpace(id) {
  const m = memory();
  if (id in m) applyPanel(m[id]);
  run("space.select", { id });
}

// The next or previous agent in the agents list's order (my-agents shares it as "agents.order"),
// shown with its space's panel set in the same moment. Like agent.next/prev, it wraps around.
function goToAgent(step) {
  const all = agents(), order = shared("agents.order");
  const list = Array.isArray(order) ? order.map(addr => all.find(a => a.address === addr)).filter(Boolean) : all;
  if (!list.length) return;
  const f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  // The focused pane's agent; else the one last shown with agent.focus.
  let current = list.findIndex(a => a.address === (pane?.terminal ?? f?.terminal));
  if (current < 0) current = list.findIndex(a => a.address === f?.agent);
  const target = list[current < 0 ? (step > 0 ? 0 : list.length - 1) : (current + step + list.length) % list.length];
  const m = memory(), active = spaces().find(s => s.active)?.id;
  if (target.space !== active && target.space in m) applyPanel(m[target.space]);
  run("agent.focus", { terminal: target.address });
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.middlePressed = null;
    // keys.json: "alt-1": "my-tabs.space-1", "ctrl-j": "my-tabs.space-next", "ctrl-k": "my-tabs.space-prev",
    // "alt-down": "my-tabs.agent-next", "alt-up": "my-tabs.agent-prev".
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        if (command === "agent-next" || command === "agent-prev") { goToAgent(command === "agent-next" ? 1 : -1); continue; }
        const list = spaces(), at = list.findIndex(s => s.active);
        if (!list.length) continue;
        let target = null;
        if (command === "space-next") target = list[(at + 1) % list.length];
        else if (command === "space-prev") target = list[(at - 1 + list.length) % list.length];
        else if (/^space-\d+$/.test(command)) target = list[Number(command.slice(6)) - 1];
        if (target && !target.active) goToSpace(target.id);
      }
    });
  }

  // Records the active space's panel; restores a space's panel after a switch that didn't.
  trackPanel(space, root) {
    if (!space || !find(root, "panel")) return;
    const now = shownPanel(root), m = memory();
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (space.id in m && m[space.id] !== now) {
        this.pending = { want: m[space.id], until: Date.now() + 1000 };
        applyPanel(m[space.id]);
        return;
      }
      if (first) return;
    }
    // Until a restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (m[space.id] !== now) setShared(MEMORY, { ...m, [space.id]: now });
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    // Panel tabs (mod panes) get their panel's icon.
    const MOD_ICONS = { "my-files": "mods/my-files/file.svg", "my-changes": "mods/my-changes/changes.svg", "remote": "mods/remote/server.svg", "services": "mods/services/services.svg" };
    const item = (c, i) => {
      const modPane = panes().find(p => p.tab === c.id && MOD_ICONS[p.mod]);
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program
        ?? (modPane ? { icon: MOD_ICONS[modPane.mod], tint: true } : panes().find(p => p.tab === c.id)?.program);
      const tabPanes = panes().filter(p => p.tab === c.id);
      const titled = tabPanes.find(p => p.focused) ?? tabPanes.find(p => p.program?.agent) ?? tabPanes[0];
      const name = c.named ? c.name : titled?.title || program?.name || c.name;
      return h_flex().id(`tab-${c.id}`).h_full().px(12).gap(7).items_center().flex_none().text_size(12.8)
        .border_r(1).border_color(t.border).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); this.middlePressed = c.id; })
        .on_mouse_up("middle", (_e, cx) => {
          cx.stop_propagation();
          const id = this.middlePressed; this.middlePressed = null;
          if (id === c.id) run("tab.close", { id: c.id });
        })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(360).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/my-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 0;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = [...(shared("workspace.panels") ?? ["files", "changes"]), "remote"];
    this.trackPanel(space, root);
    // Each panel button toggles its panel in the side panel.
    const panelButton = (id, icon) => {
      const inPanel = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).size(26).flex_none().items_center().justify_center()
        .rounded(6)
        .bg(inPanel ? t.selected : t.chrome).text_color(inPanel ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => {
          if (inPanel) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14));
    };
    return h_flex().size_full().min_w(0).pr(10).pl(lightsPadding).gap(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_mouse_up("middle", () => { this.middlePressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().overflow_x_scrollbar().children(shown.map(item)))
      .child(button("tab-new", svg("mods/my-chrome/plus.svg").size(14), () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "mods/my-files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "mods/my-changes/changes.svg")))
      .child(panelButton("remote", "mods/remote/server.svg"))
      .child(panelButton("services", "mods/services/services.svg"))
      .when(false && w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/my-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/my-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/my-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
