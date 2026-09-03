{
  flake.modules.nixos.desktop = {
    security.rtkit.enable = true;

    services.pipewire = {
      enable = true;
      alsa.enable = true;
      alsa.support32Bit = true;
      pulse.enable = true;
      jack.enable = true;
    };

    users.users.jofre.extraGroups = [ "audio" ];
  };

  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    {
      home.packages = with pkgs; [
        pulseaudio # pactl
        sox
      ];
    };
}
