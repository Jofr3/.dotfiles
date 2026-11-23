// Per-project long-running services with automatic `nix develop` wrapping,
// automatic cleanup when closing a Herdr space, and foreground `tailscale serve`.
// Works on both local and remote Herdr machines.
//
// Saved config lives in ~/.config/herdr-app/services.json:
//   { "projects": { "<project-key>": [ { id, name, command, nix, port, tsPort, tailscale } ] } }
//
// Views (props().view):
//   panel   the right-side panel (default)
//   edit    add / edit a service (dialog)
//   title   title bar for a service's floating log window

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import {
  appHome, home, hc, exec, run, theme, spaces, panes, terminals, focused, machines,
  props, shared, setShared, openOverlay, closeOverlay, readTextFile, writeTextFile, notify,
} from "herdr";

const FILE = () => `${appHome()}/services.json`;
const DIR = "mods/services";
const DEV_SCRIPTS = new Set(["dev", "start", "serve", "watch", "preview", "storybook", "local"]);

// Inline POSIX scripts so they work identically on local and remote machines
// without needing helper files copied onto the remote host.
const RUN_SCRIPT = [
  'cmd="$1"; nix_mode="${2:-auto}"; use_nix=0',
  'export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS:+$__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS,}.ts.net"',
  'if [ "$nix_mode" = "on" ]; then use_nix=1',
  'elif [ "$nix_mode" = "auto" ] && [ -f "flake.nix" ] && [ -z "$IN_NIX_SHELL" ]; then use_nix=1; fi',
  'user_shell="${SHELL:-/bin/sh}"',
  'if [ "$use_nix" -eq 1 ]; then',
  '  printf "\\033[2m$ nix develop -c %s\\033[0m\\n" "$cmd"',
  '  nix develop -c "$user_shell" -lc "$cmd"',
  'else',
  '  printf "\\033[2m$ %s\\033[0m\\n" "$cmd"',
  '  "$user_shell" -lc "$cmd"',
  'fi',
  'ec=$?',
  'hc label "$HC_TERMINAL_ID" "svc.exit=$ec" >/dev/null 2>&1',
  'if [ "$ec" -eq 0 ]; then printf "\\n\\033[32m✓ exited (0)\\033[0m"; else printf "\\n\\033[31m✗ exited (%s)\\033[0m" "$ec"; fi',
  'printf "\\033[2m · Enter closes\\033[0m"',
  'read -r _',
  'exit "$ec"',
].join("\n");

const TS_SCRIPT = [
  'local_port="$1"; ts_port="${2:-$1}"',
  'printf "\\033[2m$ tailscale serve --https=%s %s\\033[0m\\n" "$ts_port" "$local_port"',
  'exec tailscale serve --https="$ts_port" "$local_port"',
].join("\n");

function alpha(c, a) {
  let h = String(c ?? "").replace("#", "");
  if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join("");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return c;
  return `#${h.slice(0, 6)}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}

function location() {
  const space = spaces().find((s) => s.active);
  const f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const firstPane = space ? panes().find((p) => space.tabs?.some((tb) => tb.id === p.tab) && p.cwd) : null;
  return {
    space: space?.id ?? null,
    cwd: pane?.cwd || f?.cwd || firstPane?.cwd || space?.folder || null,
    machine: space?.machine ?? null,
  };
}

function projectKey(machine, root) {
  if (!root) return null;
  return machine ? `${machine}:${root}` : root;
}

function displayPath(root, machine) {
  if (!root) return "";
  if (!machine) return root.replace(home(), "~");
  return root.replace(/^\/home\/[^/]+(?=\/|$)/, "~");
}

function termMachine(address) {
  const i = String(address ?? "").indexOf("/");
  return i > 0 ? address.slice(0, i) : null;
}

// ---- config persistence ----------------------------------------------------

function parseConfig(raw) {
  try {
    const obj = JSON.parse(raw ?? "{}");
    const projects = obj && typeof obj.projects === "object" && obj.projects ? obj.projects : {};
    return { projects };
  } catch {
    return null;
  }
}

function config() {
  return shared("services.config") ?? { projects: {} };
}

function projectServices(key) {
  if (!key) return [];
  const list = config().projects?.[key];
  return Array.isArray(list) ? list : [];
}

async function loadConfig() {
  const raw = await readTextFile(FILE()).catch(() => null);
  const parsed = raw ? parseConfig(raw) : { projects: {} };
  if (parsed && JSON.stringify(parsed) !== JSON.stringify(shared("services.config"))) {
    setShared("services.config", parsed);
  }
  return raw;
}

async function saveProjectServices(key, list) {
  const before = await readTextFile(FILE()).catch(() => null);
  const current = (before ? parseConfig(before) : null) ?? config();
  const next = { projects: { ...(current.projects ?? {}) } };
  if (list.length) next.projects[key] = list;
  else delete next.projects[key];
  setShared("services.config", next);
  await writeTextFile(FILE(), JSON.stringify(next, null, 2) + "\n", before);
}

// ---- live terminal lookup & lifecycle --------------------------------------

function findTerm(spaceId, svcId, kind) {
  if (!spaceId || !svcId) return null;
  return terminals().find(
    (t) => t.state === "live"
      && t.labels?.["svc.space"] === spaceId
      && t.labels?.["svc.id"] === svcId
      && t.labels?.["svc.kind"] === kind,
  ) ?? null;
}

function appStatus(spaceId, svcId) {
  const t = findTerm(spaceId, svcId, "app");
  if (!t) return null;
  const exit = t.labels?.["svc.exit"];
  if (exit !== undefined) {
    const code = Number(exit);
    return { state: code === 0 ? "ok" : "error", code, terminal: t.address };
  }
  return { state: "running", terminal: t.address };
}

function tsHostFor(machine) {
  const hosts = shared("services.tsHosts") ?? {};
  return hosts[machine ?? "local"] || "";
}

function tsInfo(spaceId, svcId, machine) {
  const t = findTerm(spaceId, svcId, "ts");
  if (!t) return null;
  const tsPort = t.labels?.["svc.tsPort"] || t.labels?.["svc.localPort"] || "";
  const localPort = t.labels?.["svc.localPort"] || "";
  const host = tsHostFor(machine ?? termMachine(t.address));
  const url = host
    ? `https://${host}${tsPort && tsPort !== "443" ? `:${tsPort}` : ""}`
    : null;
  return { terminal: t.address, tsPort, localPort, url };
}

