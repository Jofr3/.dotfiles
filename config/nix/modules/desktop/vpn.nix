{
  flake.modules.homeManager.desktop =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      # Decrypted by base/secrets.nix.
      secretsDir = "${config.xdg.stateHome}/secrets";
      ateinsaConfig = "${secretsDir}/ateinsa-vpn.conf";
    in
    {
      home.packages = with pkgs; [
        openconnect
        openfortivpn
      ];

      home.activation.ateinsaVpn = lib.hm.dag.entryAfter [ "secrets" ] ''
        if [ -r "${secretsDir}/ATEINSA_VPN_PASSWORD" ]; then
          (umask 077 && cat >"${ateinsaConfig}" <<EOF
        host = mail.ateinsa.com
        port = 10443
        username = jscaricaciottoli
        trusted-cert = 99d778754041593273a81f14ba1241a5ec9c665891f1ec9517bc07e1a571d4f9
        password = $(cat "${secretsDir}/ATEINSA_VPN_PASSWORD")
        EOF
          )
        fi
      '';

      programs.fish.functions.vpn-ateinsa = ''
        sudo ${pkgs.openfortivpn}/bin/openfortivpn --config "${ateinsaConfig}" $argv
      '';

      programs.fish.functions.vpn-lsw = ''
        sudo ${pkgs.openconnect}/bin/openconnect \
          -b vpn.lasevaweb.com:8443 --user=jofre --passwd-on-stdin $argv \
          < "${secretsDir}/LSW_VPN_PASSWORD"
      '';
    };
}
