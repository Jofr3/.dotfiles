# systemd-oomd runs by default but watches nothing; let it kill the heaviest
# app scope under memory pressure instead of the desktop freezing.
{
  flake.modules.nixos.base.systemd.oomd.enableUserSlices = true;
}
