{ ... }:
{
  programs.nixvim = {
    plugins = {
      comment = {
        enable = true;
        settings = {
          padding = false;
          ignore = "^$";
        };
      };
    };
  };
}
