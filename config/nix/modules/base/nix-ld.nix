# Run unpatched dynamically linked binaries (downloaded toolchains, npm
# native modules, ...).
{
  flake.modules.nixos.base =
    { pkgs, ... }:
    {
      programs.nix-ld = {
        enable = true;
        libraries = with pkgs; [
          stdenv.cc.cc.lib
          zlib
        ];
      };
    };
}
