# Compressed swap in RAM on every machine. Higher priority than any disk swap,
# which stays as overflow.
{
  flake.modules.nixos.base.zramSwap = {
    enable = true;
    memoryPercent = 50;
  };
}
