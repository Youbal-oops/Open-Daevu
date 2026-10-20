const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execute } = require('./runner.cjs');
const { calculateSheet } = require('../shared/sheet.mjs');
const wrapper = `import json, sys, traceback, math
payload = json.load(sys.stdin)
rows = payload['rows']
values = payload['values']
def coordinates(ref):
    import re
    match = re.fullmatch(r'([A-Za-z]+)([1-9][0-9]*)', ref)
    if not match: raise ValueError('Use a cell address such as A1')
    column = 0
    for letter in match[1].upper(): column = column * 26 + ord(letter) - 64
    return int(match[2])-1, column-1
def get_cell(ref):
    r, c = coordinates(ref)
    return values[r][c] if r < len(values) and c < len(values[r]) else ''
def set_cell(ref, value):
    r, c = coordinates(ref)
    if r >= 10000 or c >= 256: raise ValueError('Keep sheets under 10,000 rows and 256 columns')
    while len(rows) <= r: rows.append([])
    while len(rows[r]) <= c: rows[r].append('')
    rows[r][c] = value
scope = {'rows':rows, 'values':values, 'get_cell':get_cell, 'set_cell':set_cell, '__name__':'__main__'}
try:
    exec(compile(payload['script'], 'sheet-script.py', 'exec'), scope)
    result = scope['rows']
    if not isinstance(result, list) or not result or len(result) > 10000: raise ValueError('rows must be a nonempty list with at most 10,000 rows')
    clean = []
    for row in result:
        if not isinstance(row, list) or len(row) > 256: raise ValueError('Each row must be a list with at most 256 cells')
        line = []
        for value in row:
            if value is None: value = ''
            elif isinstance(value, bool): value = 'TRUE' if value else 'FALSE'
            elif isinstance(value, float) and not math.isfinite(value): raise ValueError('Cells cannot contain NaN or infinity')
            elif not isinstance(value, (str, int, float)): raise ValueError('Cells must contain text or numbers')
            line.append(str(value))
        clean.append(line)
    encoded = json.dumps(clean, ensure_ascii=False)
    if len(encoded.encode('utf-8')) > 1048576: raise ValueError('Keep script results under 1 MB')
    with open(sys.argv[1], 'w', encoding='utf-8') as file: file.write(encoded)
except Exception:
    traceback.print_exc()
    sys.exit(1)
`;
class SheetPython {
  constructor(executor = execute) { this.execute = executor; this.busy = false; this.controller = null; }
  stop() { this.controller?.abort(); }
  async run({ rows, script, command = 'python' }, cwd) {
    if (this.busy) throw Error('A Python script is already running.');
    if (!Array.isArray(rows) || !rows.length || rows.length > 10000 || rows.some(r => !Array.isArray(r) || r.length > 256 || r.some(c => typeof c !== 'string')) || JSON.stringify(rows).length > 1048576) throw Error('Use a sheet under 1 MB, 10,000 rows, and 256 columns.');
    if (typeof script !== 'string' || !script.trim() || script.length > 100000) throw Error('Enter a Python script under 100 KB.');
    if (typeof command !== 'string' || !command.trim() || command.length > 1000 || /[\r\n]/.test(command)) throw Error('Choose your Python executable, without arguments.');
    this.busy = true; this.controller = new AbortController(); let dir;
    try {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'research-sheet-'));
      const output = path.join(dir, 'result.json');
      let stdout;
      try { stdout = await this.execute(command.trim(), ['-I', '-X', 'utf8', '-u', '-c', wrapper, output], JSON.stringify({ rows, values: calculateSheet(rows), script }), cwd, this.controller.signal, 30000); }
      catch (e) { if (/Could not find/.test(e.message)) throw Error('Python was not found. Install Python 3 and enter its executable path, or use py.'); throw e; }
      const stat = await fs.stat(output); if (stat.size > 1048576) throw Error('Keep script results under 1 MB.');
      const result = JSON.parse(await fs.readFile(output, 'utf8'));
      if (!Array.isArray(result) || !result.length || result.length > 10000 || result.some(r => !Array.isArray(r) || r.length > 256 || r.some(c => typeof c !== 'string'))) throw Error('Invalid script results.');
      return { rows: result, stdout: stdout.slice(-20000) };
    } finally { this.busy = false; this.controller = null; if (dir) await fs.rm(dir, { recursive: true, force: true }); }
  }
}
module.exports = { SheetPython };
