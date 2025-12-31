return {
  {
    "tpope/vim-fugitive",
    enabled = true,
    lazy = false,
    config = function ()
      vim.api.nvim_create_user_command("GitBlame", function()
        vim.cmd("Git blame")
      end, {})

      vim.api.nvim_create_user_command("GitLog", function()
        vim.cmd("Git log")
      end, {})

      vim.api.nvim_create_user_command("GitLogThis", function()
        vim.cmd("Git log -- " .. vim.fn.expand('%:p'))
      end, {})

      vim.api.nvim_create_user_command("GitLogLines", function(opts)
        local filepath = vim.fn.expand('%:p')
        if filepath ~= "" then
          vim.cmd(string.format("Git log --no-patch -L%d,%d:%s", opts.line1, opts.line2, filepath))
        else
          print("No file in current buffer")
        end
      end, { range = true })

      vim.api.nvim_create_user_command("GitDiff", function()
        vim.cmd("Gdiff")
      end, {})
    end
  },
  {
    "lewis6991/gitsigns.nvim",
    enabled = true,
    lazy = false,
    config = function ()
      vim.api.nvim_create_user_command("GitPreviewHunk", function()
        vim.cmd("Gitsigns preview_hunk_inline")
      end, {})
      -- Gitsigns stage_hunk !!!!!!!!
      -- Gitsigns reset_hunk !!!!!!!!
      -- Gitsigns nav_hunk next/prev !!!!!!!!!!!!!!!
      -- set statusline+=%{get(b:,'gitsigns_head','')}
    end
  },
  {
    "aaronhallaert/advanced-git-search.nvim",
    cmd = { "AdvancedGitSearch" },
    enabled = true,
    lazy = false,
    config = function ()
      local telescope = require("telescope")
      telescope.load_extension("advanced_git_search")
    end

      -- { name = "Git file history", cmd = "AdvancedGitSearch diff_commit_file" },
      -- { name = "Git line history", cmd = "AdvancedGitSearch diff_commit_line" },
  },
  {
    "echasnovski/mini.diff",
    enabled = false,
    lazy = false,
    opts = {
      view = {
        style = "sign",
        signs = { add = "░", change = "░", delete = "░" },
      },
    },
  }
}
