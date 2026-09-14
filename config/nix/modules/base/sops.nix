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
      ageKeyPath = "${config.home.homeDirectory}/.ssh/keys/sops";
      environmentSecrets = [
        "DATABASES"
        "OP_SERVICE_ACCOUNT_TOKEN"
        "FIRECRAWL_API_KEY"
      ];
    in
    {
      imports = [ inputs.sops-nix.homeManagerModules.sops ];

      sops = {
        defaultSopsFile = ../../secrets/secrets.yaml;
        age.sshKeyPaths = [ ageKeyPath ];

        secrets.DATABASES = { };
        secrets.OP_SERVICE_ACCOUNT_TOKEN = { };
        secrets.FIRECRAWL_API_KEY = { };
      };

      # Load only environment secrets; passwords for rendered configs stay in files.
      programs.fish.shellInit = lib.concatMapStringsSep "\n" (name: ''
        if test -r "${config.sops.secrets.${name}.path}"
          set -gx ${name} (cat "${config.sops.secrets.${name}.path}")
        end
      '') environmentSecrets;

      programs.fish.functions.secrets = ''
        # Convert the SSH key for the SOPS CLI, as sops-nix does during activation.
        env -u SOPS_AGE_KEY_FILE SOPS_AGE_KEY=(${lib.getExe pkgs.ssh-to-age} -private-key -i "${ageKeyPath}") \
          ${lib.getExe pkgs.sops} $argv "${config.home.homeDirectory}/.dotfiles/config/nix/secrets/secrets.yaml"
      '';
    };
}
