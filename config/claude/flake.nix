{
  description = "Claude Code configuration and development environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };

      agent-browser = pkgs.stdenv.mkDerivation rec {
        pname = "agent-browser";
        version = "0.22.3";

        src = pkgs.fetchurl {
          url = "https://registry.npmjs.org/${pname}/-/${pname}-${version}.tgz";
          hash = "sha256-hzHQ+yqoVpe+7tsxDnBrS3tmJk0aVQ80yCQGT5Il6Wk=";
        };

        sourceRoot = ".";

        nativeBuildInputs = [ pkgs.autoPatchelfHook ];
        buildInputs = [ pkgs.stdenv.cc.cc.lib ];

        dontBuild = true;

        installPhase = ''
          mkdir -p $out/bin
          cp package/bin/agent-browser-linux-x64 $out/bin/agent-browser
          chmod +x $out/bin/agent-browser
        '';
      };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          claude-code
          mcp-nixos
          bun
          jq
          git
          agent-browser
        ];
      };
    };
}
