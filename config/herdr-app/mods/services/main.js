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
import { v_flex, h_flex, InputState } from "gpui-base";
import {
  appHome, home, hc, exec, run, theme, spaces, panes, terminals, focused, machines,
  props, shared, setShared, openOverlay, closeOverlay, readTextFile, writeTextFile, notify, nextCommand,
} from "herdr";
import { TYPE, RADIUS, SIZE, TRANSPARENT, monoFont, alpha, selectedMetaColor, statusColor, dot, button, toggle, textInput, iconBtn as uiIconBtn, badge as uiBadge, chip, sectionHeader, dialogFrame, floatingTitleBar, panelHeader, emptyState } from "./ui.js";

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
          size: { px: SIZE.chrome },
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
    height: 496,
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

const iconBtn = (t, id, icon, tip, action, fg, hoverColor, opts = {}) =>
  uiIconBtn(t, id, icon.includes("/") ? icon : `${DIR}/icons/${icon}.svg`, tip, action, { color: fg, hoverColor, ...opts });

const badge = (t, text, fg, bg) => uiBadge(t, text, { fg, bg, mono: true });

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
    this.showSaved = true;
    this.showPkg = true;
    this.hovered = null;
    this.confirmStopAll = false;
    this.cursor = -1;
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
    cx.spawn(async () => {
      for (;;) {
        const cmd = await nextCommand();
        if (cmd === "focus") this.handle.focus();
      }
    });
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
    if (loc.cwd !== this.cwd || loc.machine !== this.machine || loc.space !== this.space) this.cursor = -1;
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

    const visibleItems = [
      ...(this.showSaved ? saved.map((svc) => ({ svc, isPkg: false })) : []),
      ...(this.showPkg ? pkgScripts.map((svc) => ({ svc, isPkg: true })) : []),
    ];

    const onKey = (e, cx) => {
      if (!visibleItems.length) return;
      if (e.key === "down" || e.key === "j") { this.cursor = Math.min(visibleItems.length - 1, this.cursor + 1); cx.notify(); cx.stop_propagation(); }
      else if (e.key === "up" || e.key === "k") { this.cursor = Math.max(0, this.cursor - 1); cx.notify(); cx.stop_propagation(); }
      else if (e.key === "enter") {
        const cur = visibleItems[this.cursor];
        if (!cur || !root) return;
        const st = appStatus(loc.space, cur.svc.id);
        if (st?.terminal) openLogs(loc.space, loc.machine, root, cur.svc, st.terminal);
        else startService(loc.space, loc.machine, root, cur.svc, false).catch((err) => {
          notify({ title: `Couldn't start ${cur.svc.name}`, body: String(err?.message ?? err), level: "error" });
        });
        cx.stop_propagation();
      }
    };

    let body;
    if (!loc.cwd || !loc.space) {
      body = emptyState(t, { icon: `${DIR}/layers.svg`, title: "No active project folder" });
    } else if (!info) {
      body = emptyState(t, { icon: `${DIR}/layers.svg`, title: loc.machine ? `Inspecting project on ${loc.machine}…` : "Inspecting project…", loading: true });
    } else if (saved.length === 0 && pkgScripts.length === 0) {
      body = emptyState(t, {
        icon: `${DIR}/layers.svg`,
        title: "No services yet",
        subtitle: "Run dev servers and background tasks for this space.",
        action: button(t, "svc-empty-add", "Add service", () => openEditor(loc.machine, root, null, info.hasFlake), { variant: "secondary" }),
      });
    } else {
      body = v_flex().id("svc-scroll").flex_1().min_h(0).overflow_y_scrollbar().pt(6).px(6).pb(16).gap(0)
        .when(saved.length > 0, (el) => el.child(
          v_flex().gap(0)
            .child(sectionHeader(t, {
              id: "saved-toggle",
              open: this.showSaved,
              label: "services.json",
              count: saved.length,
              pr: 6,
              onToggle: (_e, cx) => { this.showSaved = !this.showSaved; cx.notify(); },
            }))
            .when(this.showSaved, (col) => col.children(
              saved.map((svc, idx) => this.renderCard(t, loc.space, loc.machine, root, svc, info.hasFlake, false, idx, cx)),
            )),
        ))
        .when(pkgScripts.length > 0, (el) => el.child(
          v_flex().pt(saved.length ? 8 : 0).gap(0)
            .child(sectionHeader(t, {
              id: "pkg-toggle",
              open: this.showPkg,
              label: "package.json",
              count: pkgScripts.length,
              pr: 6,
              onToggle: (_e, cx) => { this.showPkg = !this.showPkg; cx.notify(); },
            }))
            .when(this.showPkg, (col) => col.children(
              pkgScripts.map((svc, idx) => this.renderCard(t, loc.space, loc.machine, root, svc, info.hasFlake, true, (this.showSaved ? saved.length : 0) + idx, cx)),
            )),
        ));
    }

    const headerActions = [];
    if (runningInSpace > 0) {
      if (this.confirmStopAll) {
        headerActions.push(
          chip(t, "svc-stop-all", "Stop all?", (_e, cx) => {
            this.confirmStopAll = false;
            stopAllInSpace(loc.space);
            cx.notify();
          }, {
            fg: t.solid_foreground,
            bg: statusColor(t, "error"),
            hoverBg: statusColor(t, "error"),
            hoverFg: t.solid_foreground,
            height: SIZE.btn,
            tip: "Click again to stop all active services in this space",
          }).on_hover((on, cx) => {
            if (!on && this.confirmStopAll) { this.confirmStopAll = false; cx.notify(); }
          }),
        );
      } else {
        headerActions.push(
          iconBtn(t, "svc-stop-all", "stop-circle", `Stop all (${runningInSpace} active)`, (_e, cx) => {
            this.confirmStopAll = true;
            cx.notify();
          }, t.muted, statusColor(t, "error")),
        );
      }
    } else if (this.confirmStopAll) {
      this.confirmStopAll = false;
    }
    const totalServices = saved.length + pkgScripts.length;
    if (root && totalServices > 0) {
      headerActions.push(
        iconBtn(t, "svc-add", "plus", "Add a service for this project",
          () => openEditor(loc.machine, root, null, info?.hasFlake)),
      );
    }

    const headerBadges = h_flex().gap(6).items_center()
      .when(Boolean(loc.machine), (el) => el.child(badge(t, loc.machine, t.accent, alpha(t.accent, 0.14))))
      .when(Boolean(info?.hasFlake), (el) => el.child(badge(t, "nix", t.muted, t.raised)));

    return v_flex().id("services-panel").track_focus(this.handle).on_key_down(onKey)
      .size_full().min_h(0).overflow_hidden()
      .bg(t.chrome).text_color(t.foreground).text_size(TYPE.body)
      .child(panelHeader(t, {
        title: "Services",
        badgeEl: (loc.machine || info?.hasFlake) ? headerBadges : null,
        meta: runningInSpace > 0 ? `${runningInSpace} active` : null,
        actions: headerActions,
      }))
      .child(body);
  }

  renderCard(t, spaceId, machine, root, svc, hasFlake, isPkg, idx, cx) {
    const st = appStatus(spaceId, svc.id);
    const ts = tsInfo(spaceId, svc.id, machine);
    const running = st?.state === "running";
    const failed = st?.state === "error";
    const hovered = this.hovered === svc.id;
    const kbdSelected = this.cursor === idx;
    const port = effectivePort(svc, st);
    const openUrl = accessUrl(machine, svc, st, ts);
    const canOpen = Boolean(openUrl) && (running || Boolean(ts?.url));

    return v_flex().id(`svc-${svc.id}`).relative().pl(8).pr(6).py(0).rounded(RADIUS.sm)
      .when(failed, (el) => el.bg(alpha(statusColor(t, "error"), 0.1)))
      .when(kbdSelected && !failed, (el) => el.bg(t.selected))
      .when(!kbdSelected || failed, (el) => el.hover((s) => s.bg(failed ? alpha(statusColor(t, "error"), 0.16) : t.hover)))
      .on_hover((on, cx) => {
        if (on) this.hovered = svc.id;
        else if (this.hovered === svc.id) this.hovered = null;
        cx.notify();
      })
      .when(Boolean(st?.terminal), (el) => el.cursor_pointer().tooltip("Click to view logs").on_click(() => { this.cursor = idx; this.handle.focus(); openLogs(spaceId, machine, root, svc, st.terminal); }))
      .when(!st?.terminal, (el) => el.on_click((_e, cx) => { this.cursor = idx; this.handle.focus(); cx.notify(); }))
      .child(h_flex().h(SIZE.row).gap(8).items_center()
        .child(running || failed || st?.state === "ok"
          ? dot(t, running ? "ok" : failed ? "error" : "ok")
          : div().size(6).flex_none())
        .child(div().flex_shrink(0).max_w(130).truncate()
          .text_color(running || failed || kbdSelected ? t.foreground : alpha(t.foreground, 0.88))
          .when(running || kbdSelected, (el) => el.font_medium())
          .tooltip(svc.rawCmd || svc.command)
          .child(svc.name))
        .when(Boolean(port) && canOpen, (el) => el.child(
          h_flex().id(`port-${svc.id}`).h(20).px(6).gap(4).items_center().rounded(RADIUS.xs)
            .bg(alpha(t.accent, 0.14))
            .text_size(TYPE.meta).font_family(monoFont()).text_color(t.accent).cursor_pointer()
            .hover((s) => s.bg(alpha(t.accent, 0.24)))
            .tooltip(`Open ${openUrl} in browser`)
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(openUrl); })
            .child(`:${port}`)
            .child(svg(`${DIR}/icons/external-link.svg`).size(SIZE.iconSm).flex_none()),
        ))
        .when(!(Boolean(port) && canOpen), (el) => el.child(
          div().flex_1().min_w(0).truncate().text_size(TYPE.meta).text_color(kbdSelected && !failed ? selectedMetaColor(t) : t.dim)
            .when(Boolean(port), (x) => x.font_family(monoFont()))
            .child(port ? `:${port}` : (svc.rawCmd || svc.command || "")),
        ))
        .when(Boolean(port) && canOpen, (el) => el.child(div().flex_1()))
        // Active Tailscale exposure is always visible at rest; inactive toggle reveals on hover.
        .when((Boolean(ts) || hovered) && !isPkg, (el) => el.child(
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
            ts ? t.accent : t.muted,
            ts ? t.accent : t.foreground,
            { active: Boolean(ts) },
          ),
        ))
        .when(hovered, (el) => el.child(isPkg
          ? iconBtn(t, `save-${svc.id}`, "plus", "Save to project services", () => {
              openEditor(machine, root, { ...svc, id: null }, hasFlake);
            })
          : iconBtn(t, `edit-${svc.id}`, "pencil", "Edit service", () => openEditor(machine, root, svc, hasFlake))))
        // Primary action always visible (muted at rest, semantic color on hover)
        .child(running
          ? uiIconBtn(t, `stop-${svc.id}`, "mods/my-chrome/square.svg", "Stop service", () => stopService(spaceId, svc.id), { color: t.muted, hoverColor: statusColor(t, "error") })
          : iconBtn(t, `start-${svc.id}`, "play", "Start service", () => {
              startService(spaceId, machine, root, svc, false).catch((e) => {
                notify({ title: `Couldn't start ${svc.name}`, body: String(e?.message ?? e), level: "error" });
              });
            }, t.muted, statusColor(t, "ok"))))
      .when(failed, (el) => el.child(
        div().pl(14).pb(4).text_size(TYPE.meta).text_color(statusColor(t, "error"))
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
    this.confirmDelete = false;
    this.error = "";
    this.focus = "command";

    const field = (key, value, placeholder) => {
      const s = InputState.new({ value: String(value ?? ""), placeholder });
      s.on("focus", (_e, cx) => { this.focus = key; cx.notify(); });
      s.on("submit", (_e, cx) => this.submitEdit(cx));
      s.on("change", (_e, cx) => cx.notify());
      return s;
    };

    this.name = field("name", svc.name, "e.g. dev");
    this.command = field("command", svc.command, "e.g. npm run dev");
    this.port = field("port", svc.port, "e.g. 3000 (optional)");
    this.tsPort = field("tsPort", svc.tsPort, "Optional (same as local)");
    this.command.focus();
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

  renderEdit() {
    const t = theme();
    const p = props() ?? {};
    const label = (text, { err = "", first = false } = {}) => h_flex().flex_none().pt(first ? 0 : 10).pb(4).items_center().justify_between()
      .child(div().text_size(TYPE.meta).font_medium().text_color(t.muted).child(text))
      .when(Boolean(err), (el) => el.child(div().text_size(TYPE.meta).font_medium().text_color(statusColor(t, "error")).child(err)));
    const input = (key, state, opts = {}) => textInput(t, state, this.focus === key, opts);
    const seg = (val, text) => h_flex().id(`nix-${val}`).flex_1().h(26).items_center().justify_center()
      .rounded(RADIUS.xs).cursor_pointer().text_size(TYPE.sub)
      .bg(this.nix === val ? t.raised : TRANSPARENT)
      .text_color(this.nix === val ? t.foreground : t.muted)
      .when(this.nix === val, (el) => el.font_medium())
      .when(this.nix !== val, (el) => el.hover((s) => s.text_color(t.foreground)))
      .on_click((_e, cx) => { this.nix = val; cx.notify(); })
      .child(text);

    const canSave = Boolean(this.command.value().trim());
    const body = v_flex().id("svc-edit-body").flex_1().min_h(0).overflow_y_scrollbar()
      .child(label("Command", { err: this.error === "Command is required." ? this.error : "", first: true }))
      .child(input("command", this.command, { mono: true }))
      .child(label("Name"))
      .child(input("name", this.name))
      .child(label(`Nix environment${this.hasFlake ? " (flake.nix detected)" : ""}`))
      .child(h_flex().flex_none().p(3).gap(3).rounded(RADIUS.sm).bg(t.background)
        .child(seg("auto", "Auto"))
        .child(seg("on", "Always nix develop"))
        .child(seg("off", "Off")))
      .child(h_flex().flex_none().gap(10)
        .child(v_flex().flex_1().min_w(0).child(label("Local port", { err: this.error.includes("Local port") ? this.error : "" })).child(input("port", this.port, { mono: Boolean(this.port.value()) })))
        .child(v_flex().flex_1().min_w(0).child(label("Tailscale HTTPS port", { err: this.error.includes("Tailscale port") ? this.error : "" })).child(input("tsPort", this.tsPort, { mono: Boolean(this.tsPort.value()) }))))
      .child(toggle(t, "ed-ts", this.tailscale, "Auto-expose with Tailscale",
        "Starts tailscale serve with this service; cleans up on stop",
        (_e, cx) => { this.tailscale = !this.tailscale; cx.notify(); }));

    const fieldErr = this.error === "Command is required." || this.error.includes("Local port") || this.error.includes("Tailscale port");
    const generalErr = Boolean(this.error) && !fieldErr ? this.error : "";
    const footer = h_flex().gap(8).items_center()
      .when(Boolean(this.editingId) && !this.confirmDelete, (el) => el.child(
        button(t, "ed-del", "Delete", (_e, cx) => { this.confirmDelete = true; cx.notify(); }, { variant: "danger" }),
      ))
      .when(Boolean(this.editingId) && this.confirmDelete, (el) => el
        .child(button(t, "ed-del-yes", "Confirm delete?", (_e, cx) => this.deleteEdit(cx), { variant: "danger" }))
        .child(button(t, "ed-del-no", "Keep", (_e, cx) => { this.confirmDelete = false; cx.notify(); }, { variant: "ghost" })))
      .when(Boolean(generalErr), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(TYPE.meta).text_color(statusColor(t, "error")).child(generalErr)))
      .when(!generalErr, (el) => el.child(div().flex_1()))
      .child(button(t, "ed-cancel", "Cancel", () => closeOverlay(p.overlay), { variant: "ghost" }))
      .child(button(t, "ed-save", "Save", (_e, cx) => this.submitEdit(cx), { variant: "primary", disabled: !canSave, tip: canSave ? "Save service" : "Enter a command to save" }));

    return dialogFrame(t, {
      id: "svc-edit",
      handle: this.handle,
      onKeyDown: (e, cx) => {
        if (e.key === "escape") {
          if (this.confirmDelete) { this.confirmDelete = false; cx.notify(); }
          else closeOverlay(p.overlay);
          cx.stop_propagation();
        }
      },
      title: this.editingId ? "Edit service" : "New service",
      subtitle: `${this.machine ? `${this.machine}: ` : ""}${displayPath(this.root, this.machine)}`,
      onClose: () => closeOverlay(p.overlay),
      body,
      footer,
    });
  }

  // ---- floating terminal title bar -----------------------------------------

  renderTitle() {
    const t = theme();
    const p = props() ?? {};
    const svc = p.svc ?? {};
    const st = appStatus(p.spaceId, svc.id);
    const ts = tsInfo(p.spaceId, svc.id, p.machine);
    const running = st?.state === "running";
    const url = accessUrl(p.machine, svc, st, ts);

    const badges = [];
    if (ts?.url) {
      badges.push(chip(t, "title-ts", ts.url, (_e, cx) => {
        cx.write_to_clipboard(ts.url);
        notify({ title: "Copied Tailscale URL", body: ts.url, level: "success", timeout: 2500 });
      }, {
        fg: t.accent,
        bg: alpha(t.accent, 0.16),
        hoverBg: alpha(t.accent, 0.24),
        tip: "Click to copy Tailscale URL",
        mono: true,
      }));
    }

    const actions = [];
    if (url && (running || Boolean(ts?.url))) {
      actions.push(iconBtn(t, "title-open", "external-link", `Open ${url} in browser`, (_e, cx) => cx.open_url(url)));
    }
    actions.push(iconBtn(t, "title-restart", "refresh-cw", "Restart service", () => {
      closeOverlay(p.overlay);
      startService(p.spaceId, p.machine, p.root, svc, true).catch((e) => {
        notify({ title: `Couldn't restart ${svc.name}`, body: String(e?.message ?? e), level: "error" });
      });
    }));
    actions.push(chip(t, "title-tab", "Dock tab", () => {
      run("terminal.keep", { terminal: p.terminal, place: "tab" });
      closeOverlay(p.overlay);
    }, { height: SIZE.btn, tip: "Dock this terminal as a tab" }));

    return floatingTitleBar(t, {
      id: "svc-title",
      iconEl: dot(t, running ? "ok" : st?.state === "error" ? "error" : st?.state === "ok" ? "ok" : "idle", { outlined: !running && st?.state !== "error" && st?.state !== "ok" }),
      title: svc.name || "Service",
      subtitle: svc.command || "",
      badges,
      actions,
      onStop: running ? () => {
        stopService(p.spaceId, svc.id);
        closeOverlay(p.overlay);
      } : null,
      stopTip: "Stop service and close",
      onHide: () => closeOverlay(p.overlay),
    });
  }
}
