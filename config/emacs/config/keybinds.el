(defun reload-config ()
  "Reload my Emacs configuration."
  (interactive)
  (load-file "~/.config/emacs/init.el"))

(global-set-key (kbd "C-c r") 'reload-config)
