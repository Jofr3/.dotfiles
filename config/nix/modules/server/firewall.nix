# No NetworkManager on a headless box; per-machine addressing lives in
# ../hosts/<name>/network.nix. The tailnet rules are in ../base/tailscale.nix.
{
  flake.modules.nixos.server.networking.firewall = {
    enable = true;
    # Port 22 is open on the LAN only; nothing here is reachable from the
    # internet. Remote access goes over the tailnet.
    allowedTCPPorts = [ 22 ];
  };
}
