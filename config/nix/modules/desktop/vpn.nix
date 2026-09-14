{
  flake.modules.homeManager.desktop =
    { config, pkgs, ... }:
    {
      home.packages = with pkgs; [
        openconnect
        openfortivpn
      ];

      sops.secrets.ATEINSA_VPN_PASSWORD = { };
      sops.templates."ateinsa-vpn.conf".content = ''
        host = mail.ateinsa.com
        port = 10443
        username = jscaricaciottoli
        trusted-cert = 99d778754041593273a81f14ba1241a5ec9c665891f1ec9517bc07e1a571d4f9
        password = ${config.sops.placeholder.ATEINSA_VPN_PASSWORD}
      '';

      programs.fish.functions.vpn-ateinsa = ''
        sudo ${pkgs.openfortivpn}/bin/openfortivpn \
          --config "${config.sops.templates."ateinsa-vpn.conf".path}" $argv
      '';
    };
}
