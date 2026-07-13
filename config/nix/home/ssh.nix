{ config, ... }:
let sshKeyPath = "${config.home.homeDirectory}/.ssh/keys/jofre_key.pem";
in {
  programs.ssh = {
    enable = true;
    enableDefaultConfig = false;

    settings = {
      "*" = {
        ControlMaster = "auto";
        ControlPath = "~/.ssh/control-%C";
        ControlPersist = "10m";
        ServerAliveInterval = 60;
        ServerAliveCountMax = 3;
        Compression = true;
        TCPKeepAlive = true;
        ForwardX11 = false;
      };

      myclientum = {
        HostName = "dev.myclientum.com";
        User = "dev_myclientum_com";
        IdentityFile = sshKeyPath;
      };

      aicoweb = {
        HostName = "13.38.219.45";
        User = "aicoweb_com";
        IdentityFile = sshKeyPath;
      };

      admin = {
        HostName = "13.36.131.255";
        User = "dev_admin_lasevaweb_com";
        IdentityFile = sshKeyPath;
      };

      tacprod = {
        HostName = "dev2.tacprod.cat";
        User = "dev_tacprod_cat";
        IdentityFile = sshKeyPath;
      };

      vicfires = {
        HostName = "ec2-15-188-172-200.eu-west-3.compute.amazonaws.com";
        User = "dev_vicfires_cat";
        IdentityFile = sshKeyPath;
      };

      myproductium = {
        HostName = "ec2-13-36-131-255.eu-west-3.compute.amazonaws.com";
        User = "dev_myproductium_com";
        IdentityFile = sshKeyPath;
      };

      memoria_mancoplana = {
        HostName = "13.36.114.143";
        User = "pam_mancoplana_cat";
        IdentityFile = sshKeyPath;
      };

      gestio_mancoplana = {
        HostName = "13.36.114.143";
        User = "gestio_mancoplana_cat";
        IdentityFile = sshKeyPath;
      };

      garden_tona = {
        HostName = "devgarden.lasevaweb.com";
        User = "devgarden_lasevaweb_com";
        IdentityFile = sshKeyPath;
      };

      vivelloc = {
        HostName = "ous.vivelloc.cat";
        User = "ous_vivelloc_cat";
        IdentityFile = sshKeyPath;
      };

      ateinsa = {
        HostName = "appserver.ateinsa.com";
        User = "ateinsa";
      };

      beques = {
        HostName = "13.36.114.143";
        User = "dev-beques_ccosona_cat";
        IdentityFile = sshKeyPath;
      };

      renovacions = {
        HostName = "ec2-13-36-114-143.eu-west-3.compute.amazonaws.com";
        User = "dev_renovacions_ccosona_cat";
        IdentityFile = sshKeyPath;
      };

      ayudas = {
        HostName = "15.237.131.24";
        User = "ayudas_asetconsultoria_com";
        IdentityFile = sshKeyPath;
      };
    };
  };
}
