return {
  {
    "tpope/vim-fugitive",
    enabled = true,
    lazy = false,
    config = function()
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
    config = function()
      local gitsigns = require('gitsigns')
      vim.api.nvim_create_user_command("GitPreviewHunk", function()
        vim.cmd("Gitsigns preview_hunk_inline")
      end, {})

      vim.api.nvim_create_user_command("GitResetHunk", function()
        vim.cmd("Gitsigns reset_hunk")
      end, {})

      vim.api.nvim_create_user_command("GitChanges", function()
        gitsigns.setqflist("all", nil)
      end, {})

      vim.api.nvim_create_user_command("GitChangesThis", function()
        gitsigns.setqflist("attached", nil)
      end, {})

      gitsigns.setup {
        signcolumn = false
      }
      -- Gitsigns stage_hunk !!!!!!!!
      -- Gitsigns nav_hunk next/prev !!!!!!!!!!!!!!!
    end,
    keys = function()
      local gitsigns = require('gitsigns')
      return {
        { "[h", function() gitsigns.nav_hunk('next') end },
        { "]h", function() gitsigns.nav_hunk('prev') end },
      }
    end
  },
  {
    "echasnovski/mini.diff",
    enabled = true,
    lazy = false,
    config = function()
      local diff = require('mini.diff')

      vim.api.nvim_create_user_command("GitDiffOverlay", function()
        diff.toggle_overlay()
      end, {})

      diff.setup {
        mappings = {
          apply = '',
          reset = '',
          textobject = '',
          goto_first = '',
          goto_prev = '',
          goto_next = '',
          goto_last = '',
        },
        view = {
          style = "sign",
          signs = { add = "░", change = "░", delete = "░" },
        },
      }
    end
  },
  {
    "aaronhallaert/advanced-git-search.nvim",
    cmd = { "AdvancedGitSearch" },
    enabled = true,
    lazy = false,
    config = function()
      local telescope = require("telescope")
      telescope.load_extension("advanced_git_search")
    end

    -- { name = "Git file history", cmd = "AdvancedGitSearch diff_commit_file" },
    -- { name = "Git line history", cmd = "AdvancedGitSearch diff_commit_line" },
  },
}