function detectedPortFor(terminal) {
  if (!terminal) return "";
  return (shared("services.detectedPorts") ?? {})[terminal] || "";
}

function effectivePort(svc, st) {
  return String(svc?.port ?? "").trim() || detectedPortFor(st?.terminal) || "";
}

function detectPortFromText(text) {
  if (!text) return "";
  const clean = text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  // Prefer explicit localhost / loopback / 0.0.0.0 URLs (e.g. Vite, Next, Bun, Wrangler)
  const urlRe = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})\b/gi;
  let m, found = "";
  while ((m = urlRe.exec(clean)) !== null) found = m[1];
  if (found) return found;
  // Fallback: "listening on :3000" / "port 3000"
  const portRe = /(?:listening\s+(?:on|at)\s+(?:https?:\/\/[^\s:]+)?|on\s+port|port)\s*:?\s*(\d{2,5})\b/gi;
  while ((m = portRe.exec(clean)) !== null) found = m[1];
  return found;
}

function accessUrl(machine, svc, st, ts) {
  if (ts?.url) return ts.url;
  const port = effectivePort(svc, st);
  if (!port) return null;
  if (!machine) return `http://localhost:${port}`;
  const host = tsHostFor(machine) || machine;
  return `http://${host}:${port}`;
}

async function startTailscale(spaceId, machine, svc, cwd, portOverride) {
  const localPort = String(portOverride || svc.port || "").trim();
  if (!localPort) {
    notify({ title: "No port detected yet", body: `Wait for "${svc.name}" to print a port, or edit it to set a local port.`, level: "warning" });
    return null;
  }
  const tsPort = String(svc.tsPort || localPort).trim();
  const existing = findTerm(spaceId, svc.id, "ts");
  if (existing) await hc(["kill", existing.address]).catch(() => {});

  const args = [
    "run", "--bg", "--json", "--no-parent", "--no-notify",
    ...(machine ? ["--on", machine] : []),
    "--label", `svc.space=${spaceId}`,
    "--label", `svc.id=${svc.id}`,
    "--label", "svc.kind=ts",
    "--label", `svc.localPort=${localPort}`,
    "--label", `svc.tsPort=${tsPort}`,
    "--cwd", cwd,
    "--", "sh", "-c", TS_SCRIPT, "services-ts", localPort, tsPort,
  ];
  const r = await hc(args);
  let address = null;
  try { address = JSON.parse(r.stdout).address; } catch {}
  if (!address) throw new Error((r.stderr || r.stdout || "tailscale serve failed").trim());
  return address;
}

async function stopTailscale(spaceId, svcId) {
  const t = findTerm(spaceId, svcId, "ts");
  if (t) await hc(["kill", t.address]).catch(() => {});
}

