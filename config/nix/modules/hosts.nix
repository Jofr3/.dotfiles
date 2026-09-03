# Turn every module named "hosts/<name>" into nixosConfigurations.<name>.
# A host lives in ./hosts/<name>/ and imports one layer (desktop or server)
# plus whatever hardware modules apply. Flake inputs are reached by closure
# from the flake-parts scope, so there is no specialArgs plumbing.
{
  config,
  inputs,
  lib,
  ...
}:
{
  flake.nixosConfigurations = lib.pipe config.flake.modules.nixos [
    (lib.filterAttrs (name: _: lib.hasPrefix "hosts/" name))
    (lib.mapAttrs' (
      name: module:
      lib.nameValuePair (lib.removePrefix "hosts/" name) (
        inputs.nixpkgs.lib.nixosSystem { modules = [ module ]; }
      )
    ))
  ];
}
