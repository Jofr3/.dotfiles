{
  flake.modules.nixos.amdgpu = {
    services.xserver.videoDrivers = [ "amdgpu" ];

    hardware.graphics = {
      enable = true;
    };
  };
}
