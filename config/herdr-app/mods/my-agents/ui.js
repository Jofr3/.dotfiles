// Shared Herdr workspace design tokens & UI primitives.
// DO NOT EDIT COPIES in other mods. Source of truth: mods/my-files/ui.js — run ./sync-ui.sh after editing.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { settings } from "herdr";

export const TYPE = {
  meta: 11,
  sub: 12,
  body: 13,
  title: 14,
  dialog: 15,
};

export const RADIUS = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  full: 999,
};

export const SIZE = {
  chrome: 36,
  header: 24,
  row: 28,
  btn: 24,
  icon: 14,
  iconSm: 12,
};

export const TRANSPARENT = "#00000000";

export function monoFont() {
  return settings()?.font_family ?? "JetBrains Mono";
}

export function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function isNarrow(root) {
  return (findNode(root, "sidebar")?.size?.px ?? Infinity) < 160;
}

export function alpha(c, a) {
  let h = String(c ?? "").replace("#", "");
  if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join("");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return c;
  return `#${h.slice(0, 6)}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}

export function selectedMetaColor(t) {
  return alpha(t.foreground, 0.78);
}

export function focusBorder(t) {
  return alpha(t.accent, 0.65);
}

// Unified status color legend across all mods:
//   cyan (done)     = healthy active services/daemons, done, ok, connected, added
//   gold (working)  = busy/working agents, finite running tasks, modified
//   rose (blocked)  = blocked, needs input, error, failed, deleted
//   iris (accent)   = info, accent, interactive port links
//   dim (idle)      = untracked files; files and folders show a 5px status dot
export function statusColor(t, kind) {
  switch (kind) {
    case "ok":
    case "done":
    case "added":
      return t.done;
    case "running":
    case "working":
    case "modified":
      return t.working;
    case "blocked":
    case "input":
    case "error":
    case "deleted":
      return t.blocked;
    case "info":
    case "accent":
      return t.accent;
    case "idle":
      return t.idle ?? t.dim;
    default:
      return t.muted;
  }
}

export function dot(t, kind, { pulse = false, size, outlined = false } = {}) {
  const c = statusColor(t, kind);
  const px = size ?? (outlined ? 7 : 6);
  let el = div().size(px).flex_none().rounded(RADIUS.full);
  if (outlined) {
    el = el.border_1().border_color(kind === "idle" ? t.muted : c);
  } else {
    el = el.bg(c).when(pulse, (d) => d.loop("opacity", { from: 0.35, to: 1, period: 1150 }));
  }
  return el;
}

export function button(t, id, label, action, { variant = "secondary", disabled = false, height = 30, tip = "" } = {}) {
  const primary = variant === "primary";
  const danger = variant === "danger";
  const ghost = variant === "ghost";
  const bg = primary ? t.solid : disabled ? t.surface : danger ? alpha(statusColor(t, "error"), 0.14) : ghost ? TRANSPARENT : t.hover;
  const fg = primary ? t.solid_foreground : disabled ? t.dim : danger ? statusColor(t, "error") : ghost ? t.muted : t.foreground;
  return h_flex()
    .id(id)
    .h(height)
    .px(12)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(RADIUS.sm)
    .bg(bg)
    .text_color(fg)
    .text_size(TYPE.sub)
    .font_medium()
    .when(disabled, (el) => el.opacity(primary ? 0.50 : 0.6))
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .when(!disabled, (el) => el.cursor_pointer()
      .hover((s) => (ghost ? s.bg(t.hover).text_color(t.foreground) : primary ? s.opacity(0.88) : danger ? s.bg(alpha(statusColor(t, "error"), 0.22)) : s.bg(t.selected)))
      .on_click(action))
    .child(label);
}

export function toggle(t, id, on, title, hint, onClick) {
  return h_flex()
    .id(id)
    .flex_none()
    .mt(6)
    .py(4)
    .gap(10)
    .items_center()
    .rounded(RADIUS.sm)
    .cursor_pointer()
    .hover((s) => s.opacity(0.88))
    .on_click(onClick)
    .child(
      h_flex()
        .w(32)
        .h(18)
        .flex_none()
        .rounded(RADIUS.full)
        .p(2)
        .bg(on ? t.accent : t.input)
        .items_center()
        .when(on, (el) => el.justify_end())
        .child(div().size(14).rounded(RADIUS.full).bg(on ? t.solid_foreground : alpha(t.foreground, 0.72))),
    )
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .child(div().text_size(TYPE.sub).font_medium().text_color(t.foreground).child(title))
        .when(Boolean(hint), (el) => el.child(div().text_size(TYPE.meta).text_color(t.dim).child(hint))),
    );
}

export function textInput(t, state, focused, { height = 34, bg, textSize, mono = false } = {}) {
  return h_flex()
    .h(height)
    .flex_none()
    .px(10)
    .items_center()
    .rounded(RADIUS.sm)
    .border_1()
    .border_color(focused ? t.accent : TRANSPARENT)
    .bg(bg ?? t.background)
    .cursor_text()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(Input.new(state).w_full().text_size(textSize ?? TYPE.body).text_color(t.foreground).when(mono, (el) => el.font_family(monoFont())));
}

export function menuFrame(t, id) {
  return v_flex()
    .id(id)
    .size_full()
    .p(4)
    .gap(2)
    .bg(t.popover)
    .border_1()
    .border_color(alpha(t.foreground, 0.10))
    .rounded(RADIUS.md)
    .shadow_lg()
    .text_color(t.foreground);
}

export function menuRow(t, id, { icon, label, selected = false, checked = false, onClick }) {
  return h_flex()
    .id(id)
    .h(SIZE.row)
    .px(8)
    .gap(8)
    .rounded(RADIUS.sm)
    .items_center()
    .cursor_pointer()
    .text_size(TYPE.body)
    .text_color(t.foreground)
    .when(selected, (el) => el.bg(t.selected))
    .hover((s) => s.bg(t.hover))
    .on_click(onClick)
    .when(Boolean(icon), (el) => el.child(svg(icon).size(SIZE.icon).flex_none().text_color(t.muted)))
    .child(div().flex_1().truncate().child(label))
    .when(checked, (el) => el.child(svg("mods/my-chrome/check.svg").size(SIZE.icon).flex_none().text_color(t.accent)));
}

export function iconBtn(t, id, iconPath, tip, action, opts = {}) {
  const { color, hoverColor, active = false, size = SIZE.icon } = opts;
  const baseColor = color ?? (active ? t.accent : t.muted);
  return h_flex()
    .id(id)
    .size(SIZE.btn)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(RADIUS.sm)
    .cursor_pointer()
    .text_color(baseColor)
    .when(active, (el) => el.bg(alpha(t.accent, 0.16)))
    .hover((s) => s.bg(active ? alpha(t.accent, 0.22) : t.hover).text_color(hoverColor ?? (active ? t.accent : t.foreground)))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => {
      cx.stop_propagation();
      action(e, cx);
    })
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .child(svg(iconPath).size(size));
}

export function badge(t, text, opts = {}) {
  const { fg, bg, mono = false } = opts;
  return h_flex()
    .h(18)
    .px(6)
    .flex_none()
    .items_center()
    .rounded(RADIUS.xs)
    .bg(bg ?? t.raised)
    .text_size(TYPE.meta)
    .font_medium()
    .text_color(fg ?? t.muted)
    .when(mono, (el) => el.font_family(monoFont()))
    .child(String(text));
}

export function countBadge(t, count) {
  return div()
    .flex_none()
    .text_size(TYPE.meta)
    .font_medium()
    .text_color(t.dim)
    .child(String(count));
}

export function chip(t, id, label, action, { icon, fg, bg, hoverBg, hoverFg, tip, mono = false, height = 20, radius } = {}) {
  return h_flex()
    .id(id)
    .h(height)
    .px(7)
    .gap(4)
    .flex_none()
    .items_center()
    .rounded(radius ?? (height >= SIZE.btn ? RADIUS.sm : RADIUS.xs))
    .bg(bg ?? t.surface)
    .text_size(TYPE.meta)
    .font_medium()
    .text_color(fg ?? t.muted)
    .when(mono, (el) => el.font_family(monoFont()))
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .when(Boolean(action), (el) => el
      .cursor_pointer()
      .hover((s) => s.bg(hoverBg ?? t.hover).text_color(hoverFg ?? fg ?? t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((e, cx) => {
        cx.stop_propagation();
        action(e, cx);
      }))
    .when(Boolean(icon), (el) => el.child(svg(icon).size(SIZE.iconSm).flex_none().text_color(fg ?? t.muted)))
    .child(String(label));
}

// Disclosure convention: file trees place chevrons on the left (hierarchy indent);
// collapsible sections place chevrons on the right inside a 24px optical column.
export function sectionHeader(t, { id, open, label, count = null, statusDot = null, labelColor = null, right = null, pr = 2, onToggle }) {
  return h_flex()
    .id(id)
    .h(SIZE.header)
    .flex_none()
    .pl(8)
    .pr(pr)
    .gap(6)
    .items_center()
    .rounded(RADIUS.sm)
    .cursor_pointer()
    .text_size(TYPE.meta)
    .font_semibold()
    .text_color(labelColor ?? t.muted)
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_click(onToggle)
    .child(div().truncate().child(label))
    .when(count !== null && count !== undefined, (el) => el.child(countBadge(t, count)))
    .child(div().flex_1())
    .when(Boolean(statusDot), (el) => el.child(statusDot))
    .when(Boolean(right), (el) => el.child(right))
    .child(
      h_flex().w(SIZE.btn).flex_none().items_center().justify_center()
        .child(svg(`mods/my-chrome/chevron-${open ? "down" : "right"}.svg`).size(SIZE.iconSm).flex_none()),
    );
}

export function dialogFrame(t, { id, handle, onKeyDown, title, subtitle, onClose, body, footer }) {
  return v_flex()
    .id(id)
    .when(Boolean(handle), (el) => el.track_focus(handle))
    .when(Boolean(onKeyDown), (el) => el.on_key_down(onKeyDown))
    .size_full()
    .min_h(0)
    .p(18)
    .gap(12)
    .bg(t.popover)
    .border_1()
    .border_color(alpha(t.foreground, 0.10))
    .rounded(RADIUS.lg)
    .shadow_lg()
    .text_color(t.foreground)
    .child(
      h_flex()
        .flex_none()
        .items_center()
        .gap(10)
        .child(
          v_flex().flex_1().min_w(0)
            .child(div().text_size(TYPE.dialog).font_semibold().truncate().child(title))
            .when(Boolean(subtitle), (el) => el.child(div().pt(2).text_size(TYPE.meta).text_color(t.dim).truncate().child(subtitle))),
        )
        .when(Boolean(onClose), (el) => el.child(iconBtn(t, `${id}-close`, "mods/my-chrome/x.svg", "Close (Esc)", onClose))),
    )
    .child(body)
    .when(Boolean(footer), (el) => el.child(
      div().flex_none().pt(6).child(footer),
    ));
}

export function floatingTitleBar(t, { id, iconEl, title, subtitle, badges = [], actions = [], onStop, stopTip = "Stop process", onHide }) {
  return h_flex()
    .id(id)
    .size_full()
    .px(12)
    .gap(8)
    .items_center()
    .bg(t.chrome)
    .border_b_1()
    .border_color(t.border)
    .text_color(t.foreground)
    .text_size(TYPE.body)
    .when(Boolean(iconEl), (el) => el.child(iconEl))
    .child(div().flex_shrink(0).max_w(220).truncate().font_semibold().child(title))
    .when(Boolean(subtitle), (el) => el.child(
      div().flex_1().min_w(0).text_size(TYPE.meta).text_color(t.muted).font_family(monoFont()).truncate().child(subtitle),
    ))
    .when(!subtitle, (el) => el.child(div().flex_1()))
    .children(badges)
    .children(actions)
    .when(Boolean(onStop), (el) => el.child(
      iconBtn(t, `${id}-stop`, "mods/my-chrome/square.svg", stopTip, onStop, {
        color: t.muted,
        hoverColor: statusColor(t, "error"),
      }),
    ))
    .when(Boolean(onHide), (el) => el.child(
      iconBtn(t, `${id}-hide`, "mods/my-chrome/x.svg", "Hide window (keeps running)", onHide),
    ));
}

export function panelHeader(t, { title, badgeEl, meta, metaTip, back, actions = [] }) {
  return h_flex()
    .h(SIZE.chrome)
    .flex_none()
    .px(14)
    .gap(8)
    .items_center()
    .border_b_1()
    .border_color(t.border)
    .when(Boolean(back), (el) => el.child(iconBtn(t, back.id, "mods/my-chrome/arrow-left.svg", back.tip ?? "Back", back.action)))
    .child(
      h_flex()
        .flex_1()
        .min_w(0)
        .gap(6)
        .items_center()
        .child(div().text_size(TYPE.title).font_semibold().truncate().text_color(t.foreground).child(title))
        .when(Boolean(badgeEl), (el) => el.child(badgeEl)),
    )
    .when(Boolean(meta), (el) => el.child(div().flex_shrink(1).max_w(160).truncate().text_right().text_size(TYPE.meta).text_color(t.dim).when(Boolean(metaTip), (m) => m.tooltip(metaTip)).child(meta)))
    .when(actions.length > 0, (el) => el.child(h_flex().gap(2).flex_none().items_center().children(actions)));
}

export function emptyState(t, { icon, iconColor, title, subtitle, action, loading = false }) {
  return v_flex()
    .flex_1()
    .items_center()
    .justify_center()
    .pb(64)
    .px(24)
    .gap(8)
    .when(Boolean(icon), (el) => el.child(svg(icon).size(22).text_color(iconColor ?? t.dim).when(loading, (s) => s.loop("opacity", { from: 0.4, to: 1, period: 1200 }))))
    .child(div().text_size(TYPE.body).font_medium().text_color(t.foreground).child(title))
    .when(Boolean(subtitle), (el) => el.child(div().text_center().text_size(TYPE.sub).text_color(t.muted).child(subtitle)))
    .when(Boolean(action), (el) => el.child(h_flex().pt(6).child(action)));
}

const DIM_NAMES = new Set(["node_modules", "vendor", "dist", "build", "target", "__pycache__", ".git", ".direnv", ".vscode", ".next", ".nuxt", ".cache"]);
export function isDimEntry(name) {
  return Boolean(name) && (name.startsWith(".") || name.endsWith(".sock") || DIM_NAMES.has(name));
}
