vim.g.mapleader = " "

vim.opt.nu = true
vim.opt.relativenumber = true
vim.opt.scrolloff = 8

vim.opt.wrap = false

vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.shiftwidth = 4
vim.opt.expandtab = true

vim.opt.smartindent = true

vim.opt.swapfile = false
vim.opt.backup = false
vim.opt.undodir = os.getenv("HOME") .. "/.vim/undodir"
vim.opt.undofile = true

vim.opt.hlsearch = true
vim.opt.incsearch = true
vim.opt.ignorecase = true

vim.opt.termguicolors = true

vim.opt.signcolumn = "no"

vim.opt.updatetime = 50

vim.opt.mouse = "a"

vim.opt.clipboard = "unnamedplus"

vim.opt.splitbelow = true
vim.opt.splitright = true

vim.opt.pumheight = 10
vim.opt.hidden = true
vim.opt.showmode = false

-- vim.g.netrw_banner = 0
-- vim.g.netrw_browse_split = 0
vim.g.loaded_netrwPlugin = 1
vim.g.loaded_netrw = 1

vim.opt.statusline = " %{expand('%:~:.')} %m"

vim.o.foldtext = [[substitute(getline(v:foldstart),'\\t',repeat('\ ',&tabstop),'g').' ... '.trim(getline(v:foldend))]]
vim.opt.fillchars = { fold = " " }
vim.opt.foldenable = true