async function startService(spaceId, machine, root, svc, show = false) {
  const existing = findTerm(spaceId, svc.id, "app");
  if (existing) await hc(["kill", existing.address]).catch(() => {});

  const nixMode = svc.nix || "auto";
  const args = [
    "run", "--bg", "--json", "--no-parent", "--no-notify",
    ...(machine ? ["--on", machine] : []),
    "--label", `svc.space=${spaceId}`,
    "--label", `svc.id=${svc.id}`,
    "--label", "svc.kind=app",
    "--label", `svc.name=${svc.name}`,
    "--label", `svc.root=${root}`,
    ...(svc.tailscale ? ["--label", "svc.autoTs=1"] : []),
    ...(svc.tsPort ? ["--label", `svc.tsPort=${svc.tsPort}`] : []),
    "--cwd", root,
    "--", "sh", "-c", RUN_SCRIPT, "services", svc.command, nixMode,
  ];
  const r = await hc(args);
  let address = null;
  try { address = JSON.parse(r.stdout).address; } catch {}
  if (!address) throw new Error((r.stderr || r.stdout || "hc run failed").trim());

  if (svc.tailscale && svc.port) {
    await startTailscale(spaceId, machine, svc, root).catch((e) => {
      notify({ title: "Tailscale serve failed", body: String(e?.message ?? e), level: "error" });
    });
  }
  if (show) openLogs(spaceId, machine, root, svc, address);
  return address;
}

async function stopService(spaceId, svcId) {
  const appT = findTerm(spaceId, svcId, "app");
  const tsT = findTerm(spaceId, svcId, "ts");
  await Promise.all([
    appT ? hc(["kill", appT.address]).catch(() => {}) : null,
    tsT ? hc(["kill", tsT.address]).catch(() => {}) : null,
  ]);
}

async function stopAllInSpace(spaceId) {
  const list = terminals().filter(
    (t) => t.state === "live" && t.labels?.["svc.space"] === spaceId,
  );
  await Promise.all(list.map((t) => hc(["kill", t.address]).catch(() => {})));
}

function openLogs(spaceId, machine, root, svc, terminal) {
  openOverlay({
    kind: "dialog",
    width: 820,
    height: 500,
    layout: {
      type: "column",
      children: [
        {
          type: "block",
          size: { px: 36 },
          content: {
            mod: "services",
            props: { view: "title", spaceId, machine, root, svc, terminal },
          },
        },
        {
          type: "block",
          padding: [8, 12],
          background: "background",
          content: { terminal },
        },
      ],
    },
  });
}

function openEditor(machine, root, svc, hasFlake) {
  openOverlay({
    mod: "services",
    kind: "dialog",
    width: 460,
    height: 520,
    props: { view: "edit", machine: machine ?? null, root, svc: svc ?? null, hasFlake: Boolean(hasFlake) },
  });
}

// ---- project inspection ----------------------------------------------------

async function inspectProject(cwd, machine) {
  const opts = machine ? { on: machine } : {};
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, ...opts }).catch(() => null);
  const root = top?.code === 0 ? top.stdout.trim() : cwd;
  const [flakeRaw, pkgRaw] = await Promise.all([
    readTextFile(`${root}/flake.nix`, opts).catch(() => null),
    readTextFile(`${root}/package.json`, opts).catch(() => null),
  ]);
  const hasFlake = flakeRaw !== null;
  let scripts = [];
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw);
      if (pkg?.scripts && typeof pkg.scripts === "object") {
        scripts = Object.entries(pkg.scripts)
          .filter(([, cmd]) => typeof cmd === "string" && cmd.trim())
          .map(([name, rawCmd]) => ({
            id: `pkg:${name}`,
            name,
            command: `npm run ${name}`,
            rawCmd,
            nix: "auto",
            port: "",
            tsPort: "",
            tailscale: false,
            priority: DEV_SCRIPTS.has(name) ? 0 : 1,
          }))
          .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
      }
    } catch {}
  }
  return { root, hasFlake, scripts };
}

async function detectTailscaleHost(machine) {
  const opts = machine ? { on: machine } : {};
  const r = await exec("tailscale", ["status", "--json"], opts).catch(() => null);
  if (r?.code !== 0) return;
  try {
    const d = JSON.parse(r.stdout);
    const dns = String(d?.Self?.DNSName ?? "").replace(/\.$/, "");
    const key = machine ?? "local";
    const hosts = shared("services.tsHosts") ?? {};
    if (dns && hosts[key] !== dns) setShared("services.tsHosts", { ...hosts, [key]: dns });
  } catch {}
}

// ---- shared UI helpers -----------------------------------------------------

const actionBtn = (t, id, label, tip, action, fg) => h_flex().id(id).h(24).px(7).flex_none()
  .items_center().justify_center().rounded(6).text_size(11.5).cursor_pointer()
  .text_color(fg ?? t.muted).hover((s) => s.bg(t.hover).text_color(fg ?? t.foreground))
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
  .on_click((e, cx) => { cx.stop_propagation(); action(e, cx); })
  .when(Boolean(tip), (el) => el.tooltip(tip))
  .child(label);

