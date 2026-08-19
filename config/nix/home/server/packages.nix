# Headless extras on top of ../packages.nix.
{ pkgs, ... }: {
  home.packages = with pkgs; [
    dnsutils
    iotop
    ncdu
    tcpdump
  ];
}
