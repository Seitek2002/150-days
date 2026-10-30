# 150 Days

**150 Days** is a fan-made first-person game inspired by Fallout 1: you walk the wasteland and fight in real time, with
the view and combat of a classic first-person shooter.

**You must own the original Fallout 1.** This repository contains no art, sounds, music or texts from Fallout: the game
reads them at runtime from your own copy (the `master.dat` and `critter.dat` files). On the first launch it asks for the
Fallout 1 folder — choose the one that holds `master.dat` and `critter.dat` (usually the game's own folder, for example
`C:\GOG Games\Fallout` or `C:\Program Files (x86)\Steam\steamapps\common\Fallout`). Fallout itself does not need to run.

The game version is shown at the bottom of the main menu (for example, "v0.0.2"). Saves and settings are kept separately
from the game folder, so installing a new version or a patch never loses them.

## Installing a patch

A patch is a small archive (about 1 MB) attached to each [release](https://github.com/Seitek2002/150-days/releases): it updates a game you already have.
Each archive also contains a `HOW TO UPDATE.txt` file with the same steps.

### Windows

1. Download `150-Days-update-<version>-windows.zip`.
2. Right-click the archive → "Extract All…" → choose the game folder (the one with `150 Days.exe`, usually
   **150 Days-win32-x64**) → "Extract".
3. When Windows asks, choose "Replace the files in the destination".

### macOS

1. Download `150-Days-update-<version>-mac.zip` and double-click it — a folder with an **app** folder inside appears.
2. Open Applications → right-click **150 Days** → "Show Package Contents" → Contents → Resources.
3. Drag the **app** folder from the archive there and choose "Replace".
4. Open Terminal (Applications → Utilities → Terminal) and paste these two lines one by one, pressing Enter after each:

   ```
   xattr -cr "/Applications/150 Days.app"
   ```

   ```
   codesign --force --deep --sign - "/Applications/150 Days.app"
   ```

   The game is not signed by Apple: the first line removes the "downloaded from the internet" mark, the second re-signs
   the game on your Mac. Without them macOS may say the app "is damaged" or "the developer cannot be verified".

If macOS still refuses to open the game: System Settings → Privacy & Security → at the bottom, "150 Days was blocked" →
"Open Anyway".

## Where saves are

- Windows: `%APPDATA%\150 Days\saves`
- macOS: `~/Library/Application Support/150 Days/saves`
