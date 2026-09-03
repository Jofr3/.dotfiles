# GUI applications not tied to a feature file, on top of ../base/packages.nix.
{
  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    {
      home.packages = with pkgs; [
        # cli tools that need hardware
        brightnessctl

        # editors
        vscode

        # apps
        dbeaver-bin
        eog
        gnome-calculator
        gnome-text-editor
        libreoffice
        nautilus
        thunderbird
        wdisplays
        zathura
        pinta
        _1password-gui
        swayimg
        t3code
      ];
    };
}
