# Keep the store from growing without bound on a machine nobody looks at.
{
  flake.modules.nixos.server.nix = {
    gc = {
      automatic = true;
      dates = "weekly";
      options = "--delete-older-than 30d";
    };
    optimise = {
      automatic = true;
      dates = [ "weekly" ];
    };
  };
}
