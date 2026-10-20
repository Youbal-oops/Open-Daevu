<p align="center">
  <img src="docs/assets/hero.svg" alt="Daevu: projects, a canvas, a calendar and a team of agents" width="900">
</p>

<h1 align="center">Daevu</h1>

<p align="center"><b>Your projects, notes, whiteboard and calendar in one app, with optional AI helpers and tools you can build yourself.</b><br>
Local-first. Yours. Built for Windows.</p>

<p align="center">
  <a href="https://github.com/Youbal-oops/Open-Daevu/releases">Download</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/GUIDE.md">Full guide</a>
</p>

---

## Everything for a project, side by side

Notes, files, boards, a calendar and a team of agents usually live in five different apps. Daevu puts them next to each other. Each project is a room: a page to write on, a whiteboard to think on, a chat with the specialists you picked, and a calendar that knows what everyone is doing.

Nothing leaves your computer unless you send it. Your work sits in plain files, or in a Google Drive folder if you want it on two machines.

## Think on a whiteboard

<p align="center"><img src="docs/assets/canvas.svg" alt="A flowchart building itself, a rough circle turning into a clean shape, sticky notes and a pasted link" width="760"></p>

- Sticky notes, shapes, text, frames and connectors, with size, bold, colour, borders, tilt, layers and lock.
- Sketch a rough circle or box and it snaps to a clean shape.
- Press Tab to grow a mind map, or start from a template: brainstorm, retro, SWOT, flowchart, timeline.
- Drop in documents, spreadsheets, kanban boards, images and links. Each shows its contents right on the board.
- Stays smooth on big boards. Two-finger scroll pans, pinch and wheel zoom.
- Drag a connector off a shape, let go on empty space, and pick the next shape to attach.

<p align="center"><img src="docs/assets/canvas.jpg" alt="A flowchart and sticky notes on the board" width="820"></p>

## Build your own tools

Describe what you need and Daevu builds it as a small app that lives inside the project: a budget tracker, a lead dashboard, a map with your own pins, a quiz, even a game.

- **Ask in plain words.** "A loan calculator that reads my rate from the sheet." An agent writes the app, checks that it runs, and fixes its own errors.
- **Or write it yourself.** An app is one HTML file with a tiny SDK for reading your project's tables, values and images, and for saving its own data between opens.
- **Safe by default.** Apps run in a sandbox with no network access, so a tool you build can't send your data anywhere.
- **Open it your way.** Full pane, a pull-out beside your work, or its own window, with its own icon in the launcher.

Three.js and Phaser are bundled for 3D scenes and games, and a built-in database keeps an app's records tidy.

## A calendar you can live in

<p align="center"><img src="docs/assets/calendar.jpg" alt="The calendar, one long scroll with quick add" width="820"></p>

Scroll through the months without stopping. Type "Lunch with Sam tomorrow 1pm @Blue Bottle" and it becomes an event. It handles repeats, reminders, several calendars, week and day views, and `.ics` import and export. Scheduled agent work shows up here as well.

## Agents that have a job

<p align="center"><img src="docs/assets/agents.jpg" alt="Agent profiles" width="820"></p>

Give each specialist a name, a role and a model. Use your ChatGPT, Gemini or Claude account, an API key, or a command-line tool you already have. They hand work to each other, write findings into your pages, leave comments, link related projects and add events to your calendar. They only use the tools you give them. Prefer to work alone? Switch the helpers off in settings and every trace of them disappears.

## Make it yours

<p align="center"><img src="docs/assets/plugins.jpg" alt="Plugins" width="820"></p>

- **Plugins** add web chats, panels and tools. Choose an icon, then place each in the sidebar, the tab bar or a pull-out, or lock it to one project.
- **Connections** reach the public MCP registry, with the logo of every service.
- **Your tab bar** keeps the tools you reach for in each project: browser, calendar, database, whiteboard.
- **Pages** are made of blocks, with comments and deep links. Images open with a marker, text and crop. Copy and paste keeps your formatting.

## Quick start

Grab the installer from [Releases](https://github.com/Youbal-oops/Open-Daevu/releases), or run it from source with Node.js 24:

```powershell
npm ci
npm run dev
```

The first launch walks you through a look, a storage place and whether to turn on AI helpers. Then start a project.

## Shortcuts

| Shortcut | What it does |
|---|---|
| Ctrl + B / I / U | Bold, italic, underline while writing |
| Ctrl + Shift + X, Ctrl + E | Strike-through, code |
| Ctrl + Alt + 1 / 2 / 3, Ctrl + Alt + 0 | Heading 1 / 2 / 3, plain text |
| Ctrl + Shift + 7 / 8 / 9 | Numbered, bulleted and to-do lists |
| Ctrl + Alt + C | Open or close the canvas |
| Ctrl + Alt + B | Open or close the browser |
| Ctrl + Alt + A | Open or close apps |
| Esc | Close the open tool |

## Good to know

- Windows 10 and 11. The installer is unsigned for now.
- Syncing through Google Drive happens when the app opens, and only one computer can have the workspace open at a time, so two machines never fight.
- Deleted things go to Trash first.

## Building and testing

```powershell
npm test            # unit tests
npm run build       # production build
npm run dist:win    # installer and portable app
```

Everything else (agents, storage, plugins, formulas, the research browser) is in the [full guide](docs/GUIDE.md).

## License

MIT. See [LICENSE](LICENSE). The Daevu name and logo are not covered, see [TRADEMARKS.md](TRADEMARKS.md). Third-party credits are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
