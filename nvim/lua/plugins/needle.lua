return {
    "Jofr3/needle",
    enabled = false,
    config = function()
        -- require("needle").setup()
    end,
    keys = {
        { "<C-m>", "<cmd>:NeedleAddMark<CR>", remap = true, desc = "Add mark at cursor", { silent = true } },
        { "<C-x>", "<cmd>:NeedleDeleteMark<CR>", remap = true, desc = "Delete mark at cursor", { silent = true } },
        { "<Leader>x", "<cmd>:NeedleClearMarks<CR>", remap = true, desc = "Clear all local marks", { silent = true } },

        { "<Leader>q", "<cmd>:NeedleJumpToMark q<CR>", remap = true, desc = "Jump to mark", { silent = true } },
        { "<Leader>w", "<cmd>:NeedleJumpToMark w<CR>", remap = true, desc = "Jump to mark", { silent = true } },
        { "<Leader>e", "<cmd>:NeedleJumpToMark e<CR>", remap = true, desc = "Jump to mark", { silent = true } },
        { "<Leader>r", "<cmd>:NeedleJumpToMark r<CR>", remap = true, desc = "Jump to mark", { silent = true } },
        { "<Leader>t", "<cmd>:NeedleJumpToMark t<CR>", remap = true, desc = "Jump to mark", { silent = true } },
        { "<Leader>y", "<cmd>:NeedleJumpToMark y<CR>", remap = true, desc = "Jump to mark", { silent = true } },
        { "<Leader>u", "<cmd>:NeedleJumpToMark u<CR>", remap = true, desc = "Jump to mark", { silent = true } },
        { "<Leader>i", "<cmd>:NeedleJumpToMark i<CR>", remap = true, desc = "Jump to mark", { silent = true } },
        { "<Leader>o", "<cmd>:NeedleJumpToMark o<CR>", remap = true, desc = "Jump to mark", { silent = true } },
        { "<Leader>p", "<cmd>:NeedleJumpToMark p<CR>", remap = true, desc = "Jump to mark", { silent = true } }
    }
}
