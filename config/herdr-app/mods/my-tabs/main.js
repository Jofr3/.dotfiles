import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, focused, run, openOverlay, theme, window, shared, setShared, layout, settings, nextCommand } from "herdr";
import { TYPE, RADIUS, SIZE, findNode, dot, iconBtn } from "./ui.js";

// The side panel (which one, or closed) is remembered per space in shared "panel.bySpace",
// which my-spaces reads too. A switch that sets the panel in the same moment as the space
// (goToSpace: the sidebar, and the space keys through this mod's commands) draws both at
// once, so nothing flashes.
const MEMORY = "panel.bySpace";
const memory = () => shared(MEMORY) ?? {};
const shownPanel = (root) => {
  const panel = findNode(root, "panel");
  return panel && !panel.hidden ? findNode(root, "panel-body")?.active ?? null : null;
};
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

function goToAgent(step) {
  const all = agents(), order = shared("agents.order");
  const list = Array.isArray(order) ? order.map((addr) => all.find((a) => a.address === addr)).filter(Boolean) : all;
  if (!list.length) return;
  const f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  let current = list.findIndex((a) => a.address === (pane?.terminal ?? f?.terminal));
  if (current < 0) current = list.findIndex((a) => a.address === f?.agent);
  const target = list[current < 0 ? (step > 0 ? 0 : list.length - 1) : (current + step + list.length) % list.length];
  const m = memory(), active = spaces().find((s) => s.active)?.id;
  if (target.space !== active && target.space in m) applyPanel(m[target.space]);
  run("agent.focus", { terminal: target.address });
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.over = null;
    this.middlePressed = null;
    this.hoveredTab = null;
    this.lastSpaceId = undefined;
    this.lastPanel = undefined;
    this.pending = null;
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        if (command === "agent-next" || command === "agent-prev") { goToAgent(command === "agent-next" ? 1 : -1); continue; }
        const list = spaces(), at = list.findIndex((s) => s.active);
        if (!list.length) continue;
        let target = null;
        if (command === "space-next") target = list[(at + 1) % list.length];
        else if (command === "space-prev") target = list[(at - 1 + list.length) % list.length];
        else if (/^space-\d+$/.test(command)) target = list[Number(command.slice(6)) - 1];
        if (target && !target.active) goToSpace(target.id);
      }
    });
  }

  syncPanelMemory() {
    const space = spaces().find((s) => s.active);
    const root = layout();
    if (!space || !findNode(root, "panel")) return;
    const now = shownPanel(root), m = memory();
    if (space.id !== this.lastSpaceId) {
      const first = this.lastSpaceId === undefined;
      this.lastSpaceId = space.id;
      this.pending = null;
      if (space.id in m && m[space.id] !== now) {
        this.pending = { want: m[space.id], until: Date.now() + 1000 };
        applyPanel(m[space.id]);
        return;
      }
      if (first) return;
    }
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (m[space.id] !== now) setShared(MEMORY, { ...m, [space.id]: now });
  }

  render(cx) {
    const t = theme();
    const space = spaces().find((p) => p.active);
    const root = layout();
    const nowPanel = shownPanel(root);
    if (space?.id !== this.lastSpaceId || nowPanel !== this.lastPanel) {
      this.lastPanel = nowPanel;
      cx.spawn(async () => this.syncPanelMemory());
    }
    const shown = space?.tabs ?? [];
    const MOD_ICONS = {
      "my-files": "mods/my-files/file.svg",
      "my-changes": "mods/my-changes/changes.svg",
      "remote": "mods/remote/cloud.svg",
      "services": "mods/services/layers.svg",
    };

    const item = (c, i) => {
      const modPane = panes().find((p) => p.tab === c.id && MOD_ICONS[p.mod]);
      const program = panes().find((p) => p.tab === c.id && p.program?.agent)?.program
        ?? (modPane ? { icon: MOD_ICONS[modPane.mod], tint: true } : panes().find((p) => p.tab === c.id)?.program);
      const tabPanes = panes().filter((p) => p.tab === c.id);
      const titled = tabPanes.find((p) => p.focused) ?? tabPanes.find((p) => p.program?.agent) ?? tabPanes[0];
      const name = c.named ? c.name : titled?.title || program?.name || c.name;
      const dropTarget = this.pressed !== null && this.over === i && this.pressed !== i;
      const showClose = this.hoveredTab === c.id && shown.length > 0;
      return h_flex().id(`tab-${c.id}`).relative().h_full().pl(12).pr(12).gap(6).items_center().flex_none().text_size(TYPE.body)
        .cursor_pointer()
        .when(!c.active, (el) => el.border_b(1).border_color(t.border))
        .bg(c.active ? t.background : t.chrome)
        .text_color(c.active ? t.foreground : t.muted)
        .when(c.active, (el) => el.font_medium())
        .when(!c.active, (el) => el.hover((s) => s.bg(t.hover).text_color(t.foreground)))
        .when(dropTarget, (el) => el.child(
          div().absolute().top(4).bottom(4).w(2).rounded(RADIUS.xs).bg(t.accent)
            .when(this.pressed < i, (l) => l.right(0))
            .when(this.pressed > i, (l) => l.left(0)),
        ))
        .on_hover((on, cx) => {
          if (on) this.hoveredTab = c.id;
          else if (this.hoveredTab === c.id) this.hoveredTab = null;
          cx.notify();
        })
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; this.over = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_move((_e, cx) => { if (this.pressed !== null && this.over !== i) { this.over = i; cx.notify(); } })
        .on_mouse_up("left", (_e, cx) => {
          const from = this.pressed; this.pressed = null; this.over = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex((x) => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
          cx.notify();
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); this.middlePressed = c.id; })
        .on_mouse_up("middle", (_e, cx) => {
          cx.stop_propagation();
          const id = this.middlePressed; this.middlePressed = null;
          if (id === c.id) run("tab.close", { id: c.id });
        })
        .when(Boolean(program?.icon), (el) => el.child(program.tint ? svg(program.icon).size(SIZE.icon).flex_none().text_color(c.active ? t.foreground : t.muted) : image(program.icon).size(SIZE.icon).flex_none()))
        .child(div().max_w(320).truncate().child(c.zoomed ? `${name} · Z` : name))
        .when(c.status === "working", (el) => el.child(dot(t, "working", { pulse: true })))
        .when(c.status === "blocked" || c.status === "done", (el) => el.child(dot(t, c.status)))
        .when(showClose, (el) => el.child(
          h_flex().id(`tab-close-${c.id}`).absolute().right(4).size(18).flex_none().items_center().justify_center().rounded(RADIUS.xs)
            .bg(c.active ? t.background : t.hover)
            .text_color(t.muted).hover((s) => s.bg(t.selected).text_color(t.foreground))
            .tooltip("Close tab")
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); })
            .child(svg("mods/my-chrome/x.svg").size(SIZE.iconSm)),
        ));
    };

    const sidebar = findNode(root, "sidebar"), w = window();
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 0;
    const panel = findNode(root, "panel"), body = findNode(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    const panelButton = (id, icon, tip) => {
      const inPanel = Boolean(panel && !panel.hidden && body?.active === id);
      return iconBtn(t, `panel-${id}`, icon, tip, () => {
        if (inPanel) run("layout.hide", { id: "panel" });
        else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
      }, { active: inPanel });
    };

    return h_flex().size_full().min_w(0).pl(lightsPadding).items_center().bg(t.chrome)
      .on_mouse_up("left", (_e, cx) => { if (this.pressed !== null) { this.pressed = null; this.over = null; cx.notify(); } })
      .on_mouse_up("middle", () => { this.middlePressed = null; })
      .on_scroll_wheel((e) => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(
        h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().overflow_x_scrollbar()
          .children(shown.map(item))
          .child(
            h_flex().h_full().px(6).flex_none().items_center().border_b(1).border_color(t.border)
              .child(iconBtn(t, "tab-new", "mods/my-chrome/plus.svg", "New tab", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }))),
          )
          .child(div().flex_1().h_full().border_b(1).border_color(t.border)),
      )
      .child(
        h_flex().h_full().pr(12).pl(6).gap(4).flex_none().items_center().border_b(1).border_color(t.border)
          .when(enabled.includes("files"), (el) => el.child(panelButton("files", "mods/my-files/file.svg", "Files panel")))
          .when(enabled.includes("changes"), (el) => el.child(panelButton("changes", "mods/my-changes/changes.svg", "Changes panel")))
          .child(panelButton("remote", "mods/remote/cloud.svg", "Remote SFTP panel"))
          .child(panelButton("services", "mods/services/layers.svg", "Services panel")),
      );
  }
}
