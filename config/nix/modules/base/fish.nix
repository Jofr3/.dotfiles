{
  flake.modules.nixos.base =
    { pkgs, ... }:
    {
      programs.fish.enable = true;
      users.users.jofre.shell = pkgs.fish;
    };

  flake.modules.homeManager.base =
    { config, lib, ... }:
    {
      home.sessionVariables = {
        EDITOR = "nvim";
        SHELL = lib.getExe config.programs.fish.package;
        XDG_CONFIG_HOME = config.xdg.configHome;
        PI_ONEPASSWORD_DESKTOP_ACCOUNT = "Jofre Scaricaciottoli Sirvent";
      };
      home.sessionPath = [ "${config.home.homeDirectory}/.cargo/bin" ];

      programs.fish = {
        enable = true;
        shellInit = ''
          set -g fish_greeting
          set -g fish_prompt_pwd_dir_length 0
          set -g fish_history_ignore exit ls history clear ff nvim nr hr cc cd
          set -g fish_autosuggestion_enabled 0
        '';

        shellAliases = {
          n = "nvim";
          ff = "fastfetch";
          b = "btop";
          bcc = "npx -y @anthropic-ai/claude-code --chrome";
          bpi = "bunx @mariozechner/pi-coding-agent";
          cc = "claude";
          ".." = "cd ..";
          sd = "shutdown now";
          rb = "sudo reboot now";
          p = "sudo lsof -i -P -n";
          nd = "nix develop";
          nr = "sudo nixos-rebuild switch --flake ${config.home.homeDirectory}/.dotfiles/config/nix/.";
          ls = "exa --icons --group-directories-first";
          lt = "exa --tree --level=4 --icons --group-directories-first";
          grep = "grep --color='auto'";
        };

        functions = {
          fish_prompt = ''
            echo "" (set_color cyan)(prompt_pwd) (set_color green)'* '
          '';
          fish_mode_prompt = "";
          fish_user_key_bindings = ''
            bind \ef super-cd
          '';
          super-cd = ''
            set -l selected_dir (
              begin
                fd --type d --max-depth 1 --min-depth 1 . ~/lsw/ ~/projects/ ~/.dotfiles/config/
                printf "%s\n" \
                  "~/.config" \
                  "~/.dotfiles" \
                  "~/.dotfiles/scripts" \
                  "~/notes/"
              end | string replace -- "$HOME" "~" | fzf
            )

            test -n "$selected_dir" && cd (string replace '~' "$HOME" "$selected_dir") && commandline -f repaint
          '';
        };
      };
    };

  # Headless hosts do not load Stylix; keep the existing Fish syntax colors.
  flake.modules.homeManager.server.programs.fish.shellInit = ''
    set -g fish_color_autosuggestion 6e6a86
    set -g fish_color_cancel -r
    set -g fish_color_command green
    set -g fish_color_comment 6e6a86
    set -g fish_color_cwd green
    set -g fish_color_cwd_root red
    set -g fish_color_end brblack
    set -g fish_color_error red
    set -g fish_color_escape yellow
    set -g fish_color_history_current --bold
    set -g fish_color_host normal
    set -g fish_color_match --background=brblue
    set -g fish_color_normal normal
    set -g fish_color_operator blue
    set -g fish_color_param 908caa
    set -g fish_color_quote yellow
    set -g fish_color_redirection cyan
    set -g fish_color_search_match bryellow --background=393552
    set -g fish_color_selection white --bold --background=393552
    set -g fish_color_status red
    set -g fish_color_user brgreen
    set -g fish_color_valid_path --underline
    set -g fish_pager_color_completion normal
    set -g fish_pager_color_description yellow --dim
    set -g fish_pager_color_prefix white --bold
    set -g fish_pager_color_progress brwhite --background=cyan
  '';
}