const iconBtn = (t, id, icon, tip, action, fg) => h_flex().id(id).size(24).flex_none()
  .items_center().justify_center().rounded(6).cursor_pointer()
  .hover((s) => s.bg(t.hover))
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
  .on_click((e, cx) => { cx.stop_propagation(); action(e, cx); })
  .when(Boolean(tip), (el) => el.tooltip(tip))
  .child(svg(icon.includes("/") ? icon : `${DIR}/icons/${icon}.svg`).size(13.5).text_color(fg ?? t.muted));

const badge = (t, text, fg, bg) => h_flex().h(18).px(6).flex_none().items_center().rounded(4)
  .bg(bg ?? t.raised).border_1().border_color(alpha(fg ?? t.border, bg ? 0.35 : 0.8))
  .text_size(10.5).text_color(fg ?? t.muted).font_family("JetBrains Mono")
  .child(text);

// ---- the mod ---------------------------------------------------------------

export default class Services extends View {
  init(_props, cx) {
    this.view = props()?.view ?? "panel";
    this.handle = cx.focus_handle();
    if (this.view === "panel") this.initPanel(cx);
    else if (this.view === "edit") this.initEdit(cx);
  }

  render(cx) {
    switch (this.view) {
      case "edit": return this.renderEdit(cx);
      case "title": return this.renderTitle(cx);
      default: return this.renderPanel(cx);
    }
  }

  // ---- panel view ----------------------------------------------------------

  initPanel(cx) {
    this.cwd = undefined;
    this.machine = undefined;
    this.space = undefined;
    this.info = null;
    this.cache = new Map(); // `${machine ?? ""}:${cwd}` -> { root, hasFlake, scripts }
    this.tsChecked = new Set();
    this.autoTsStarted = new Set();
    this.killing = new Set();
    this.scanning = false;
    this.showPkg = true;
    this.lastSpaceSig = "";

    const tick = (cx) => {
      this.reapClosedSpaces(cx);
      if (this.scanning) return;
      this.scanning = true;
      cx.spawn(async (cx) => {
        try {
          await this.scanRunningPorts();
          await loadConfig().catch(() => {});
        } finally {
          this.scanning = false;
          cx.notify();
        }
      });
    };

    cx.spawn(async (cx) => {
      await Promise.all([loadConfig(), detectTailscaleHost(null)]);
      this.tsChecked.add("local");
      await this.scanRunningPorts();
      cx.notify();
    });

    // Gentle background timer: reaps services of closed spaces, detects ports, picks up hand edits.
    cx.timer.every(1500, (cx) => tick(cx));
  }

  async scanRunningPorts() {
    const running = terminals().filter(
      (t) => t.state === "live" && t.labels?.["svc.kind"] === "app" && t.labels?.["svc.exit"] === undefined,
    );
    if (!running.length) return;
    const current = { ...(shared("services.detectedPorts") ?? {}) };
    let changed = false;
    for (const t of running) {
      if (current[t.address]) continue;
      const r = await hc(["read", t.address]).catch(() => null);
      if (!r || r.code !== 0) continue;
      const port = detectPortFromText(r.stdout);
      if (!port) continue;
      current[t.address] = port;
      changed = true;

      // Auto-start Tailscale if configured on this service and not yet running.
      const spaceId = t.labels?.["svc.space"];
      const svcId = t.labels?.["svc.id"];
      const machine = termMachine(t.address);
      const savedList = Object.values(config().projects ?? {}).flat();
      const savedSvc = savedList.find((s) => s.id === svcId);
      const wantTs = t.labels?.["svc.autoTs"] === "1" || Boolean(savedSvc?.tailscale);
      if (wantTs && spaceId && svcId && !findTerm(spaceId, svcId, "ts") && !this.autoTsStarted.has(t.address)) {
        this.autoTsStarted.add(t.address);
        const cwd = t.labels?.["svc.root"] || t.cwd || home();
        const svcObj = savedSvc ?? { id: svcId, name: t.labels?.["svc.name"] || "service", tsPort: t.labels?.["svc.tsPort"] || "" };
        startTailscale(spaceId, machine, svcObj, cwd, port).catch(() => {});
      }
    }
    if (changed) setShared("services.detectedPorts", current);
  }

  locate(cx, force = false) {
    const loc = location();
    this.cwd = loc.cwd;
    this.machine = loc.machine;
    this.space = loc.space;
    if (!loc.cwd) { this.info = null; return; }

    const mKey = loc.machine ?? "local";
    if (force || !this.tsChecked.has(mKey)) {
      this.tsChecked.add(mKey);
      cx.spawn(async (cx) => {
        await detectTailscaleHost(loc.machine);
        cx.notify();
      });
    }

    const cKey = `${loc.machine ?? ""}:${loc.cwd}`;
    if (!force && this.cache.has(cKey)) {
      this.info = this.cache.get(cKey);
      return;
    }
    this.info = null;
    const askedCwd = loc.cwd;
    const askedMachine = loc.machine;
    cx.spawn(async (cx) => {
      const info = await inspectProject(askedCwd, askedMachine).catch(() => ({ root: askedCwd, hasFlake: false, scripts: [] }));
      this.cache.set(cKey, info);
      if (this.cwd === askedCwd && this.machine === askedMachine) {
        this.info = info;
        cx.notify();
      }
    });
  }

