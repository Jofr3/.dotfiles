# Headless extras on top of ../base/packages.nix.
{
  flake.modules.nixos.server =
    { pkgs, ... }:
    {
      environment.systemPackages = with pkgs; [
        htop
        tmux
      ];
    };

  flake.modules.homeManager.server =
    { pkgs, ... }:
    {
      home.packages = with pkgs; [
        dnsutils
        iotop
        ncdu
        tcpdump
        tree-sitter
      ];
    };
}
