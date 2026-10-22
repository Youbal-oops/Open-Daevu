import React, { useState } from 'react';
import { ChevronDown, Smile, Hand, Leaf, Utensils, Trophy, Plane, Lightbulb, Hash } from 'lucide-react';

const QUICK = '📄 📚 🚀 🎯 💡 🧠 📊 🗂️ ✅ 🔬 📝 🌱 🔥 ⭐ 🧭 🛠️ 📅 💼 🎨 🔒'.split(' ');
const TABS = [
  ['Faces', Smile, '😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😍 🤩 😎 🤓 🤔 🫡 😴 🥳 😇 🥹 😌 🙃 😬 🤯 😮 😢 😭 😡 🥶 🥵 🤖 👻 💀 👽 😺'],
  ['People', Hand, '👋 👍 👏 🙌 🙏 💪 🤝 ✌️ 🤞 👌 👀 🧑‍💻 🧑‍🔬 🧑‍🎨 🧑‍🚀 🧑‍🏫 🧑‍🍳 🧑‍⚕️ 🧑‍🌾 🧑‍🔧 👨‍👩‍👧 🧒 🧓 🏃 🧘 🚶 💃 🕺'],
  ['Nature', Leaf, '🌱 🌿 🍀 🌳 🌲 🌴 🌵 🌸 🌻 🌹 🍁 🌍 🌙 ☀️ ⭐ ⚡ 🔥 💧 🌊 ❄️ 🌈 ☁️ 🐶 🐱 🦊 🐻 🐼 🦁 🐢 🐙 🦋 🐝 🐠 🦉'],
  ['Food', Utensils, '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🥑 🥕 🌽 🍞 🧀 🍕 🍔 🌮 🍜 🍣 🍪 🎂 🍩 ☕ 🍵 🥤 🍷 🍺 🥗 🍳'],
  ['Activity', Trophy, '⚽ 🏀 🏈 🎾 🏐 🏓 🎯 🎮 🎲 🧩 🎸 🎹 🎨 🎬 📚 🏆 🥇 🏅 🧗 🚴 🏊 ⛷️ 🎪 🎭'],
  ['Travel', Plane, '🚗 🚕 🚌 🚂 ✈️ 🚀 🛸 🚲 ⛵ 🚢 🏠 🏢 🏫 🏥 🏦 🏰 🗼 🗽 🌆 🏖️ 🏔️ 🗺️ 🧳 📍'],
  ['Objects', Lightbulb, '💡 🔦 💻 🖥️ ⌨️ 🖱️ 📱 📷 🎧 🔋 🔌 🧰 🔧 🔨 ⚙️ 🧪 🔬 🔭 📡 💾 📁 📂 🗂️ 📅 📌 📎 ✏️ 🖊️ 📝 📖 📊 📈 📉 💼 💰 💳 🔑 🔒 🧭 ⏰ 📦'],
  ['Symbols', Hash, '✅ ❌ ⚠️ ❓ ❗ ➕ ➖ ✔️ 💯 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🔶 🔷 ❤️ 🧡 💛 💚 💙 💜 🖤 ♻️ 🚩 🏁 🔔 ✨ 💬 🔗'],
].map(([name, Icon, list]) => [name, Icon, list.split(' ')]);

// Suggested icons first, with a button that opens every category as tabs.
export function EmojiPicker({ value, onPick, onRemove }) {
  const [open, setOpen] = useState(false), [tab, setTab] = useState(0);
  return <div className="emoji-picker" role="listbox" aria-label="Page icon">
    <div className="emoji-quick">{QUICK.map(i => <button key={i} role="option" aria-selected={i === value} onClick={() => onPick(i)}>{i}</button>)}</div>
    <div className={`emoji-more${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="emoji-more-inner">
        <div className="emoji-tabs" role="tablist">{TABS.map(([name, Icon], n) => <button key={name} role="tab" aria-selected={tab === n} aria-label={name} title={name} className={tab === n ? 'on' : ''} tabIndex={open ? 0 : -1} onClick={() => setTab(n)}><Icon size={15}/></button>)}</div>
        <div className="emoji-label">{TABS[tab][0]}</div>
        <div className="emoji-all" key={tab}>{TABS[tab][2].map(i => <button key={i} role="option" aria-selected={i === value} tabIndex={open ? 0 : -1} onClick={() => onPick(i)}>{i}</button>)}</div>
      </div>
    </div>
    <div className="emoji-foot"><button type="button" className="emoji-toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Show less' : 'Add more'}<ChevronDown size={13}/></button>{value && <button type="button" className="emoji-remove" onClick={onRemove}>Remove</button>}</div>
  </div>;
}
