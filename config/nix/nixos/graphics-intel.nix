{ pkgs, ... }: {
  # Intel Iris Xe graphics configuration
  services.xserver.videoDrivers = [ "modesetting" ];

  hardware.graphics = {
    enable = true;
    extraPackages = with pkgs; [
      intel-media-driver
      intel-vaapi-driver
      libvdpau-va-gl
    ];
  };

  # Enable Intel GPU tools
  environment.systemPackages = with pkgs; [ intel-gpu-tools ];
}
