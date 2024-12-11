{ ... }:
{
  programs.nixvim = {
    globals.mapleader = " ";
    globalOpts = {
      number = true;
      relativenumber = true;
      undofile = true;
      ignorecase = true;
      smartcase = true;
      signcolumn = "yes";
      splitright = true;
      splitbelow = true;
      list = false;
      inccommand = "split";
      scrolloff = 10;
      hlsearch = true;
      statusline = " %{expand('%:~:.')} %m";
      tabstop = 4;
      softtabstop = 4;
      shiftwidth = 4;
      expandtab = true;
      smartindent = true;
      autoindent = true;
      wrap = false;
      pumheight = 15;
    };
  };
}
