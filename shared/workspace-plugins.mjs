export const AI_CHAT_IDS = ['chatgpt-web','gemini-web'];
export function pluginPlacement(id,placements={}) {
 return AI_CHAT_IDS.includes(id) ? placements['chatgpt-web'] || placements['gemini-web'] || 'pull-down' : placements[id] || 'sidebar';
}
// Plain icon names a plugin may use instead of the default puzzle piece.
export const PLUGIN_ICONS = ['Puzzle', 'Bot', 'Sparkles', 'Brain', 'MessageSquare', 'Globe', 'Code', 'Terminal', 'Database', 'Table2', 'FileText', 'BookOpen', 'Library', 'Image', 'Music', 'Video', 'Gamepad2', 'Calendar', 'Mail', 'Map', 'Search', 'Wrench', 'Zap', 'Star', 'Heart', 'Flame', 'Rocket', 'Lightbulb', 'Camera', 'Palette', 'Shield', 'Cloud', 'Lock', 'Coffee', 'Briefcase', 'ShoppingCart', 'Wallet', 'LineChart', 'FlaskConical', 'GraduationCap'];
// A plugin locked to a project only appears while that project is open.
export function pluginVisible(id,locks={},projectId) {
 return !locks[id]||locks[id]===projectId;
}
export function workspacePluginEntries(plugins,placements={},locks={},projectId) {
 const available=plugins.filter(p=>p.enabled&&!p.browserExtension&&pluginVisible(p.id,locks,projectId));
 const chats=AI_CHAT_IDS.map(id=>available.find(p=>p.id===id&&p.panels.some(panel=>panel.type==='web-chat'))).filter(Boolean);
 const entries=available.filter(p=>!chats.includes(p)).flatMap(plugin=>plugin.panels.map(panel=>({plugin,panel,key:`plugin:${plugin.id}:${panel.id}`,memberIds:[plugin.id],placement:pluginPlacement(plugin.id,placements)})));
 if(chats.length){const plugin=chats[0],panel=plugin.panels.find(p=>p.type==='web-chat');entries.push({plugin,panel,key:'plugin:ai-chats',memberIds:chats.map(p=>p.id),combined:true,title:'AI chats',placement:pluginPlacement(plugin.id,placements)});}
 return entries;
}
