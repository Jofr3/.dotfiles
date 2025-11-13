{ config, pkgs, ... }: {
  services.xserver.videoDrivers = [ "nvidia" ];

  hardware.nvidia = {
    modesetting.enable = true;
    powerManagement.enable = false;
    powerManagement.finegrained = false;
    open = false;
    nvidiaSettings = true;
    package = config.boot.kernelPackages.nvidiaPackages.stable;
  };

  # Enable OpenGL with NVIDIA support
  hardware.graphics = {
    enable = true;
    extraPackages = with pkgs; [ vaapiVdpau libvdpau-va-gl ];
  };
}
