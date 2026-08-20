# Headless server profile: no Wayland, no display manager, no theming.
# Used by nixos-remote.
{ lib, pkgs, ... }:
{
  # Password auth over SSH is off (see below), so this list is the only way in
  # over the network -- emptying it leaves just the local console and the
  # `initialPassword` from ../machines/common.nix.
  users.users.jofre.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHQRsAl4ousWrEi9QGAvl1kCyPi1NRdOpO8Wgg56qLm4 jofrescari@gmail.com"
  ];

  # networking — no NetworkManager on a headless box; per-machine addressing
  # lives in machines/<host>/network.nix.
  networking = {
    firewall = {
      enable = true;
      # Port 22 is open on the LAN only; nothing here is reachable from the
      # internet. Remote access goes over the tailnet (see below).
      allowedTCPPorts = [ 22 ];

      # Anything arriving over the tailnet is already authenticated by
      # WireGuard, so it skips the firewall entirely. This is what makes a dev
      # server on 5173/3000/whatever reachable remotely without punching a
      # hole per port.
      trustedInterfaces = [ "tailscale0" ];

      # Strict reverse-path filtering drops return traffic when this machine
      # routes through an exit node. Harmless otherwise.
      checkReversePath = "loose";
    };
  };

  # Remote access. Tailscale dials out to build a WireGuard mesh, so this works
  # from any network with no port forwarding and no public IP -- including
  # behind CGNAT. Enrol once, by hand, after the first rebuild:
  #   sudo tailscale up
  # then reach the box at `nixos-remote` (MagicDNS) or its 100.x.y.z address.
  services.tailscale = {
    enable = true;
    openFirewall = true; # UDP 41641, lets peers connect directly instead of relaying
  };

  services.openssh = {
    enable = true;
    openFirewall = true;
    settings = {
      PermitRootLogin = "no";
      PasswordAuthentication = lib.mkDefault false;
      KbdInteractiveAuthentication = false;
    };
  };

  services.fail2ban.enable = true;

  # Never let a headless machine sleep or react to a lid.
  services.logind.settings.Login = {
    HandleLidSwitch = "ignore";
    HandleLidSwitchExternalPower = "ignore";
  };
  systemd.sleep.settings.Sleep = {
    AllowSuspend = false;
    AllowHibernation = false;
    AllowHybridSleep = false;
    AllowSuspendThenHibernate = false;
  };

  # Compressed swap in RAM — cheap insurance on a small box.
  zramSwap.enable = true;

  # Keep the store from growing without bound on a machine nobody looks at.
  nix.gc = {
    automatic = true;
    dates = "weekly";
    options = "--delete-older-than 30d";
  };
  nix.optimise = {
    automatic = true;
    dates = [ "weekly" ];
  };

  # Rebuild from the local checkout on a schedule, against the committed
  # flake.lock -- inputs are bumped by hand, not by the timer. Requires the
  # dotfiles repo to be present at this path; set enable = false to opt out.
  system.autoUpgrade = {
    enable = true;
    flake = "/home/jofre/.dotfiles/config/nix";
    dates = "weekly";
    randomizedDelaySec = "45min";
    allowReboot = false;
  };

  services.journald.extraConfig = ''
    SystemMaxUse=512M
  '';

  console.keyMap = "us";

  environment.systemPackages = with pkgs; [
    htop
    tmux
  ];
}
