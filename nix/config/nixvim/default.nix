{ ... }:
{
  programs.nixvim.enable = true;

  imports = [
    ./plugins
    ./init.nix
    ./cmds.nix
    ./maps.nix
    ./highlights.nix
  ];
}
