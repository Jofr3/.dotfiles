{ ... }:
{
  programs.nixvim = {
    autoCmd = [
      {
        event = [ "FileType" ];
        pattern = [ "oil" ];
        callback = {
          __raw = "function() vim.opt_local.number = false vim.opt_local.relativenumber = false end";
        };
      }
    ];
  };
}
