# Home-manager for graphical workstations.
{ pkgs, ... }: {
  imports = [
    ../common.nix
    ./configs.nix
    ./packages.nix
    ./mime.nix
  ];

  programs.emacs = {
    enable = true;
    package = pkgs.emacs-pgtk;
  };
  services.emacs.enable = true;

  services.wlsunset = {
    enable = true;
    sunrise = "00:00";
    sunset = "00:01";
    temperature = {
      day = 4501;
      night = 4500;
    };
  };

  home.pointerCursor.enable = true;

  gtk = {
    enable = true;
    iconTheme = {
      name = "Adwaita";
      package = pkgs.adwaita-icon-theme;
    };
  };
}
