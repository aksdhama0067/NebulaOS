(() => {
    'use strict';
    const STORAGE = { settings: 'nova-webos-settings-v1', files: 'nova-webos-files-v1', icons: 'nova-webos-icons-v1', notifications: 'nova-webos-notifications-v1' };
    const startedAt = Date.now();
    const apps = {
      notepad: { name: 'Notepad', icon: '📝', description: 'Write and save notes' },
      calculator: { name: 'Calculator', icon: '🧮', description: 'Standard and scientific' },
      terminal: { name: 'Terminal', icon: '⌘', description: 'Local command line' },
      files: { name: 'Files', icon: '🗀', description: 'Browse local files' },
      settings: { name: 'Settings', icon: '⚙', description: 'Personalize your desktop' }
    };
    const desktopApps = ['files', 'notepad', 'calculator', 'terminal', 'settings'];
    const desktop = document.getElementById('desktop');
    const iconsEl = document.getElementById('desktop-icons');
    const windowLayer = document.getElementById('window-layer');
    const taskList = document.getElementById('task-list');
    const startMenu = document.getElementById('start-menu');
    const windows = new Map();
    let zIndex = 20;
    let windowNo = 0;
    const defaultSettings = { wallpaper: 'aurora', theme: 'dark', accent: 'azure' };
    const defaultFiles = {
      '/Documents': { type: 'dir', modified: Date.now() },
      '/Downloads': { type: 'dir', modified: Date.now() },
      '/Projects': { type: 'dir', modified: Date.now() },
      '/': { type: 'dir', modified: Date.now() },
      '/Documents/Notes.txt': { type: 'file', content: 'This is your first note. You can edit it or create new notes in the Documents folder.', modified: Date.now() },
      '/Documents/Todo.txt': { type: 'file', content: 'This is your first to-do list. You can edit it or create new lists in the Documents folder.', modified: Date.now() },
      '/Documents/Welcome.txt': { type: 'file', content: 'Welcome to Nebula OS!\n\nYour notes and virtual files are stored privately in this browser using localStorage.', modified: Date.now() },
      '/Projects/Readme.txt': { type: 'file', content: 'This is your local workspace. Use Files or the Terminal to create more folders and notes.', modified: Date.now() }
    };

    function readStore(key, fallback) {
      try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === 'object' ? value : structuredClone(fallback); }
      catch { return structuredClone(fallback); }
    }
    let settings = { ...defaultSettings, ...readStore(STORAGE.settings, defaultSettings) };
    let filesystem = readStore(STORAGE.files, defaultFiles);
    let iconPositions = readStore(STORAGE.icons, {});
    let notifications = readStore(STORAGE.notifications, []);
    if (!Array.isArray(notifications)) notifications = [];
    function persistSettings() { localStorage.setItem(STORAGE.settings, JSON.stringify(settings)); }
    function persistIconPositions() { localStorage.setItem(STORAGE.icons, JSON.stringify(iconPositions)); }
    function persistNotifications() { localStorage.setItem(STORAGE.notifications, JSON.stringify(notifications)); }
    function persistFiles() { localStorage.setItem(STORAGE.files, JSON.stringify(filesystem)); notify('Files saved locally.'); refreshFileWindows(); }
    function normalizePath(input, cwd = '/') {
      if (!input || input === '.') return cwd;
      let joined = input.startsWith('/') ? input : `${cwd.replace(/\/$/, '')}/${input}`;
      const parts = [];
      joined.split('/').forEach(part => { if (!part || part === '.') return; if (part === '..') parts.pop(); else parts.push(part); });
      return '/' + parts.join('/');
    }
    function parentPath(path) { const parts = path.split('/').filter(Boolean); parts.pop(); return '/' + parts.join('/'); }
    function fileName(path) { return path.split('/').filter(Boolean).pop() || '/'; }
    function listDir(path) {
      path = normalizePath(path);
      if (path !== '/' && (!filesystem[path] || filesystem[path].type !== 'dir')) return null;
      const prefix = path === '/' ? '/' : `${path}/`;
      return Object.entries(filesystem).filter(([entry]) => entry.startsWith(prefix) && entry !== path && !entry.slice(prefix.length).includes('/')).map(([path, item]) => ({ path, ...item })).sort((a,b) => (b.type === 'dir') - (a.type === 'dir') || fileName(a.path).localeCompare(fileName(b.path)));
    }
    function mkdir(path) {
      path = normalizePath(path);
      if (path === '/' || filesystem[path]) return { ok: false, message: 'Already exists.' };
      const parent = parentPath(path);
      if (parent !== '/' && (!filesystem[parent] || filesystem[parent].type !== 'dir')) return { ok: false, message: 'Parent directory does not exist.' };
      filesystem[path] = { type: 'dir', modified: Date.now() }; persistFiles(); return { ok: true, path };
    }
    function writeFile(path, content) {
      path = normalizePath(path);
      const parent = parentPath(path);
      if (parent !== '/' && (!filesystem[parent] || filesystem[parent].type !== 'dir')) return { ok: false, message: 'Parent directory does not exist.' };
      if (filesystem[path]?.type === 'dir') return { ok: false, message: 'A folder has this name.' };
      filesystem[path] = { type: 'file', content: String(content), modified: Date.now() }; persistFiles(); return { ok: true, path };
    }
    function uniqueFilePath(directory, name) {
      const cleaned = safeFileName(name); const dot = cleaned.lastIndexOf('.'); const base = dot > 0 ? cleaned.slice(0, dot) : cleaned; const extension = dot > 0 ? cleaned.slice(dot) : '';
      let candidate = normalizePath(`${directory}/${cleaned}`), counter = 1;
      while (filesystem[candidate]) candidate = normalizePath(`${directory}/${base} (${counter++})${extension}`);
      return candidate;
    }
    function removePath(path) {
      path = normalizePath(path);
      if (!filesystem[path]) return false;
      Object.keys(filesystem).filter(key => key === path || key.startsWith(`${path}/`)).forEach(key => delete filesystem[key]); persistFiles(); return true;
    }
    function setTheme(theme) { settings.theme = theme; document.body.classList.toggle('light', theme === 'light'); persistSettings(); refreshSettingsWindows(); }
    function setAccentTheme(accent) { settings.accent = accent; document.body.classList.remove('accent-violet', 'accent-mint', 'accent-sunset'); if (accent !== 'azure') document.body.classList.add(`accent-${accent}`); persistSettings(); refreshSettingsWindows(); }
    function setWallpaper(name) { settings.wallpaper = name; desktop.className = `wallpaper-${name}`; persistSettings(); refreshSettingsWindows(); }
    function notify(message) {
      const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; document.getElementById('toast-area').append(toast);
      window.setTimeout(() => toast.remove(), 2800);
      notifications.unshift({ message: String(message), created: Date.now() }); notifications = notifications.slice(0, 30); persistNotifications(); renderNotifications();
    }
    function renderNotifications() {
      const list = document.getElementById('notification-list'), badge = document.getElementById('notification-badge'); if (!list || !badge) return;
      list.replaceChildren(); badge.hidden = notifications.length === 0;
      if (!notifications.length) { list.innerHTML = '<p class="notification-empty">You’re all caught up.</p>'; return; }
      notifications.forEach(item => { const entry = document.createElement('article'); entry.className = 'notification-item'; const text = document.createElement('div'); text.textContent = item.message; const time = document.createElement('time'); time.textContent = new Date(item.created).toLocaleString(); entry.append(text, time); list.append(entry); });
    }
    function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
    function safeFileName(name) { return name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'Untitled'; }

    function appIcon(appId) { return `<span class="window-title-icon" aria-hidden="true">${apps[appId].icon}</span>`; }
    function createWindow(appId, options = {}) {
      const app = apps[appId];
      const id = `window-${++windowNo}`;
      const win = document.createElement('section');
      win.className = 'window'; win.dataset.id = id; win.dataset.app = appId; win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', options.title || app.name);
      const layerWidth = windowLayer.clientWidth || innerWidth;
      const layerHeight = windowLayer.clientHeight || (innerHeight - 62);
      const width = Math.min(options.width || 620, Math.max(290, layerWidth - 16));
      const height = Math.min(options.height || 430, Math.max(185, layerHeight - 16));
      const left = Math.max(6, Math.min(options.left ?? (64 + (windowNo * 27) % Math.max(60, layerWidth - width - 20)), layerWidth - width - 6));
      const top = Math.max(4, Math.min(options.top ?? (38 + (windowNo * 23) % Math.max(40, layerHeight - height - 10)), layerHeight - height - 4));
      win.style.cssText = `width:${width}px;height:${height}px;left:${left}px;top:${top}px;z-index:${++zIndex}`;
      win.innerHTML = `<header class="titlebar"><span class="window-title-icon" aria-hidden="true">${app.icon}</span><span class="window-title">${escapeHtml(options.title || app.name)}</span><div class="window-controls"><button type="button" data-action="minimize" title="Minimize" aria-label="Minimize">−</button><button type="button" data-action="maximize" title="Maximize" aria-label="Maximize">□</button><button type="button" class="close" data-action="close" title="Close" aria-label="Close">×</button></div></header><div class="window-content"></div>${['n','s','e','w','ne','nw','se','sw'].map(pos => `<i class="resize-handle ${pos}" data-resize="${pos}"></i>`).join('')}`;
      windowLayer.append(win);
      const record = { id, appId, el: win, minimized: false, maximized: false, bounds: null, state: options.state || {} };
      windows.set(id, record);
      attachWindowEvents(record);
      if (options.mount) options.mount(win.querySelector('.window-content'), record);
      focusWindow(id); renderTasks();
      return record;
    }
    function focusWindow(id) {
      const record = windows.get(id); if (!record) return;
      record.el.classList.remove('minimized'); record.minimized = false;
      record.el.style.zIndex = ++zIndex;
      windows.forEach(item => item.el.classList.toggle('focused', item.id === id));
      renderTasks();
    }
    function closeWindow(id) { const record = windows.get(id); if (!record) return; if (record.infoTimer) window.clearInterval(record.infoTimer); record.el.remove(); windows.delete(id); renderTasks(); }
    function minimizeWindow(id) { const record = windows.get(id); if (!record) return; record.minimized = true; record.el.classList.add('minimized'); renderTasks(); }
    function toggleMaximize(id) {
      const record = windows.get(id); if (!record) return;
      const el = record.el;
      if (record.maximized) {
        el.classList.remove('maximized'); Object.assign(el.style, record.bounds); record.maximized = false;
      } else {
        record.bounds = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
        el.classList.add('maximized'); record.maximized = true;
      }
      focusWindow(id);
    }
    function attachWindowEvents(record) {
      const { el, id } = record;
      el.addEventListener('pointerdown', () => focusWindow(id));
      el.querySelector('.window-controls').addEventListener('click', event => {
        const action = event.target.closest('button')?.dataset.action; if (!action) return;
        if (action === 'close') closeWindow(id); if (action === 'minimize') minimizeWindow(id); if (action === 'maximize') toggleMaximize(id);
      });
      const titlebar = el.querySelector('.titlebar');
      titlebar.addEventListener('dblclick', event => { if (!event.target.closest('button')) toggleMaximize(id); });
      titlebar.addEventListener('pointerdown', event => {
        if (event.target.closest('button') || record.maximized || event.button !== 0) return;
        event.preventDefault(); focusWindow(id);
        const startX = event.clientX, startY = event.clientY, startLeft = el.offsetLeft, startTop = el.offsetTop;
        titlebar.setPointerCapture(event.pointerId);
        const move = e => { el.style.left = `${Math.max(0, Math.min(startLeft + e.clientX - startX, windowLayer.clientWidth - el.offsetWidth))}px`; el.style.top = `${Math.max(0, Math.min(startTop + e.clientY - startY, windowLayer.clientHeight - el.offsetHeight))}px`; };
        const end = e => { titlebar.releasePointerCapture?.(e.pointerId); titlebar.removeEventListener('pointermove', move); titlebar.removeEventListener('pointerup', end); };
        titlebar.addEventListener('pointermove', move); titlebar.addEventListener('pointerup', end);
      });
      el.querySelectorAll('[data-resize]').forEach(handle => handle.addEventListener('pointerdown', event => {
        if (record.maximized || event.button !== 0) return;
        event.preventDefault(); event.stopPropagation(); focusWindow(id);
        const dir = handle.dataset.resize, rect = el.getBoundingClientRect(), startX = event.clientX, startY = event.clientY;
        handle.setPointerCapture(event.pointerId);
        const move = e => {
          const dx = e.clientX - startX, dy = e.clientY - startY; let left = rect.left, top = rect.top, width = rect.width, height = rect.height;
          if (dir.includes('e')) width = Math.max(290, rect.width + dx); if (dir.includes('s')) height = Math.max(185, rect.height + dy);
          if (dir.includes('w')) { width = Math.max(290, rect.width - dx); left = rect.right - width; } if (dir.includes('n')) { height = Math.max(185, rect.height - dy); top = rect.bottom - height; }
          left = Math.max(0, Math.min(left, windowLayer.clientWidth - 290)); top = Math.max(0, Math.min(top, windowLayer.clientHeight - 185));
          width = Math.min(width, windowLayer.clientWidth - left); height = Math.min(height, windowLayer.clientHeight - top);
          Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
        };
        const end = e => { handle.releasePointerCapture?.(e.pointerId); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); };
        handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end);
      }));
    }
    function renderTasks() {
      taskList.replaceChildren();
      [...windows.values()].sort((a,b) => Number(a.el.style.zIndex) - Number(b.el.style.zIndex)).forEach(record => {
        const button = document.createElement('button'); button.type = 'button'; button.className = `task-button open${record.el.classList.contains('focused') && !record.minimized ? ' active' : ''}`;
        button.title = `${record.minimized ? 'Restore' : 'Focus'} ${record.el.querySelector('.window-title').textContent}`;
        button.innerHTML = `<span aria-hidden="true">${apps[record.appId].icon}</span><span class="task-title">${escapeHtml(record.el.querySelector('.window-title').textContent)}</span>`;
        button.addEventListener('click', () => { if (!record.minimized && record.el.classList.contains('focused')) minimizeWindow(record.id); else focusWindow(record.id); }); taskList.append(button);
      });
    }
    function renderDesktopIcons() {
      desktopApps.forEach(appId => {
        const app = apps[appId], button = document.createElement('button'); button.type = 'button'; button.className = 'desktop-icon'; button.dataset.app = appId;
        button.innerHTML = `<span class="app-symbol" aria-hidden="true">${app.icon}</span><span>${app.name}</span>`;
        const savedPosition = iconPositions[appId];
        if (savedPosition) { button.style.position = 'absolute'; button.style.left = `${savedPosition.left}px`; button.style.top = `${savedPosition.top}px`; }
        let dragging = false, origin = null;
        button.addEventListener('dblclick', () => launch(appId));
        button.addEventListener('click', () => { iconsEl.querySelectorAll('.desktop-icon').forEach(i => i.classList.toggle('selected', i === button)); });
        button.addEventListener('pointerdown', event => {
          if (event.button !== 0) return; origin = { x: event.clientX, y: event.clientY, left: button.offsetLeft, top: button.offsetTop }; button.setPointerCapture(event.pointerId);
          const move = e => { const dx = e.clientX - origin.x, dy = e.clientY - origin.y; if (Math.abs(dx) + Math.abs(dy) > 5) { dragging = true; button.style.position = 'absolute'; button.style.left = `${Math.max(0, Math.min(origin.left + dx, iconsEl.clientWidth - button.offsetWidth))}px`; button.style.top = `${Math.max(0, origin.top + dy)}px`; } };
          const end = e => { button.releasePointerCapture?.(e.pointerId); button.removeEventListener('pointermove', move); button.removeEventListener('pointerup', end); if (dragging) { iconPositions[appId] = { left: button.offsetLeft, top: button.offsetTop }; persistIconPositions(); notify(`${app.name} position saved.`); } window.setTimeout(() => dragging = false, 0); };
          button.addEventListener('pointermove', move); button.addEventListener('pointerup', end);
        }); iconsEl.append(button);
      });
    }
    function launch(appId, payload = {}) {
      startMenu.classList.remove('open');
      if (appId === 'notepad') return openNotepad(payload);
      if (appId === 'calculator') return openCalculator();
      if (appId === 'terminal') return openTerminal(payload.cwd);
      if (appId === 'files') return openFiles(payload.path);
      if (appId === 'settings') return openSettings();
    }

    function openNotepad({ path, content, name } = {}) {
      const saved = path && filesystem[path]?.type === 'file' ? filesystem[path] : null;
      const title = saved ? fileName(path) : 'Untitled Note';
      return createWindow('notepad', { title, width: 690, height: 500, state: { path: saved ? path : null }, mount(container, record) {
        container.innerHTML = `<div class="notepad"><div class="app-toolbar"><input class="input notepad-filename" aria-label="File name" value="${escapeHtml(name || (saved ? fileName(path).replace(/\.txt$/i, '') : 'Untitled'))}" spellcheck="false"><div class="format-group"><button class="toolbar-btn" type="button" data-format="bold" title="Bold"><b>B</b></button><button class="toolbar-btn" type="button" data-format="italic" title="Italic"><i>I</i></button><button class="toolbar-btn" type="button" data-format="underline" title="Underline"><u>U</u></button></div><button class="mini-btn" type="button" data-note-save>Save</button><button class="mini-btn" type="button" data-note-download>Download .txt</button></div><article class="editor" contenteditable="true" spellcheck="true" data-placeholder="Start writing…"></article><div class="notepad-status"><span>Plain-text save · Formatting stays in this note session</span><span data-note-count>0 characters</span></div></div>`;
        const editor = container.querySelector('.editor'), nameInput = container.querySelector('.notepad-filename'), count = container.querySelector('[data-note-count]');
        editor.textContent = content ?? saved?.content ?? '';
        const updateCount = () => count.textContent = `${editor.innerText.length} character${editor.innerText.length === 1 ? '' : 's'}`;
        updateCount(); editor.addEventListener('input', updateCount);
        container.querySelectorAll('[data-format]').forEach(btn => btn.addEventListener('click', () => { editor.focus(); document.execCommand(btn.dataset.format, false); }));
        const getName = () => { let value = safeFileName(nameInput.value); return value.toLowerCase().endsWith('.txt') ? value : `${value}.txt`; };
        container.querySelector('[data-note-save]').addEventListener('click', () => { const target = record.state.path || `/Documents/${getName()}`; const result = writeFile(target, editor.innerText); if (!result.ok) return notify(result.message); record.state.path = target; record.el.querySelector('.window-title').textContent = fileName(target); notify(`Saved ${fileName(target)}.`); });
        container.querySelector('[data-note-download]').addEventListener('click', () => { const blob = new Blob([editor.innerText], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = getName(); link.click(); URL.revokeObjectURL(url); notify('Text file downloaded.'); });
        window.setTimeout(() => editor.focus(), 0);
      }});
    }

    function openCalculator() {
      return createWindow('calculator', { width: 405, height: 535, mount(container, record) {
        const keys = [['sin','cos','tan','log','ln'],['√','π','e','(',')'],['C','⌫','%','^','÷'],['7','8','9','×','−'],['4','5','6','+','−'],['1','2','3','+','−'],['0','.','Ans','=','=']];
        container.innerHTML = `<div class="calculator"><div class="calc-display" aria-live="polite"><div class="calc-history">Ready</div><div class="calc-value">0</div></div><div class="calc-keypad">${keys.flat().map(key => `<button type="button" class="calc-key ${['÷','×','−','+','^','%','sin','cos','tan','log','ln','√','(',')'].includes(key) ? 'operator' : ''} ${key === '=' ? 'equal' : ''}" data-calc="${key}">${key}</button>`).join('')}</div></div>`;
        const display = container.querySelector('.calc-value'), history = container.querySelector('.calc-history'); let expression = '', answer = '0', evaluated = false;
        const show = () => { display.textContent = expression || '0'; display.scrollLeft = display.scrollWidth; };
        const tokenize = raw => raw.replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-').replaceAll('π', String(Math.PI)).replaceAll('√','sqrt').replace(/\bAns\b/g, answer).replace(/\b(e)\b/g, String(Math.E)).replace(/(\d|\))(?=(sin|cos|tan|log|ln|sqrt|\())/g, '$1*').replace(/\)(?=\d)/g, ')*').replace(/%(?!\w)/g, '/100');
        const calculate = () => {
          if (!expression) return; const source = tokenize(expression);
          if (!/^[0-9+\-*/().,\sA-Za-z]+$/.test(source) || /(constructor|prototype|__|window|document|Function|eval)/i.test(source)) throw new Error('Invalid expression');
          const fn = Function('sin','cos','tan','log','ln','sqrt', `"use strict"; return (${source});`);
          const result = fn(Math.sin, Math.cos, Math.tan, Math.log10, Math.log, Math.sqrt);
          if (!Number.isFinite(result)) throw new Error('Result is undefined'); return result;
        };
        const press = key => {
          if (key === 'C') { expression = ''; history.textContent = 'Cleared'; evaluated = false; show(); return; }
          if (key === '⌫') { expression = expression.slice(0, -1); evaluated = false; show(); return; }
          if (key === '=') { try { const result = calculate(); history.textContent = `${expression} =`; answer = String(Number(result.toPrecision(12))); expression = answer; evaluated = true; show(); } catch (error) { history.textContent = error.message; display.textContent = 'Error'; expression = ''; } return; }
          if (evaluated && (/\d|\.|π|e|sin|cos|tan|log|ln|√|\(/.test(key))) expression = '';
          evaluated = false;
          const inserts = { 'sin': 'sin(', 'cos': 'cos(', 'tan': 'tan(', 'log': 'log(', 'ln': 'ln(', '√': '√(' };
          expression += inserts[key] || key; show();
        };
        container.querySelectorAll('[data-calc]').forEach(button => button.addEventListener('click', () => press(button.dataset.calc)));
        record.el.addEventListener('keydown', event => {
          const map = { Enter: '=', '=': '=', Escape: 'C', Backspace: '⌫', '*': '×', '/': '÷', '-': '−', '^': '^', '%': '%', '(': '(', ')': ')', '.': '.' };
          const value = map[event.key] || (/^[0-9+]$/.test(event.key) ? event.key : null); if (value) { event.preventDefault(); press(value); }
        }); record.el.tabIndex = -1; record.el.focus();
      }});
    }

    function openTerminal(initialCwd = '/') {
      return createWindow('terminal', { width: 680, height: 420, state: { cwd: normalizePath(initialCwd) }, mount(container, record) {
        container.innerHTML = `<div class="terminal"><div class="terminal-output" aria-live="polite"></div><form class="terminal-prompt"><label></label><input class="terminal-input" aria-label="Terminal command" autocomplete="off" autocapitalize="off" spellcheck="false"></form></div>`;
        const output = container.querySelector('.terminal-output'), form = container.querySelector('form'), input = container.querySelector('input'), label = container.querySelector('label');
        const prompt = () => { label.textContent = `guest@nebula:${record.state.cwd}$`; };
        const print = text => { const line = document.createElement('div'); line.className = 'terminal-line'; line.textContent = text; output.append(line); output.scrollTop = output.scrollHeight; };
        const command = line => {
          const [cmd = '', ...args] = line.trim().split(/\s+/); const rest = line.trim().slice(cmd.length).trim();
          switch (cmd.toLowerCase()) {
            case '': return;
            case 'help': print('Commands: help, clear, echo <text>, date, ls [path], cd [path], mkdir <name>, cat <file>, touch <file>, theme toggle'); return;
            case 'clear': output.replaceChildren(); return;
            case 'echo': print(rest); return;
            case 'date': print(new Date().toString()); return;
            case 'pwd': print(record.state.cwd); return;
            case 'ls': { const path = normalizePath(args[0] || record.state.cwd, record.state.cwd); const entries = listDir(path); print(entries ? (entries.map(item => `${item.type === 'dir' ? '📁' : '📄'} ${fileName(item.path)}`).join('\n') || '(empty)') : `ls: cannot access '${args[0] || ''}': Not a directory`); return; }
            case 'cd': { const path = normalizePath(args[0] || '/', record.state.cwd); if (path === '/' || filesystem[path]?.type === 'dir') { record.state.cwd = path; prompt(); } else print(`cd: ${args[0]}: No such directory`); return; }
            case 'mkdir': { if (!rest) return print('mkdir: missing operand'); const result = mkdir(normalizePath(rest, record.state.cwd)); print(result.ok ? `created directory ${result.path}` : `mkdir: ${result.message}`); return; }
            case 'touch': { if (!rest) return print('touch: missing file name'); const path = normalizePath(rest, record.state.cwd); const result = writeFile(path, filesystem[path]?.content || ''); print(result.ok ? `created ${result.path}` : `touch: ${result.message}`); return; }
            case 'cat': { if (!rest) return print('cat: missing file name'); const item = filesystem[normalizePath(rest, record.state.cwd)]; print(item?.type === 'file' ? item.content : `cat: ${rest}: No such file`); return; }
            case 'theme': if (args[0] === 'toggle') { setTheme(settings.theme === 'dark' ? 'light' : 'dark'); print(`Theme switched to ${settings.theme}.`); } else print('Usage: theme toggle'); return;
            default: print(`${cmd}: command not found. Type 'help' for commands.`);
          }
        };
        prompt(); print('Nebula OS Terminal v1.0 — type help to see commands.');
        form.addEventListener('submit', event => { event.preventDefault(); const value = input.value; print(`${label.textContent} ${value}`); command(value); input.value = ''; });
        window.setTimeout(() => input.focus(), 0);
      }});
    }

    function openFiles(startPath = '/') {
      const record = createWindow('files', { width: 750, height: 500, state: { path: normalizePath(startPath) }, mount(container, record) {
        container.innerHTML = `<div class="file-manager"><div class="app-toolbar"><button class="mini-btn" type="button" data-up>← Up</button><span class="file-path"></span><button class="mini-btn" type="button" data-import>Import</button><input type="file" data-import-input accept="text/*,.txt,.md,.json,.csv" multiple hidden><button class="mini-btn" type="button" data-new-folder>New folder</button><button class="mini-btn" type="button" data-new-file>New text file</button><button class="mini-btn" type="button" data-delete>Delete</button></div><div class="file-grid"></div></div>`;
        const grid = container.querySelector('.file-grid'), pathEl = container.querySelector('.file-path');
        record.renderFiles = () => {
          const items = listDir(record.state.path) || []; pathEl.textContent = record.state.path;
          grid.replaceChildren(); record.state.selected = null;
          if (!items.length) { grid.innerHTML = '<div class="file-empty">This folder is empty.<br>Create a folder or a text file to get started.</div>'; return; }
          items.forEach(item => { const button = document.createElement('button'); button.type = 'button'; button.className = 'file-item'; button.dataset.path = item.path; button.innerHTML = `<span class="file-icon">${item.type === 'dir' ? '📁' : '📄'}</span><span class="file-name">${escapeHtml(fileName(item.path))}</span><span class="file-meta">${item.type === 'dir' ? 'Folder' : `${(item.content || '').length} bytes`}</span>`; button.addEventListener('click', () => { record.state.selected = item.path; grid.querySelectorAll('.file-item').forEach(node => node.classList.toggle('selected', node === button)); }); button.addEventListener('dblclick', () => { if (item.type === 'dir') { record.state.path = item.path; record.renderFiles(); } else openNotepad({ path: item.path }); }); grid.append(button); });
        };
        container.querySelector('[data-up]').addEventListener('click', () => { record.state.path = parentPath(record.state.path); record.renderFiles(); });
        container.querySelector('[data-new-folder]').addEventListener('click', () => { const name = window.prompt('Folder name:'); if (name === null) return; const result = mkdir(`${record.state.path}/${safeFileName(name)}`); notify(result.ok ? 'Folder created.' : result.message); record.renderFiles(); });
        container.querySelector('[data-new-file]').addEventListener('click', () => { const name = window.prompt('Text file name:', 'Untitled'); if (name === null) return; const filename = safeFileName(name).toLowerCase().endsWith('.txt') ? safeFileName(name) : `${safeFileName(name)}.txt`; const result = writeFile(`${record.state.path}/${filename}`, ''); if (!result.ok) return notify(result.message); record.renderFiles(); openNotepad({ path: result.path }); });
        const importInput = container.querySelector('[data-import-input]');
        container.querySelector('[data-import]').addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', async () => { const incoming = [...importInput.files]; if (!incoming.length) return; let imported = 0; for (const file of incoming) { try { const result = writeFile(uniqueFilePath(record.state.path, file.name), await file.text()); if (result.ok) imported++; } catch { notify(`Could not import ${file.name}.`); } } importInput.value = ''; record.renderFiles(); if (imported) notify(`${imported} file${imported === 1 ? '' : 's'} imported.`); });
        container.querySelector('[data-delete]').addEventListener('click', () => { const selected = record.state.selected; if (!selected) return notify('Select a file or folder first.'); if (window.confirm(`Delete ${fileName(selected)}${filesystem[selected].type === 'dir' ? ' and its contents' : ''}?`)) { removePath(selected); record.renderFiles(); notify('Item deleted.'); } });
        record.renderFiles();
      }}); return record;
    }
    function refreshFileWindows() { windows.forEach(record => { if (record.appId === 'files' && record.renderFiles) record.renderFiles(); }); }

    function openSettings() {
      return createWindow('settings', { width: 590, height: 510, mount(container, record) {
        container.innerHTML = `<div class="settings"><h2>Personalization</h2><section class="settings-section"><h3>Wallpaper</h3><div class="wallpaper-options">${['aurora','dusk','ocean','mono'].map(name => `<button type="button" class="wallpaper-choice ${name}" data-wallpaper="${name}" data-label="${name[0].toUpperCase() + name.slice(1)}" aria-label="${name} wallpaper"></button>`).join('')}</div></section><section class="settings-section"><h3>Accent theme</h3><div class="accent-options">${['azure','violet','mint','sunset'].map(name => `<button type="button" class="accent-choice ${name}" data-accent="${name}">${name[0].toUpperCase() + name.slice(1)}</button>`).join('')}</div></section><section class="settings-section"><h3>Appearance</h3><div class="setting-row"><div><strong>Light mode</strong><p>Use brighter surfaces and stronger contrast.</p></div><button type="button" class="switch" data-theme-switch aria-label="Toggle light mode"></button></div></section><section class="settings-section"><h3>Keyboard shortcuts</h3><div class="system-info"><div><span>Open search</span><strong>Ctrl + Space</strong></div><div><span>New note</span><strong>Ctrl + Alt + N</strong></div><div><span>Files</span><strong>Ctrl + Alt + F</strong></div><div><span>Terminal</span><strong>Ctrl + Alt + T</strong></div></div></section><section class="settings-section"><h3>System information</h3><div class="system-info"><div><span>Memory</span><strong data-memory>—</strong></div><div><span>Browser engine</span><strong data-engine>—</strong></div><div><span>Uptime</span><strong data-uptime>—</strong></div><div><span>Storage</span><strong data-storage>—</strong></div></div></section></div>`;
        record.refreshSettings = () => {
          container.querySelectorAll('[data-wallpaper]').forEach(button => button.classList.toggle('selected', button.dataset.wallpaper === settings.wallpaper));
          container.querySelectorAll('[data-accent]').forEach(button => button.classList.toggle('selected', button.dataset.accent === settings.accent));
          container.querySelector('[data-theme-switch]').classList.toggle('on', settings.theme === 'light');
          container.querySelector('[data-memory]').textContent = navigator.deviceMemory ? `${navigator.deviceMemory} GB (simulated)` : '4 GB (simulated)';
          const ua = navigator.userAgent; container.querySelector('[data-engine]').textContent = /Firefox/i.test(ua) ? 'Gecko' : /Safari/i.test(ua) && !/Chrome/i.test(ua) ? 'WebKit' : 'Blink';
          const seconds = Math.floor((Date.now() - startedAt) / 1000); container.querySelector('[data-uptime]').textContent = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
          container.querySelector('[data-storage]').textContent = `${Object.values(filesystem).filter(item => item.type === 'file').length} local files`;
        };
        container.querySelectorAll('[data-wallpaper]').forEach(button => button.addEventListener('click', () => setWallpaper(button.dataset.wallpaper)));
        container.querySelectorAll('[data-accent]').forEach(button => button.addEventListener('click', () => setAccentTheme(button.dataset.accent)));
        container.querySelector('[data-theme-switch]').addEventListener('click', () => setTheme(settings.theme === 'dark' ? 'light' : 'dark'));
        record.refreshSettings(); record.infoTimer = window.setInterval(record.refreshSettings, 1000);
      }});
    }
    function refreshSettingsWindows() { windows.forEach(record => { if (record.appId === 'settings' && record.refreshSettings) record.refreshSettings(); }); }

    function updateClock() { const now = new Date(); document.getElementById('clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); document.getElementById('clock').title = now.toLocaleString(); }
    function initMenu() {
      const menuApps = document.getElementById('menu-apps'), search = document.getElementById('app-search'), notificationCenter = document.getElementById('notification-center');
      desktopApps.forEach(appId => { const app = apps[appId], button = document.createElement('button'); button.type = 'button'; button.className = 'menu-app'; button.dataset.search = `${app.name} ${app.description}`.toLowerCase(); button.innerHTML = `<span class="app-symbol" aria-hidden="true">${app.icon}</span><span>${app.name}<small>${app.description}</small></span>`; button.addEventListener('click', () => launch(appId)); menuApps.append(button); });
      const showSearch = () => { startMenu.classList.add('open'); notificationCenter.classList.remove('open'); search.focus(); search.select(); };
      search.addEventListener('input', () => { const query = search.value.trim().toLowerCase(); menuApps.querySelectorAll('.menu-app').forEach(button => button.hidden = !!query && !button.dataset.search.includes(query)); });
      document.getElementById('start-button').addEventListener('click', event => { event.stopPropagation(); startMenu.classList.toggle('open'); notificationCenter.classList.remove('open'); if (startMenu.classList.contains('open')) window.setTimeout(() => search.focus(), 0); });
      document.getElementById('menu-theme').addEventListener('click', () => setTheme(settings.theme === 'dark' ? 'light' : 'dark'));
      document.getElementById('notification-button').addEventListener('click', event => { event.stopPropagation(); notificationCenter.classList.toggle('open'); startMenu.classList.remove('open'); });
      document.getElementById('clear-notifications').addEventListener('click', () => { notifications = []; persistNotifications(); renderNotifications(); });
      document.addEventListener('pointerdown', event => { if (!startMenu.contains(event.target) && event.target.id !== 'start-button') startMenu.classList.remove('open'); if (!notificationCenter.contains(event.target) && event.target.id !== 'notification-button') notificationCenter.classList.remove('open'); });
      document.addEventListener('keydown', event => {
        if (event.ctrlKey && !event.altKey && event.code === 'Space') { event.preventDefault(); showSearch(); }
        if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); launch('notepad'); }
        if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'f') { event.preventDefault(); launch('files'); }
        if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 't') { event.preventDefault(); launch('terminal'); }
        if (event.key === 'Escape') { startMenu.classList.remove('open'); notificationCenter.classList.remove('open'); }
      });
    }
    function clampWindows() { windows.forEach(record => { if (record.maximized) return; const el = record.el; const maxLeft = Math.max(0, windowLayer.clientWidth - el.offsetWidth), maxTop = Math.max(0, windowLayer.clientHeight - el.offsetHeight); el.style.left = `${Math.max(0, Math.min(parseFloat(el.style.left) || 0, maxLeft))}px`; el.style.top = `${Math.max(0, Math.min(parseFloat(el.style.top) || 0, maxTop))}px`; }); }
    document.addEventListener('dragstart', event => event.preventDefault());
    document.addEventListener('contextmenu', event => { if (event.target.closest('.desktop-icon')) event.preventDefault(); });
    window.addEventListener('resize', clampWindows);
    setTheme(settings.theme); setAccentTheme(settings.accent); setWallpaper(settings.wallpaper); renderDesktopIcons(); initMenu(); renderNotifications(); updateClock(); window.setInterval(updateClock, 1000);
  })();
