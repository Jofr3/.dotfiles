# Output of `nixos-generate-config` for this machine, wrapped as a module.
# To regenerate: `nixos-generate-config --show-hardware-config` and replace
# the body below.
{
  flake.modules.nixos."hosts/nixos-pc" =
    {
      config,
      lib,
      modulesPath,
      ...
    }:
    {
      imports = [
        (modulesPath + "/installer/scan/not-detected.nix")
      ];

      boot.initrd.availableKernelModules = [
        "nvme"
        "xhci_pci"
        "ahci"
        "usb_storage"
        "usbhid"
        "sd_mod"
      ];
      boot.initrd.kernelModules = [ ];
      boot.kernelModules = [ "kvm-amd" ];
      boot.extraModulePackages = [ ];

      fileSystems."/" = {
        device = "/dev/disk/by-uuid/07e40abd-e2d1-4440-8892-f80222e11a93";
        fsType = "ext4";
      };

      fileSystems."/boot" = {
        device = "/dev/disk/by-uuid/9693-850B";
        fsType = "vfat";
        options = [
          "fmask=0077"
          "dmask=0077"
        ];
      };

      swapDevices = [
        { device = "/dev/disk/by-uuid/3036f1a9-7ece-49af-9a6f-f73d15e6d4d1"; }
      ];

      nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";
      hardware.cpu.amd.updateMicrocode = lib.mkDefault config.hardware.enableRedistributableFirmware;
    };
}
