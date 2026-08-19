# Static addressing for jofre-server. The box hands out its own services on
# this address, so it must not move when the router's lease table does.
# Reserve 192.168.1.138 on the router too, or exclude it from the DHCP pool.
{
  networking = {
    useDHCP = false;

    interfaces.enp0s31f6 = {
      useDHCP = false;
      ipv4.addresses = [
        {
          address = "192.168.1.138";
          prefixLength = 24;
        }
      ];
    };

    defaultGateway = {
      address = "192.168.1.1";
      interface = "enp0s31f6";
    };

    # DHCP used to supply these; with DHCP off they have to be declared.
    nameservers = [
      "45.15.139.151"
      "45.15.139.152"
      "1.1.1.1"
    ];
  };
}