  // Kills any service or tailscale terminal whose space no longer exists,
  // only for machines whose layout is currently ready.
  reapClosedSpaces(cx) {
    const readyMachines = new Set(
      machines().filter((m) => m.layout === "ready").map((m) => m.name ?? null),
    );
    if (!readyMachines.size) return;
    const activeSpaces = new Set(spaces().map((s) => s.id));
    const orphans = terminals().filter(
      (t) => t.state === "live"
        && t.labels?.["svc.space"]
        && readyMachines.has(termMachine(t.address))
        && !activeSpaces.has(t.labels["svc.space"])
        && !this.killing.has(t.address),
    );
    if (!orphans.length) return;
    for (const t of orphans) this.killing.add(t.address);
    cx.spawn(async () => {
      await Promise.all(orphans.map((t) => hc(["kill", t.address]).catch(() => {})));
      for (const t of orphans) this.killing.delete(t.address);
    });
  }

  renderPanel(cx) {
    const t = theme();
    const loc = location();
    if (loc.cwd !== this.cwd || loc.machine !== this.machine || loc.space !== this.space) {
      this.locate(cx);
    }

    // Immediate reap whenever the set of spaces changes.
    const spaceSig = spaces().map((s) => s.id).join(",");
    if (spaceSig !== this.lastSpaceSig) {
      this.lastSpaceSig = spaceSig;
      this.reapClosedSpaces(cx);
    }

    const info = this.info;
    const root = info?.root ?? null;
    const pKey = projectKey(loc.machine, root);
    const saved = projectServices(pKey);
    const savedCmds = new Set(saved.map((s) => s.command.trim()));
    const pkgScripts = (info?.scripts ?? []).filter((s) => !savedCmds.has(s.command.trim()));
    const runningInSpace = loc.space
      ? terminals().filter((x) => x.state === "live" && x.labels?.["svc.space"] === loc.space && x.labels?.["svc.kind"] === "app").length
      : 0;

    const message = (text, extra) => v_flex().p(14).gap(10).text_size(12).text_color(t.dim)
      .child(text).when(Boolean(extra), (el) => el.child(extra));

    let body;
    if (!loc.cwd || !loc.space) {
      body = message("No active project folder.");
    } else if (!info) {
      body = message(loc.machine ? `Inspecting project on ${loc.machine}…` : "Inspecting project…");
    } else {
      body = v_flex().id("svc-scroll").flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(8)
        .when(saved.length === 0 && pkgScripts.length === 0, (el) => el.child(
          message(`No services configured for ${displayPath(root, loc.machine)}.`,
            h_flex().child(
              div().id("svc-empty-add").px(10).py(6).rounded(6).bg(t.solid).text_color(t.solid_foreground)
                .text_size(12).font_medium().cursor_pointer()
                .on_click(() => openEditor(loc.machine, root, null, info.hasFlake))
                .child("+ Add service"),
            )),
        ))
        .children(saved.map((svc) => this.renderCard(t, loc.space, loc.machine, root, svc, info.hasFlake, false, cx)))
        .when(pkgScripts.length > 0, (el) => el.child(
          v_flex().pt(saved.length ? 8 : 0).gap(6)
            .child(h_flex().id("pkg-toggle").px(4).py(2).items_center().gap(5).cursor_pointer()
              .on_click((_e, cx) => { this.showPkg = !this.showPkg; cx.notify(); })
              .child(svg(`mods/my-files/chevron-${this.showPkg ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim))
              .child(div().text_size(11).font_semibold().text_color(t.dim)
                .child(`package.json (${pkgScripts.length})`)))
            .when(this.showPkg, (col) => col.children(
              pkgScripts.map((svc) => this.renderCard(t, loc.space, loc.machine, root, svc, info.hasFlake, true, cx)),
            )),
        ));
    }

    return v_flex().id("services-panel").size_full().min_h(0).overflow_hidden()
      .bg(t.background).border_l_1().border_color(t.border).text_color(t.foreground).text_size(13)
      // Header
      .child(h_flex().h(42).flex_none().px(10).gap(6).items_center().border_b_1().border_color(t.border)
        .child(svg(`${DIR}/services.svg`).size(14).flex_none().text_color(runningInSpace ? t.ansi2 : t.muted))
        .child(h_flex().flex_1().min_w(0).gap(6).items_center()
          .child(div().font_semibold().truncate().child("Services"))
          .when(Boolean(loc.machine), (el) => el.child(badge(t, loc.machine, t.ansi4, alpha(t.ansi4, 0.14)))))
        .when(runningInSpace > 0, (el) => el.child(
          h_flex().id("svc-stop-all").h(24).px(6).gap(4).flex_none().items_center().rounded(6).cursor_pointer()
            .text_size(11.5).text_color(t.ansi1).hover((s) => s.bg(t.hover))
            .tooltip("Stop all services in this space")
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((e, cx) => { cx.stop_propagation(); stopAllInSpace(loc.space); })
            .child(svg(`${DIR}/icons/square.svg`).size(12).text_color(t.ansi1))
            .child(String(runningInSpace)),
        ))
        .when(Boolean(root), (el) => el.child(
          iconBtn(t, "svc-refresh", "refresh-cw", "Refresh project", (_e, cx) => {
            this.cache.delete(`${this.machine ?? ""}:${this.cwd}`);
            this.locate(cx, true);
          }),
        ))
        .when(Boolean(root), (el) => el.child(
          iconBtn(t, "svc-add", "plus", "Add a service for this project",
            () => openEditor(loc.machine, root, null, info?.hasFlake)),
        )))
      .child(body);
  }

  renderCard(t, spaceId, machine, root, svc, hasFlake, isPkg, cx) {
    const st = appStatus(spaceId, svc.id);
    const ts = tsInfo(spaceId, svc.id, machine);
    const running = st?.state === "running";
    const failed = st?.state === "error";
    const dotColor = running ? t.ansi2 : failed ? t.ansi1 : st?.state === "ok" ? t.ansi4 : t.dim;
    const usesNix = svc.nix === "on" || (svc.nix !== "off" && hasFlake);
    const port = effectivePort(svc, st);
    const openUrl = accessUrl(machine, svc, st, ts);

    return v_flex().id(`svc-${svc.id}`).px(9).py(7).gap(4).rounded(8)
      .bg(running ? alpha(t.ansi2, 0.07) : t.surface)
      .border_1().border_color(running ? alpha(t.ansi2, 0.35) : failed ? alpha(t.ansi1, 0.4) : t.border)
      .when(Boolean(st?.terminal), (el) => el.cursor_pointer().tooltip("Click to view logs").on_click(() => openLogs(spaceId, machine, root, svc, st.terminal)))
      // Single compact row: status dot + name + controls (open, tailscale, edit, stop/start)
      .child(h_flex().gap(5).items_center()
        .child(div().size(8).flex_none().rounded(4).bg(dotColor))
        .child(div().flex_1().min_w(0).font_medium().truncate().tooltip(svc.command).child(svc.name))
        .when(usesNix, (el) => el.child(
          h_flex().size(24).flex_none().items_center().justify_center().tooltip("Runs inside nix develop")
            .child(svg("icons/nix.svg").size(13.5).text_color(t.ansi6)),
        ))
        // 1. Open access URL in local browser
        .when(Boolean(openUrl) && (running || Boolean(ts?.url)), (el) => el.child(
          iconBtn(t, `open-${svc.id}`, "external-link", `Open ${openUrl} in browser`,
            (_e, cx) => cx.open_url(openUrl)),
        ))
        // 2. Tailscale icon toggle (for saved services)
        .when(!isPkg, (el) => el.child(
          iconBtn(
            t,
            `ts-${svc.id}`,
            `${DIR}/tailscale.svg`,
            ts ? `Tailscale active (${ts.url ?? `:${ts.tsPort}`}) · click to stop` : port ? `Expose :${port} on Tailscale` : "Set a port to use Tailscale",
            () => {
              if (ts) stopTailscale(spaceId, svc.id);
              else if (!port) openEditor(machine, root, svc, hasFlake);
              else startTailscale(spaceId, machine, svc, root, port).catch((e) => {
                notify({ title: "Tailscale serve failed", body: String(e?.message ?? e), level: "error" });
              });
            },
            ts ? t.ansi4 : t.muted,
          ),
        ))
        // 3. Edit saved OR Save from package.json
        .child(isPkg
          ? iconBtn(t, `save-${svc.id}`, "plus", "Save to project services", () => {
              openEditor(machine, root, { ...svc, id: null }, hasFlake);
            })
          : iconBtn(t, `edit-${svc.id}`, "pencil", "Edit service", () => openEditor(machine, root, svc, hasFlake)))
        // 4. Stop / Start button
        .child(running
          ? iconBtn(t, `stop-${svc.id}`, "square", "Stop service", () => stopService(spaceId, svc.id), t.ansi1)
          : iconBtn(t, `start-${svc.id}`, "play", "Start service", () => {
              startService(spaceId, machine, root, svc, false).catch((e) => {
                notify({ title: `Couldn't start ${svc.name}`, body: String(e?.message ?? e), level: "error" });
              });
            }, t.ansi2)))
      // Exit error if failed
      .when(failed, (el) => el.child(
        div().pl(14).text_size(11).text_color(t.ansi1)
          .child(`Exited with code ${st.code} · click to view logs`),
      ));
  }

