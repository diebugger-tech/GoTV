# install.sh - Installiert die GoTV Desktop-App fuer den aktuellen Nutzer.
# Kein Shebang und kein Ausrufezeichen (Regel: zsh History Expansion).
# Aufruf: sh desktop/install.sh   (kein sudo, keine Systemdateien)

set -u

HOME_DIR="$HOME"
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)

echo "GoTV Desktop-Installation (Repo: $ROOT_DIR)"

if command -v python3 > /dev/null 2>&1; then
  :
else
  echo "python3 fehlt. Installation abgebrochen."
  exit 1
fi
if command -v yarn > /dev/null 2>&1; then
  :
else
  echo "yarn fehlt. Setup siehe AGENTS.md (corepack + Shim)."
  exit 1
fi
if command -v curl > /dev/null 2>&1; then
  :
else
  echo "curl fehlt (wird von launch-gotv fuer den Health-Check gebraucht)."
  exit 1
fi

echo "1/4 Production-Build fuer den Desktop (REACT_APP_API_URL=/json/access)..."
cd "$ROOT_DIR" || exit 1
REACT_APP_API_URL=/json/access yarn build || exit 1
rm -rf build-desktop
mv build build-desktop

echo "2/4 Launcher, Icon und Desktop-Datei..."
mkdir -p "$HOME_DIR/.local/bin" \
         "$HOME_DIR/.local/share/applications" \
         "$HOME_DIR/.local/share/icons/hicolor/scalable/apps" \
         "$HOME_DIR/.config/gotv" \
         "$HOME_DIR/.local/share/gotv"

cp "$ROOT_DIR/desktop/launch-gotv" "$HOME_DIR/.local/bin/launch-gotv"
chmod +x "$HOME_DIR/.local/bin/launch-gotv"

cp "$ROOT_DIR/desktop/icons/gotv.svg" \
   "$HOME_DIR/.local/share/icons/hicolor/scalable/apps/gotv.svg"
for size in 16 32 48 64 128 256 512; do
  mkdir -p "$HOME_DIR/.local/share/icons/hicolor/${size}x${size}/apps"
  cp "$ROOT_DIR/desktop/icons/png/gotv-${size}.png" \
     "$HOME_DIR/.local/share/icons/hicolor/${size}x${size}/apps/gotv.png"
done
# Alter, flacher Icon-Pfad aus einer frueheren Variante - falls noch vorhanden,
# entfernen, damit nur noch die hicolor-Version gefunden wird.
rm -f "$HOME_DIR/.local/share/icons/gotv.png"

echo "$ROOT_DIR" > "$HOME_DIR/.config/gotv/root-path"

sed "s|@INSTALL_HOME@|$HOME_DIR|" \
  "$ROOT_DIR/desktop/gotv.desktop" \
  > "$HOME_DIR/.local/share/applications/gotv.desktop"
chmod +x "$HOME_DIR/.local/share/applications/gotv.desktop"

echo "3/4 Desktop-Datenbanken aktualisieren..."
if command -v update-desktop-database > /dev/null 2>&1; then
  update-desktop-database "$HOME_DIR/.local/share/applications" 2> /dev/null
fi
if command -v gtk-update-icon-cache > /dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$HOME_DIR/.local/share/icons/hicolor" 2> /dev/null
fi

echo "4/4 Fertig."
echo "  App-Auswahl:  'GoTV'"
echo "  Launcher:     $HOME_DIR/.local/bin/launch-gotv"
echo "  Desktop-File: $HOME_DIR/.local/share/applications/gotv.desktop"
echo "  Server-Log:   $HOME_DIR/.local/share/gotv/server.log"
echo "Deinstallation: sh $ROOT_DIR/desktop/uninstall.sh"
