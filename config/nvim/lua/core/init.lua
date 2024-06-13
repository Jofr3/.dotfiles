-- Leader key
vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- Nerd fonts
vim.g.have_nerd_font = true

-- Enable relative line numbers
vim.opt.number = true
vim.opt.relativenumber = true

-- Don't show the mode
vim.opt.showmode = false

-- Sync clipboard between OS and Neovim.
vim.opt.clipboard = "unnamedplus"

-- Enable break indent
vim.opt.breakindent = true

-- Save undo history
vim.opt.undofile = true

-- Case-insensitive searching UNLESS \C or one or more capital letters in the search term
vim.opt.ignorecase = true
vim.opt.smartcase = true

-- Keep signcolumn on by default
vim.opt.signcolumn = "yes"

-- Update time
vim.opt.updatetime = 200

-- Mapped sequence wait time
vim.opt.timeoutlen = 400

-- How new splits open
vim.opt.splitright = true
vim.opt.splitbelow = true

-- Whitespace characters
vim.opt.list = false

-- Preview substitutions as you type
vim.opt.inccommand = "split"

-- Minimal number of screen lines to keep above and below the cursor.
vim.opt.scrolloff = 15

-- Set highlight on search
vim.opt.hlsearch = true

-- Status line
vim.opt.statusline = " %{expand('%:~:.')} %m"

-- Tab settings
vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.shiftwidth = 4
vim.opt.expandtab = true

-- Disable wrap
vim.opt.wrap = false

-- Remove welcome message
vim.opt.shortmess = "I"

-- Disable netrw
vim.g.loaded_netrwPlugin = 1
vim.g.loaded_netrw = 1

-- Completition max results
vim.opt.pumheight = 10
