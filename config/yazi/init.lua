-- Trim the status bar. The ids come from Status._left / Status._right in
-- Yazi's preset components/status.lua:
--   left  1 = mode, 2 = length, 3 = name
--   right 4 = perm, 5 = percent, 6 = position
Status:children_remove(2, Status.LEFT) -- file size
Status:children_remove(5, Status.RIGHT) -- Top / Bot / NN%
Status:children_remove(6, Status.RIGHT) -- cursor position (1/5)
