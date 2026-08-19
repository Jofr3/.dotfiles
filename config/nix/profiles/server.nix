# Headless server profile: no Wayland, no display manager, no theming.
# Used by jofre-server.
{ lib, pkgs, ... }:
{
  # ---------------------------------------------------------------------------
  # TODO: add your public keys here BEFORE deploying this machine anywhere you
  # cannot reach a physical console. Password auth over SSH is off (see below),
  # so with an empty list the only way in is the local console using the
  # `initialPassword` from ../machines/common.nix.
  # ---------------------------------------------------------------------------
  users.users.jofre.openssh.authorizedKeys.keys = [
    # "ssh-ed25519 AAAA... jofre@nixos"
  ];

  # networking — no NetworkManager on a headless box; hardware.nix enables DHCP.
  networking = {
    firewall = {
      enable = true;
      allowedTCPPorts = [ 22 ];
    };
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
