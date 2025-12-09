;;; early-init.el --- Early Init File -*- lexical-binding: t -*-

;;; Commentary:
;; Early initialization file for Emacs 27+

;;; Code:

;; Disable package.el in favor of straight.el or use-package
(setq package-enable-at-startup nil)

;; Disable unnecessary GUI elements early
(push '(menu-bar-lines . 0) default-frame-alist)
(push '(tool-bar-lines . 0) default-frame-alist)
(push '(vertical-scroll-bars) default-frame-alist)

;; Faster startup
(setq gc-cons-threshold most-positive-fixnum
      gc-cons-percentage 0.6)

(add-hook 'emacs-startup-hook
          (lambda ()
            (setq gc-cons-threshold 16777216
                  gc-cons-percentage 0.1)))

(provide 'early-init)
;;; early-init.el ends here
