{ config, ... }:
let sshKeyPath = "${config.home.homeDirectory}/.ssh/keys/jofre_key.pem";
in {
  programs.ssh = {
    enable = true;
    enableDefaultConfig = false;

    matchBlocks = {
      "*" = {
        controlMaster = "auto";
        controlPath = "~/.ssh/control-%C";
        controlPersist = "10m";
        serverAliveInterval = 60;
        serverAliveCountMax = 3;
        compression = true;
        extraOptions = {
          TCPKeepAlive = "yes";
          IPQoS = "throughput";
          ForwardX11 = "no";
        };
      };

      myclientum = {
        hostname = "dev.myclientum.com";
        user = "dev_myclientum_com";
        identityFile = sshKeyPath;
      };

      aicoweb = {
        hostname = "13.38.219.45";
        user = "aicoweb_com";
        identityFile = sshKeyPath;
      };

      admin = {
        hostname = "13.36.131.255";
        user = "dev_admin_lasevaweb_com";
        identityFile = sshKeyPath;
      };

      tacprod = {
        hostname = "dev2.tacprod.cat";
        user = "dev_tacprod_cat";
        identityFile = sshKeyPath;
      };

      vicfires = {
        hostname = "ec2-15-188-172-200.eu-west-3.compute.amazonaws.com";
        user = "dev_vicfires_cat";
        identityFile = sshKeyPath;
      };

      myproductium = {
        hostname = "ec2-13-36-131-255.eu-west-3.compute.amazonaws.com";
        user = "dev_myproductium_com";
        identityFile = sshKeyPath;
      };

      memoria_mancoplana = {
        hostname = "13.36.114.143";
        user = "pam_mancoplana_cat";
        identityFile = sshKeyPath;
      };

      gestio_mancoplana = {
        hostname = "13.36.114.143";
        user = "gestio_mancoplana_cat";
        identityFile = sshKeyPath;
      };

      garden_tona = {
        hostname = "devgarden.lasevaweb.com";
        user = "devgarden_lasevaweb_com";
        identityFile = sshKeyPath;
      };

      ateinsa = {
        hostname = "appserver.ateinsa.com";
        user = "ateinsa";
      };

      beques = {
        hostname = "13.36.114.143";
        user = "dev-beques_ccosona_cat";
        identityFile = sshKeyPath;
      };

      renovacions = {
        hostname = "ec2-13-36-114-143.eu-west-3.compute.amazonaws.com";
        user = "dev_renovacions_ccosona_cat";
        identityFile = sshKeyPath;
      };
    };
  };
}
