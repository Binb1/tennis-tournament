/** Pixel sprites for <Sprite>: one string per row, one character per pixel (palette in Sprite.tsx). */

/* ---- Sprites (players face right; flip for the other side) ---- */

export const PLAYER_READY = [
  "....kkk........",
  "...kkkkk...ccc.",
  "...ksss...c...c",
  "...ssss...c...c",
  "....ss.....ccc.",
  "..pppppp....c..",
  "..pppppp...s...",
  ".s.pppp.sss....",
  ".s.pppp........",
  "...pppp........",
  "...ww.ww.......",
  "...ww.ww.......",
  "...ss..ss......",
  "...ss..ss......",
  "..kkk..kkk.....",
]

export const PLAYER_SWING = [
  "....kkk........",
  "...kkkkk.......",
  "...ksss........",
  "...ssss........",
  "....ss.....ccc.",
  "..pppppp..c...c",
  "..ppppppssc...c",
  ".s.pppp....ccc.",
  ".s.pppp........",
  "...pppp........",
  "..ww...ww......",
  "..ww...ww......",
  ".ss.....ss.....",
  ".ss.....ss.....",
  "kkk.....kkk....",
]

export const PLAYER_CHEER = [
  "...........ccc.",
  "..s..kkk..c...c",
  "..s.kkkkk.c...c",
  "..s.ksss...ccc.",
  "...sssss..sc...",
  "...pppppps.....",
  "...pppppp......",
  "...pppppp......",
  "....pppp.......",
  "....ww.ww......",
  "....ww.ww......",
  "....ss.ss......",
  "....ss.ss......",
  "...kkk.kkk.....",
]

export const BALL_BOY_A = [
  "...kkk....",
  "..kssss...",
  "...sss....",
  "..pppp....",
  ".spppps...",
  "..pppp....",
  "..ww.ww...",
  ".ss...ss..",
  "kk.....kk.",
]

export const BALL_BOY_B = [
  "...kkk....",
  "..kssss...",
  "...sss....",
  "..pppp....",
  "..ppppss..",
  ".spppp....",
  "...www....",
  "...ss.....",
  "...kk.....",
]

export const BALL = [".bb.", "bbbb", "bbbb", ".bb."]

export const ARROW_UP = ["..c..", ".ccc.", "ccccc", ".ccc.", ".ccc."]

export const RACKET = [".mmm.", "m...m", "m...m", "m...m", ".mmm.", "..m..", "..m..", "..m..", "..k.."]

/** 3×5 pixel digits for the shot clock. */
export const DIGITS: Record<string, string[]> = {
  "0": ["ccc", "c.c", "c.c", "c.c", "ccc"],
  "1": [".c.", "cc.", ".c.", ".c.", "ccc"],
  "2": ["ccc", "..c", "ccc", "c..", "ccc"],
  "3": ["ccc", "..c", "ccc", "..c", "ccc"],
  "4": ["c.c", "c.c", "ccc", "..c", "..c"],
  "5": ["ccc", "c..", "ccc", "..c", "ccc"],
  "6": ["ccc", "c..", "ccc", "c.c", "ccc"],
  "7": ["ccc", "..c", ".c.", ".c.", ".c."],
  "8": ["ccc", "c.c", "ccc", "c.c", "ccc"],
  "9": ["ccc", "c.c", "ccc", "..c", "ccc"],
  ":": [".", "c", ".", "c", "."],
}
