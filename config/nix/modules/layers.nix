# The two roles a machine can have. Both build on `base`; a host imports
# exactly one of them (never `base` directly, so nothing is imported twice).
{ config, ... }:
{
  flake.modules.nixos.desktop.imports = [ config.flake.modules.nixos.base ];
  flake.modules.nixos.server.imports = [ config.flake.modules.nixos.base ];
}
