return {
	"yetone/avante.nvim",
	build = "make",
	event = "VeryLazy",
	version = false,
	opts = {
		mode = "legacy",
		provider = "gemini",
		providers = {
			gemini = {
				model = "gemini-2.5-flash",
				timeout = 30000,
				extra_request_body = {
					temperature = 0.75,
					max_tokens = 20480,
				},
			},
		},
		behaviour = {
			auto_set_highlight_group = false,
			auto_set_keymaps = false,
			enable_token_counting = false,
		},
		prompt_logger = {
			enabled = false,
		},
		hints = { enabled = false },
		windows = {
			width = 40,
			sidebar_header = {
				enabled = false,
			},
			spinner = {
				editing = { "-", "\\", "|", "/" },
				generating = { "-", "\\", "|", "/" },
				thinking = { "-", "\\", "|", "/" },
			},
			ask = {
				start_insert = false,
			},
		},
		selection = {
			enabled = false,
		},
		mappings = {
			submit = {
				normal = "<C-Enter>",
				insert = "<C-Enter>",
			},
			sidebar = {
				add_file = "@",
				close = { "q" },
				close_from_input = { normal = "q" },
			},
		},
	},
	dependencies = {
		"nvim-lua/plenary.nvim",
		"MunifTanjim/nui.nvim",
		"nvim-telescope/telescope.nvim",
	},
	init = function()
		vim.api.nvim_set_hl(0, "AvanteSidebarWinSeparator", { fg = "#504945" })
		vim.api.nvim_set_hl(0, "AvantePromptHint", { fg = "#282828" })
	end,
}
