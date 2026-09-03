# Top-level flake-parts setup. Everything else under modules/ writes into
# flake.modules.<class>.<name> (declared by flakeModules.modules) or into
# flake.nixosConfigurations (see ./hosts.nix).
{ inputs, ... }:
{
  imports = [ inputs.flake-parts.flakeModules.modules ];

  systems = [ "x86_64-linux" ];

  perSystem =
    { pkgs, ... }:
    {
      formatter = pkgs.nixfmt;
    };
}
