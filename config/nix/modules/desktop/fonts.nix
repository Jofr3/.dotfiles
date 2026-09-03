{
  flake.modules.nixos.desktop =
    { pkgs, ... }:
    {
      fonts.packages = with pkgs; [ nerd-fonts.fira-code ];
    };
}
