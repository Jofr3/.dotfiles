vim.g.have_nerd_font = false

vim.opt.number = true
vim.opt.relativenumber = true

vim.opt.mouse = "a"

vim.opt.ignorecase = true
vim.opt.smartcase = true

vim.opt.signcolumn = "yes"

vim.opt.updatetime = 50

vim.opt.timeoutlen = 300

vim.opt.splitright = true
vim.opt.splitbelow = true

vim.opt.inccommand = "split"

vim.opt.breakindent = true

vim.opt.statusline = " %{expand('%:~:.')} %m%=%{get(b:,'gitsigns_head','')} "

vim.opt.tabstop = 2
vim.opt.softtabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true

vim.opt.wrap = false

vim.opt.pumheight = 15

vim.opt.swapfile = false
vim.opt.backup = false
vim.opt.undofile = true

vim.opt.incsearch = true

vim.opt.scrolloff = 10

vim.opt.termguicolors = true

vim.schedule(function()
  vim.opt.clipboard = "unnamedplus"
end)

vim.o.winborder = "single"

vim.opt.shadafile = "NONE"

vim.diagnostic.config({
  virtual_text = false,
  virtual_lines = { current_line = true },
  signs = false,
})

-- temp
-- vim.opt.laststatus = 3

vim.opt.shortmess:append("I")

vim.opt.autoread = true