  // ---- edit dialog ---------------------------------------------------------

  initEdit(cx) {
    const p = props() ?? {};
    const svc = p.svc ?? {};
    this.machine = p.machine ?? null;
    this.root = p.root;
    this.pKey = projectKey(this.machine, this.root);
    this.hasFlake = Boolean(p.hasFlake);
    this.editingId = svc.id ?? null;
    this.nix = svc.nix || "auto";
    this.tailscale = Boolean(svc.tailscale);
    this.error = "";
    this.focus = "command";

    const field = (key, value, placeholder) => {
      const s = InputState.new({ value: String(value ?? ""), placeholder });
      s.on("focus", (_e, cx) => { this.focus = key; cx.notify(); });
      s.on("submit", (_e, cx) => this.submitEdit(cx));
      s.on("change", (_e, cx) => cx.notify());
      return s;
    };

    this.name = field("name", svc.name, "dev");
    this.command = field("command", svc.command, "npm run dev");
    this.port = field("port", svc.port, "3000 (optional, for Tailscale)");
    this.tsPort = field("tsPort", svc.tsPort, "Same as local port");
    this.command.focus();
    cx.timer.after(200, () => this.command.focus());
  }

  submitEdit(cx) {
    const command = this.command.value().trim();
    if (!command) { this.error = "Command is required."; cx.notify(); return; }
    const port = this.port.value().trim();
    const tsPort = this.tsPort.value().trim();
    if (port && !/^\d+$/.test(port)) { this.error = "Local port must be a number."; cx.notify(); return; }
    if (tsPort && !/^\d+$/.test(tsPort)) { this.error = "Tailscale port must be a number."; cx.notify(); return; }

    const entry = {
      id: this.editingId ?? `svc_${Date.now().toString(36)}`,
      name: this.name.value().trim() || command.split(/\s+/)[0],
      command,
      nix: this.nix,
      port,
      tsPort,
      tailscale: this.tailscale,
    };

    const list = [...projectServices(this.pKey)];
    const i = list.findIndex((x) => x.id === entry.id);
    if (i >= 0) list[i] = entry;
    else list.push(entry);

    const overlay = props().overlay;
    cx.spawn(async (cx) => {
      try {
        await saveProjectServices(this.pKey, list);
        closeOverlay(overlay);
      } catch (e) {
        this.error = `Couldn't save: ${e?.message ?? e}`;
        cx.notify();
      }
    });
  }

