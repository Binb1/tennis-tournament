#!/bin/sh
# Regenerates index.html from the iter-N-{desktop,mobile}.png files in this folder.
cd "$(dirname "$0")"
{
cat <<'H'
<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Landing iterations</title>
<style>
body{margin:0;background:#1e1611;color:#f7f2e8;font:14px/1.4 system-ui,sans-serif}
header{padding:24px 32px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:12px;opacity:.8}
section{padding:24px 32px;border-top:1px solid #3a2a20}
h2{margin:0 0 16px;font-size:18px}
.row{display:flex;gap:24px;align-items:flex-start;overflow-x:auto}
.row a{flex:none}
.d{width:min(900px,70vw)} .m{width:240px}
img{display:block;border:1px solid #3a2a20}
</style></head><body><header>Tiebreakers · évolution de la landing</header>
H
for f in $(ls iter-*-desktop.png | sort -t- -k2 -n -r); do
  n=$(echo "$f" | sed -E 's/iter-([0-9]+)-desktop.png/\1/')
  echo "<section><h2>Itération $n</h2><div class=\"row\"><a href=\"$f\"><img class=\"d\" src=\"$f\"></a><a href=\"iter-$n-mobile.png\"><img class=\"m\" src=\"iter-$n-mobile.png\"></a></div></section>"
done
echo "</body></html>"
} > index.html
