{
  flake.modules.nixos.base = {
    virtualisation.docker.enable = true;
    users.users.jofre.extraGroups = [ "docker" ];
  };

  flake.modules.homeManager.base =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.docker-compose ];
    };
}
