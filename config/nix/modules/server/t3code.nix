# T3 Code (https://t3.codes) running headless on this box, reachable from a
# phone or laptop over the tailnet -- the agents, terminals and repos all stay
# here.  Upstream installs a prebuilt release into ~/.t3 and registers its own
# systemd unit with `t3 service install`; neither survives a rebuild, so the
# release tarball is a derivation and the unit is declared here.  `t3 update`
# does not work against a read-only store: bump `version` below instead.
#
# Once per machine, after the first rebuild and `sudo tailscale up`:
#   t3 pair --tailscale        # pairing link for a new device
#   t3 connect                 # optional, adds T3 Connect (cloud) access
{
  flake.modules.nixos.server =
    { pkgs, ... }:
    {
      # The server is a *user* unit, so systemd must start jofre's manager at
      # boot and keep it after logout.
      users.users.jofre.linger = true;

      # `t3 serve --tailscale-serve` shells out to `tailscale serve`, which is
      # root-only until the user is made the tailnet operator.  Before
      # enrolment (`sudo tailscale up`) there is no tailnet to set this on, so
      # the failure is ignored and picked up on the next boot.
      systemd.services.tailscale-operator = {
        description = "Let jofre drive tailscale serve without sudo";
        wantedBy = [ "multi-user.target" ];
        after = [ "tailscaled.service" ];
        wants = [ "tailscaled.service" ];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          ExecStart = "-${pkgs.tailscale}/bin/tailscale set --operator=jofre";
        };
      };
    };

  flake.modules.homeManager.server =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      # Loopback only: `tailscale serve` is the one thing in front of it, and
      # it terminates HTTPS on the tailnet name (nixos-remote.<tailnet>.ts.net).
      port = 3773;

      t3code = pkgs.stdenv.mkDerivation (finalAttrs: {
        pname = "t3code";
        version = "0.0.42";

        # A Bun single-file binary plus the web client; there is no source
        # build.  To bump:
        #   nix-prefetch-url --unpack <url> | xargs nix hash convert --to sri --hash-algo sha256
        src = pkgs.fetchzip {
          url = "https://github.com/pingdotgg/t3code/releases/download/v${finalAttrs.version}/t3-${finalAttrs.version}-linux-x64.tar.gz";
          hash = "sha256-Br4myVg4WClVKNPAgWEGFgTVQYXoNwwdPQaUvKgHhaA=";
        };

        nativeBuildInputs = [
          pkgs.autoPatchelfHook
          pkgs.makeWrapper
        ];
        buildInputs = [ pkgs.stdenv.cc.cc.lib ];

        # The JavaScript bundle is appended to the Bun runtime after its last
        # ELF section, so stripping the binary throws the program away and
        # leaves something that dies with SIGILL on startup.
        dontStrip = true;

        # `t3` resolves ./client and ./node_modules next to itself, so the
        # tree stays intact and only a wrapper lands in bin/.
        installPhase = ''
          runHook preInstall
          mkdir -p $out/libexec/t3code
          cp -r ./. $out/libexec/t3code
          makeWrapper $out/libexec/t3code/t3 $out/bin/t3 \
            --prefix PATH : ${lib.makeBinPath [ pkgs.tailscale ]}
          runHook postInstall
        '';

        meta.mainProgram = "t3";
      });
    in
    {
      home.packages = [ t3code ];

      systemd.user.services.t3code = {
        Unit = {
          Description = "T3 Code server";
          Documentation = "https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md";
        };

        Service = {
          # Ordering against tailscaled is not expressible from the user
          # manager, so a restart loop covers the boot race instead.
          ExecStart = "${lib.getExe t3code} serve --no-browser --host 127.0.0.1 --port ${toString port} --tailscale-serve";
          WorkingDirectory = config.home.homeDirectory;
          Restart = "always";
          RestartSec = 5;

          # A user unit inherits almost nothing, and t3 launches the provider
          # CLIs (claude, codex, ...), git and a shell by name.
          Environment = [
            "PATH=/etc/profiles/per-user/${config.home.username}/bin:/run/wrappers/bin:/run/current-system/sw/bin"
          ];
        };

        Install.WantedBy = [ "default.target" ];
      };
    };
}
