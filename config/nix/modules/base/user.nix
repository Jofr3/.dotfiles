# The single user on every machine. Feature files add the groups they need
# (docker, networkmanager, audio, ...) next to the feature itself.
{
  flake.modules.nixos.base.users.users.jofre = {
    isNormalUser = true;
    initialPassword = "1234";
    extraGroups = [ "wheel" ];
  };

  flake.modules.homeManager.base.home = {
    username = "jofre";
    homeDirectory = "/home/jofre";
  };
}
