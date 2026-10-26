{
  flake.modules.nixos.gaming = {
    # Also enables 32-bit graphics/audio support for Steam and Proton.
    # AMD uses the host's default Mesa/RADV stack.
    programs.steam.enable = true;
  };
}
