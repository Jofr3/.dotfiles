{
  flake.modules.homeManager.desktop =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      dailyLimitsMinutes = {
        "youtube.com" = 45;
      };
      pollIntervalSeconds = 5;
      debuggerPort = 9222;

      python = pkgs.python3.withPackages (ps: [ ps.websocket-client ]);
      settings = pkgs.writeText "website-usage-limiter.json" (
        builtins.toJSON {
          inherit dailyLimitsMinutes pollIntervalSeconds debuggerPort;
        }
      );
      script = pkgs.writeText "website-usage-limiter.py" ''
        import argparse
        import datetime
        import fcntl
        import json
        import logging
        import math
        import os
        from pathlib import Path
        import tempfile
        import time
        from contextlib import closing
        from urllib.parse import quote, urlsplit
        from urllib.request import ProxyHandler, build_opener

        import websocket

        SETTINGS = json.loads(Path("${settings}").read_text())
        LIMITS = {
            domain.lower().rstrip("."): minutes * 60
            for domain, minutes in SETTINGS["dailyLimitsMinutes"].items()
        }
        INTERVAL = SETTINGS["pollIntervalSeconds"]
        PORT = SETTINGS["debuggerPort"]
        ENDPOINT = f"http://127.0.0.1:{PORT}"
        TIMEOUT = 2
        STATE_DIR = Path(os.environ.get(
            "XDG_STATE_HOME", str(Path.home() / ".local/state")
        )) / "website-usage-limiter"
        STATE_FILE = STATE_DIR / "usage.json"
        # Never send local debugging traffic through an HTTP proxy.
        HTTP = build_opener(ProxyHandler({}))
        EXPRESSION = """({
            url: location.href,
            focused: document.visibilityState === 'visible' && document.hasFocus()
        })"""


        def today():
            return datetime.date.today().isoformat()


        def domain_for(url):
            parsed = urlsplit(url)
            if parsed.scheme not in ("http", "https"):
                return None
            host = (parsed.hostname or "").lower().rstrip(".")
            for domain in sorted(LIMITS, key=len, reverse=True):
                if host == domain or host.endswith("." + domain):
                    return domain
            return None


        def load_state(path):
            empty = {"date": today(), "seconds": {}}
            try:
                state = json.loads(path.read_text())
                if state["date"] != today():
                    return empty
                seconds = state["seconds"]
                if not isinstance(seconds, dict) or not all(
                    isinstance(key, str)
                    and type(value) in (int, float)
                    and math.isfinite(value) and value >= 0
                    for key, value in seconds.items()
                ):
                    raise ValueError("invalid usage totals")
                return state
            except FileNotFoundError:
                return empty
            except (ValueError, KeyError, TypeError):
                logging.warning("Invalid usage state; starting fresh")
                return empty


        def save_state(path, state):
            # Same-directory rename prevents a partial JSON file after a crash.
            with tempfile.NamedTemporaryFile(
                mode="w", dir=path.parent, delete=False
            ) as handle:
                temporary = Path(handle.name)
                try:
                    json.dump(state, handle)
                    handle.flush()
                    os.fsync(handle.fileno())
                    os.replace(temporary, path)
                finally:
                    temporary.unlink(missing_ok=True)


        class Tracker:
            def __init__(self, state):
                self.state = state
                self.previous = set()
                self.last_tick = None

            def update(self, focused, now, day):
                changed = False
                if self.state["date"] != day:
                    self.state = {"date": day, "seconds": {}}
                    self.previous = set()
                    changed = True
                elapsed = 0 if self.last_tick is None else now - self.last_tick
                # Require consecutive focused samples. Skip gaps (suspend,
                # slow/unresponsive pages); never charge time while offline.
                if 0 < elapsed <= 2 * INTERVAL:
                    for domain in self.previous & focused:
                        used = self.state["seconds"].get(domain, 0)
                        self.state["seconds"][domain] = used + elapsed
                        changed = True
                self.previous = focused
                self.last_tick = now
                return changed

            def exhausted(self, domain):
                return (
                    domain in LIMITS
                    and self.state["seconds"].get(domain, 0) >= LIMITS[domain]
                )


        def request(path):
            with HTTP.open(ENDPOINT + path, timeout=TIMEOUT) as response:
                return response.read()


        def inspect_tab(target):
            address = target["webSocketDebuggerUrl"]
            parsed = urlsplit(address)
            if (
                parsed.scheme != "ws"
                or parsed.hostname not in ("localhost", "127.0.0.1")
                or parsed.port != PORT
            ):
                raise ValueError("Non-local debugging target refused")
            with closing(websocket.create_connection(
                address, timeout=TIMEOUT, suppress_origin=True,
                http_no_proxy=["localhost", "127.0.0.1"],
            )) as connection:
                connection.send(json.dumps({
                    "id": 1,
                    "method": "Runtime.evaluate",
                    "params": {
                        "expression": EXPRESSION,
                        "returnByValue": True,
                        "timeout": TIMEOUT * 1000,
                    },
                }))
                deadline = time.monotonic() + TIMEOUT
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError("Tab evaluation timed out")
                    connection.settimeout(remaining)
                    reply = json.loads(connection.recv())
                    if reply.get("id") != 1:
                        continue
                    value = reply["result"]["result"]["value"]
                    return domain_for(value["url"]), value["focused"] is True


        TAB_ERRORS = (OSError, ValueError, KeyError, TypeError,
                      websocket.WebSocketException)


        class BrowserUnavailable(Exception):
            pass


        def poll(tracker):
            try:
                targets = json.loads(request("/json/list"))
            except (OSError, ValueError) as error:
                raise BrowserUnavailable from error
            focused = set()
            candidates = []
            for target in targets:
                try:
                    if target.get("type") != "page" or not domain_for(target["url"]):
                        continue
                    domain, active = inspect_tab(target)
                    if domain is not None:
                        candidates.append((target, domain))
                        if active:
                            focused.add(domain)
                except TAB_ERRORS:
                    # Tabs may navigate, close, or become unresponsive mid-poll.
                    logging.debug("Could not inspect tab", exc_info=True)
            # BOOTTIME includes suspend, allowing Tracker to discard that gap.
            now = time.clock_gettime(time.CLOCK_BOOTTIME)
            if tracker.update(focused, now, today()):
                save_state(STATE_FILE, tracker.state)
            for target, domain in candidates:
                if not tracker.exhausted(domain):
                    continue
                try:
                    # Do not close a tab that has navigated to an unrelated site
                    # since discovery. Only store aggregate domains, never URLs.
                    current, _ = inspect_tab(target)
                    if tracker.exhausted(current):
                        request("/json/close/" + quote(target["id"], safe=""))
                        logging.info("Closed tab: %s (daily limit reached)", current)
                except TAB_ERRORS:
                    logging.debug("Could not close tab", exc_info=True)


        def main():
            parser = argparse.ArgumentParser(description="Daily focused-tab budgets")
            parser.add_argument("--status", action="store_true",
                                help="show today's usage without connecting to Chrome")
            args = parser.parse_args()
            logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
            if args.status:
                state = load_state(STATE_FILE)
                print(json.dumps({
                    "date": state["date"],
                    "sites": {
                        domain: {
                            "usedMinutes": round(state["seconds"].get(domain, 0) / 60, 2),
                            "limitMinutes": limit / 60,
                        }
                        for domain, limit in LIMITS.items()
                    },
                }, indent=2))
                return
            if not LIMITS:
                logging.info("No limits configured; edit dailyLimitsMinutes in website-usage-limiter.nix")
                return
            STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
            with (STATE_DIR / "monitor.lock").open("w") as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    logging.error("A website usage limiter is already running")
                    return
                tracker = Tracker(load_state(STATE_FILE))
                connected = None
                while True:
                    try:
                        poll(tracker)
                        if not connected:
                            logging.info("Monitoring chrome-jofre on port %s", PORT)
                        connected = True
                    except BrowserUnavailable:
                        tracker.previous = set()
                        tracker.last_tick = None
                        if connected is not False:
                            logging.info("Waiting for chrome-jofre on port %s", PORT)
                        connected = False
                    time.sleep(INTERVAL)


        if __name__ == "__main__":
            main()
      '';
      monitor = pkgs.writeShellApplication {
        name = "website-usage-limiter";
        text = ''
          exec ${python}/bin/python3 ${script} "$@"
        '';
      };
    in
    {
      assertions = [
        {
          assertion = lib.all (minutes: builtins.isInt minutes && minutes >= 0) (
            builtins.attrValues dailyLimitsMinutes
          );
          message = "Website limits must be non-negative whole minutes (0 blocks immediately).";
        }
        {
          assertion = lib.all (domain: builtins.match "[a-z0-9-]+(\\.[a-z0-9-]+)*" domain != null) (
            builtins.attrNames dailyLimitsMinutes
          );
          message = "Website limits must use lowercase hostnames, not URLs or wildcards.";
        }
      ];

      home.packages = [ monitor ];
      systemd.user.services.website-usage-limiter = lib.mkIf (dailyLimitsMinutes != { }) {
        Unit.Description = "Daily website usage limits for chrome-jofre";
        Service = {
          ExecStart = "${monitor}/bin/website-usage-limiter";
          Restart = "on-failure";
          RestartSec = 5;
          UMask = "0077";
          Environment = [ "XDG_STATE_HOME=${config.xdg.stateHome}" ];
        };
        Install.WantedBy = [ "default.target" ];
      };
    };
}
