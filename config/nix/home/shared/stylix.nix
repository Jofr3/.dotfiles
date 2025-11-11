{ pkgs, inputs, ... }: {
  imports = [ inputs.stylix.homeModules.stylix ];

  stylix = {
    enable = true;
    image = ../../theme/wallpaper.jpg;
    # base16Scheme = "${pkgs.base16-schemes}/share/themes/tokyo-night-dark.yaml";
    base16Scheme = ../../theme/gruvbox.yml;
    cursor = {
      package = pkgs.vanilla-dmz;
      name = "Vanilla-DMZ";
      size = 24;
    };
    polarity = "dark";
  };
}
