import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, openOverlay } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

export default class WorkspaceChrome extends View {
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      // Icon-only buttons side by side; narrower on the rail so both fit.
      const icon = (id, path, action) => div().id(id).relative().h(28).w(collapsed ? 19 : 28).flex_none().flex()
        .items_center().justify_center().rounded(collapsed ? 6 : 8)
        .text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action).child(svg(path).size(14));
      return h_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border)
        .px(collapsed ? 2 : 8).gap(collapsed ? 2 : 4).items_center()
        .child(icon("settings", "mods/my-chrome/settings.svg", () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(div().absolute().top(5).right(4).size(6).rounded_full().bg(t.accent))))
        .child(icon("keybinds", "mods/keybinds/keyboard.svg", () => run("mod.open", { name: "keybinds" })))
        // The command buttons' manager (mods/cmd-buttons, its "manage" view).
        .child(icon("cmd-buttons", "mods/cmd-buttons/icons/square-terminal.svg",
          () => openOverlay({ mod: "cmd-buttons", kind: "dialog", width: 560, height: 480, props: { view: "manage" } }))
          .tooltip("Command buttons"));
    }
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(div().flex_1()))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/my-chrome/sidebar.svg").size(15), toggleSidebar)));
  }
}
