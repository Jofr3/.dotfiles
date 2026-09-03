# Theming. Stylix's NixOS module auto-imports its Home Manager half into every
# home-manager user, so the GTK/cursor bits below only add what it leaves out.
{ inputs, ... }:
{
  flake.modules.nixos.desktop =
    { pkgs, ... }:
    {
      imports = [ inputs.stylix.nixosModules.stylix ];

      stylix = {
        enable = true;
        image = ../../theme/wallpaper.jpg;
        base16Scheme = "${pkgs.base16-schemes}/share/themes/rose-pine-moon.yaml";
        cursor = {
          package = pkgs.vanilla-dmz;
          name = "Vanilla-DMZ";
          size = 24;
        };
        polarity = "dark";
      };
    };

  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    {
      home.pointerCursor.enable = true;

      gtk = {
        enable = true;
        iconTheme = {
          name = "Adwaita";
          package = pkgs.adwaita-icon-theme;
        };
      };
    };
}
