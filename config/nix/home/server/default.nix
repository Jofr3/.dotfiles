# Home-manager for headless machines.
{ ... }: {
  imports = [
    ../common.nix
    ./packages.nix
  ];
}
