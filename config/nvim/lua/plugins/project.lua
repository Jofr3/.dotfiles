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
		last_session_on_startup = true,
		picker = {
			type = "telescope",
			preview = false,
		},
	},
	keys = {
		{ mode = "n", "<A-p>", "<cmd>NeovimProjectDiscover<cr>" },
	},
}
