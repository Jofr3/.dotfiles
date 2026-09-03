# Wayland session plumbing shared by any compositor.
{
  flake.modules.nixos.desktop = {
    environment.sessionVariables.NIXOS_OZONE_WL = "1";
    users.users.jofre.extraGroups = [
      "video"
      "input"
      "render"
    ];
  };

  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    {
      home.packages = with pkgs; [
        cliphist
        grim
        satty
        slurp
        swaybg
        wl-clipboard
        wl-color-picker
        wtype
      ];
    };
}
