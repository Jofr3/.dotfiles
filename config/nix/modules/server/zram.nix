# Compressed swap in RAM -- cheap insurance on a small box.
{
  flake.modules.nixos.server.zramSwap.enable = true;
}
