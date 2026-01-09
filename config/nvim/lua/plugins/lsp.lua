return {
  "neovim/nvim-lspconfig",
  enabled = true,
  lazy = false,
  init = function()
    vim.lsp.enable({ "lua_ls", "nil_ls", "ts_ls", "angularls", "html", "cssls", "markdown_oxide" })
  end,
  keys = {
    -- Navigation
    { "gd",         vim.lsp.buf.definition,              desc = "Go to definition" },
    { "gD",         vim.lsp.buf.declaration,             desc = "Go to declaration" },
    { "gt",         vim.lsp.buf.type_definition,         desc = "Go to type definition" },
    { "gi",         vim.lsp.buf.implementation,          desc = "Go to implementation" },
    { "gr",         vim.lsp.buf.references,              desc = "List references" },

    -- Information
    { "K",          vim.lsp.buf.hover,                   desc = "Show hover information" },
    { "<C-k>",      vim.lsp.buf.signature_help,          desc = "Show signature help",    mode = "i" },

    -- Actions
    { "<leader>lr", vim.lsp.buf.rename,                  desc = "Rename symbol" },
    { "<leader>la", vim.lsp.buf.code_action,             desc = "Code action" },
    { "<leader>lf", vim.lsp.buf.format,                  desc = "Format buffer" },

    -- Symbols
    { "<leader>ls", vim.lsp.buf.document_symbol,         desc = "List document symbols" },
    { "<leader>lS", vim.lsp.buf.workspace_symbol,        desc = "List workspace symbols" },

    -- Call hierarchy
    { "<leader>li", vim.lsp.buf.incoming_calls,          desc = "Show incoming calls" },
    { "<leader>lo", vim.lsp.buf.outgoing_calls,          desc = "Show outgoing calls" },
  }
}
