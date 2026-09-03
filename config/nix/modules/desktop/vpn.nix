{
  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    {
      home.packages = with pkgs; [
        openconnect
        openfortivpn
      ];
    };
}
