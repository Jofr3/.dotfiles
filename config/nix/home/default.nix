{ config, pkgs, hostId, ... }: {
  imports = [
    ./configs.nix
    ./hyprland.nix
    ./packages.nix
    ./ssh.nix
  ];

  home = {
    username = "jofre";
    homeDirectory = "/home/jofre";
    stateVersion = "25.05";
    enableNixpkgsReleaseCheck = false;

    sessionVariables = {
      FZF_DEFAULT_OPTS = builtins.concatStringsSep " " [
        "--color=bg+:#2a273f,bg:#232136,spinner:#eb6f92,hl:#c4a7e7"
        "--color=fg:#e0def4,header:#908caa,info:#9ccfd8,pointer:#eb6f92"
        "--color=marker:#ea9a97,fg+:#e0def4,prompt:#f6c177,hl+:#c4a7e7"
        "--border=none"
        "--layout=reverse"
      ];
    };
  };

  programs.home-manager.enable = true;
  programs.bash.enable = true;

  services.emacs = {
    enable = true;
    package = pkgs.emacs-pgtk;
  };

  stylix.enable = true;

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
      "text/html" = "google-chrome.desktop";
      "x-scheme-handler/http" = "google-chrome.desktop";
      "x-scheme-handler/https" = "google-chrome.desktop";
      "x-scheme-handler/about" = "google-chrome.desktop";
      "x-scheme-handler/unknown" = "google-chrome.desktop";
      "inode/directory" = "org.gnome.Nautilus.desktop";
      "application/pdf" = "org.pwmt.zathura.desktop";
      "image/jpeg" = "org.gnome.eog.desktop";
      "image/png" = "org.gnome.eog.desktop";
      "image/gif" = "org.gnome.eog.desktop";
      "image/webp" = "org.gnome.eog.desktop";
      "image/svg+xml" = "org.gnome.eog.desktop";
      "image/bmp" = "org.gnome.eog.desktop";
      "image/tiff" = "org.gnome.eog.desktop";
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

  systemd.user.startServices = "sd-switch";
}
