{
  flake.modules.homeManager.desktop =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      # Minutes per domain: a number for a daily budget, or an object with
      # "daily" and/or "hourly" budgets, e.g.
      #   { "reddit.com": 45, "youtube.com": { "daily": 120, "hourly": 10 } }
      # Hourly use also counts towards the daily budget; once the hourly budget
      # is spent the site stays blocked until the next clock hour. Kept encrypted in
      # secrets/WEBSITE_LIMITS.age (edit with `secret-edit WEBSITE_LIMITS`) and
      # decrypted by base/secrets.nix, so it is read at runtime, never by Nix.
      limitsSecret = ../../secrets/WEBSITE_LIMITS.age;
      limitsFile = "${config.xdg.stateHome}/secrets/WEBSITE_LIMITS";
      pollIntervalSeconds = 5;
      debuggerPort = 9222;

      python = pkgs.python3.withPackages (ps: [ ps.websocket-client ]);
      settings = pkgs.writeText "website-usage-limiter.json" (
        builtins.toJSON {
          inherit limitsFile pollIntervalSeconds debuggerPort;
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
        import re
        import sys
        from pathlib import Path
        import tempfile
        import time
        from contextlib import closing
        from urllib.parse import quote, urlsplit
        from urllib.request import ProxyHandler, build_opener

        import websocket

        SETTINGS = json.loads(Path("${settings}").read_text())
        LIMITS_FILE = Path(SETTINGS["limitsFile"])
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


        PERIODS = ("daily", "hourly")


        def load_limits():
            try:
                config = json.loads(LIMITS_FILE.read_text())
            except (OSError, ValueError) as error:
                sys.exit(f"Cannot read website limits from {LIMITS_FILE}: {error}")
            if not isinstance(config, dict):
                sys.exit("Website limits must be a JSON object of domain: minutes")
            limits = {}
            for domain, value in config.items():
                if not re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)*", domain):
                    sys.exit(f"Website limits must use lowercase hostnames, not URLs or wildcards: {domain!r}")
                if type(value) is int:
                    value = {"daily": value}
                if not isinstance(value, dict) or not value or not set(value) <= set(PERIODS):
                    sys.exit(f"Website limits must be minutes or an object with \"daily\" and/or \"hourly\" minutes: {domain!r}")
                for minutes in value.values():
                    if type(minutes) is not int or minutes < 0:
                        sys.exit(f"Website limits must be non-negative whole minutes (0 blocks immediately): {domain!r}")
                limits[domain] = {period: minutes * 60 for period, minutes in value.items()}
            return limits


        LIMITS = load_limits()


        def current_period():
            # One clock reading for both, so day and hour can never disagree.
            now = datetime.datetime.now()
            return now.date().isoformat(), now.strftime("%Y-%m-%dT%H")


        def empty_state(day, hour):
            return {"date": day, "seconds": {}, "hour": hour, "hourSeconds": {}}


        def valid_totals(totals):
            return isinstance(totals, dict) and all(
                isinstance(key, str)
                and type(value) in (int, float)
                and math.isfinite(value) and value >= 0
                for key, value in totals.items()
            )


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
            day, hour = current_period()
            empty = empty_state(day, hour)
            try:
                state = json.loads(path.read_text())
                if state["date"] != day:
                    return empty
                if not valid_totals(state["seconds"]):
                    raise ValueError("invalid usage totals")
                # State written before hourly limits existed has no hour bucket.
                if state.get("hour") != hour or not valid_totals(state.get("hourSeconds")):
                    state["hour"] = hour
                    state["hourSeconds"] = {}
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

            def update(self, focused, now, day, hour):
                changed = False
                if self.state["date"] != day:
                    self.state = empty_state(day, hour)
                    self.previous = set()
                    changed = True
                elif self.state["hour"] != hour:
                    self.state["hour"] = hour
                    self.state["hourSeconds"] = {}
                    changed = True
                elapsed = 0 if self.last_tick is None else now - self.last_tick
                # Require consecutive focused samples. Skip gaps (suspend,
                # slow/unresponsive pages); never charge time while offline.
                if 0 < elapsed <= 2 * INTERVAL:
                    for domain in self.previous & focused:
                        for key in ("seconds", "hourSeconds"):
                            used = self.state[key].get(domain, 0)
                            self.state[key][domain] = used + elapsed
                        changed = True
                self.previous = focused
                self.last_tick = now
                return changed

            def exhausted(self, domain):
                """Return the period whose budget is spent ("daily"/"hourly"), or None."""
                limit = LIMITS.get(domain, {})
                for period, key in (("daily", "seconds"), ("hourly", "hourSeconds")):
                    if period in limit and self.state[key].get(domain, 0) >= limit[period]:
                        return period
                return None


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
            if tracker.update(focused, now, *current_period()):
                save_state(STATE_FILE, tracker.state)
            for target, domain in candidates:
                if not tracker.exhausted(domain):
                    continue
                try:
                    # Do not close a tab that has navigated to an unrelated site
                    # since discovery. Only store aggregate domains, never URLs.
                    current, _ = inspect_tab(target)
                    period = tracker.exhausted(current)
                    if period:
                        request("/json/close/" + quote(target["id"], safe=""))
                        logging.info("Closed tab: %s (%s limit reached)", current, period)
                except TAB_ERRORS:
                    logging.debug("Could not close tab", exc_info=True)


        def main():
            parser = argparse.ArgumentParser(description="Daily and hourly focused-tab budgets")
            parser.add_argument("--status", action="store_true",
                                help="show today's and this hour's usage without connecting to Chrome")
            args = parser.parse_args()
            logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
            if args.status:
                state = load_state(STATE_FILE)
                sites = {}
                for domain, limit in LIMITS.items():
                    site = sites[domain] = {
                        "usedMinutes": round(state["seconds"].get(domain, 0) / 60, 2),
                        "usedThisHourMinutes": round(state["hourSeconds"].get(domain, 0) / 60, 2),
                    }
                    if "daily" in limit:
                        site["dailyLimitMinutes"] = limit["daily"] / 60
                    if "hourly" in limit:
                        site["hourlyLimitMinutes"] = limit["hourly"] / 60
                print(json.dumps({
                    "date": state["date"],
                    "hour": state["hour"],
                    "sites": sites,
                }, indent=2))
                return
            if not LIMITS:
                logging.info("No limits configured; run `secret-edit WEBSITE_LIMITS`")
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
      home.packages = [ monitor ];
      systemd.user.services.website-usage-limiter = {
        Unit = {
          Description = "Daily and hourly website usage limits for chrome-jofre";
          ConditionPathExists = limitsFile;
          # The decrypted file is rewritten on activation; restart when it changes.
          X-Restart-Triggers = [ "${limitsSecret}" ];
        };
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
