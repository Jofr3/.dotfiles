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
      # Restored from secrets/age-key.age by `nix run .#rebuild`.
      ageKeyPath = "${config.xdg.configHome}/sops/age/keys.txt";
      environmentSecrets = [
        "DATABASES"
        "OP_SERVICE_ACCOUNT_TOKEN"
        "FIRECRAWL_API_KEY"
        "CLOUDFLARE_API_TOKEN"
      ];
    in
    {
      imports = [ inputs.sops-nix.homeManagerModules.sops ];

      sops = {
        defaultSopsFile = ../../secrets/secrets.yaml;
        age.keyFile = ageKeyPath;

        secrets.DATABASES = { };
        secrets.OP_SERVICE_ACCOUNT_TOKEN = { };
        secrets.FIRECRAWL_API_KEY = { };
        secrets.CLOUDFLARE_API_TOKEN = { };
      };

      # Load only environment secrets; passwords for rendered configs stay in files.
      programs.fish.shellInit = lib.concatMapStringsSep "\n" (name: ''
        if test -r "${config.sops.secrets.${name}.path}"
          set -gx ${name} (cat "${config.sops.secrets.${name}.path}")
        end
      '') environmentSecrets;

      programs.fish.functions.secrets = ''
        SOPS_AGE_KEY_FILE="${ageKeyPath}" ${lib.getExe pkgs.sops} $argv "${config.home.homeDirectory}/.dotfiles/config/nix/secrets/secrets.yaml"
      '';
    };
}
