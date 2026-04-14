vim.lsp.enable({ "lua_ls", "nil_ls", "ts_ls", "angularls", "html", "cssls", "marksman" })

local map = vim.keymap.set

-- gd / gD / gt kept (no 0.11 defaults); gri / grr / K / <C-s> provided by nvim 0.11+.
map("n", "gd", vim.lsp.buf.definition, { desc = "Go to definition" })
map("n", "gD", vim.lsp.buf.declaration, { desc = "Go to declaration" })
map("n", "gt", vim.lsp.buf.type_definition, { desc = "Go to type definition" })

map("n", "<leader>lr", vim.lsp.buf.rename, { desc = "Rename symbol" })
map("n", "<leader>la", vim.lsp.buf.code_action, { desc = "Code action" })
map("n", "<leader>lf", vim.lsp.buf.format, { desc = "Format buffer" })

map("n", "<leader>ls", vim.lsp.buf.document_symbol, { desc = "List document symbols" })
map("n", "<leader>lS", vim.lsp.buf.workspace_symbol, { desc = "List workspace symbols" })

map("n", "<leader>li", vim.lsp.buf.incoming_calls, { desc = "Show incoming calls" })
map("n", "<leader>lo", vim.lsp.buf.outgoing_calls, { desc = "Show outgoing calls" })
