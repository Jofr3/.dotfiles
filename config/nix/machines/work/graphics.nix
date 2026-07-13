{ pkgs, ... }: {
  services.xserver.videoDrivers = [ "modesetting" ];

  hardware.graphics = {
    enable = true;
    extraPackages = with pkgs; [
      intel-media-driver
      libvdpau-va-gl
    ];
  };

  environment.systemPackages = with pkgs; [ intel-gpu-tools ];
}
