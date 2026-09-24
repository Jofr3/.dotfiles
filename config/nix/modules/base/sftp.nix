# One SSH host per work project in ~/lsw, named after the project directory and
# mirroring the host/user/key in its .vscode/sftp.json. Projects on plain FTP
# (arete, ccbergueda, concurs_formatges_lactium, gesame, petit_mon_ecologic,
# visat) have no SSH access and are left out.
{
  flake.modules.homeManager.base =
    { config, lib, ... }:
    let
      keys = "${config.home.homeDirectory}/.ssh/keys";
      lswKey = "${keys}/jofre_key.pem";

      # key = null: authenticate through the agent (bitwarden) or by password.
      projects = {
        admin = {
          host = "13.36.131.255";
          user = "dev_admin_lasevaweb_com";
        };
        ateinsa = {
          host = "dev.ateinsa.com";
          user = "ateinsa";
          key = null;
        };
        ateinsa_new = {
          host = "dev2.ateinsa.com";
          user = "dev2_ateinsa_com";
          key = "${keys}/dev2_ateinsa_com_key.pem";
        };
        ayudas = {
          host = "15.237.131.241";
          user = "ayudas_asetconsultoria_com";
        };
        beques = {
          host = "13.36.114.143";
          user = "dev-beques_ccosona_cat";
          key = null;
        };
        compartium = {
          host = "app.compartium.cat";
          user = "app_compartium_cat";
        };
        exportbdns = {
          host = "exportbdns.cat";
          user = "exportbdns_cat";
        };
        gardentona = {
          host = "devgarden.lasevaweb.com";
          user = "devgarden_lasevaweb_com";
        };
        gestio_mancoplana = {
          host = "13.36.114.143";
          user = "gestio_mancoplana_cat";
        };
        inscritum = {
          host = "ec2-13-36-131-255.eu-west-3.compute.amazonaws.com";
          user = "dev_inscritum_com";
        };
        intranet = {
          host = "intranet.ccosona.cat";
          user = "intranet_ccosona_cat";
          key = null;
        };
        memoria_mancoplana = {
          host = "13.36.114.143";
          user = "pam_mancoplana_cat";
        };
        myclientum = {
          host = "dev.myclientum.com";
          user = "dev_myclientum_com";
        };
        mydocumentium_api = {
          host = "devapi896623.mydocumentium.com";
          user = "devapi_mydocumentium_com";
        };
        myproductium = {
          host = "ec2-13-36-131-255.eu-west-3.compute.amazonaws.com";
          user = "dev_myproductium_com";
        };
        renovacions = {
          host = "ec2-13-36-114-143.eu-west-3.compute.amazonaws.com";
          user = "dev_renovacions_ccosona_cat";
        };
        senditum = {
          host = "dev.senditum.cat";
          user = "dev_senditum_cat";
        };
        tacprod = {
          host = "dev2.tacprod.cat";
          user = "dev_tacprod_cat";
        };
        targecopy = {
          host = "dev.virtual.targecopy.com";
          user = "dev_virtual_targecopy_com";
        };
        vicfires = {
          host = "ec2-15-188-172-200.eu-west-3.compute.amazonaws.com";
          user = "dev_vicfires_cat";
        };
        vivelloc = {
          host = "ous.vivelloc.cat";
          user = "ous_vivelloc_cat";
        };
      };

      toHost =
        {
          host,
          user,
          key ? lswKey,
        }:
        {
          HostName = host;
          User = user;
        }
        // lib.optionalAttrs (key != null) {
          IdentityFile = key;
          IdentitiesOnly = true;
        };
    in
    {
      programs.ssh.settings = lib.mapAttrs (_: toHost) projects;
    };
}
