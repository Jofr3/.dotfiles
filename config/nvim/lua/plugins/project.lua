return {
	"coffebar/neovim-project",
	enabled = true,
	lazy = false,
	dependencies = {
		{ "nvim-lua/plenary.nvim" },
		{ "nvim-telescope/telescope.nvim" },
		{ "Shatur/neovim-session-manager" },
	},
	init = function()
		vim.opt.sessionoptions:append("globals")
	end,
	opts = {
		projects = {
			"~/.dotfiles/config/*",
			"~/nix",
			"~/Dropbox/notes/",
		},
		last_session_on_startup = false,
		picker = {
			type = "telescope",
			preview = true,
		},
	},
	keys = {
		{ mode = "n", "<A-p>", "<cmd>NeovimProjectDiscover<cr>" },
	},
}
