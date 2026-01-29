{ config, pkgs, ... }: {
  imports = [
    ../home/shared/bash.nix
    ../home/shared/configs.nix
    ../home/shared/hyprland.nix
    ../home/shared/packages.nix
    ../home/shared/ssh.nix
    ../home/shared/stylix.nix
  ];

  home = {
    username = "jofre";
    homeDirectory = "/home/jofre";
    stateVersion = "25.05";
    enableNixpkgsReleaseCheck = false;

    packages = with pkgs; [ bruno-cli helix fzy onlyoffice-desktopeditors uv ];

    sessionVariables = {
      FZF_DEFAULT_OPTS = "--color=bg+:#2a273f,bg:#232136,spinner:#eb6f92,hl:#c4a7e7,fg:#e0def4,header:#908caa,info:#9ccfd8,pointer:#eb6f92,marker:#ea9a97,fg+:#e0def4,prompt:#f6c177,hl+:#c4a7e7";
    };
  };

  programs.home-manager.enable = true;

  gtk = {
    enable = true;
    iconTheme = {
      name = "Adwaita";
      package = pkgs.adwaita-icon-theme;
    };
  };

  xdg.mimeApps = {
    enable = true;
    defaultApplications = {
      # Browser
      "text/html" = "google-chrome.desktop";
      "x-scheme-handler/http" = "google-chrome.desktop";
      "x-scheme-handler/https" = "google-chrome.desktop";
      "x-scheme-handler/about" = "google-chrome.desktop";
      "x-scheme-handler/unknown" = "google-chrome.desktop";

      # File manager
      "inode/directory" = "org.gnome.Nautilus.desktop";

      # PDF viewer
      "application/pdf" = "org.pwmt.zathura.desktop";

      # Image viewer
      "image/jpeg" = "org.gnome.eog.desktop";
      "image/png" = "org.gnome.eog.desktop";
      "image/gif" = "org.gnome.eog.desktop";
      "image/webp" = "org.gnome.eog.desktop";
      "image/svg+xml" = "org.gnome.eog.desktop";
      "image/bmp" = "org.gnome.eog.desktop";
      "image/tiff" = "org.gnome.eog.desktop";

      # Text editor
      "text/plain" = "org.gnome.TextEditor.desktop";
      "text/x-csrc" = "org.gnome.TextEditor.desktop";
      "text/x-chdr" = "org.gnome.TextEditor.desktop";
      "text/x-c++src" = "org.gnome.TextEditor.desktop";
      "text/x-c++hdr" = "org.gnome.TextEditor.desktop";
      "text/x-python" = "org.gnome.TextEditor.desktop";
      "text/x-java" = "org.gnome.TextEditor.desktop";
      "text/x-shellscript" = "org.gnome.TextEditor.desktop";
      "text/x-script.python" = "org.gnome.TextEditor.desktop";
      "text/markdown" = "org.gnome.TextEditor.desktop";
      "text/x-markdown" = "org.gnome.TextEditor.desktop";
      "text/xml" = "org.gnome.TextEditor.desktop";
      "text/css" = "org.gnome.TextEditor.desktop";
      "text/x-log" = "org.gnome.TextEditor.desktop";
      "application/json" = "org.gnome.TextEditor.desktop";
      "application/xml" = "org.gnome.TextEditor.desktop";
      "application/javascript" = "org.gnome.TextEditor.desktop";
      "application/x-shellscript" = "org.gnome.TextEditor.desktop";
    };
  };

  # services = {
  #   emacs = {
  #     enable = true;
  #     client.enable = true;
  #     startWithUserSession = "graphical";
  #   };
  # };

  systemd.user.startServices = "sd-switch";
}
