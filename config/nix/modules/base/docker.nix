{
  flake.modules.nixos.base = {
    virtualisation.docker.enable = false;
    users.users.jofre.extraGroups = [ "docker" ];
  };

  flake.modules.homeManager.base = { pkgs, ... }: {
    home.packages = [ pkgs.docker-compose ];
  };
}
