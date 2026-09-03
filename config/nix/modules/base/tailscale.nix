# Every machine joins the same tailnet, so `ssh jofre@nixos-remote` and
# `http://nixos-remote:5173` work from any network -- no port forwarding, no
# public IP, fine behind CGNAT. Enrol once per machine, by hand, after the
# first rebuild:
#   sudo tailscale up
# The daemon just idles until then, so this is harmless on machines that
# never join.
{
  flake.modules.nixos.base.services.tailscale = {
    enable = true;
    openFirewall = true; # UDP 41641, for direct peer connections instead of relaying
  };

  # Only the server accepts connections *over* the tailnet. Anything arriving
  # there is already authenticated by WireGuard, so it skips the firewall
  # entirely -- that is what makes a dev server on 5173/3000/whatever reachable
  # remotely without punching a hole per port. Desktops only need to reach
  # out; add the same lines under `desktop` to connect *to* one of them.
  flake.modules.nixos.server.networking.firewall = {
    trustedInterfaces = [ "tailscale0" ];

    # Strict reverse-path filtering drops return traffic when this machine
    # routes through an exit node. Harmless otherwise.
    checkReversePath = "loose";
  };
}
