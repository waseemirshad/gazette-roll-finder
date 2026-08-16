# Gazette Roll Finder

A Chrome extension that imports an `.xlsx` or `.csv` student list and steps through roll numbers in an open PDF gazette.

## Features

- Reads Excel files locally in the browser; no upload server.
- Auto-detects columns such as `10th Roll No 2026`, `Roll No`, `Name`, `Father Name`, and `Section`.
- Previous/Next navigation.
- Manual mode: copy the current roll number.
- Auto mode: opens Chrome Find in the active PDF, searches the roll number, and moves to the match.
- Remembers the imported list and current position.

## Install in Chrome

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `gazette-roll-finder` folder.
6. Open your gazette PDF in a Chrome tab.
7. Open the extension, upload the Excel file, and press **Find current roll in PDF** or **Next**.

## Excel format

The extension auto-detects these common headers:

- Roll: `10th Roll No 2026`, `10th Roll No`, `Roll No`, or `Roll Number`
- Name: `Name` or `Student Name`
- Father: `Father Name` or `Father's Name`
- Section: `Section`

The supplied Asif + Shabbir workbook works directly.

## Why the debugger permission?

Chrome's built-in PDF viewer does not allow normal content scripts to control its Find box. The extension uses Chrome's debugger input API only when you press Find/Next in auto mode, sends the same keys as `Ctrl+F`, types the roll number, then detaches immediately. It does not inspect network traffic or upload files.

## Manual mode

Turn off **Auto-search on Next**. Use **Copy roll number**, then press `Ctrl+F` in the PDF and paste.

## Privacy

All Excel parsing and navigation happen locally. No analytics, server, or external requests are used.

## License

MIT
