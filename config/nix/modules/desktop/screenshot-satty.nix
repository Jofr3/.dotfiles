{
  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    let
      screenshotSatty = pkgs.writeShellApplication {
        name = "screenshot-satty";
        runtimeInputs = with pkgs; [
          coreutils
          grim
          satty
          slurp
          wl-clipboard
        ];
        text = ''
          screenshots_dir="$HOME/Documents/screenshots"
          mkdir -p "$screenshots_dir"

          geometry="$(slurp)" || exit 0
          [[ -n "$geometry" ]] || exit 0

          grim -g "$geometry" -t ppm - | satty \
            --filename - \
            --fullscreen \
            --output-filename "$screenshots_dir/$(date +%Y%m%d-%H%M%S).png" \
            --copy-command wl-copy \
            --actions-on-enter save-to-clipboard,save-to-file,exit \
            --actions-on-escape exit
        '';
      };
    in
    {
      home.packages = with pkgs; [
        grim
        satty
        slurp
        screenshotSatty
      ];

      wayland.windowManager.niri.settings.binds."Super+S".spawn = [
        "${screenshotSatty}/bin/screenshot-satty"
      ];
    };
}
