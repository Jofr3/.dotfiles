{ inputs, ... }:
{
  flake.modules.homeManager.base =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      dotfiles = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles";
      source = inputs.pi.outPath;
      packageJson = builtins.fromJSON (
        builtins.readFile (source + "/packages/coding-agent/package.json")
      );
      modelCatalogPin = builtins.fromJSON (builtins.readFile (source + "/nix/model-catalog.json"));
      modelCatalog = pkgs.fetchurl {
        name = "pi-model-catalog.json";
        url = "https://pi.dev/api/models/revisions/${modelCatalogPin.revision}?types=chat,image,classifier";
        sha256 = lib.removePrefix "sha256-" modelCatalogPin.revision;
      };

      # Pi Durable's coding-agent TUI is currently an experimental, source-only
      # entry point. Keep it on the same pinned source revision as the regular
      # Pi package and run it with Node's native TypeScript support.
      piDurable = pkgs.stdenv.mkDerivation {
        pname = "pi-durable";
        inherit (packageJson) version;
        src = source;

        npmDeps = pkgs.importNpmLock { npmRoot = source; };
        npmRebuildFlags = [ "--ignore-scripts" ];

        nativeBuildInputs = [
          pkgs.nodejs_22
          pkgs.importNpmLock.npmConfigHook
          pkgs.makeWrapper
        ]
        ++ lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];

        buildInputs = [
          pkgs.nodejs_22
        ]
        ++ lib.optionals pkgs.stdenv.hostPlatform.isLinux [
          pkgs.stdenv.cc.cc.lib
          pkgs.libxcb
        ];

        buildPhase = ''
          runHook preBuild

          node packages/ai/scripts/hydrate-model-catalog.ts ${modelCatalog}

          # Retain only the workspaces and production dependencies used by the
          # durable coding-agent entry point.
          node <<'EOF'
          const fs = require("node:fs");
          const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
          manifest.workspaces = [
            "packages/chord",
            "packages/telemetry",
            "packages/codemode",
            "packages/mcp",
            "packages/ai",
            "packages/durable",
            "packages/agent",
            "packages/tui",
            "packages/coding-agent"
          ];
          fs.writeFileSync("package.json", JSON.stringify(manifest));
          EOF
          npm prune --omit=dev --ignore-scripts --offline

          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall

          mkdir -p "$out/lib/pi-durable" "$out/bin"
          cp package.json tsconfig.json tsconfig.base.json "$out/lib/pi-durable/"
          cp -R packages node_modules "$out/lib/pi-durable/"

          makeWrapper ${pkgs.nodejs_22}/bin/node "$out/bin/pi-durable" \
            --add-flags "--import $out/lib/pi-durable/packages/coding-agent/src/experimental/source-resolver.ts" \
            --add-flags "$out/lib/pi-durable/packages/coding-agent/src/experimental/durable/main.ts" \
            --prefix PATH : ${
              lib.makeBinPath (
                [
                  pkgs.nodejs_22
                  pkgs.fd
                  pkgs.ripgrep
                ]
                ++ lib.optionals pkgs.stdenv.hostPlatform.isLinux [
                  pkgs.wl-clipboard
                  pkgs.xclip
                ]
              )
            }

          runHook postInstall
        '';

        dontStrip = true;

        doInstallCheck = true;
        installCheckPhase = ''
          runHook preInstallCheck
          cd "$out/lib/pi-durable"
          ${pkgs.nodejs_22}/bin/node \
            --import ./packages/coding-agent/src/experimental/source-resolver.ts \
            -e "await import('./packages/coding-agent/src/experimental/durable/runtime.ts')"
          runHook postInstallCheck
        '';

        meta = {
          description = "Experimental durable Pi coding-agent TUI";
          homepage = "https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/experimental/durable";
          license = lib.licenses.mit;
          mainProgram = "pi-durable";
          platforms = lib.platforms.unix;
        };
      };
    in
    {
      home.packages = [
        inputs.pi.packages.${pkgs.stdenv.hostPlatform.system}.pi
        piDurable
      ];

      # Pi and Pi Durable share settings, credentials, skills, and themes.
      # Durable sessions are stored below agent/experimental/durable-sessions.
      home.file.".pi".source = "${dotfiles}/config/pi";
    };
}
