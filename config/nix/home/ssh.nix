{ config, ... }:
let
  sshKeyPath = "${config.home.homeDirectory}/.ssh/keys/jofre_key.pem";
  keyedHost =
    settings:
    settings
    // {
      IdentityFile = sshKeyPath;
      IdentitiesOnly = true;
    };
in
{
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

      myclientum = keyedHost {
        HostName = "dev.myclientum.com";
        User = "dev_myclientum_com";
      };

      aicoweb = keyedHost {
        HostName = "13.38.219.45";
        User = "aicoweb_com";
      };

      admin = keyedHost {
        HostName = "13.36.131.255";
        User = "dev_admin_lasevaweb_com";
      };

      tacprod = keyedHost {
        HostName = "dev2.tacprod.cat";
        User = "dev_tacprod_cat";
      };

      vicfires = keyedHost {
        HostName = "ec2-15-188-172-200.eu-west-3.compute.amazonaws.com";
        User = "dev_vicfires_cat";
      };

      myproductium = keyedHost {
        HostName = "ec2-13-36-131-255.eu-west-3.compute.amazonaws.com";
        User = "dev_myproductium_com";
      };

      memoria_mancoplana = keyedHost {
        HostName = "13.36.114.143";
        User = "pam_mancoplana_cat";
      };

      gestio_mancoplana = keyedHost {
        HostName = "13.36.114.143";
        User = "gestio_mancoplana_cat";
      };

      garden_tona = keyedHost {
        HostName = "devgarden.lasevaweb.com";
        User = "devgarden_lasevaweb_com";
      };

      vivelloc = keyedHost {
        HostName = "ous.vivelloc.cat";
        User = "ous_vivelloc_cat";
      };

      ateinsa = {
        HostName = "appserver.ateinsa.com";
        User = "ateinsa";
      };

      beques = keyedHost {
        HostName = "13.36.114.143";
        User = "dev-beques_ccosona_cat";
      };

      renovacions = keyedHost {
        HostName = "ec2-13-36-114-143.eu-west-3.compute.amazonaws.com";
        User = "dev_renovacions_ccosona_cat";
      };

      ayudas = keyedHost {
        HostName = "15.237.131.24";
        User = "ayudas_asetconsultoria_com";
      };
    };
  };
}
