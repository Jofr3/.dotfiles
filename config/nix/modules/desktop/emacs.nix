{
  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    {
      programs.emacs = {
        enable = true;
        package = pkgs.emacs-pgtk;
      };
      services.emacs.enable = true;
    };
}
