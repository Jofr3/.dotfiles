# GUI applications not tied to a feature file, on top of ../base/packages.nix.
{
  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    {
      home.packages = with pkgs; [
        # editors
        vscode
        herdr-desktop

        # apps
        dbeaver-bin
        gnome-calculator
        # gnome-text-editor
        libreoffice
        nautilus
        thunderbird
        wdisplays
        zathura
        pinta
        bitwarden-desktop
      ];
    };
}
