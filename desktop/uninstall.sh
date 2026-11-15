# uninstall.sh - Entfernt die GoTV Desktop-App des aktuellen Nutzers.
# Kein Shebang und kein Ausrufezeichen (Regel: zsh History Expansion).
# Aufruf: sh desktop/uninstall.sh   (kein sudo)

set -u

HOME_DIR="$HOME"

echo "GoTV Desktop-Deinstallation"

# Laufenden lokalen Server beenden, falls vorhanden.
if pgrep -f "desktop/goTV_local.py" > /dev/null 2>&1; then
  pkill -f "desktop/goTV_local.py"
  echo "Lokaler Server wurde beendet."
else
  echo "Kein lokaler Server lief."
fi

for file in \
  "$HOME_DIR/.local/share/applications/gotv.desktop" \
  "$HOME_DIR/.local/share/icons/hicolor/scalable/apps/gotv.svg" \
  "$HOME_DIR/.local/share/icons/hicolor/16x16/apps/gotv.png" \
  "$HOME_DIR/.local/share/icons/hicolor/32x32/apps/gotv.png" \
  "$HOME_DIR/.local/share/icons/hicolor/48x48/apps/gotv.png" \
  "$HOME_DIR/.local/share/icons/hicolor/64x64/apps/gotv.png" \
  "$HOME_DIR/.local/share/icons/hicolor/128x128/apps/gotv.png" \
  "$HOME_DIR/.local/share/icons/hicolor/256x256/apps/gotv.png" \
  "$HOME_DIR/.local/share/icons/hicolor/512x512/apps/gotv.png" \
  "$HOME_DIR/.local/share/icons/gotv.png" \
  "$HOME_DIR/.local/bin/launch-gotv" \
  "$HOME_DIR/.config/gotv/root-path"; do
  if [ -e "$file" ]; then
    rm -f "$file"
    echo "Entfernt: $file"
  fi
done

# Leeres Config-Verzeichnis aufraeumen.
if [ -d "$HOME_DIR/.config/gotv" ]; then
  rmdir "$HOME_DIR/.config/gotv" 2> /dev/null
fi

if command -v update-desktop-database > /dev/null 2>&1; then
  update-desktop-database "$HOME_DIR/.local/share/applications" 2> /dev/null
fi
if command -v gtk-update-icon-cache > /dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$HOME_DIR/.local/share/icons/hicolor" 2> /dev/null
fi

echo "Fertig."
echo "Nicht entfernt (Nutzerdaten): $HOME_DIR/.local/share/gotv"
echo "  (Browser-Profil, Server-Log). Manuell loeschen, falls nicht mehr gebraucht."
