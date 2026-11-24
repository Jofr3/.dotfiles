import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout } from "herdr";
import { TYPE, RADIUS, SIZE, findNode, isNarrow, iconBtn } from "./ui.js";

const COLLAPSED_FOOTER_PX = 68;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const root = layout();
  const collapsed = isNarrow(root);
  const width = findNode(root, "sidebar")?.size?.px;
  if (!collapsed) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !collapsed);
  run("layout.resize", {
    id: "sidebar",
    px: collapsed ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44,
  });
  run("layout.resize", { id: "sidebar-footer", px: collapsed ? SIZE.chrome : COLLAPSED_FOOTER_PX });
  run("layout.resize", { id: "usage", px: collapsed ? 272 : 76 });
}

export default class WorkspaceChrome extends View {
  init(_props, cx) {
    if (props()?.footer) {
      const root = layout();
      const want = isNarrow(root) ? COLLAPSED_FOOTER_PX : SIZE.chrome;
      const cur = findNode(root, "sidebar-footer")?.size?.px;
      if (cur !== want) cx.spawn(async () => run("layout.resize", { id: "sidebar-footer", px: want }));
    }
  }

  render() {
    const t = theme();
    const collapsed = isNarrow(layout());

    const hasUpdate = Boolean(updates().app.ready);
    const settingsBtn = () => iconBtn(t, "settings", "mods/my-chrome/settings.svg", "Settings", () => run("app.settings"))
      .relative()
      .when(hasUpdate, (el) => el.child(div().absolute().top(3).right(3).size(5).rounded(RADIUS.full).bg(t.accent)));
    const keybindsBtn = () => iconBtn(t, "keybinds", "mods/keybinds/keyboard.svg", "Keyboard shortcuts", () => run("mod.open", { name: "keybinds" }));
    const toggleBtn = () => iconBtn(t, "sidebar-toggle", "mods/my-chrome/sidebar.svg", collapsed ? "Expand sidebar" : "Collapse sidebar", toggleSidebar);

    if (props()?.footer) {
      if (collapsed) {
        return v_flex().size_full().bg(t.chrome)
          .py(6).gap(4).items_center().justify_center()
          .child(settingsBtn())
          .child(toggleBtn());
      }
      return h_flex().size_full().bg(t.chrome)
        .px(8).gap(4).items_center()
        .child(settingsBtn())
        .child(keybindsBtn())
        .child(div().flex_1())
        .child(toggleBtn());
    }
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 12).pr(8).gap(4).items_center().text_size(TYPE.body)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, (el) => el.pl(76))
      .when(!collapsed, (el) => el.child(div().flex_1()))
      .when(!(collapsed && window()?.platform === "macos"), (el) => el.child(toggleBtn()));
  }
}
