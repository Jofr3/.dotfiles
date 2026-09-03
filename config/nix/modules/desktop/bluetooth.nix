{
  flake.modules.nixos.desktop.hardware.bluetooth.enable = true;

  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.overskride ];
    };
}
