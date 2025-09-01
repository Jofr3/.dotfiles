{ config, ... }: {

  programs = {
    ssh = {
      enable = true;

      controlMaster = "auto";
      controlPath = "~/.ssh/control-%r@%h:%p";
      controlPersist = "10m";

      matchBlocks = {
        "myclientum" = {
          hostname = "dev.myclientum.com";
          user = "dev_myclientum_com";
          port = 22;
          identityFile = "~/.ssh/keys/jofre_key.pem";
        };

        "aicoweb" = {
          hostname = "13.38.219.45";
          user = "aicoweb_com";
          port = 22;
          identityFile = "~/.ssh/keys/jofre_key.pem";
        };

        "admin" = {
          hostname = "13.36.131.255";
          user = "dev_admin_lasevaweb_com";
          port = 22;
          identityFile = "~/.ssh/keys/jofre_key.pem";
        };

        "tacprod" = {
          hostname = "dev2.tacprod.cat";
          user = "dev_tacprod_cat";
          port = 22;
          identityFile = "~/.ssh/keys/jofre_key.pem";
        };

        "vicfires" = {
          hostname = "ec2-15-188-172-200.eu-west-3.compute.amazonaws.com";
          user = "dev_vicfires_cat";
          port = 22;
          identityFile = "~/.ssh/keys/jofre_key.pem";
        };

        "myproductium" = {
          hostname = "ec2-13-36-131-255.eu-west-3.compute.amazonaws.com";
          user = "dev_myproductium_com";
          port = 22;
          identityFile = "~/.ssh/keys/jofre_key.pem";
        };

        "memoria_mancoplana" = {
          hostname = "13.36.114.143";
          user = "pam_mancoplana_cat";
          port = 22;
          identityFile = "~/.ssh/keys/jofre_key.pem";
        };

        "gestio_mancoplana" = {
          hostname = "13.36.114.143";
          user = "gestio_mancoplana_cat";
          port = 22;
          identityFile = "~/.ssh/keys/jofre_key.pem";
        };
      };
    };
  };
}
