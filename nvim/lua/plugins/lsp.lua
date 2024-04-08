return {
	"neovim/nvim-lspconfig",
	enabled = true,
	config = function()
		local lspconfig = require("lspconfig")

		vim.keymap.set("n", "<space>e", vim.diagnostic.open_float)
		vim.keymap.set("n", "[d", vim.diagnostic.goto_prev)
		vim.keymap.set("n", "]d", vim.diagnostic.goto_next)
		vim.keymap.set("n", "<space>q", vim.diagnostic.setloclist)

		vim.api.nvim_create_autocmd("LspAttach", {
			group = vim.api.nvim_create_augroup("UserLspConfig", {}),
			callback = function(ev)
				local optsL = { buffer = ev.buf }
				vim.keymap.set("n", "<space>ld", vim.lsp.buf.declaration, optsL)
				vim.keymap.set("n", "<space>lf", vim.lsp.buf.definition, optsL)
				vim.keymap.set("n", "<space>lh", vim.lsp.buf.hover, optsL)
				vim.keymap.set("n", "<space>li", vim.lsp.buf.implementation, optsL)
				vim.keymap.set("n", "<space>ls", vim.lsp.buf.signature_help, optsL)
				vim.keymap.set("n", "<space>lt", vim.lsp.buf.type_definition, optsL)
				vim.keymap.set("n", "<space>lr", vim.lsp.buf.rename, optsL)
				vim.keymap.set("n", "<space>la", vim.lsp.buf.code_action, optsL)
				vim.keymap.set("n", "<space>le", vim.lsp.buf.references, optsL)
			end,
		})

		vim.g.lsp_servers = {
			"bashls",
			"html",
			"cssls",
			"tailwindcss",
			"tsserver",
			"jsonls",
			"volar",
			"prismals",
			"lua_ls",
			"dockerls",
			"intelephense",
			"docker_compose_language_service",
		}

		for _, lsp in ipairs(vim.g.lsp_servers) do
			lspconfig[lsp].setup({})
		end
	end,
}