  deleteEdit(cx) {
    if (!this.editingId) return;
    const list = projectServices(this.pKey).filter((x) => x.id !== this.editingId);
    const overlay = props().overlay;
    cx.spawn(async (cx) => {
      try {
        await saveProjectServices(this.pKey, list);
        closeOverlay(overlay);
      } catch (e) {
        this.error = `Couldn't delete: ${e?.message ?? e}`;
        cx.notify();
      }
    });
  }

  renderEdit(cx) {
    const t = theme();
    const p = props() ?? {};
    const label = (text) => div().pt(12).pb(5).text_size(11.5).text_color(t.dim).child(text);
    const input = (key, state) => Input.new(state).h(34).px(10).rounded(8).border_1()
      .border_color(this.focus === key ? t.accent : t.input).bg(t.background)
      .text_size(12.8).text_color(t.foreground);
    const seg = (val, text) => h_flex().id(`nix-${val}`).flex_1().h(30).items_center().justify_center()
      .rounded(6).cursor_pointer().text_size(12)
      .bg(this.nix === val ? t.selected : t.raised)
      .border_1().border_color(this.nix === val ? t.accent : t.border)
      .text_color(this.nix === val ? t.foreground : t.muted)
      .on_click((_e, cx) => { this.nix = val; cx.notify(); })
      .child(text);
    const btn = (id, text, primary, danger, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : danger ? alpha(t.ansi1, 0.5) : t.input)
      .bg(primary ? t.solid : danger ? alpha(t.ansi1, 0.14) : t.raised)
      .text_color(primary ? t.solid_foreground : danger ? t.ansi1 : t.foreground)
      .text_size(12.5).font_medium().cursor_pointer().hover((s) => s.opacity(0.88))
      .on_click(action).child(text);

    return v_flex().id("svc-edit").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .size_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(15).font_semibold().child(this.editingId ? "Edit service" : "New service"))
      .child(div().pt(2).text_size(11.5).text_color(t.dim).truncate()
        .child(`${this.machine ? `${this.machine}: ` : ""}${displayPath(this.root, this.machine)}`))
      .child(label("Command"))
      .child(input("command", this.command))
      .child(label("Name"))
      .child(input("name", this.name))
      .child(label(`Nix environment${this.hasFlake ? " (flake.nix detected)" : ""}`))
      .child(h_flex().gap(6)
        .child(seg("auto", "Auto"))
        .child(seg("on", "Always nix develop"))
        .child(seg("off", "Off")))
      .child(h_flex().gap(10)
        .child(v_flex().flex_1().child(label("Local port")).child(input("port", this.port)))
        .child(v_flex().flex_1().child(label("Tailscale HTTPS port")).child(input("tsPort", this.tsPort))))
      // Auto-Tailscale toggle
      .child(h_flex().id("ed-ts").pt(14).gap(10).items_center().cursor_pointer()
        .on_click((_e, cx) => { this.tailscale = !this.tailscale; cx.notify(); })
        .child(h_flex().w(30).h(18).flex_none().rounded(9).p(2).bg(this.tailscale ? t.accent : t.input)
          .when(this.tailscale, (el) => el.justify_end())
          .child(div().size(14).rounded(7).bg("#ffffff")))
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_size(12.5).child("Auto-expose with Tailscale"))
          .child(div().text_size(11).text_color(t.dim).child("Starts foreground tailscale serve with this service; cleans up on stop/close."))))
      .when(Boolean(this.error), (el) => el.child(div().pt(10).text_size(12).text_color(t.ansi1).child(this.error)))
      .child(div().flex_1())
      .child(h_flex().pt(12).gap(8).items_center()
        .when(Boolean(this.editingId), (el) => el.child(btn("ed-del", "Delete", false, true, (_e, cx) => this.deleteEdit(cx))))
        .child(div().flex_1())
        .child(btn("ed-cancel", "Cancel", false, false, () => closeOverlay(p.overlay)))
        .child(btn("ed-save", "Save", true, false, (_e, cx) => this.submitEdit(cx))));
  }

  // ---- floating terminal title bar -----------------------------------------

  renderTitle() {
    const t = theme();
    const p = props() ?? {};
    const svc = p.svc ?? {};
    const st = appStatus(p.spaceId, svc.id);
    const ts = tsInfo(p.spaceId, svc.id, p.machine);
    const running = st?.state === "running";

    return h_flex().id("svc-title").size_full().px(12).gap(8).items_center()
      .bg(t.chrome).border_b_1().border_color(t.border).text_color(t.foreground).text_size(12.5)
      .child(div().size(8).flex_none().rounded(4).bg(running ? t.ansi2 : st?.state === "error" ? t.ansi1 : t.dim))
      .child(div().font_semibold().truncate().child(svc.name || "Service"))
      .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.dim).font_family("JetBrains Mono").truncate()
        .child(svc.command || ""))
      .when(Boolean(ts?.url), (el) => el.child(
        h_flex().id("title-ts").px(8).h(22).items_center().rounded(5)
          .bg(alpha(t.ansi4, 0.16)).text_size(11).text_color(t.ansi4).font_family("JetBrains Mono").cursor_pointer()
          .tooltip("Click to copy Tailscale URL")
          .on_click((_e, cx) => {
            cx.write_to_clipboard(ts.url);
            notify({ title: "Copied Tailscale URL", body: ts.url, level: "success", timeout: 2500 });
          })
          .child(ts.url),
      ))
      .when(Boolean(accessUrl(p.machine, svc, st, ts)) && (running || Boolean(ts?.url)), (el) => {
        const url = accessUrl(p.machine, svc, st, ts);
        return el.child(iconBtn(t, "title-open", "external-link", `Open ${url} in browser`, (_e, cx) => cx.open_url(url)));
      })
      .child(iconBtn(t, "title-restart", "refresh-cw", "Restart service", () => {
        closeOverlay(p.overlay);
        startService(p.spaceId, p.machine, p.root, svc, true).catch((e) => {
          notify({ title: `Couldn't restart ${svc.name}`, body: String(e?.message ?? e), level: "error" });
        });
      }))
      .when(running, (el) => el.child(
        iconBtn(t, "title-stop", "square", "Stop service", () => {
          stopService(p.spaceId, svc.id);
          closeOverlay(p.overlay);
        }, t.ansi1),
      ))
      .child(actionBtn(t, "title-tab", "Tab", "Dock this terminal as a tab", () => {
        run("terminal.keep", { terminal: p.terminal, place: "tab" });
        closeOverlay(p.overlay);
      }))
      .child(iconBtn(t, "title-close", "x", "Hide window (keeps running)", () => closeOverlay(p.overlay)));
  }
}
