{
  flake.modules.nixos.desktop = {
    programs.niri.enable = true;

    # Disable GNOME's SSH agent (pulled in by niri) to avoid conflict with
    # programs.ssh.startAgent.
    services.gnome.gcr-ssh-agent.enable = false;
  };

  flake.modules.homeManager.desktop =
    { config, pkgs, ... }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
    in
    {
      home.packages = [ pkgs.xwayland-satellite ];
      xdg.configFile.niri.source = "${dotfiles}/config/niri";
    };
}
