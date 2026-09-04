{
  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    {
      programs.emacs = {
        enable = false;
        package = pkgs.emacs-pgtk;
      };
      services.emacs.enable = false;
    };
}
