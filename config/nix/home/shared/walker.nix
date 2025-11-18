{ inputs, ... }: {
  imports = [ inputs.walker.homeManagerModules.default ];

  programs.walker = {
    enable = true;
    runAsService = true;

    config = {
      force_keyboard_focus = true;
      disable_mouse = true;
      hide_quick_activation = true;
      hide_action_hints = true;
      theme = "default";

      placeholders."default" = {
        input = "";
        list = "";
      };

      keybinds = {
        close = [ "Escape" "alt q" ];
        next = [ "Down" "alt j" ];
        previous = [ "Up" "alt k" ];
        resume_last_query = [ "space" ];
        page_down = [ "ctrl d" ];
        page_up = [ "ctrl u" ];
      };

      providers = {
        default = [ "desktopapplications" ];
        clipboard = { time_format = "%d/%m %H:%M"; };
      };
    };
  };
}
