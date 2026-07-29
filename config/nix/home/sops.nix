{ inputs, config, ... }: {
  imports = [ inputs.sops-nix.homeManagerModules.sops ];

  sops = {
    defaultSopsFile = ../secrets/secrets.yaml;
    age.sshKeyPaths = [ "${config.home.homeDirectory}/.ssh/keys/sops" ];

    secrets.DATABASES = { };
    secrets.OP_SERVICE_ACCOUNT_TOKEN = { };
  };
}
