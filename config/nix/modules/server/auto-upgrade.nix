# Rebuild from the local checkout on a schedule, against the committed
# flake.lock -- inputs are bumped by hand, not by the timer. Requires the
# dotfiles repo to be present at this path; set enable = false to opt out.
{
  flake.modules.nixos.server.system.autoUpgrade = {
    enable = true;
    flake = "/home/jofre/.dotfiles/config/nix";
    dates = "weekly";
    randomizedDelaySec = "45min";
    allowReboot = false;
  };
}
