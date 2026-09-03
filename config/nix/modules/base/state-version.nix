# Bump both together, and only on a fresh install.
{
  flake.modules.nixos.base.system.stateVersion = "25.11";
  flake.modules.homeManager.base.home.stateVersion = "25.11";
}
