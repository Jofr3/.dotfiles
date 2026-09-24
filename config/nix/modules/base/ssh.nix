# Client side: agent plus the host list. The server side (sshd) lives in
# ../server/openssh.nix.
{
  flake.modules.nixos.base.programs.ssh.startAgent = true;

  flake.modules.homeManager.base =
    { config, ... }:
    let
      sshKeyPath = "${config.home.homeDirectory}/.ssh/keys/jofre_key.pem";
      serverKeyPath = "${config.home.homeDirectory}/.ssh/keys/Jofr3";
      ateinsaKey = "${config.home.homeDirectory}/.ssh/keys/dev2_ateinsa_com_key.pub";
      keyedHost =
        settings:
        settings
        // {
          IdentityFile = sshKeyPath;
          IdentitiesOnly = true;
        };
    in
    {
      programs.fish.interactiveShellInit = ''
        # Only load SSH keys once per session, not in every child shell.
        if not set -q SSH_AGENT_LOADED
          ssh-add ~/.ssh/keys/* > /dev/null 2>&1
          set -gx SSH_AGENT_LOADED 1
        end
      '';

      programs.ssh = {
        enable = true;
        enableDefaultConfig = false;

        settings = {
          "*" = {
            ControlMaster = "auto";
            ControlPath = "~/.ssh/control-%C";
            ControlPersist = "10m";
            ServerAliveInterval = 60;
            Compression = true;
          };

          remote = {
            HostName = "nixos-remote";
            User = "jofre";
            IdentityFile = serverKeyPath;
            IdentitiesOnly = true;
          };

          remote-lan = {
            HostName = "192.168.1.138";
            User = "jofre";
            IdentityFile = serverKeyPath;
            IdentitiesOnly = true;
          };

          dev2_ateinsa = {
            HostName = "dev2.ateinsa.com";
            User = "ateinsa";
            IdentityFile = ateinsaKey;
            IdentitiesOnly = true;
          };

          aicoweb = keyedHost {
            HostName = "13.38.219.45";
            User = "aicoweb_com";
          };

          # Production app server; the dev box is the `ateinsa` project host in sftp.nix.
          ateinsa_appserver = {
            HostName = "appserver.ateinsa.com";
            User = "ateinsa";
          };
        };
      };
    };
}
