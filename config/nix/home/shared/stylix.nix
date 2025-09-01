{ pkgs, ... }: {
  stylix = {
    enable = true;
    image = ../../theme/wallpaper.jpg;
    base16Scheme = ../../theme/gruvbox.yml;
    cursor = {
      package = pkgs.vanilla-dmz;
      name = "Vanilla-DMZ";
      size = 24;
    };
    polarity = "dark";
  };
}
