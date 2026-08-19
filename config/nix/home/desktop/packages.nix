# GUI applications and anything that needs a session, on top of ../packages.nix.
{ pkgs, ... }: {
  home.packages = with pkgs; [
    # cli tools that need hardware or a browser
    brightnessctl
    pulseaudio
    sox
    agent-browser

    # editors
    vscode

    # terminals
    foot
    kitty

    # browsers
    chromium
    google-chrome

    # apps
    dbeaver-bin
    eog
    gnome-calculator
    gnome-text-editor
    libreoffice
    nautilus
    overskride
    thunderbird
    wdisplays
    zathura
    pinta
    _1password-gui
    swayimg
    t3code

    # wayland utilities
    cliphist
    grim
    satty
    slurp
    swaybg
    wl-clipboard
    wl-color-picker
    wtype
    xwayland-satellite

    # vpn
    openconnect
    openfortivpn
  ];
}
