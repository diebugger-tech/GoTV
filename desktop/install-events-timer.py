"""Install a daily Go TV calendar timer for the current user (no sudo)."""
import os
from pathlib import Path
import subprocess
import sys


def quote(value):
    return '"' + str(value).replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%") + '"'


def main():
    root = Path(__file__).resolve().parent.parent
    config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    data = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
    units = config / "systemd/user"
    units.mkdir(parents=True, exist_ok=True)
    service = "\n".join([
        "[Unit]",
        "Description=Refresh Go TV tournament and stream calendar",
        "",
        "[Service]",
        "Type=oneshot",
        "WorkingDirectory=" + str(root).replace("%", "%%"),
        "ExecStart=" + quote(sys.executable) + " -m tools.refresh_tv_events --cache " + quote(data / "gotv/events.json"),
        "TimeoutStartSec=5min",
        "",
    ])
    timer = "\n".join([
        "[Unit]",
        "Description=Daily Go TV calendar refresh",
        "",
        "[Timer]",
        "OnCalendar=*-*-* 06:15:00",
        "RandomizedDelaySec=10min",
        "Persistent=true",
        "",
        "[Install]",
        "WantedBy=timers.target",
        "",
    ])
    (units / "gotv-events.service").write_text(service, encoding="utf-8")
    (units / "gotv-events.timer").write_text(timer, encoding="utf-8")
    subprocess.run(["systemd-analyze", "--user", "verify", str(units / "gotv-events.service"), str(units / "gotv-events.timer")], check=True)
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "--now", "gotv-events.timer"], check=True)
    subprocess.run(["systemctl", "--user", "start", "--no-block", "gotv-events.service"], check=True)
    print("Go TV calendar: daily at 06:15–06:25 local time; first update started.")


if __name__ == "__main__":
    main()
